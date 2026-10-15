import { CONTENT_TYPES } from "@mangaforever/shared";
import { env } from "../config/env.js";
import { AppError } from "../lib/errors.js";
import { logger } from "../lib/logger.js";
import { prisma } from "../lib/prisma.js";
import { getChapterProvider } from "../providers/chapters.js";
import { importSeries } from "../providers/import.service.js";
import { getProvider } from "../providers/registry.js";
import { writeSeries } from "../services/catalog-writer.js";
import { recordChapters } from "../services/chapters.service.js";
import { sendMail } from "../services/mailer.js";
import { recomputeSeriesStats } from "../services/stats.service.js";

/**
 * Automatic jobs. Free hosting can't keep a background worker running, so a scheduler
 * (GitHub Actions, see .github/workflows/jobs.yml) calls POST /internal/jobs/:job with JOBS_TOKEN.
 * Every run is recorded in JobRun and shown in the admin panel.
 */
type JobStats = Record<string, unknown>;
type Job = (opts: { limit?: number }) => Promise<JobStats>;

const DAY = 86_400_000;

/** Every 15 minutes: ask the chapter source for new chapters of due series and announce them. */
async function syncChapters({ limit = 40 }): Promise<JobStats> {
  const provider = getChapterProvider();
  if (!provider) return { skipped: "Chapter provider disabled (CHAPTER_PROVIDER=none)." };
  const due = new Date(Date.now() - 10 * 60_000);
  const candidates = await prisma.seriesSourceLink.findMany({
    where: {
      provider: provider.name,
      series: { isArchived: false },
      OR: [{ lastCheckedAt: null }, { lastCheckedAt: { lt: due }, series: { status: { in: ["ONGOING", "HIATUS", "UPCOMING", "UNKNOWN"] } } }],
    },
    orderBy: { lastCheckedAt: { sort: "asc", nulls: "first" } },
    take: 400,
    include: { series: { select: { id: true, _count: { select: { follows: true } } } } },
  });
  // Series people follow come first, then whichever was checked longest ago.
  const followed = (l: (typeof candidates)[number]) => (l.series._count.follows > 0 ? 0 : 1);
  candidates.sort((a, b) => followed(a) - followed(b) || (a.lastCheckedAt?.getTime() ?? 0) - (b.lastCheckedAt?.getTime() ?? 0));

  let checked = 0, newChapters = 0, linksUpdated = 0, errors = 0;
  for (const link of candidates.slice(0, limit)) {
    const startedAt = new Date();
    try {
      // Overlap the window so chapters published with a delayed timestamp aren't missed.
      const since = link.lastCheckedAt ? new Date(link.lastCheckedAt.getTime() - 6 * 3_600_000) : null;
      const chapters = await provider.chaptersSince(link.externalId, since);
      const { created, updated } = await recordChapters(link.seriesId, provider.name, chapters, { announce: link.lastCheckedAt !== null });
      const newest = chapters.reduce<Date | null>((m, c) => (!m || c.releasedAt > m ? c.releasedAt : m), link.lastChapterAt);
      await prisma.seriesSourceLink.update({ where: { id: link.id }, data: { lastCheckedAt: startedAt, lastChapterAt: newest } });
      checked++;
      if (link.lastCheckedAt) newChapters += created.length;
      linksUpdated += updated;
    } catch (err) {
      errors++;
      logger.warn({ err, seriesId: link.seriesId }, "Chapter sync failed for one series");
      await prisma.seriesSourceLink.update({ where: { id: link.id }, data: { lastCheckedAt: startedAt } }).catch(() => {});
    }
  }
  if (checked === 0 && errors > 0) throw new Error(`Chapter source unreachable (${errors} failures).`);
  return { due: candidates.length, checked, newChapters, officialLinksAdded: linksUpdated, errors };
}

