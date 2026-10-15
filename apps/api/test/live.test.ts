import request from "supertest";
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import { env } from "../src/config/env.js";
import { setChapterProvider, type ChapterProvider, type ProviderChapter } from "../src/providers/chapters.js";
import { outbox } from "../src/services/mailer.js";
import { app, createUser, prisma, resetDb, seedCatalog } from "./helpers.js";

const JOBS = { Authorization: `Bearer ${process.env.JOBS_TOKEN}` };

class FakeChapters implements ChapterProvider {
  readonly name = "mangadex";
  readonly attribution = { label: "MangaDex", url: "https://mangadex.org" };
  feed = new Map<string, ProviderChapter[]>();
  matches = new Map<string, string>();
  async matchAniList(anilistId: string) {
    return this.matches.get(anilistId) ?? null;
  }
  async chaptersSince(externalId: string, since: Date | null) {
    return (this.feed.get(externalId) ?? []).filter((c) => !since || c.releasedAt >= since);
  }
}

const ch = (number: number, hoursAgo: number, externalUrl: string | null = null): ProviderChapter => ({
  number,
  title: `Chapter ${number}`,
  releasedAt: new Date(Date.now() - hoursAgo * 3_600_000),
  language: "en",
  externalUrl,
  publisher: externalUrl ? "MANGA Plus" : null,
});

let ids: Record<string, string>;
let fake: FakeChapters;

beforeEach(async () => {
  await resetDb();
  ids = await seedCatalog();
  fake = new FakeChapters();
  setChapterProvider(fake);
});
afterEach(() => {
  env.requireEmailVerification = false;
  env.adminEmails = [];
});
afterAll(() => setChapterProvider(null));

describe("email confirmation", () => {
  it("holds sign-in until the emailed link is used, then signs the member in", async () => {
    env.requireEmailVerification = true;
    const reg = await request(app).post("/api/v1/auth/register").send({ email: "new@test.dev", username: "newbie", password: "password123" });
    expect(reg.status).toBe(201);
    expect(reg.body).toMatchObject({ user: null, verificationRequired: true, email: "new@test.dev" });
    expect(reg.headers["set-cookie"]).toBeUndefined();

    const login = await request(app).post("/api/v1/auth/login").send({ identifier: "newbie", password: "password123" });
    expect(login.status).toBe(403);
    expect(login.body.error.code).toBe("EMAIL_NOT_VERIFIED");

    const mail = outbox.findLast((m) => m.to === "new@test.dev")!;
    expect(mail.subject).toMatch(/Confirm/);
    const token = decodeURIComponent(/token=([^\s&]+)/.exec(mail.text)![1]!);

    const agent = request.agent(app);
    const ok = await agent.post("/api/v1/auth/verify-email").send({ token });
    expect(ok.status).toBe(200);
    expect(ok.body.user).toMatchObject({ username: "newbie", emailVerified: true });
    expect((await agent.get("/api/v1/auth/me")).status).toBe(200);

    const again = await request(app).post("/api/v1/auth/verify-email").send({ token });
    expect(again.status).toBe(400);
    expect((await request(app).post("/api/v1/auth/login").send({ identifier: "newbie", password: "password123" })).status).toBe(200);
  });

  it("resends a link without revealing whether the account exists", async () => {
    env.requireEmailVerification = true;
    await request(app).post("/api/v1/auth/register").send({ email: "late@test.dev", username: "late", password: "password123" });
    const before = outbox.length;
    const a = await request(app).post("/api/v1/auth/resend-verification").send({ email: "late@test.dev" });
    const b = await request(app).post("/api/v1/auth/resend-verification").send({ email: "nobody@test.dev" });
    expect(a.status).toBe(200);
    expect(b.body.message).toBe(a.body.message);
    expect(outbox.length).toBe(before + 1);
  });

  it("gives the Admin role to emails listed in ADMIN_EMAILS", async () => {
    env.adminEmails = ["owner@test.dev"];
    const reg = await request(app).post("/api/v1/auth/register").send({ email: "owner@test.dev", username: "owner", password: "password123" });
    expect(reg.body.user.role).toBe("ADMIN");
    const other = await request(app).post("/api/v1/auth/register").send({ email: "reader@test.dev", username: "reader", password: "password123" });
    expect(other.body.user.role).toBe("USER");
  });
});

