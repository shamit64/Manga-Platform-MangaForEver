import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AniListProvider, mapAniList, type AniListMedia } from "../src/providers/anilist.js";
import { setProvider } from "../src/providers/registry.js";
import { ProviderError, type MetadataProvider } from "../src/providers/types.js";
import { app, createUser, prisma, resetDb, seedCatalog } from "./helpers.js";

let ids: Record<string, string>;
beforeAll(async () => {
  await resetDb();
  ids = await seedCatalog();
});
afterAll(() => setProvider("anilist", null));

describe("admin authorization", () => {
  it.each([
    ["get", "/api/v1/admin/statistics"],
    ["post", "/api/v1/admin/manga"],
    ["patch", "/api/v1/admin/manga/x"],
    ["delete", "/api/v1/admin/manga/x"],
    ["get", "/api/v1/admin/users"],
    ["post", "/api/v1/admin/import"],
  ])("regular users get 403 on %s %s", async (method, url) => {
    const { agent } = await createUser("USER");
    const res = await (agent as unknown as Record<string, (u: string) => request.Test>)[method](url).send({ title: "x", type: "MANGA" });
    expect(res.status).toBe(403);
  });

  it("moderators can moderate but not administer", async () => {
    const { agent } = await createUser("MODERATOR");
    expect((await agent.get("/api/v1/admin/reports")).status).toBe(200);
    expect((await agent.get("/api/v1/admin/statistics")).status).toBe(403);
    expect((await agent.post("/api/v1/admin/manga").send({ title: "x", type: "MANGA" })).status).toBe(403);
  });

  it("anonymous requests get 401", async () => {
    expect((await request(app).get("/api/v1/admin/statistics")).status).toBe(401);
  });
});

describe("admin catalog management", () => {
  it("creates, edits, archives series and writes audit logs", async () => {
    const { agent } = await createUser("ADMIN");
    const created = await agent.post("/api/v1/admin/manga").send({
      title: "Test Manhwa", type: "MANHWA", status: "ONGOING", genres: ["Fantasy"], authors: ["Tester"], altTitles: ["테스트"],
    });
    expect(created.status).toBe(201);
    const found = await request(app).get("/api/v1/manga").query({ q: "테스트" });
    expect(found.body.items[0].title).toBe("Test Manhwa");

    await agent.patch(`/api/v1/admin/manga/${created.body.id}`).send({ synopsis: "Updated synopsis", status: "COMPLETED" }).expect(200);
    const detail = await request(app).get(`/api/v1/manga/${created.body.id}`);
    expect(detail.body).toMatchObject({ synopsis: "Updated synopsis", status: "COMPLETED", source: "MANUAL" });

    await agent.delete(`/api/v1/admin/manga/${created.body.id}`).expect(204);
    expect((await request(app).get(`/api/v1/manga/${created.body.id}`)).status).toBe(404);
    const actions = (await prisma.adminAuditLog.findMany({ where: { entityId: created.body.id } })).map((a) => a.action);
    expect(actions).toEqual(expect.arrayContaining(["series.create", "series.update", "series.archive"]));
  });

  it("statistics come from stored data", async () => {
    const { agent } = await createUser("ADMIN");
    const stats = await agent.get("/api/v1/admin/statistics");
    expect(stats.status).toBe(200);
    expect(stats.body.catalog.total).toBe(await prisma.mangaSeries.count({ where: { isArchived: false } }));
    expect(stats.body.users.total).toBe(await prisma.user.count());
  });

  it("merges duplicates, moving user data", async () => {
    const admin = await createUser("ADMIN");
    const reader = await createUser();
    const dup = await admin.agent.post("/api/v1/admin/manga").send({ title: "Berserk (dup)", type: "MANGA" });
    await reader.agent.post("/api/v1/favorites").send({ seriesId: dup.body.id }).expect(201);
    await admin.agent.post("/api/v1/admin/manga/merge").send({ keepId: ids.Berserk, mergeId: dup.body.id }).expect(200);
    const favs = await reader.agent.get("/api/v1/favorites");
    expect(favs.body.items[0].series.id).toBe(ids.Berserk);
    const kept = await request(app).get(`/api/v1/manga/${ids.Berserk}`);
    expect(kept.body.altTitles).toContain("Berserk (dup)");
  });
});

const media: AniListMedia = {
  id: 30002,
  siteUrl: "https://anilist.co/manga/30002",
  isAdult: false,
  format: "MANGA",
  status: "RELEASING",
  countryOfOrigin: "KR",
  chapters: null,
  volumes: null,
  title: { romaji: "Na Honjaman Level Up", english: "Solo Leveling", native: "나 혼자만 레벨업" },
  synonyms: ["Only I Level Up"],
  description: "Ten years ago, <i>the Gate</i> appeared.<br><br>Second paragraph &amp; more.",
  startDate: { year: 2018, month: 3, day: 4 },
  endDate: { year: null, month: null, day: null },
  coverImage: { extraLarge: "https://s4.anilist.co/cover.jpg", large: null },
  bannerImage: null,
  genres: ["Action", "Fantasy"],
  averageScore: 84,
  popularity: 150000,
  tags: [
    { name: "Dungeon", rank: 90, isMediaSpoiler: false, isAdult: false, category: "Setting" },
    { name: "Twist Ending", rank: 90, isMediaSpoiler: true, isAdult: false, category: "Plot" },
  ],
  staff: { edges: [{ role: "Story", node: { name: { full: "Chugong" } } }, { role: "Art", node: { name: { full: "DUBU" } } }] },
  rankings: [{ rank: 5, type: "POPULAR", allTime: true, context: "most popular all time" }],
};

