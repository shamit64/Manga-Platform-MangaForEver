import { RANKING_EXPLANATIONS, type RankingKind, type RankingResponse, type Season } from "@mangaverse/shared";
import type { Prisma } from "../generated/prisma/client.js";
import { prisma } from "../lib/prisma.js";
import { cardInclude, toCard } from "./series-mapper.js";
import { POPULARITY_WEIGHTS, bayesianAverage } from "./stats.service.js";

const MIN_RATINGS_FOR_TOP = 3;

async function hasDemoActivity() {
  return (await prisma.libraryEntry.count({ where: { user: { isDemo: true } }, take: 1 })) > 0;
}

export async function getRanking(kind: RankingKind, opts: { type?: string; limit: number }): Promise<RankingResponse> {
  const base: Prisma.MangaSeriesWhereInput = { isArchived: false, ...(opts.type ? { type: opts.type as "MANGA" } : {}) };
  const explanation = RANKING_EXPLANATIONS[kind];
  const demo = kind === "external" ? false : await hasDemoActivity();
  const wrap = (items: RankingResponse["items"], source: "community" | "external" = "community"): RankingResponse => ({
    kind,
    explanation,
    source,
    includesDemoActivity: demo,
    items,
  });

  if (kind === "popular" || kind === "most-reviewed" || kind === "most-favorited") {
    const field = kind === "popular" ? "popularityScore" : kind === "most-reviewed" ? "reviewCount" : "favoriteCount";
    const rows = await prisma.mangaSeries.findMany({
      where: { ...base, [field]: { gt: 0 } },
      orderBy: [{ [field]: "desc" }, { ratingAvg: { sort: "desc", nulls: "last" } }, { title: "asc" }],
      take: opts.limit,
      include: cardInclude,
    });
    return wrap(rows.map((s, i) => ({ ...toCard(s), rank: i + 1, metric: s[field] as number })));
  }

  if (kind === "top-rated") {
    const global = await prisma.rating.aggregate({ _avg: { score: true } });
    const C = global._avg.score ?? 7;
    const rows = await prisma.mangaSeries.findMany({
      where: { ...base, ratingCount: { gte: MIN_RATINGS_FOR_TOP } },
      include: cardInclude,
    });
    const ranked = rows
      .map((s) => ({ s, b: bayesianAverage(s.ratingAvg ?? 0, s.ratingCount, C) }))
      .sort((a, b) => b.b - a.b || b.s.ratingCount - a.s.ratingCount)
      .slice(0, opts.limit);
    return wrap(ranked.map(({ s, b }, i) => ({ ...toCard(s), rank: i + 1, metric: Math.round(b * 100) / 100 })));
  }

  if (kind === "trending") {
    const since = new Date(Date.now() - 30 * 86_400_000);
    const [lib, fav, rat, rev] = await Promise.all([
      prisma.libraryEntry.groupBy({ by: ["seriesId"], where: { createdAt: { gte: since } }, _count: { _all: true } }),
      prisma.favorite.groupBy({ by: ["seriesId"], where: { createdAt: { gte: since } }, _count: { _all: true } }),
      prisma.rating.groupBy({ by: ["seriesId"], where: { updatedAt: { gte: since } }, _count: { _all: true } }),
      prisma.review.groupBy({ by: ["seriesId"], where: { createdAt: { gte: since }, isHidden: false }, _count: { _all: true } }),
    ]);
    const score = new Map<string, number>();
    const add = (rows: { seriesId: string; _count: { _all: number } }[], w: number) =>
      rows.forEach((r) => score.set(r.seriesId, (score.get(r.seriesId) ?? 0) + r._count._all * w));
    add(lib, POPULARITY_WEIGHTS.library);
    add(fav, POPULARITY_WEIGHTS.favorite);
    add(rat, POPULARITY_WEIGHTS.rating);
    add(rev, POPULARITY_WEIGHTS.review);
    const rows = await prisma.mangaSeries.findMany({ where: { ...base, id: { in: [...score.keys()] } }, include: cardInclude });
    const ranked = rows.sort((a, b) => (score.get(b.id) ?? 0) - (score.get(a.id) ?? 0) || a.title.localeCompare(b.title)).slice(0, opts.limit);
    return wrap(ranked.map((s, i) => ({ ...toCard(s), rank: i + 1, metric: score.get(s.id) ?? 0 })));
  }

  // external: provider-reported popularity, only for imported titles
  const rows = await prisma.mangaSeries.findMany({
    where: { ...base, externalPopularity: { not: null } },
    orderBy: [{ externalPopularity: "desc" }],
    take: opts.limit,
    include: cardInclude,
  });
  return wrap(
    rows.map((s, i) => ({ ...toCard(s), rank: i + 1, metric: s.externalPopularity })),
    "external",
  );
}

const SEASON_MONTHS: Record<Season, [number, number]> = { WINTER: [0, 2], SPRING: [3, 5], SUMMER: [6, 8], FALL: [9, 11] };

export function currentSeason(d = new Date()): { season: Season; year: number } {
  const m = d.getUTCMonth();
  const season = (Object.entries(SEASON_MONTHS).find(([, [a, b]]) => m >= a && m <= b)![0]) as Season;
  return { season, year: d.getUTCFullYear() };
}

/**
 * Seasonal discovery. Returns editor-curated collections (always labelled as curated) and, separately,
 * series whose provider-supplied start date actually falls inside that season. Series without a
 * known start date are never placed in a season.
 */
export async function getSeasonal(opts: { season?: Season; year?: number; genre?: string }) {
  const { season, year } = { ...currentSeason(), ...Object.fromEntries(Object.entries(opts).filter(([, v]) => v !== undefined)) } as {
    season: Season;
    year: number;
  };
  const genreFilter: Prisma.MangaSeriesWhereInput = opts.genre ? { genres: { some: { genre: { slug: opts.genre } } } } : {};

  const collections = await prisma.seasonalCollection.findMany({
    where: { isPublished: true, season, year },
    orderBy: { createdAt: "asc" },
    include: {
      items: {
        where: { series: { isArchived: false, ...genreFilter } },
        orderBy: { position: "asc" },
        include: { series: { include: cardInclude } },
      },
    },
  });

  const [m0, m1] = SEASON_MONTHS[season];
  const from = new Date(Date.UTC(year, m0, 1));
  const to = new Date(Date.UTC(year, m1 + 1, 1));
  const published = await prisma.mangaSeries.findMany({
    where: { isArchived: false, startDate: { gte: from, lt: to }, ...genreFilter },
    orderBy: [{ popularityScore: "desc" }, { externalPopularity: { sort: "desc", nulls: "last" } }],
    take: 48,
    include: cardInclude,
  });

  const available = await prisma.seasonalCollection.findMany({
    where: { isPublished: true },
    select: { season: true, year: true },
    distinct: ["season", "year"],
    orderBy: [{ year: "desc" }],
  });

  return {
    season,
    year,
    collections: collections.map((c) => ({
      id: c.id,
      slug: c.slug,
      title: c.title,
      description: c.description,
      season: c.season,
      year: c.year,
      isCurated: true as const,
      items: c.items.map((i) => ({ series: toCard(i.series), note: i.note })),
    })),
    publishedThisSeason: published.map(toCard),
    availableSeasons: available,
  };
}
