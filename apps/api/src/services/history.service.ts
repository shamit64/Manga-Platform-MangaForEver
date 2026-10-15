import { notFound } from "../lib/errors.js";
import { prisma } from "../lib/prisma.js";
import { pageResult } from "../lib/util.js";
import { cardInclude, toCard } from "./series-mapper.js";

async function prefs(userId: string) {
  return (
    (await prisma.userPreference.findUnique({ where: { userId } })) ?? (await prisma.userPreference.create({ data: { userId } }))
  );
}

/** Record that the user opened a series page — only when browsing history is switched on. */
export async function recordView(userId: string, seriesId: string) {
  const p = await prefs(userId);
  if (!p.trackBrowsingHistory) return { recorded: false };
  const exists = await prisma.mangaSeries.findFirst({ where: { id: seriesId, isArchived: false }, select: { id: true } });
  if (!exists) throw notFound("Series");
  await prisma.readingHistory.upsert({
    where: { userId_seriesId: { userId, seriesId } },
    update: { lastViewedAt: new Date(), viewCount: { increment: 1 } },
    create: { userId, seriesId },
  });
  return { recorded: true };
}

export async function listHistory(userId: string, page: number, pageSize: number) {
  const where = { userId };
  const [total, rows] = await Promise.all([
    prisma.readingHistory.count({ where }),
    prisma.readingHistory.findMany({
      where,
      orderBy: { lastViewedAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: { series: { include: cardInclude } },
    }),
  ]);
  const entries = await prisma.libraryEntry.findMany({
    where: { userId, seriesId: { in: rows.map((r) => r.seriesId) } },
    select: { seriesId: true, status: true, progressChapter: true },
  });
  const entryBy = new Map(entries.map((e) => [e.seriesId, e]));
  return pageResult(
    rows.map((r) => ({
      id: r.id,
      lastViewedAt: r.lastViewedAt.toISOString(),
      firstViewedAt: r.firstViewedAt.toISOString(),
      viewCount: r.viewCount,
      series: toCard(r.series),
      progress: entryBy.get(r.seriesId) ?? null,
    })),
    total,
    page,
    pageSize,
  );
}

export async function removeHistoryEntry(userId: string, id: string) {
  // Scoped by userId: deleting someone else's row is a no-op that reports not found.
  const { count } = await prisma.readingHistory.deleteMany({ where: { id, userId } });
  if (!count) throw notFound("History entry");
}

export async function clearHistory(userId: string, scope: "browsing" | "activity" | "all") {
  const ops = [];
  if (scope === "browsing" || scope === "all") ops.push(prisma.readingHistory.deleteMany({ where: { userId } }));
  if (scope === "activity" || scope === "all") ops.push(prisma.readingActivity.deleteMany({ where: { userId } }));
  const results = await prisma.$transaction(ops);
  return { deleted: results.reduce((n, r) => n + r.count, 0) };
}

// ───────── Search history ─────────

export async function recordSearch(userId: string, query: string) {
  const normalized = query.trim().toLowerCase().replace(/\s+/g, " ");
  if (normalized.length < 2) return;
  const p = await prefs(userId);
  if (!p.trackSearchHistory) return;
  await prisma.searchHistory.upsert({
    where: { userId_normalized: { userId, normalized } },
    update: { lastSearchedAt: new Date(), query: query.trim() },
    create: { userId, query: query.trim(), normalized },
  });
  // Keep the list short.
  const old = await prisma.searchHistory.findMany({
    where: { userId },
    orderBy: { lastSearchedAt: "desc" },
    skip: 25,
    select: { id: true },
  });
  if (old.length) await prisma.searchHistory.deleteMany({ where: { id: { in: old.map((o) => o.id) } } });
}

export async function listSearches(userId: string, limit = 10) {
  const rows = await prisma.searchHistory.findMany({ where: { userId }, orderBy: { lastSearchedAt: "desc" }, take: limit });
  return rows.map((r) => ({ id: r.id, query: r.query, lastSearchedAt: r.lastSearchedAt.toISOString() }));
}

export async function deleteSearch(userId: string, id: string) {
  const { count } = await prisma.searchHistory.deleteMany({ where: { id, userId } });
  if (!count) throw notFound("Search");
}

export async function clearSearches(userId: string) {
  await prisma.searchHistory.deleteMany({ where: { userId } });
}

export async function recentlyViewed(userId: string, limit = 12) {
  const rows = await prisma.readingHistory.findMany({
    where: { userId, series: { isArchived: false } },
    orderBy: { lastViewedAt: "desc" },
    take: limit,
    include: { series: { include: cardInclude } },
  });
  return rows.map((r) => ({ lastViewedAt: r.lastViewedAt.toISOString(), series: toCard(r.series) }));
}