/** Daily: match imported series to the chapter source. Only exact AniList-ID matches are accepted. */
async function linkSources({ limit = 25 }): Promise<JobStats> {
  const provider = getChapterProvider();
  if (!provider) return { skipped: "Chapter provider disabled (CHAPTER_PROVIDER=none)." };
  const series = await prisma.mangaSeries.findMany({
    where: {
      isArchived: false,
      externalProvider: "anilist",
      externalId: { not: null },
      sourceLinks: { none: { provider: provider.name } },
      OR: [{ sourceLinkCheckedAt: null }, { sourceLinkCheckedAt: { lt: new Date(Date.now() - 7 * DAY) } }],
    },
    orderBy: [{ externalPopularity: { sort: "desc", nulls: "last" } }, { id: "asc" }],
    take: limit,
    select: { id: true, title: true, altTitles: true, localizedTitles: true, externalId: true },
  });
  let linked = 0, errors = 0;
  for (const s of series) {
    try {
      const en = (s.localizedTitles as Record<string, string> | null)?.en;
      const titles = [...new Set([s.title, ...(en ? [en] : []), ...s.altTitles.filter((t) => /^[\x20-\x7e]+$/.test(t))])];
      const externalId = await provider.matchAniList(s.externalId!, titles);
      if (externalId) {
        await prisma.seriesSourceLink.create({ data: { seriesId: s.id, provider: provider.name, externalId } }).then(() => linked++, () => {});
      }
      await prisma.mangaSeries.update({ where: { id: s.id }, data: { sourceLinkCheckedAt: new Date() } });
    } catch (err) {
      errors++;
      logger.warn({ err, seriesId: s.id }, "Source linking failed for one series");
    }
  }
  return { tried: series.length, linked, unmatched: series.length - linked - errors, errors };
}

/** Daily: refresh status, chapter counts, covers and scores from AniList, oldest first. */
async function refreshMetadata({ limit = 40 }): Promise<JobStats> {
  const provider = getProvider("anilist");
  if (!provider) return { skipped: "Metadata provider disabled (METADATA_PROVIDER=none)." };
  const rows = await prisma.mangaSeries.findMany({
    where: { externalProvider: "anilist", externalId: { not: null }, isArchived: false },
    orderBy: { lastSyncedAt: { sort: "asc", nulls: "first" } },
    take: limit,
    select: { id: true, externalId: true },
  });
  let refreshed = 0, errors = 0;
  for (const r of rows) {
    try {
      const fresh = await provider.getById(r.externalId!);
      if (fresh) {
        await writeSeries(fresh, { id: r.id });
        refreshed++;
      }
    } catch (err) {
      errors++;
      logger.warn({ err, seriesId: r.id }, "Metadata refresh failed for one series");
    }
  }
  if (rows.length && refreshed === 0 && errors > 0) throw new Error("AniList unreachable.");
  return { refreshed, errors };
}

/** Weekly: add newly popular manga, manhwa and manhua, a fresh page each week. */
async function importNew({ limit = 25 }): Promise<JobStats> {
  if (!getProvider("anilist")) return { skipped: "Metadata provider disabled (METADATA_PROVIDER=none)." };
  const previous = await prisma.jobRun.count({ where: { job: "import-series", ok: true } });
  const page = (previous % 8) + 1;
  const out: Record<string, { imported: number; skipped: number }> = {};
  for (const type of CONTENT_TYPES) {
    const r = await importSeries(null, { provider: "anilist", contentType: type, page, limit, skipExisting: true });
    out[type] = { imported: r.imported, skipped: r.skipped };
  }
  return { page, ...out };
}

/** Hourly: recompute community statistics behind Trending, Top Rated and the popularity score. */
async function rankings(): Promise<JobStats> {
  const ids = await prisma.mangaSeries.findMany({ where: { isArchived: false }, select: { id: true } });
  for (const { id } of ids) await recomputeSeriesStats(id);
  return { series: ids.length };
}

/**
 * Daily: pick the home-page hero carousel by rule so nothing needs an editor.
 * Score = new chapters this week × 3 + new readers × 2 + new favorites × 2 + rating / 2.
 * Titles auto-picked in the last 14 days are skipped; admin pins are never touched.
 */
