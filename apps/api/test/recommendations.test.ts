import request from "supertest";
import { beforeAll, describe, expect, it } from "vitest";
import {
  buildProfile,
  diversify,
  scoreCandidate,
  similarity,
  type SeriesFeatures,
  type UserSignals,
} from "../src/services/recommendation/scoring.js";
import { app, createUser, resetDb, seedCatalog } from "./helpers.js";

const g = (...names: string[]) => names.map((n) => ({ slug: n.toLowerCase(), name: n }));
const series = (id: string, genres: string[], extra: Partial<SeriesFeatures> = {}): SeriesFeatures => ({
  id,
  title: id,
  type: "MANGA",
  genres: g(...genres),
  tags: [],
  creators: [],
  ratingAvg: null,
  ratingCount: 0,
  popularityScore: 0,
  ...extra,
});
const empty: UserSignals = { preferredGenres: [], library: [], ratings: [], favorites: [], views: [], searches: [] };
const ctx = { globalMean: 7, maxPopularity: 10, seed: "test" };

describe("recommendation scoring (unit)", () => {
  it("builds a taste profile from ratings: high scores add weight, low scores subtract", () => {
    const p = buildProfile({
      ...empty,
      ratings: [
        { series: series("a", ["Fantasy"]), score: 10 },
        { series: series("b", ["Romance"]), score: 2 },
      ],
    });
    expect(p.genres.get("fantasy")).toBeGreaterThan(0);
    expect(p.genres.get("romance")).toBeLessThan(0);
  });

  it("ranks genre matches above non-matches and explains why", () => {
    const p = buildProfile({ ...empty, preferredGenres: ["fantasy"], favorites: [series("fav", ["Fantasy", "Adventure"])] });
    const match = scoreCandidate(series("m", ["Fantasy", "Adventure"]), p, ctx);
    const miss = scoreCandidate(series("x", ["Romance"]), p, ctx);
    expect(match.score).toBeGreaterThan(miss.score);
    expect(match.reasons.join(" ")).toMatch(/Because you like (Fantasy|Adventure)/);
  });

  it("dropped series push their genres down", () => {
    const p = buildProfile({ ...empty, library: [{ series: series("d", ["Horror"]), status: "DROPPED" }], preferredGenres: ["comedy"] });
    expect(scoreCandidate(series("h", ["Horror"]), p, ctx).score).toBeLessThan(scoreCandidate(series("c", ["Comedy"]), p, ctx).score);
  });

  it("credits shared creators with a named reason", () => {
    const fav = series("Monster", ["Thriller"], { creators: [{ slug: "urasawa", name: "Naoki Urasawa" }] });
    const p = buildProfile({ ...empty, favorites: [fav] });
    const cand = scoreCandidate(series("Pluto", ["Sci-Fi"], { creators: [{ slug: "urasawa", name: "Naoki Urasawa" }] }), p, ctx);
    expect(cand.reasons[0]).toBe("From Naoki Urasawa, who also made Monster");
  });

  it("diversifies so one genre doesn't take every slot", () => {
    const p = buildProfile({ ...empty, preferredGenres: ["fantasy", "comedy"] });
    const pool = [
      ...Array.from({ length: 6 }, (_, i) => scoreCandidate(series(`f${i}`, ["Fantasy"]), p, ctx)),
      scoreCandidate(series("c1", ["Comedy"]), p, ctx),
    ];
    const picked = diversify(pool, 4);
    expect(picked.map((s) => s.series.id)).toContain("c1");
  });

  it("similarity rewards shared genres and creators", () => {
    const a = series("a", ["Mystery", "Thriller"], { creators: [{ slug: "ohba", name: "Ohba" }] });
    expect(similarity(a, series("b", ["Mystery", "Thriller"])).score).toBeGreaterThan(similarity(a, series("c", ["Romance"])).score);
    expect(similarity(a, series("d", ["Comedy"], { creators: [{ slug: "ohba", name: "Ohba" }] })).reasons[0]).toBe("Same creator: Ohba");
  });
});

describe("recommendations API", () => {
  let ids: Record<string, string>;
  beforeAll(async () => {
    await resetDb();
    ids = await seedCatalog();
  });

  it("gives signed-out visitors and new users non-personalised fallback shelves", async () => {
    const anon = await request(app).get("/api/v1/recommendations");
    expect(anon.status).toBe(200);
    expect(anon.body.personalised).toBe(false);
    const { agent } = await createUser();
    expect((await agent.get("/api/v1/recommendations")).body.personalised).toBe(false);
  });

  it("personalises from stored activity and excludes titles already in the library", async () => {
    const { agent } = await createUser();
    await agent.post("/api/v1/library").send({ seriesId: ids["Solo Leveling"], status: "COMPLETED", score: 10 }).expect(201);
    await agent.post("/api/v1/favorites").send({ seriesId: ids["Solo Leveling"] }).expect(201);
    await agent.patch("/api/v1/users/me").send({ preferences: { favoriteGenres: ["fantasy", "action"] } }).expect(200);

    const res = await agent.get("/api/v1/recommendations");
    expect(res.body.personalised).toBe(true);
    const forYou = res.body.shelves.find((s: { key: string }) => s.key === "for-you");
    const titles = forYou.items.map((i: { series: { title: string } }) => i.series.title);
    expect(titles).not.toContain("Solo Leveling");
    expect(titles.slice(0, 2)).toContain("Tower of God"); // action + fantasy manhwa
    expect(forYou.items[0].reasons.length).toBeGreaterThan(0);
    expect(res.body.shelves.map((s: { key: string }) => s.key)).toEqual(
      expect.arrayContaining(["because-you-read", "similar-favorites", "popular-in-genre"]),
    );
  });

  it("honours dismissals", async () => {
    const { agent } = await createUser();
    await agent.post("/api/v1/library").send({ seriesId: ids["Solo Leveling"], status: "COMPLETED", score: 10 }).expect(201);
    await agent.patch("/api/v1/users/me").send({ preferences: { favoriteGenres: ["fantasy"] } }).expect(200);
    await agent.post("/api/v1/recommendations/dismiss").send({ seriesId: ids["Tower of God"] }).expect(204);
    const res = await agent.get("/api/v1/recommendations");
    const all = res.body.shelves.flatMap((s: { items: { series: { id: string } }[] }) => s.items.map((i) => i.series.id));
    expect(all).not.toContain(ids["Tower of God"]);
  });
});
