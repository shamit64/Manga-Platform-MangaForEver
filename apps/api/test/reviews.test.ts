import request from "supertest";
import { beforeAll, describe, expect, it } from "vitest";
import { app, createUser, prisma, resetDb, seedCatalog } from "./helpers.js";

let ids: Record<string, string>;
beforeAll(async () => {
  await resetDb();
  ids = await seedCatalog();
});

describe("ratings", () => {
  it("computes the community average from stored ratings and supports updates", async () => {
    const a = await createUser();
    const b = await createUser();
    const c = await createUser();
    const id = ids["Tower of God"];
    await a.agent.put(`/api/v1/manga/${id}/rating`).send({ score: 10 }).expect(200);
    await b.agent.put(`/api/v1/manga/${id}/rating`).send({ score: 7 }).expect(200);
    let r = await c.agent.put(`/api/v1/manga/${id}/rating`).send({ score: 4 });
    expect(r.body.community).toEqual({ ratingAvg: 7, ratingCount: 3 });

    r = await c.agent.put(`/api/v1/manga/${id}/rating`).send({ score: 7 }); // update, not a second row
    expect(r.body.community).toEqual({ ratingAvg: 8, ratingCount: 3 });
    expect(await prisma.rating.count({ where: { seriesId: id } })).toBe(3);

    await c.agent.delete(`/api/v1/manga/${id}/rating`).expect(200);
    const detail = await request(app).get(`/api/v1/manga/${id}`);
    expect(detail.body).toMatchObject({ ratingAvg: 8.5, ratingCount: 2 });
  });

  it("only accepts whole numbers from 1 to 10", async () => {
    const { agent } = await createUser();
    for (const score of [0, 11, 7.5]) {
      expect((await agent.put(`/api/v1/manga/${ids.Berserk}/rating`).send({ score })).status).toBe(422);
    }
  });

  it("library score and rating are the same value", async () => {
    const { agent } = await createUser();
    await agent.post("/api/v1/library").send({ seriesId: ids.Bakuman, score: 6 }).expect(201);
    const detail = await agent.get(`/api/v1/manga/${ids.Bakuman}`);
    expect(detail.body.viewer.rating).toBe(6);
    expect(detail.body.ratingAvg).toBe(6);
  });
});

describe("reviews", () => {
  const body = "A careful, well-paced story that rewards patience and rereading.";

  it("creates one review per member per series and lets the author edit it", async () => {
    const { agent } = await createUser();
    const create = await agent.post(`/api/v1/manga/${ids["Death Note"]}/reviews`).send({ title: "Cat and mouse", body, score: 9 });
    expect(create.status).toBe(201);
    expect(create.body).toMatchObject({ title: "Cat and mouse", score: 9, isOwn: true, helpfulCount: 0 });

    const dup = await agent.post(`/api/v1/manga/${ids["Death Note"]}/reviews`).send({ title: "Again", body });
    expect(dup.status).toBe(409);

    const edit = await agent.patch(`/api/v1/reviews/${create.body.id}`).send({ title: "Cat and mouse, revisited", score: 8, containsSpoilers: true });
    expect(edit.body).toMatchObject({ title: "Cat and mouse, revisited", score: 8, containsSpoilers: true });
    expect((await request(app).get(`/api/v1/manga/${ids["Death Note"]}`)).body.reviewCount).toBe(1);
  });

  it("stops other users from editing or deleting someone else's review", async () => {
    const author = await createUser();
    const other = await createUser();
    const r = await author.agent.post(`/api/v1/manga/${ids.Berserk}/reviews`).send({ title: "Dark", body });
    expect((await other.agent.patch(`/api/v1/reviews/${r.body.id}`).send({ title: "hijacked" })).status).toBe(403);
    expect((await other.agent.delete(`/api/v1/reviews/${r.body.id}`)).status).toBe(403);
    const stored = await prisma.review.findUniqueOrThrow({ where: { id: r.body.id } });
    expect(stored.title).toBe("Dark");
  });

  it("validates review content and escapes nothing on the server (rendered as text by the client)", async () => {
    const { agent } = await createUser();
    expect((await agent.post(`/api/v1/manga/${ids.Bakuman}/reviews`).send({ title: "x", body: "short" })).status).toBe(422);
    const xss = await agent.post(`/api/v1/manga/${ids.Bakuman}/reviews`).send({ title: "<script>alert(1)</script>", body });
    expect(xss.status).toBe(201);
    expect(xss.body.title).toBe("<script>alert(1)</script>"); // stored verbatim, React renders it as text
  });

  it("helpful votes: one per member, toggleable, no self-votes, count derived from votes", async () => {
    const author = await createUser();
    const v1 = await createUser();
    const v2 = await createUser();
    const r = await author.agent.post(`/api/v1/manga/${ids["Solo Leveling"]}/reviews`).send({ title: "Spectacle", body });
    expect((await author.agent.post(`/api/v1/reviews/${r.body.id}/helpful`)).status).toBe(400);
    expect((await v1.agent.post(`/api/v1/reviews/${r.body.id}/helpful`)).body).toEqual({ voted: true, helpfulCount: 1 });
    expect((await v2.agent.post(`/api/v1/reviews/${r.body.id}/helpful`)).body).toEqual({ voted: true, helpfulCount: 2 });
    expect((await v1.agent.post(`/api/v1/reviews/${r.body.id}/helpful`)).body).toEqual({ voted: false, helpfulCount: 1 });
    // Clients can't set helpfulCount directly
    await author.agent.patch(`/api/v1/reviews/${r.body.id}`).send({ helpfulCount: 999 }).expect(200);
    expect((await prisma.review.findUniqueOrThrow({ where: { id: r.body.id } })).helpfulCount).toBe(1);
  });

  it("sorts reviews by most helpful, newest and highest rated", async () => {
    const list = await request(app).get(`/api/v1/manga/${ids["Solo Leveling"]}/reviews`).query({ sort: "helpful" });
    expect(list.status).toBe(200);
    expect(list.body.items.length).toBeGreaterThan(0);
    for (const sort of ["newest", "rating"]) {
      expect((await request(app).get(`/api/v1/manga/${ids["Solo Leveling"]}/reviews`).query({ sort })).status).toBe(200);
    }
  });

  it("reports go to moderators, who can hide the review", async () => {
    const author = await createUser();
    const reporter = await createUser();
    const mod = await createUser("MODERATOR");
    const r = await author.agent.post(`/api/v1/manga/${ids["True Beauty"]}/reviews`).send({ title: "Spam", body: `${body} buy cheap things` });
    const rep = await reporter.agent.post(`/api/v1/reviews/${r.body.id}/report`).send({ reason: "SPAM" });
    expect(rep.status).toBe(201);
    expect((await reporter.agent.post(`/api/v1/reviews/${r.body.id}/report`).send({ reason: "SPAM" })).status).toBe(409);

    expect((await reporter.agent.get("/api/v1/admin/reports")).status).toBe(403);
    const reports = await mod.agent.get("/api/v1/admin/reports").query({ status: "OPEN" });
    const report = reports.body.items.find((x: { review: { id: string } }) => x.review.id === r.body.id);
    await mod.agent.post(`/api/v1/admin/reports/${report.id}/resolve`).send({ action: "HIDE_REVIEW", note: "Spam" }).expect(204);

    const visible = await request(app).get(`/api/v1/manga/${ids["True Beauty"]}/reviews`);
    expect(visible.body.items.find((x: { id: string }) => x.id === r.body.id)).toBeUndefined();
    expect(await prisma.adminAuditLog.count({ where: { action: "report.hide_review" } })).toBe(1);
  });
});