async function curate({ limit = 5 }): Promise<JobStats> {
  const weekAgo = new Date(Date.now() - 7 * DAY);
  const recentRuns = await prisma.jobRun.findMany({ where: { job: "curate", ok: true, startedAt: { gt: new Date(Date.now() - 14 * DAY) } }, select: { stats: true } });
  const recentlyShown = new Set(recentRuns.flatMap((r) => ((r.stats as { picks?: string[] } | null)?.picks ?? [])));
  const pinned = new Set((await prisma.featuredSeries.findMany({ where: { isAuto: false }, select: { seriesId: true } })).map((f) => f.seriesId));

  const [chapters, adds, favs] = await Promise.all([
    prisma.chapterMetadata.groupBy({ by: ["seriesId"], where: { releasedAt: { gt: weekAgo } }, _count: { _all: true } }),
    prisma.libraryEntry.groupBy({ by: ["seriesId"], where: { createdAt: { gt: weekAgo } }, _count: { _all: true } }),
    prisma.favorite.groupBy({ by: ["seriesId"], where: { createdAt: { gt: weekAgo } }, _count: { _all: true } }),
  ]);
  const score = new Map<string, { chapters: number; readers: number; favorites: number }>();
  const bump = (id: string, k: "chapters" | "readers" | "favorites", n: number) => {
    const cur = score.get(id) ?? { chapters: 0, readers: 0, favorites: 0 };
    cur[k] += n;
    score.set(id, cur);
  };
  chapters.forEach((r) => bump(r.seriesId, "chapters", r._count._all));
  adds.forEach((r) => bump(r.seriesId, "readers", r._count._all));
  favs.forEach((r) => bump(r.seriesId, "favorites", r._count._all));

  // Fall back to the most popular titles when the week was quiet.
  const ids = [...score.keys()];
  const series = await prisma.mangaSeries.findMany({
    where: { isArchived: false, isAdult: false, coverUrl: { not: null }, OR: [{ id: { in: ids } }, { popularityScore: { gt: 0 } }, { externalPopularity: { not: null } }] },
    orderBy: [{ popularityScore: "desc" }, { externalPopularity: { sort: "desc", nulls: "last" } }],
    take: 300,
    select: { id: true, title: true, ratingAvg: true, externalRating: true },
  });
  const ranked = series
    .filter((s) => !pinned.has(s.id) && !recentlyShown.has(s.id))
    .map((s) => {
      const c = score.get(s.id) ?? { chapters: 0, readers: 0, favorites: 0 };
      return { s, c, total: c.chapters * 3 + c.readers * 2 + c.favorites * 2 + (s.ratingAvg ?? s.externalRating ?? 0) / 2 };
    })
    .sort((a, b) => b.total - a.total)
    .slice(0, limit);

  const reason = (c: { chapters: number; readers: number; favorites: number }) => {
    const parts = [
      c.chapters && `${c.chapters} new chapter${c.chapters > 1 ? "s" : ""}`,
      c.readers && `${c.readers} new reader${c.readers > 1 ? "s" : ""}`,
      c.favorites && `${c.favorites} new favorite${c.favorites > 1 ? "s" : ""}`,
    ].filter(Boolean);
    return parts.length ? `Picked this week for ${parts.join(", ")}.` : "A reader favorite worth discovering this week.";
  };
  await prisma.$transaction([
    prisma.featuredSeries.deleteMany({ where: { isAuto: true } }),
    ...ranked.map((r, i) =>
      prisma.featuredSeries.create({ data: { seriesId: r.s.id, reason: reason(r.c), position: 50 + i, isAuto: true } }),
    ),
  ]);
  return { picks: ranked.map((r) => r.s.id), titles: ranked.map((r) => r.s.title) };
}

/** Daily (opt-in): one email per member listing new chapters of series they follow. */
async function digest(): Promise<JobStats> {
  const since = new Date(Date.now() - 2 * DAY);
  const pending = await prisma.notification.findMany({
    where: { type: "NEW_CHAPTER", emailedAt: null, createdAt: { gt: since }, user: { isSuspended: false, preference: { emailDigest: true } } },
    orderBy: { createdAt: "desc" },
    include: { user: { select: { id: true, email: true, username: true } }, series: { select: { id: true, slug: true, title: true } }, chapter: { select: { number: true } } },
  });
  const optedOut = new Set(
    (await prisma.seriesFollow.findMany({ where: { notifyEmail: false, userId: { in: [...new Set(pending.map((p) => p.userId))] } }, select: { userId: true, seriesId: true } })).map((f) => `${f.userId}:${f.seriesId}`),
  );
  const byUser = new Map<string, typeof pending>();
  for (const n of pending) {
    if (n.seriesId && optedOut.has(`${n.userId}:${n.seriesId}`)) continue;
    byUser.set(n.userId, [...(byUser.get(n.userId) ?? []), n]);
  }
  const base = env.APP_URL.replace(/\/$/, "");
  let emails = 0;
  for (const [, items] of byUser) {
    const { user } = items[0]!;
    const lines = items.slice(0, 25).map((n) => `• ${n.series?.title ?? "A series you follow"} — chapter ${n.chapter?.number ?? "?"}: ${base}/manga/${n.series?.slug}/chapter/${n.chapter?.number}`);
    await sendMail({
      to: user.email,
      subject: `${items.length} new chapter${items.length > 1 ? "s" : ""} on MangaForEver`,
      text: `Hi ${user.username}, here's what came out for the series you follow:\n\n${lines.join("\n")}\n\nTurn this email off any time in Settings: ${base}/settings`,
    });
    await prisma.notification.updateMany({ where: { id: { in: items.map((i) => i.id) } }, data: { emailedAt: new Date() } });
    emails++;
  }
  return { emails };
}