describe("scheduled jobs", () => {
  it("requires the jobs token", async () => {
    expect((await request(app).post("/internal/jobs/cleanup")).status).toBe(401);
    expect((await request(app).post("/internal/jobs/cleanup").set("Authorization", "Bearer wrong-token-wrong-token")).status).toBe(401);
    const ok = await request(app).post("/internal/jobs/cleanup").set(JOBS);
    expect(ok.status).toBe(200);
    expect(ok.body).toMatchObject({ job: "cleanup", ok: true });
    expect(await prisma.jobRun.count({ where: { job: "cleanup", ok: true } })).toBe(1);
    expect((await request(app).post("/internal/jobs/nope").set(JOBS)).status).toBe(404);
  });

  it("links series to the chapter source only on an exact AniList match", async () => {
    await prisma.mangaSeries.update({ where: { id: ids["Berserk"] }, data: { externalProvider: "anilist", externalId: "30002" } });
    await prisma.mangaSeries.update({ where: { id: ids["Tower of God"] }, data: { externalProvider: "anilist", externalId: "85143" } });
    fake.matches.set("30002", "801513ba-a712-498c-8f57-cae55b38cc92");
    const res = await request(app).post("/internal/jobs/link-sources").set(JOBS);
    expect(res.body.stats).toMatchObject({ tried: 2, linked: 1, unmatched: 1 });
    const link = await prisma.seriesSourceLink.findFirstOrThrow({ where: { seriesId: ids["Berserk"] } });
    expect(link.externalId).toBe("801513ba-a712-498c-8f57-cae55b38cc92");
    // Unmatched series are listed for admins instead of guessed.
    const { agent } = await createUser("ADMIN");
    const unmatched = await agent.get("/api/v1/admin/source-links/unmatched");
    expect(unmatched.body.items.map((i: { title: string }) => i.title)).toEqual(["Tower of God"]);
  });

  it("finds new chapters, notifies followers once, and updates the live feed", async () => {
    const seriesId = ids["Tower of God"]!;
    await prisma.seriesSourceLink.create({ data: { seriesId, provider: "mangadex", externalId: "tog" } });
    fake.feed.set("tog", [ch(600, 48), ch(601, 24, "https://www.webtoons.com/en/fantasy/tower-of-god/ep-601")]);
    const { user, agent } = await createUser();
    expect((await agent.put(`/api/v1/manga/${seriesId}/follow`).send({})).body.following).toBe(true);

    // First sync back-fills quietly.
    const first = await request(app).post("/internal/jobs/sync-chapters").set(JOBS);
    expect(first.body.stats).toMatchObject({ checked: 1, newChapters: 0 });
    expect(await prisma.chapterMetadata.count({ where: { seriesId } })).toBe(2);
    expect(await prisma.notification.count()).toBe(0);

    // A new chapter appears.
    await prisma.seriesSourceLink.updateMany({ data: { lastCheckedAt: new Date(Date.now() - 20 * 60_000) } });
    fake.feed.set("tog", [...fake.feed.get("tog")!, ch(602, 0)]);
    const second = await request(app).post("/internal/jobs/sync-chapters").set(JOBS);
    expect(second.body.stats).toMatchObject({ checked: 1, newChapters: 1 });

    const series = await prisma.mangaSeries.findUniqueOrThrow({ where: { id: seriesId } });
    expect(series.latestChapter).toBe(602);
    const unread = await agent.get("/api/v1/notifications/unread-count");
    expect(unread.body.count).toBe(1);
    const list = await agent.get("/api/v1/notifications");
    expect(list.body.items[0]).toMatchObject({ type: "NEW_CHAPTER", series: { slug: series.slug }, chapter: { number: 602 } });

    // Re-running never duplicates.
    await prisma.seriesSourceLink.updateMany({ data: { lastCheckedAt: new Date(Date.now() - 20 * 60_000) } });
    await request(app).post("/internal/jobs/sync-chapters").set(JOBS);
    expect(await prisma.chapterMetadata.count({ where: { seriesId } })).toBe(3);
    expect(await prisma.notification.count({ where: { userId: user.id } })).toBe(1);

    const latest = await request(app).get("/api/v1/latest-updates");
    expect(latest.body.items[0].series.id).toBe(seriesId);
    expect(latest.body.items[0].chapters.map((c: { number: number }) => c.number)).toEqual([602, 601, 600]);
    expect(latest.body.items[0].chapters[1]).toMatchObject({ publisher: "MANGA Plus" });

    expect((await agent.post("/api/v1/notifications/read-all")).body.updated).toBe(1);
    expect((await agent.get("/api/v1/notifications/unread-count")).body.count).toBe(0);
  });

  it("auto-curates the hero carousel without touching admin pins", async () => {
    const { user: admin } = await createUser("ADMIN");
    await prisma.featuredSeries.create({ data: { seriesId: ids["Berserk"]!, reason: "Pinned by an editor.", createdById: admin.id } });
    await prisma.mangaSeries.updateMany({ data: { coverUrl: "https://example.com/c.jpg", popularityScore: 1 } });
    const { agent } = await createUser();
    await agent.post("/api/v1/library").send({ seriesId: ids["Solo Leveling"], status: "READING" });
    const res = await request(app).post("/internal/jobs/curate").set(JOBS);
    expect(res.status).toBe(200);
    expect(res.body.stats.picks).toHaveLength(5);
    expect(res.body.stats.picks[0]).toBe(ids["Solo Leveling"]);
    expect(res.body.stats.picks).not.toContain(ids["Berserk"]);
    expect(await prisma.featuredSeries.count({ where: { isAuto: false } })).toBe(1);
    // The next run skips titles shown in the last 14 days.
    const again = await request(app).post("/internal/jobs/curate").set(JOBS);
    expect(again.body.stats.picks.filter((p: string) => res.body.stats.picks.includes(p))).toHaveLength(0);
  });
});

