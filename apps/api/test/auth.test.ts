import request from "supertest";
import { beforeAll, describe, expect, it } from "vitest";
import { outbox } from "../src/services/mailer.js";
import { app, createUser, prisma, resetDb } from "./helpers.js";

beforeAll(resetDb);

describe("registration and login", () => {
  const creds = { email: "new.reader@test.dev", username: "new_reader", password: "readmore42" };

  it("registers, sets an httpOnly session cookie and returns the user", async () => {
    const res = await request(app).post("/api/v1/auth/register").send(creds);
    expect(res.status).toBe(201);
    expect(res.body.user).toMatchObject({ email: creds.email, username: creds.username, role: "USER" });
    expect(res.body.user.passwordHash).toBeUndefined();
    const cookie = res.headers["set-cookie"][0];
    expect(cookie).toMatch(/mv_session=/);
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=Lax/i);
  });

  it("stores a bcrypt hash, never the password", async () => {
    const u = await prisma.user.findUniqueOrThrow({ where: { email: creds.email } });
    expect(u.passwordHash).not.toContain(creds.password);
    expect(u.passwordHash).toMatch(/^\$2[aby]\$/);
  });

  it("rejects duplicate emails and usernames (case-insensitive)", async () => {
    const dupEmail = await request(app).post("/api/v1/auth/register").send({ ...creds, username: "other_name" });
    expect(dupEmail.status).toBe(409);
    const dupUser = await request(app).post("/api/v1/auth/register").send({ ...creds, email: "x@test.dev", username: "NEW_READER" });
    expect(dupUser.status).toBe(409);
  });

  it("validates input server-side", async () => {
    const res = await request(app).post("/api/v1/auth/register").send({ email: "nope", username: "a", password: "short" });
    expect(res.status).toBe(422);
    const paths = res.body.error.details.map((d: { path: string }) => d.path);
    expect(paths).toEqual(expect.arrayContaining(["email", "username", "password"]));
  });

  it("logs in with email or username and gives the same error for wrong password and unknown user", async () => {
    const byEmail = await request(app).post("/api/v1/auth/login").send({ identifier: creds.email, password: creds.password });
    expect(byEmail.status).toBe(200);
    const byName = await request(app).post("/api/v1/auth/login").send({ identifier: "New_Reader", password: creds.password });
    expect(byName.status).toBe(200);
    const wrong = await request(app).post("/api/v1/auth/login").send({ identifier: creds.email, password: "wrongpass1" });
    const unknown = await request(app).post("/api/v1/auth/login").send({ identifier: "ghost@test.dev", password: "wrongpass1" });
    expect(wrong.status).toBe(401);
    expect(unknown.status).toBe(401);
    expect(wrong.body.error.message).toBe(unknown.body.error.message);
  });

  it("logout destroys the session server-side", async () => {
    const agent = request.agent(app);
    await agent.post("/api/v1/auth/login").send({ identifier: creds.email, password: creds.password }).expect(200);
    await agent.get("/api/v1/auth/me").expect(200);
    await agent.post("/api/v1/auth/logout").expect(204);
    await agent.get("/api/v1/auth/me").expect(401);
  });
});

describe("protected routes", () => {
  it.each([
    ["get", "/api/v1/auth/me"],
    ["get", "/api/v1/library"],
    ["post", "/api/v1/library"],
    ["get", "/api/v1/favorites"],
    ["get", "/api/v1/history"],
    ["get", "/api/v1/search-history"],
    ["patch", "/api/v1/users/me"],
    ["post", "/api/v1/reviews/abc/helpful"],
  ])("%s %s requires a session", async (method, url) => {
    const res = await (request(app) as unknown as Record<string, (u: string) => request.Test>)[method](url).send({});
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("UNAUTHORIZED");
  });

  it("rejects forged session tokens", async () => {
    const res = await request(app).get("/api/v1/auth/me").set("Cookie", "mv_session=forged-token-that-is-long-enough-123");
    expect(res.status).toBe(401);
  });

  it("blocks cross-site writes from disallowed origins", async () => {
    const { agent } = await createUser();
    const res = await agent.post("/api/v1/favorites").set("Origin", "https://evil.example").send({ seriesId: "x" });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("BAD_ORIGIN");
  });
});

describe("password reset", () => {
  it("emails a single-use token that resets the password and signs out other sessions", async () => {
    const { user, agent } = await createUser("USER", "oldpass123");
    const res = await request(app).post("/api/v1/auth/forgot-password").send({ email: user.email });
    expect(res.status).toBe(200);
    const mail = outbox.at(-1)!;
    expect(mail.to).toBe(user.email);
    const token = decodeURIComponent(mail.text.match(/token=([^\s]+)/)![1]);

    await request(app).post("/api/v1/auth/reset-password").send({ token, password: "newpass456" }).expect(200);
    await agent.get("/api/v1/auth/me").expect(401); // old session revoked
    await request(app).post("/api/v1/auth/login").send({ identifier: user.email, password: "newpass456" }).expect(200);
    await request(app).post("/api/v1/auth/reset-password").send({ token, password: "another789" }).expect(400); // single use
  });

  it("does not reveal whether an email exists", async () => {
    const res = await request(app).post("/api/v1/auth/forgot-password").send({ email: "nobody@test.dev" });
    expect(res.status).toBe(200);
  });
});