/** Daily: remove expired sessions and links, old notifications and old job history. */
async function cleanup(): Promise<JobStats> {
  const now = new Date();
  const [sessions, resets, verifies, readNotifs, oldNotifs, runs] = await Promise.all([
    prisma.session.deleteMany({ where: { expiresAt: { lt: now } } }),
    prisma.passwordResetToken.deleteMany({ where: { expiresAt: { lt: now } } }),
    prisma.emailVerificationToken.deleteMany({ where: { expiresAt: { lt: now } } }),
    prisma.notification.deleteMany({ where: { readAt: { lt: new Date(Date.now() - 60 * DAY) } } }),
    prisma.notification.deleteMany({ where: { createdAt: { lt: new Date(Date.now() - 180 * DAY) } } }),
    prisma.jobRun.deleteMany({ where: { startedAt: { lt: new Date(Date.now() - 30 * DAY) } } }),
  ]);
  return { sessions: sessions.count, tokens: resets.count + verifies.count, notifications: readNotifs.count + oldNotifs.count, jobRuns: runs.count };
}

export const JOBS: Record<string, { run: Job; schedule: string; description: string }> = {
  "sync-chapters": { run: syncChapters, schedule: "Every 15 minutes", description: "Find new chapters, update Latest, notify followers." },
  "link-sources": { run: linkSources, schedule: "Daily", description: "Match new series to the chapter source." },
  "refresh-metadata": { run: refreshMetadata, schedule: "Daily", description: "Refresh status, counts, covers and scores from AniList." },
  "import-series": { run: importNew, schedule: "Weekly", description: "Add newly popular manga, manhwa and manhua." },
  rankings: { run: rankings, schedule: "Hourly", description: "Recompute Trending, Top Rated and popularity." },
  curate: { run: curate, schedule: "Daily", description: "Pick the home-page hero carousel." },
  digest: { run: digest, schedule: "Daily", description: "Email opted-in members their new chapters." },
  cleanup: { run: cleanup, schedule: "Daily", description: "Remove expired sessions, links and old notifications." },
};

const running = new Set<string>();

/** Run one job, recording it in JobRun. Overlapping runs of the same job are refused. */
export async function runJob(name: string, opts: { limit?: number } = {}) {
  const job = JOBS[name];
  if (!job) throw new AppError(404, "NOT_FOUND", `Unknown job "${name}".`);
  if (running.has(name)) throw new AppError(409, "JOB_RUNNING", `"${name}" is already running.`);
  running.add(name);
  const run = await prisma.jobRun.create({ data: { job: name } });
  try {
    const stats = await job.run(opts);
    const done = await prisma.jobRun.update({ where: { id: run.id }, data: { finishedAt: new Date(), ok: true, stats: JSON.parse(JSON.stringify(stats)) } });
    logger.info({ job: name, stats }, "Job finished");
    return { id: done.id, job: name, ok: true, durationMs: done.finishedAt!.getTime() - done.startedAt.getTime(), stats };
  } catch (err) {
    const message = (err as Error).message ?? String(err);
    await prisma.jobRun.update({ where: { id: run.id }, data: { finishedAt: new Date(), ok: false, error: message.slice(0, 2000) } });
    logger.error({ err, job: name }, "Job failed");
    throw new AppError(500, "JOB_FAILED", `${name} failed: ${message}`);
  } finally {
    running.delete(name);
  }
}

/** Latest run of every job plus recent history, for the admin dashboard. */
export async function jobStatus() {
  const recent = await prisma.jobRun.findMany({ orderBy: { startedAt: "desc" }, take: 60 });
  return Object.entries(JOBS).map(([name, j]) => {
    const runs = recent.filter((r) => r.job === name);
    const last = runs[0];
    let failStreak = 0;
    for (const r of runs) {
      if (r.ok === false) failStreak++;
      else break;
    }
    return {
      name,
      schedule: j.schedule,
      description: j.description,
      lastRun: last ? { startedAt: last.startedAt.toISOString(), finishedAt: last.finishedAt?.toISOString() ?? null, ok: last.ok, stats: last.stats, error: last.error } : null,
      failStreak,
    };
  });
}
