import request from "supertest";
import { beforeAll, describe, expect, it } from "vitest";
import { app, createUser, prisma, resetDb, seedCatalog } from "./helpers.js";

let ids: Record<string, string>;
beforeAll(async () => {
  await resetDb();
  ids = await seedCatalog();
});

describe("library", () => {
  it("adds a title, updates progress and persists across sessions", async () => {
    const { user, agent } = await createUser("USER", "password123");
    const add = await agent.post("/api/v1/library").send({ seriesId: ids["Death Note"], status: "READING", progressChapter: 10 });
    expect(add.status).toBe(201);
    expect(add.body).toMatchObject({ status: "READING", progressChapter: 10 });
    expect(add.body.startedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);

    const upd = await agent.patch(`/api/v1/library/${add.body.id}`).send({ progressChapter: 55, score: 9, notes: "L is the best" });
    expect(upd.status).toBe(200);
    expect(upd.body).toMatchObject({ progressChapter: 55, score: 9, notes: "L is the best" });

    // New login (another device) sees the same data.
    const other = request.agent(app);
    await other.post("/api/v1/auth/login").send({ identifier: user.email, password: "password123" }).expect(200);
    const list = await other.get("/api/v1/library");
    expect(list.body.items).toHaveLength(1);
    expect(list.body.items[0]).toMatchObject({ progressChapter: 55, score: 9, series: { title: "Death Note" } });
  });

  it("prevents duplicate entries", async () => {
    const { agent } = await createUser();
    await agent.post("/api/v1/library").send({ seriesId: ids.Berserk }).expect(201);
    const dup = await agent.post("/api/v1/library").send({ seriesId: ids.Berserk });
    expect(dup.status).toBe(409);
    expect(await prisma.libraryEntry.count({ where: { seriesId: ids.Berserk } })).toBe(1);
  });

  it("rejects impossible progress when the chapter count is known", async () => {
    const { agent } = await createUser();
    const res = await agent.post("/api/v1/library").send({ seriesId: ids["Death Note"], progressChapter: 500 });
    expect(res.status).toBe(422);
    expect(res.body.error.details[0].path).toBe("progressChapter");
  });

  it("allows any progress when the chapter count is unknown", async () => {
    const { agent } = await createUser();
    const res = await agent.post("/api/v1/library").send({ seriesId: ids["Tower of God"], progressChapter: 640 });
    expect(res.status).toBe(201);
  });

  it("marking completed fills progress with the known total and sets a completion date", async () => {
    const { agent } = await createUser();
    const add = await agent.post("/api/v1/library").send({ seriesId: ids.Bakuman, status: "READING", progressChapter: 20 });
    const upd = await agent.patch(`/api/v1/library/${add.body.id}`).send({ status: "COMPLETED" });
    expect(upd.body).toMatchObject({ status: "COMPLETED", progressChapter: 176 });
    expect(upd.body.completedAt).toBeTruthy();
  });

  it("enforces ownership on update and delete", async () => {
    const a = await createUser();
    const b = await createUser();
    const entry = await a.agent.post("/api/v1/library").send({ seriesId: ids["True Beauty"] });
    expect((await b.agent.patch(`/api/v1/library/${entry.body.id}`).send({ progressChapter: 3 })).status).toBe(404);
    expect((await b.agent.delete(`/api/v1/library/${entry.body.id}`)).status).toBe(404);
    expect((await b.agent.get("/api/v1/library")).body.items).toHaveLength(0);
    expect((await a.agent.delete(`/api/v1/library/${entry.body.id}`)).status).toBe(204);
  });

  it("filters and summarises the library dashboard", async () => {
    const { agent } = await createUser();
    await agent.post("/api/v1/library").send({ seriesId: ids["Solo Leveling"], status: "COMPLETED", progressChapter: 200 }).expect(201);
    await agent.post("/api/v1/library").send({ seriesId: ids["Tower of God"], status: "READING", progressChapter: 50 }).expect(201);
    await agent.post("/api/v1/library").send({ seriesId: ids["Death Note"], status: "PLAN_TO_READ" }).expect(201);
    const reading = await agent.get("/api/v1/library").query({ status: "READING" });
    expect(reading.body.items.map((i: { series: { title: string } }) => i.series.title)).toEqual(["Tower of God"]);
    const stats = await agent.get("/api/v1/library/stats");
    expect(stats.body).toMatchObject({ total: 3, completed: 1, chaptersTracked: 250 });
    expect(stats.body.byStatus).toMatchObject({ READING: 1, COMPLETED: 1, PLAN_TO_READ: 1 });
    expect(stats.body.genreDistribution[0]).toMatchObject({ slug: expect.any(String), count: expect.any(Number) });
    expect(stats.body.recentActivity.length).toBeGreaterThanOrEqual(3);
  });

  it("updates the series' community library count", async () => {
    const before = (await request(app).get(`/api/v1/manga/${ids["Heaven Official's Blessing"]}`)).body.libraryCount;
    const { agent } = await createUser();
    await agent.post("/api/v1/library").send({ seriesId: ids["Heaven Official's Blessing"] }).expect(201);
    const after = (await request(app).get(`/api/v1/manga/${ids["Heaven Official's Blessing"]}`)).body.libraryCount;
    expect(after).toBe(before + 1);
  });
});

describe("favorites", () => {
  it("adds, lists, prevents duplicates and removes", async () => {
    const { user, agent } = await createUser("USER", "password123");
    await agent.post("/api/v1/favorites").send({ seriesId: ids.Berserk }).expect(201);
    await agent.post("/api/v1/favorites").send({ seriesId: ids["Solo Leveling"] }).expect(201);
    expect((await agent.post("/api/v1/favorites").send({ seriesId: ids.Berserk })).status).toBe(409);

    // Persists across a fresh login
    const again = request.agent(app);
    await again.post("/api/v1/auth/login").send({ identifier: user.email, password: "password123" }).expect(200);
    const list = await again.get("/api/v1/favorites").query({ sort: "title" });
    expect(list.body.items.map((f: { series: { title: string } }) => f.series.title)).toEqual(["Berserk", "Solo Leveling"]);
    const manhwaOnly = await again.get("/api/v1/favorites").query({ type: "MANHWA" });
    expect(manhwaOnly.body.total).toBe(1);

    const detail = await again.get(`/api/v1/manga/${ids.Berserk}`);
    expect(detail.body.viewer.isFavorite).toBe(true);
    expect(detail.body.favoriteCount).toBe(1);

    await again.delete(`/api/v1/favorites/${ids.Berserk}`).expect(204);
    expect((await again.delete(`/api/v1/favorites/${ids.Berserk}`)).status).toBe(404);
    expect((await again.get("/api/v1/favorites")).body.total).toBe(1);
    expect((await request(app).get(`/api/v1/manga/${ids.Berserk}`)).body.favoriteCount).toBe(0);
  });

  it("404s for unknown series", async () => {
    const { agent } = await createUser();
    expect((await agent.post("/api/v1/favorites").send({ seriesId: "nope" })).status).toBe(404);
  });
});
