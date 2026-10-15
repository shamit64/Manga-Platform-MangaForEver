import type { CatalogQuery, SeriesCard } from "@mangaforever/shared";
import { Prisma } from "../generated/prisma/client.js";
import { notFound } from "../lib/errors.js";
import { prisma } from "../lib/prisma.js";
import { pageResult } from "../lib/util.js";
import { cardInclude, detailInclude, toCard, toDetail } from "./series-mapper.js";

const MAX_SEARCH_CANDIDATES = 2000;

function escapeLike(s: string) {
  return s.replace(/[\\%_]/g, (c) => `\\${c}`);
}

/**
 * Ranked text search over titles, alternative/localised titles, creators, genres, tags and type words.
 * Uses PostgreSQL full-text ranking (ts_rank) plus pg_trgm similarity, both backed by GIN indexes,
 * so partial words ("berse") and small typos ("berzerk") still match. Returns ids with scores.
 */
export async function searchIds(q: string): Promise<Map<string, number>> {
  const term = q.trim().toLowerCase().slice(0, 120);
  if (!term) return new Map();
  const like = `%${escapeLike(term)}%`;
  const rows = await prisma.$queryRaw<{ id: string; score: number }[]>(Prisma.sql`
    SELECT id,
      (
        ts_rank(to_tsvector('simple', "searchText"), websearch_to_tsquery('simple', ${term})) * 2
        + similarity(lower(title), ${term}) * 3
        + word_similarity(${term}, "searchText")
        + CASE WHEN lower(title) = ${term} THEN 5 ELSE 0 END
        + CASE WHEN lower(title) LIKE ${escapeLike(term) + "%"} THEN 2 ELSE 0 END
      )::float AS score
    FROM "MangaSeries"
    WHERE "isArchived" = false
      AND (
        "searchText" ILIKE ${like}
        OR to_tsvector('simple', "searchText") @@ websearch_to_tsquery('simple', ${term})
        OR ${term} <% "searchText"
        OR title % ${term}
      )
    ORDER BY score DESC
    LIMIT ${MAX_SEARCH_CANDIDATES}
  `);
  return new Map(rows.map((r) => [r.id, Number(r.score)]));
}

export function buildWhere(q: Partial<CatalogQuery>, ids?: string[]): Prisma.MangaSeriesWhereInput {
  const and: Prisma.MangaSeriesWhereInput[] = [{ isArchived: false }];
  if (ids) and.push({ id: { in: ids } });
  if (q.type?.length) and.push({ type: { in: q.type } });
  if (q.status?.length) and.push({ status: { in: q.status } });
  if (q.demographic?.length) and.push({ demographic: { in: q.demographic } });
  if (q.genres?.length) {
    if (q.genreMode === "any") and.push({ genres: { some: { genre: { slug: { in: q.genres } } } } });
    else for (const slug of q.genres) and.push({ genres: { some: { genre: { slug } } } });
  }
  if (q.tags?.length) and.push({ tags: { some: { tag: { slug: { in: q.tags } } } } });
  if (q.yearFrom !== undefined) and.push({ releaseYear: { gte: q.yearFrom } });
  if (q.yearTo !== undefined) and.push({ releaseYear: { lte: q.yearTo } });
  if (q.creator) {
    and.push({ creators: { some: { creator: { OR: [{ name: { contains: q.creator, mode: "insensitive" } }, { slug: q.creator }] } } } });
  }
  if (q.minRating !== undefined) and.push({ ratingAvg: { gte: q.minRating } });
  if (q.minPopularity !== undefined) and.push({ popularityScore: { gte: q.minPopularity } });
  if (q.updatedWithinDays !== undefined) {
    and.push({ metadataUpdatedAt: { gte: new Date(Date.now() - q.updatedWithinDays * 86_400_000) } });
  }
  return { AND: and };
}

export function buildOrder(sort: CatalogQuery["sort"], order?: "asc" | "desc"): Prisma.MangaSeriesOrderByWithRelationInput[] {
  const dir = order ?? "desc";
  switch (sort) {
    case "rating":
      return [{ ratingAvg: { sort: dir, nulls: "last" } }, { ratingCount: "desc" }, { id: "asc" }];
    case "reviews":
      return [{ reviewCount: dir }, { popularityScore: "desc" }, { id: "asc" }];
    case "newest":
      return [{ releaseYear: { sort: dir, nulls: "last" } }, { startDate: { sort: dir, nulls: "last" } }, { id: "asc" }];
    case "added":
      return [{ createdAt: dir }, { id: "asc" }];
    case "updated":
      return [{ metadataUpdatedAt: dir }, { id: "asc" }];
    case "title":
      return [{ title: order ?? "asc" }, { id: "asc" }];
    case "popularity":
    default:
      return [{ popularityScore: dir }, { externalPopularity: { sort: "desc", nulls: "last" } }, { title: "asc" }];
  }
}

