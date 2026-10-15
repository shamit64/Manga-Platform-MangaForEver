import type { LibraryCreateInput, LibraryEntryDTO, LibraryUpdateInput } from "@mangaforever/shared";
import type { Prisma } from "../generated/prisma/client.js";
import { AppError, conflict, notFound } from "../lib/errors.js";
import { prisma } from "../lib/prisma.js";
import { isoDate, pageResult, toDateOnly } from "../lib/util.js";
import { cardInclude, toCard, type CardRow } from "./series-mapper.js";
import { recomputeSeriesStats } from "./stats.service.js";

type EntryRow = Prisma.LibraryEntryGetPayload<{ include: { series: { include: typeof cardInclude } } }>;

export function toEntryDTO(e: Omit<EntryRow, "series"> & { series?: CardRow }, score: number | null): LibraryEntryDTO {
  return {
    id: e.id,
    seriesId: e.seriesId,
    status: e.status,
    progressChapter: e.progressChapter,
    progressVolume: e.progressVolume,
    score,
    notes: e.notes,
    isPrivate: e.isPrivate,
    startedAt: isoDate(e.startedAt),
    completedAt: isoDate(e.completedAt),
    createdAt: e.createdAt.toISOString(),
    updatedAt: e.updatedAt.toISOString(),
    ...(e.series ? { series: toCard(e.series) } : {}),
  };
}

function invalid(path: string, message: string) {
  return new AppError(422, "VALIDATION_ERROR", message, [{ path, message }]);
}

/**
 * Progress is checked against known totals only. Unknown chapter/volume counts never block tracking,
 * because many ongoing series have no reliable total.
 */
function checkProgress(series: { chapterCount: number | null; volumeCount: number | null }, chapter?: number, volume?: number) {
  if (chapter !== undefined && series.chapterCount !== null && chapter > series.chapterCount) {
    throw invalid("progressChapter", `This series has ${series.chapterCount} chapters — progress can't go past that.`);
  }
  if (volume !== undefined && series.volumeCount !== null && volume > series.volumeCount) {
    throw invalid("progressVolume", `This series has ${series.volumeCount} volumes — progress can't go past that.`);
  }
}

async function setScore(tx: Prisma.TransactionClient, userId: string, seriesId: string, score: number | null | undefined) {
  if (score === undefined) return;
  if (score === null) await tx.rating.deleteMany({ where: { userId, seriesId } });
  else
    await tx.rating.upsert({
      where: { userId_seriesId: { userId, seriesId } },
      update: { score },
      create: { userId, seriesId, score },
    });
}

export async function addToLibrary(userId: string, input: LibraryCreateInput) {
  const series = await prisma.mangaSeries.findFirst({ where: { id: input.seriesId, isArchived: false } });
  if (!series) throw notFound("Series");
  const existing = await prisma.libraryEntry.findUnique({ where: { userId_seriesId: { userId, seriesId: series.id } } });
  if (existing) throw conflict("This series is already in your library.");

  let progressChapter = input.progressChapter ?? 0;
  if (input.status === "COMPLETED" && input.progressChapter === undefined && series.chapterCount) progressChapter = series.chapterCount;
  checkProgress(series, progressChapter, input.progressVolume);
  const today = new Date().toISOString().slice(0, 10);

  const entry = await prisma.$transaction(async (tx) => {
    const e = await tx.libraryEntry.create({
      data: {
        userId,
        seriesId: series.id,
        status: input.status,
        progressChapter,
        progressVolume: input.progressVolume ?? 0,
        notes: input.notes ?? null,
        isPrivate: input.isPrivate ?? false,
        startedAt: toDateOnly(input.startedAt ?? (input.status === "READING" ? today : null)),
        completedAt: toDateOnly(input.completedAt ?? (input.status === "COMPLETED" ? today : null)),
      },
    });
    await setScore(tx, userId, series.id, input.score);
    await tx.readingActivity.create({
      data: { userId, seriesId: series.id, type: "ADDED_TO_LIBRARY", data: { status: input.status } },
    });
    return e;
  });
  await recomputeSeriesStats(series.id);
  const rating = await prisma.rating.findUnique({ where: { userId_seriesId: { userId, seriesId: series.id } } });
  return toEntryDTO(entry, rating?.score ?? null);
}

