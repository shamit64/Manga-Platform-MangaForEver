import request from "supertest";
import { beforeAll, describe, expect, it } from "vitest";
import { app, resetDb, seedCatalog } from "./helpers.js";

let ids: Record<string, string>;
beforeAll(async () => {
  await resetDb();
  ids = await seedCatalog();
});

const titles = (res: request.Response) => res.body.items.map((i: { title: string }) => i.title);

describe("catalog search", () => {
  it("finds by main title", async () => {
    const res = await request(app).get("/api/v1/manga").query({ q: "death note" });
    expect(res.status).toBe(200);
    expect(titles(res)[0]).toBe("Death Note");
  });

  it("finds by alternative/native title", async () => {
    const res = await request(app).get("/api/v1/manga").query({ q: "天官赐福" });
    expect(titles(res)).toContain("Heaven Official's Blessing");
  });

  it("finds by creator name", async () => {
    const res = await request(app).get("/api/v1/manga").query({ q: "ohba" });
    expect(titles(res).sort()).toEqual(["Bakuman", "Death Note"]);
  });

  it("tolerates partial words and typos", async () => {
    expect(titles(await request(app).get("/api/v1/manga").query({ q: "solo lev" }))).toContain("Solo Leveling");
    expect(titles(await request(app).get("/api/v1/manga").query({ q: "berzerk" }))).toContain("Berserk");
  });

  it("returns an empty page for no matches", async () => {
    const res = await request(app).get("/api/v1/manga").query({ q: "zzzqqqxxx" });
    expect(res.body).toMatchObject({ items: [], total: 0 });
  });

  it("treats SQL/LIKE metacharacters as plain text", async () => {
    const res = await request(app).get("/api/v1/manga").query({ q: "%' OR 1=1 --" });
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(0);
  });

  it("serves autocomplete suggestions", async () => {
    const res = await request(app).get("/api/v1/manga/suggest").query({ q: "tow" });
    expect(res.body.items[0]).toMatchObject({ title: "Tower of God", type: "MANHWA" });
  });
});

describe("filters", () => {
  it("filters by content type", async () => {
    const res = await request(app).get("/api/v1/manga").query({ type: "MANHUA" });
    expect(res.body.total).toBe(2);
    expect(res.body.items.every((i: { type: string }) => i.type === "MANHUA")).toBe(true);
  });

  it("filters by multiple genres (all) and by any genre", async () => {
    const all = await request(app).get("/api/v1/manga").query({ genres: "action,fantasy" });
    expect(titles(all).sort()).toEqual(["Berserk", "Solo Leveling", "Tower of God"]);
    const any = await request(app).get("/api/v1/manga").query({ genres: "romance,historical", genreMode: "any" });
    expect(titles(any).sort()).toEqual(["Heaven Official's Blessing", "The Ravages of Time", "True Beauty"]);
  });

  it("filters by status and combines with search and type", async () => {
    const res = await request(app).get("/api/v1/manga").query({ q: "fantasy", type: "MANHWA", status: "ONGOING" });
    expect(titles(res)).toEqual(["Tower of God"]);
  });

  it("filters by year range and creator", async () => {
    const res = await request(app).get("/api/v1/manga").query({ yearFrom: 2008, yearTo: 2018, creator: "Obata" });
    expect(titles(res)).toEqual(["Bakuman"]);
  });

  it("rejects invalid filter values", async () => {
    const res = await request(app).get("/api/v1/manga").query({ type: "COMIC" });
    expect(res.status).toBe(422);
  });
});

describe("pagination and sorting", () => {
  it("paginates without overlap", async () => {
    const p1 = await request(app).get("/api/v1/manga").query({ sort: "title", pageSize: 3, page: 1 });
    const p2 = await request(app).get("/api/v1/manga").query({ sort: "title", pageSize: 3, page: 2 });
    expect(p1.body).toMatchObject({ total: 8, totalPages: 3, page: 1 });
    expect(titles(p1)).toEqual(["Bakuman", "Berserk", "Death Note"]);
    expect(titles(p2)).toEqual(["Heaven Official's Blessing", "Solo Leveling", "The Ravages of Time"]);
  });

  it("sorts by newest publication year", async () => {
    const res = await request(app).get("/api/v1/manga").query({ sort: "newest", pageSize: 2 });
    expect(titles(res)[0]).toBe("Heaven Official's Blessing");
  });

  it("caps page size", async () => {
    const res = await request(app).get("/api/v1/manga").query({ pageSize: 500 });
    expect(res.status).toBe(422);
  });
});

describe("details", () => {
  it("returns a detail page by id or slug, with unknown fields as null", async () => {
    const byId = await request(app).get(`/api/v1/manga/${ids["Death Note"]}`);
    expect(byId.status).toBe(200);
    expect(byId.body).toMatchObject({ title: "Death Note", chapterCount: 108, volumeCount: null, publisher: null, source: "SEED_SAMPLE" });
    expect(byId.body.creators).toEqual(
      expect.arrayContaining([expect.objectContaining({ name: "Tsugumi Ohba", role: "STORY" }), expect.objectContaining({ name: "Takeshi Obata", role: "ART" })]),
    );
    expect(byId.body.viewer).toBeUndefined();
    const bySlug = await request(app).get(`/api/v1/manga/${byId.body.slug}`);
    expect(bySlug.body.id).toBe(ids["Death Note"]);
  });

  it("404s for unknown series", async () => {
    const res = await request(app).get("/api/v1/manga/does-not-exist");
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("NOT_FOUND");
  });

  it("returns related series sharing genres or creators", async () => {
    const res = await request(app).get(`/api/v1/manga/${ids["Death Note"]}/recommendations`);
    expect(res.body.items[0].series.title).toBe("Bakuman");
    expect(res.body.items[0].reasons[0]).toMatch(/Same creator/);
  });

  it("does not fabricate chapter releases", async () => {
    const latest = await request(app).get("/api/v1/latest");
    expect(latest.body.chapterReleases).toEqual([]);
    expect(latest.body.catalogUpdates.length).toBeGreaterThan(0);
  });
});