describe("reader", () => {
  async function hostChapters() {
    const { agent: admin } = await createUser("ADMIN");
    for (const n of [1, 2, 3]) {
      const r = await admin.post(`/api/v1/admin/manga/${ids["Death Note"]}/chapters`).send({
        number: n,
        title: `Part ${n}`,
        pages: [{ url: "/sample/page-1.svg", width: 800, height: 1200 }, { url: "/sample/page-2.svg" }],
      });
      expect(r.status).toBe(201);
    }
    return prisma.mangaSeries.findUniqueOrThrow({ where: { id: ids["Death Note"] } });
  }

  it("serves hosted chapters with pages and neighbours", async () => {
    const s = await hostChapters();
    const res = await request(app).get(`/api/v1/manga/${s.slug}/chapters/2`);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ prev: 1, next: 3, chapterNumbers: [1, 2, 3], chapter: { number: 2, readable: true } });
    expect(res.body.pages).toHaveLength(2);
    expect((await request(app).get(`/api/v1/manga/${s.slug}/chapters/9`)).status).toBe(404);
    const list = await request(app).get(`/api/v1/manga/${s.slug}/chapters?order=asc`);
    expect(list.body).toMatchObject({ total: 3, first: 1, latest: 3 });
  });

  it("saves progress automatically and never moves it backwards", async () => {
    const s = await hostChapters();
    const { user, agent } = await createUser();
    const c2 = (await request(app).get(`/api/v1/manga/${s.slug}/chapters/2`)).body.chapter.id;
    const c1 = (await request(app).get(`/api/v1/manga/${s.slug}/chapters/1`)).body.chapter.id;

    expect((await agent.post(`/api/v1/chapters/${c2}/read`)).body).toEqual({ status: "READING", progressChapter: 2 });
    expect((await agent.post(`/api/v1/chapters/${c1}/read`)).body).toEqual({ status: "READING", progressChapter: 2 });
    const entry = await prisma.libraryEntry.findUniqueOrThrow({ where: { userId_seriesId: { userId: user.id, seriesId: s.id } } });
    expect(entry.progressChapter).toBe(2);
    expect(await prisma.seriesFollow.count({ where: { userId: user.id } })).toBe(1);

    // Plan to Read moves to Reading.
    const { user: u2, agent: a2 } = await createUser();
    await a2.post("/api/v1/library").send({ seriesId: s.id, status: "PLAN_TO_READ" });
    expect((await a2.post(`/api/v1/chapters/${c1}/read`)).body.status).toBe("READING");
    expect((await prisma.libraryEntry.findFirstOrThrow({ where: { userId: u2.id } })).progressChapter).toBe(1);
  });

  it("counts reactions and holds spammy comments for review", async () => {
    const s = await hostChapters();
    const chapterId = (await request(app).get(`/api/v1/manga/${s.slug}/chapters/1`)).body.chapter.id;
    const { agent } = await createUser();
    const { agent: other } = await createUser();
    await agent.put(`/api/v1/chapters/${chapterId}/reaction`).send({ kind: "HYPE" });
    const r = await other.put(`/api/v1/chapters/${chapterId}/reaction`).send({ kind: "HYPE" });
    expect(r.body.reactions.HYPE).toBe(2);
    expect((await other.put(`/api/v1/chapters/${chapterId}/reaction`).send({ kind: null })).body.reactions.HYPE).toBe(1);

    const good = await agent.post(`/api/v1/chapters/${chapterId}/comments`).send({ body: "That ending was incredible.", containsSpoilers: true });
    expect(good.status).toBe(201);
    expect(good.body.isHidden).toBe(false);
    const spam = await other.post(`/api/v1/chapters/${chapterId}/comments`).send({ body: "join https://a.io https://b.io https://c.io", containsSpoilers: false });
    expect(spam.body.isHidden).toBe(true);

    const publicList = await request(app).get(`/api/v1/chapters/${chapterId}/comments`);
    expect(publicList.body.items).toHaveLength(1);
    const { agent: mod } = await createUser("MODERATOR");
    const held = await mod.get("/api/v1/admin/chapter-comments/held");
    expect(held.body.items).toHaveLength(1);
    await mod.patch(`/api/v1/admin/chapter-comments/${spam.body.id}/visibility`).send({ hidden: false });
    expect((await request(app).get(`/api/v1/chapters/${chapterId}/comments`)).body.items).toHaveLength(2);
  });

  it("shows follow state on the series page and auto-follows new readers", async () => {
    const { agent } = await createUser();
    await agent.post("/api/v1/library").send({ seriesId: ids["Berserk"], status: "READING" });
    const detail = await agent.get(`/api/v1/manga/${ids["Berserk"]}`);
    expect(detail.body.viewer.isFollowing).toBe(true);
    expect(detail.body.followerCount).toBe(1);
    await agent.delete(`/api/v1/manga/${ids["Berserk"]}/follow`);
    expect((await agent.get(`/api/v1/manga/${ids["Berserk"]}`)).body.viewer.isFollowing).toBe(false);
  });
});