export async function updateEntry(userId: string, entryId: string, input: LibraryUpdateInput) {
  // Ownership: the entry must belong to the caller. Other users' entries look like "not found".
  const entry = await prisma.libraryEntry.findFirst({ where: { id: entryId, userId }, include: { series: true } });
  if (!entry) throw notFound("Library entry");
  const { series } = entry;

  let progressChapter = input.progressChapter;
  if (input.status === "COMPLETED" && progressChapter === undefined && series.chapterCount) progressChapter = series.chapterCount;
  checkProgress(series, progressChapter, input.progressVolume);

  const data: Prisma.LibraryEntryUpdateInput = {};
  if (input.status !== undefined) data.status = input.status;
  if (progressChapter !== undefined) data.progressChapter = progressChapter;
  if (input.progressVolume !== undefined) data.progressVolume = input.progressVolume;
  if (input.notes !== undefined) data.notes = input.notes;
  if (input.isPrivate !== undefined) data.isPrivate = input.isPrivate;
  if (input.startedAt !== undefined) data.startedAt = toDateOnly(input.startedAt);
  if (input.completedAt !== undefined) data.completedAt = toDateOnly(input.completedAt);
  const today = toDateOnly(new Date().toISOString().slice(0, 10));
  if (input.status === "COMPLETED" && input.completedAt === undefined && !entry.completedAt) data.completedAt = today;
  if (input.status === "READING" && input.startedAt === undefined && !entry.startedAt) data.startedAt = today;

  const updated = await prisma.$transaction(async (tx) => {
    const u = await tx.libraryEntry.update({ where: { id: entry.id }, data });
    await setScore(tx, userId, entry.seriesId, input.score);
    if (input.status && input.status !== entry.status) {
      await tx.readingActivity.create({
        data: { userId, seriesId: entry.seriesId, type: "STATUS_CHANGED", data: { from: entry.status, to: input.status } },
      });
    }
    if (progressChapter !== undefined && progressChapter !== entry.progressChapter) {
      await tx.readingActivity.create({
        data: { userId, seriesId: entry.seriesId, type: "PROGRESS_UPDATED", data: { from: entry.progressChapter, chapter: progressChapter } },
      });
    }
    return u;
  });
  if (input.score !== undefined) await recomputeSeriesStats(entry.seriesId);
  const rating = await prisma.rating.findUnique({ where: { userId_seriesId: { userId, seriesId: entry.seriesId } } });
  return toEntryDTO(updated, rating?.score ?? null);
}

export async function removeEntry(userId: string, entryId: string) {
  const entry = await prisma.libraryEntry.findFirst({ where: { id: entryId, userId } });
  if (!entry) throw notFound("Library entry");
  await prisma.libraryEntry.delete({ where: { id: entry.id } });
  await recomputeSeriesStats(entry.seriesId);
}