export async function listSeries(q: CatalogQuery) {
  const { page, pageSize } = q;
  let scores: Map<string, number> | undefined;
  if (q.q) scores = await searchIds(q.q);
  const where = buildWhere(q, scores ? [...scores.keys()] : undefined);
  const sort = q.sort ?? (q.q ? "relevance" : "popularity");

  if (sort === "relevance" && scores) {
    // Rank in memory: the candidate set is bounded by MAX_SEARCH_CANDIDATES.
    const matching = await prisma.mangaSeries.findMany({ where, select: { id: true, popularityScore: true } });
    matching.sort((a, b) => (scores!.get(b.id) ?? 0) - (scores!.get(a.id) ?? 0) || b.popularityScore - a.popularityScore);
    const pageIds = matching.slice((page - 1) * pageSize, page * pageSize).map((m) => m.id);
    const rows = await prisma.mangaSeries.findMany({ where: { id: { in: pageIds } }, include: cardInclude });
    const byId = new Map(rows.map((r) => [r.id, r]));
    return pageResult(pageIds.map((id) => toCard(byId.get(id)!)), matching.length, page, pageSize);
  }

  const [total, rows] = await Promise.all([
    prisma.mangaSeries.count({ where }),
    prisma.mangaSeries.findMany({
      where,
      include: cardInclude,
      orderBy: buildOrder(sort === "relevance" ? "popularity" : sort, q.order),
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
  ]);
  return pageResult(rows.map(toCard), total, page, pageSize);
}

/** Autocomplete: top matches with thumbnail data. */
export async function suggest(q: string, limit: number) {
  const scores = await searchIds(q);
  const ids = [...scores.entries()].sort((a, b) => b[1] - a[1]).slice(0, limit).map(([id]) => id);
  const rows = await prisma.mangaSeries.findMany({ where: { id: { in: ids } }, include: cardInclude });
  const byId = new Map(rows.map((r) => [r.id, r]));
  return ids.filter((id) => byId.has(id)).map((id) => toCard(byId.get(id)!));
}

export async function findSeriesId(idOrSlug: string) {
  const row = await prisma.mangaSeries.findFirst({
    where: { OR: [{ id: idOrSlug }, { slug: idOrSlug }] },
    select: { id: true, isArchived: true },
  });
  if (!row) throw notFound("Series");
  return row;
}

export async function getSeriesDetail(idOrSlug: string, opts: { includeArchived?: boolean } = {}) {
  const s = await prisma.mangaSeries.findFirst({
    where: { OR: [{ id: idOrSlug }, { slug: idOrSlug }] },
    include: detailInclude,
  });
  if (!s || (s.isArchived && !opts.includeArchived)) throw notFound("Series");
  let rank: number | null = null;
  if (s.popularityScore > 0) {
    rank = (await prisma.mangaSeries.count({ where: { isArchived: false, popularityScore: { gt: s.popularityScore } } })) + 1;
  }
  return toDetail(s, rank);
}

export async function getViewerState(userId: string, seriesId: string) {
  const [entry, fav, rating, review, follow] = await Promise.all([
    prisma.libraryEntry.findUnique({ where: { userId_seriesId: { userId, seriesId } } }),
    prisma.favorite.findUnique({ where: { userId_seriesId: { userId, seriesId } }, select: { id: true } }),
    prisma.rating.findUnique({ where: { userId_seriesId: { userId, seriesId } }, select: { score: true } }),
    prisma.review.findUnique({ where: { userId_seriesId: { userId, seriesId } }, select: { id: true } }),
    prisma.seriesFollow.findUnique({ where: { userId_seriesId: { userId, seriesId } }, select: { userId: true } }),
  ]);
  return {
    libraryEntry: entry
      ? {
          id: entry.id,
          seriesId: entry.seriesId,
          status: entry.status,
          progressChapter: entry.progressChapter,
          progressVolume: entry.progressVolume,
          score: rating?.score ?? null,
          notes: entry.notes,
          isPrivate: entry.isPrivate,
          startedAt: entry.startedAt?.toISOString().slice(0, 10) ?? null,
          completedAt: entry.completedAt?.toISOString().slice(0, 10) ?? null,
          createdAt: entry.createdAt.toISOString(),
          updatedAt: entry.updatedAt.toISOString(),
        }
      : null,
    isFavorite: !!fav,
    rating: rating?.score ?? null,
    reviewId: review?.id ?? null,
    isFollowing: !!follow,
  };
}

export async function listGenres() {
  const genres = await prisma.genre.findMany({
    orderBy: { name: "asc" },
    include: { _count: { select: { series: { where: { series: { isArchived: false } } } } } },
  });
  return genres.map((g) => ({ name: g.name, slug: g.slug, count: g._count.series }));
}

export async function listTags(limit = 80) {
  const tags = await prisma.tag.findMany({
    include: { _count: { select: { series: true } } },
    orderBy: { series: { _count: "desc" } },
    take: limit,
  });
  return tags.map((t) => ({ name: t.name, slug: t.slug, count: t._count.series }));
}

export async function getFeatured() {
  const rows = await prisma.featuredSeries.findMany({
    where: { isActive: true, series: { isArchived: false } },
    orderBy: { position: "asc" },
    include: { series: { include: detailInclude } },
  });
  return rows.map((f) => ({ reason: f.reason, series: toDetail(f.series, null) }));
}

/** "Latest updates": real metadata changes, plus chapter releases only when a provider supplied them. */
export async function getLatest(limit: number, type?: string) {
  const typeWhere = type ? { type: type as "MANGA" } : {};
  const [catalogUpdates, chapters] = await Promise.all([
    prisma.mangaSeries.findMany({
      where: { isArchived: false, ...typeWhere },
      orderBy: [{ metadataUpdatedAt: "desc" }, { id: "asc" }],
      take: limit,
      include: cardInclude,
    }),
    prisma.chapterMetadata.findMany({
      where: { releasedAt: { not: null }, series: { isArchived: false, ...typeWhere } },
      orderBy: { releasedAt: "desc" },
      take: limit,
      include: { series: { include: cardInclude } },
    }),
  ]);
  return {
    catalogUpdates: catalogUpdates.map((s) => ({
      series: toCard(s),
      updatedAt: s.metadataUpdatedAt.toISOString(),
      source: s.source,
      lastSyncedAt: s.lastSyncedAt?.toISOString() ?? null,
    })),
    chapterReleases: chapters.map((c) => ({
      series: toCard(c.series),
      chapter: c.number,
      title: c.title,
      releasedAt: c.releasedAt!.toISOString(),
      source: c.source,
      externalUrl: c.externalUrl,
    })),
  };
}

/**
 * Latest Updates grid: series ordered by their newest chapter, each with its three newest chapters
 * (one row per chapter number). Powers the home page and /latest; refreshed live by the sync job.
 */
export async function getLatestUpdates(page: number, pageSize: number, type?: string) {
  const where: Prisma.MangaSeriesWhereInput = { isArchived: false, lastChapterAt: { not: null }, ...(type ? { type: type as "MANGA" } : {}) };
  const [total, rows] = await Promise.all([
    prisma.mangaSeries.count({ where }),
    prisma.mangaSeries.findMany({
      where,
      orderBy: [{ lastChapterAt: "desc" }, { id: "asc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: { ...cardInclude, chapters: { orderBy: { number: "desc" }, take: 9, select: { number: true, title: true, releasedAt: true, readable: true, externalUrl: true, publisher: true } } },
    }),
  ]);
  const items = rows.map((s) => {
    const seen = new Map<number, (typeof s.chapters)[number]>();
    for (const c of s.chapters) {
      const cur = seen.get(c.number);
      if (!cur || (c.readable && !cur.readable) || (c.externalUrl && !cur.externalUrl)) seen.set(c.number, c);
    }
    return {
      series: toCard(s),
      chapters: [...seen.values()].slice(0, 3).map((c) => ({ ...c, releasedAt: c.releasedAt?.toISOString() ?? null })),
    };
  });
  return pageResult(items, total, page, pageSize);
}

/** New releases by original publication date, or new additions to the MangaForEver catalog. */
export async function getNewReleases(by: "published" | "added", limit: number, type?: string, year?: number) {
  const where: Prisma.MangaSeriesWhereInput = { isArchived: false };
  if (type) where.type = type as "MANGA";
  if (by === "published") where.releaseYear = year ? year : { not: null };
  const rows = await prisma.mangaSeries.findMany({
    where,
    orderBy:
      by === "published"
        ? [{ releaseYear: "desc" }, { startDate: { sort: "desc", nulls: "last" } }, { title: "asc" }]
        : [{ createdAt: "desc" }, { id: "asc" }],
    take: limit,
    include: cardInclude,
  });
  return rows.map(toCard);
}

export type { SeriesCard };
