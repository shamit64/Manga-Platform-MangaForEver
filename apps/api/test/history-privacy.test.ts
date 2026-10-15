import request from "supertest";
import { beforeAll, describe, expect, it } from "vitest";
import { app, createUser, prisma, resetDb, seedCatalog } from "./helpers.js";

let ids: Record<string, string>;
beforeAll(async () => {
  await resetDb();
  ids = await seedCatalog();
});

describe("reading & browsing history", () => {
  it("records views, orders by recency and supports removing entries", async () => {
    const { agent } = await createUser();
    await agent.post("/api/v1/history/views").send({ seriesId: ids.Berserk }).expect(200);
    await agent.post("/api/v1/history/views").send({ seriesId: ids["Death Note"] }).expect(200);
    await agent.post("/api/v1/history/views").send({ seriesId: ids.Berserk }).expect(200);
    const list = await agent.get("/api/v1/history");
    expect(list.body.items.map((h: { series: { title: string } }) => h.series.title)).toEqual(["Berserk", "Death Note"]);
    expect(list.body.items[0].viewCount).toBe(2);

    await agent.delete(`/api/v1/history/${list.body.items[1].id}`).expect(204);
    expect((await agent.get("/api/v1/history")).body.total).toBe(1);
    await agent.delete("/api/v1/history").query({ scope: "all" }).expect(200);
    expect((await agent.get("/api/v1/history")).body.total).toBe(0);
  });

  it("does not record views when browsing history is turned off", async () => {
    const { user, agent } = await createUser();
    await agent.patch("/api/v1/users/me").send({ preferences: { trackBrowsingHistory: false } }).expect(200);
    const res = await agent.post("/api/v1/history/views").send({ seriesId: ids.Berserk });
    expect(res.body).toEqual({ recorded: false });
    expect(await prisma.readingHistory.count({ where: { userId: user.id } })).toBe(0);
  });

  it("is private: users can't see or delete each other's history", async () => {
    const a = await createUser();
    const b = await createUser();
    await a.agent.post("/api/v1/history/views").send({ seriesId: ids.Bakuman }).expect(200);
    const aList = await a.agent.get("/api/v1/history");
    expect((await b.agent.get("/api/v1/history")).body.total).toBe(0);
    expect((await b.agent.delete(`/api/v1/history/${aList.body.items[0].id}`)).status).toBe(404);
    expect((await a.agent.get("/api/v1/history")).body.total).toBe(1);
  });

  it("records search history only when enabled, and lets users clear it", async () => {
    const { agent } = await createUser();
    await agent.get("/api/v1/manga/search").query({ q: "tower" }).expect(200);
    await agent.get("/api/v1/manga/search").query({ q: "Tower" }).expect(200); // de-duplicated
    expect((await agent.get("/api/v1/search-history")).body.items.map((s: { query: string }) => s.query)).toEqual(["Tower"]);
    await agent.delete("/api/v1/search-history").expect(204);
    await agent.patch("/api/v1/users/me").send({ preferences: { trackSearchHistory: false } }).expect(200);
    await agent.get("/api/v1/manga/search").query({ q: "berserk" }).expect(200);
    expect((await agent.get("/api/v1/search-history")).body.items).toEqual([]);
  });
});

describe("public profile privacy", () => {
  it("hides private libraries, private entries and private notes", async () => {
    const owner = await createUser();
    const visitor = await createUser();
    const pub = await owner.agent.post("/api/v1/library").send({ seriesId: ids.Berserk, status: "READING", notes: "secret thoughts" });
    await owner.agent.post("/api/v1/library").send({ seriesId: ids["True Beauty"], status: "READING", isPrivate: true });
    expect(pub.status).toBe(201);

    const lib = await visitor.agent.get(`/api/v1/users/${owner.user.username}/library`);
    expect(lib.body.private).toBe(false);
    expect(lib.body.items.map((i: { series: { title: string } }) => i.series.title)).toEqual(["Berserk"]);
    expect(lib.body.items[0].notes).toBeNull();

    await owner.agent.patch("/api/v1/users/me").send({ preferences: { libraryVisibility: "PRIVATE", favoritesVisibility: "PRIVATE" } }).expect(200);
    const hidden = await request(app).get(`/api/v1/users/${owner.user.username}/library`);
    expect(hidden.body).toMatchObject({ private: true, items: [] });
    const profile = await request(app).get(`/api/v1/users/${owner.user.username}`);
    expect(profile.body.favorites).toBeNull();
    expect(profile.body.recentlyCompleted).toBeNull();
    expect(JSON.stringify(profile.body)).not.toContain("secret thoughts");

    // The owner still sees everything, including notes.
    const own = await owner.agent.get(`/api/v1/users/${owner.user.username}/library`);
    expect(own.body.items).toHaveLength(2);
    expect((await owner.agent.get("/api/v1/library")).body.items.find((i: { notes: string | null }) => i.notes === "secret thoughts")).toBeTruthy();
  });

  it("never exposes email or password hash on public profiles", async () => {
    const { user } = await createUser();
    const res = await request(app).get(`/api/v1/users/${user.username}`);
    expect(res.status).toBe(200);
    expect(JSON.stringify(res.body)).not.toContain(user.email);
    expect(JSON.stringify(res.body)).not.toContain("passwordHash");
  });
});