export async function listLibrary(
  userId: string,
  q: { status?: string; type?: string; q?: string; sort: string; page: number; pageSize: number },
  opts: { publicOnly?: boolean } = {},
) {
  const where: Prisma.LibraryEntryWhereInput = { userId };
  if (q.status) where.status = q.status as "READING";
  if (opts.publicOnly) where.isPrivate = false;
  const seriesWhere: Prisma.MangaSeriesWhereInput = {};
  if (q.type) seriesWhere.type = q.type as "MANGA";
  if (q.q) seriesWhere.OR = [{ title: { contains: q.q, mode: "insensitive" } }, { searchText: { contains: q.q.toLowerCase() } }];
  if (Object.keys(seriesWhere).length) where.series = seriesWhere;

  const orderBy: Prisma.LibraryEntryOrderByWithRelationInput[] =
    q.sort === "title" ? [{ series: { title: "asc" } }]
    : q.sort === "progress" ? [{ progressChapter: "desc" }]
    : q.sort === "added" ? [{ createdAt: "desc" }]
    : [{ updatedAt: "desc" }];

  const needsScoreSort = q.sort === "score";
  const [total, rows] = await Promise.all([
    prisma.libraryEntry.count({ where }),
    prisma.libraryEntry.findMany({
      where,
      orderBy: needsScoreSort ? [{ updatedAt: "desc" }] : [...orderBy, { id: "asc" }],
      include: { series: { include: cardInclude } },
      ...(needsScoreSort ? {} : { skip: (q.page - 1) * q.pageSize, take: q.pageSize }),
    }),
  ]);
  const ratings = await prisma.rating.findMany({ where: { userId, seriesId: { in: rows.map((r) => r.seriesId) } } });
  const scoreBy = new Map(ratings.map((r) => [r.seriesId, r.score]));
  let items = rows.map((r) => toEntryDTO(r, scoreBy.get(r.seriesId) ?? null));
  if (needsScoreSort) {
    items.sort((a, b) => (b.score ?? -1) - (a.score ?? -1));
    items = items.slice((q.page - 1) * q.pageSize, q.page * q.pageSize);
  }
  if (opts.publicOnly) items = items.map((i) => ({ ...i, notes: null })); // private notes never leave the owner
  return pageResult(items, total, q.page, q.pageSize);
}

export async function libraryStats(userId: string, opts: { publicOnly?: boolean } = {}) {
  const where: Prisma.LibraryEntryWhereInput = { userId, ...(opts.publicOnly ? { isPrivate: false } : {}) };
  const [byStatus, chapters, favorites, genreRows, recent] = await Promise.all([
    prisma.libraryEntry.groupBy({ by: ["status"], where, _count: { _all: true } }),
    prisma.libraryEntry.aggregate({ where, _sum: { progressChapter: true, progressVolume: true } }),
    prisma.favorite.count({ where: { userId } }),
    prisma.seriesGenre.findMany({
      where: { series: { libraryEntries: { some: where } } },
      include: { genre: true },
    }),
    opts.publicOnly
      ? Promise.resolve([])
      : prisma.readingActivity.findMany({
          where: { userId },
          orderBy: { createdAt: "desc" },
          take: 15,
          include: { series: { select: { id: true, slug: true, title: true, coverUrl: true, type: true } } },
        }),
  ]);
  const counts = { READING: 0, PLAN_TO_READ: 0, COMPLETED: 0, ON_HOLD: 0, DROPPED: 0 } as Record<string, number>;
  for (const r of byStatus) counts[r.status] = r._count._all;
  const genreCounts = new Map<string, { name: string; slug: string; count: number }>();
  for (const g of genreRows) {
    const cur = genreCounts.get(g.genre.slug) ?? { name: g.genre.name, slug: g.genre.slug, count: 0 };
    cur.count++;
    genreCounts.set(g.genre.slug, cur);
  }
  return {
    byStatus: counts,
    total: Object.values(counts).reduce((a, b) => a + b, 0),
    completed: counts.COMPLETED,
    favorites,
    chaptersTracked: chapters._sum.progressChapter ?? 0,
    volumesTracked: chapters._sum.progressVolume ?? 0,
    genreDistribution: [...genreCounts.values()].sort((a, b) => b.count - a.count).slice(0, 12),
    recentActivity: recent.map((a) => ({
      id: a.id,
      type: a.type,
      data: a.data,
      createdAt: a.createdAt.toISOString(),
      series: a.series,
    })),
  };
}

/** Continue reading: most recently touched entries the user is actively reading. */
export async function continueReading(userId: string, limit = 8) {
  const rows = await prisma.libraryEntry.findMany({
    where: { userId, status: { in: ["READING", "ON_HOLD"] } },
    orderBy: [{ updatedAt: "desc" }],
    take: limit,
    include: { series: { include: cardInclude } },
  });
  return rows.map((r) => toEntryDTO(r, null));
}