describe("AniList provider", () => {
  it("maps provider fields into the internal schema without inventing data", () => {
    const m = mapAniList(media);
    expect(m).toMatchObject({
      title: "Solo Leveling",
      type: "MANHWA",
      status: "ONGOING",
      externalRating: 8.4,
      externalRatingSource: "AniList average score",
      externalPopularity: 150000,
      externalPopularityRank: 5,
      externalId: "30002",
      chapterCount: null,
      publisher: null,
      endDate: null,
      authors: ["Chugong"],
      artists: ["DUBU"],
      tags: ["Dungeon"], // spoiler tag dropped
    });
    expect(m.description).toBe("Ten years ago, the Gate appeared.\n\nSecond paragraph & more.");
    expect(m.altTitles).toEqual(expect.arrayContaining(["Na Honjaman Level Up", "나 혼자만 레벨업", "Only I Level Up"]));
  });

  it("retries transient failures and then succeeds", async () => {
    let calls = 0;
    const fakeFetch = (async () => {
      calls++;
      if (calls === 1) return new Response("boom", { status: 502 });
      return new Response(JSON.stringify({ data: { Media: media } }), { status: 200 });
    }) as typeof fetch;
    const p = new AniListProvider("https://example.test", fakeFetch, { timeoutMs: 1000, retries: 2, cacheTtlMs: 0 });
    const result = await p.getById("30002");
    expect(result?.title).toBe("Solo Leveling");
    expect(calls).toBe(2);
  });

  it("turns timeouts into a ProviderError", async () => {
    const hang = ((_u: string, init: RequestInit) =>
      new Promise((_, reject) => init.signal!.addEventListener("abort", () => reject(Object.assign(new Error("t"), { name: "TimeoutError" }))))) as unknown as typeof fetch;
    const p = new AniListProvider("https://example.test", hang, { timeoutMs: 50, retries: 1, cacheTtlMs: 0 });
    await expect(p.getById("1")).rejects.toBeInstanceOf(ProviderError);
  });

  it("stops calling after a 429 until Retry-After passes", async () => {
    let calls = 0;
    const limited = (async () => {
      calls++;
      return new Response("", { status: 429, headers: { "retry-after": "60" } });
    }) as typeof fetch;
    const p = new AniListProvider("https://example.test", limited, { timeoutMs: 1000, retries: 2, cacheTtlMs: 0 });
    await expect(p.search("x")).rejects.toThrow(/rate limit/);
    await expect(p.search("y")).rejects.toThrow(/rate limit/);
    expect(calls).toBe(1);
  });
});

describe("imports", () => {
  it("imports by external ID without duplicates, and refreshes on re-import", async () => {
    const fake: MetadataProvider = {
      name: "anilist",
      attribution: { label: "AniList", url: "https://anilist.co" },
      search: async () => ({ items: [mapAniList(media)], hasNextPage: false }),
      popular: async () => ({ items: [mapAniList(media)], hasNextPage: false }),
      getById: async () => mapAniList(media),
    };
    setProvider("anilist", fake);
    const { agent } = await createUser("ADMIN");
    const first = await agent.post("/api/v1/admin/import").send({ provider: "anilist", externalId: "30002" });
    expect(first.body).toMatchObject({ imported: 1, refreshed: 0 });
    const second = await agent.post("/api/v1/admin/import").send({ provider: "anilist", externalId: "30002" });
    expect(second.body).toMatchObject({ imported: 0, refreshed: 1 });
    expect(await prisma.mangaSeries.count({ where: { externalProvider: "anilist", externalId: "30002" } })).toBe(1);
    const row = await prisma.mangaSeries.findFirstOrThrow({ where: { externalId: "30002" } });
    expect(row.lastSyncedAt).toBeTruthy();
    expect(row.ratingCount).toBe(0); // imports never touch community stats
  });

  it("degrades gracefully when the provider is down, and the catalog keeps working", async () => {
    const down: MetadataProvider = {
      name: "anilist",
      attribution: { label: "AniList", url: "https://anilist.co" },
      search: async () => { throw new ProviderError("anilist", "Couldn't reach AniList."); },
      popular: async () => { throw new ProviderError("anilist", "Couldn't reach AniList."); },
      getById: async () => { throw new ProviderError("anilist", "Couldn't reach AniList."); },
    };
    setProvider("anilist", down);
    const { agent } = await createUser("ADMIN");
    const res = await agent.post("/api/v1/admin/import").send({ provider: "anilist", search: "anything" });
    expect(res.status).toBe(503);
    expect(res.body.error.message).toMatch(/local catalog still works/);
    expect((await request(app).get("/api/v1/manga")).status).toBe(200);
  });

  it("reports a disabled provider clearly", async () => {
    setProvider("anilist", null);
    const { agent } = await createUser("ADMIN");
    const res = await agent.post("/api/v1/admin/import").send({ provider: "anilist", search: "x" });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("PROVIDER_DISABLED");
  });
});
