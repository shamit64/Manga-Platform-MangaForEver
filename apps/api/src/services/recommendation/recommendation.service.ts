import type { Recommendation, RecommendationShelf } from "@mangaforever/shared";
import type { Prisma } from "../../generated/prisma/client.js";
import { prisma } from "../../lib/prisma.js";
import { cardInclude, toCard } from "../series-mapper.js";
import { getRanking } from "../rankings.service.js";
import {
  NEW_USER_STRENGTH_THRESHOLD,
  buildProfile,
  diversify,
  scoreCandidate,
  similarity,
  type SeriesFeatures,
} from "./scoring.js";

const featureInclude = {
  ...cardInclude,
  tags: { include: { tag: true } },
  creators: { include: { creator: true } },
} satisfies Prisma.MangaSeriesInclude;

type FeatureRow = Prisma.MangaSeriesGetPayload<{ include: typeof featureInclude }>;

function features(s: FeatureRow): SeriesFeatures {
  return {
    id: s.id,
    title: s.title,
    type: s.type,
    genres: s.genres.map((g) => ({ slug: g.genre.slug, name: g.genre.name })),
    tags: s.tags.map((t) => ({ slug: t.tag.slug, name: t.tag.name })),
    creators: s.creators.map((c) => ({ slug: c.creator.slug, name: c.creator.name })),
    ratingAvg: s.ratingAvg,
    ratingCount: s.ratingCount,
    popularityScore: s.popularityScore,
  };
}

async function loadSignals(userId: string) {
  const [pref, library, ratings, favorites, views, searches, dismissed] = await Promise.all([
    prisma.userPreference.findUnique({ where: { userId } }),
    prisma.libraryEntry.findMany({ where: { userId }, include: { series: { include: featureInclude } }, orderBy: { updatedAt: "desc" } }),
    prisma.rating.findMany({ where: { userId }, include: { series: { include: featureInclude } } }),
    prisma.favorite.findMany({ where: { userId }, include: { series: { include: featureInclude } }, orderBy: { createdAt: "desc" } }),
    prisma.readingHistory.findMany({ where: { userId }, include: { series: { include: featureInclude } }, orderBy: { lastViewedAt: "desc" }, take: 30 }),
    prisma.searchHistory.findMany({ where: { userId }, orderBy: { lastSearchedAt: "desc" }, take: 20 }),
    prisma.dismissedRecommendation.findMany({ where: { userId }, select: { seriesId: true } }),
  ]);
  return {
    signals: {
      preferredGenres: pref?.favoriteGenres ?? [],
      library: library.map((l) => ({ series: features(l.series), status: l.status })),
      ratings: ratings.map((r) => ({ series: features(r.series), score: r.score })),
      favorites: favorites.map((f) => features(f.series)),
      views: views.map((v) => features(v.series)),
      searches: searches.map((s) => s.query),
    },
    library,
    ratings,
    favorites,
    excluded: new Set([...library.map((l) => l.seriesId), ...dismissed.map((d) => d.seriesId)]),
    dismissed: new Set(dismissed.map((d) => d.seriesId)),
  };
}

async function candidates() {
  const rows = await prisma.mangaSeries.findMany({ where: { isArchived: false }, include: featureInclude, take: 3000 });
  return { rows, byId: new Map(rows.map((r) => [r.id, r])) };
}

async function globalMean() {
  return (await prisma.rating.aggregate({ _avg: { score: true } }))._avg.score ?? 7;
}

function toRec(row: FeatureRow, score: number, reasons: string[]): Recommendation {
  return { series: toCard(row), score: Math.round(score * 1000) / 1000, reasons };
}

/** Non-personalised fallback used for signed-out visitors and brand-new accounts. */
async function fallbackShelves(exclude: Set<string> = new Set()): Promise<RecommendationShelf[]> {
  const [popular, topRated, featured] = await Promise.all([
    getRanking("popular", { limit: 16 }),
    getRanking("top-rated", { limit: 16 }),
    prisma.featuredSeries.findMany({ where: { isActive: true }, include: { series: { include: cardInclude } }, orderBy: { position: "asc" } }),
  ]);
  return [
    {
      key: "popular",
      title: "Popular on MangaForEver",
      explanation: "Most-tracked series by MangaForEver members. Add a few titles or pick favorite genres to personalise this page.",
      items: popular.items.filter((s) => !exclude.has(s.id)).slice(0, 12).map((s) => ({ series: s, score: s.popularityScore, reasons: ["Popular with members"] })),
    },
    {
      key: "top-rated",
      title: "Highly rated",
      explanation: "Series with the best member ratings (at least 3 ratings, small samples shrunk toward the average).",
      items: topRated.items.filter((s) => !exclude.has(s.id)).slice(0, 12).map((s) => ({ series: s, score: s.metric ?? 0, reasons: [`Members rate it ${s.ratingAvg?.toFixed(1)}/10`] })),
    },
    {
      key: "editors",
      title: "Editor's picks",
      explanation: "Hand-picked by MangaForEver editors.",
      items: featured.filter((f) => !exclude.has(f.seriesId)).map((f) => ({ series: toCard(f.series), score: 0, reasons: [f.reason] })),
    },
  ].filter((s) => s.items.length);
}

export async function getRecommendations(userId: string | undefined, opts: { limit?: number; refresh?: string } = {}) {
  const limit = opts.limit ?? 18;
  if (!userId) return { personalised: false, shelves: await fallbackShelves() };

  const ctxData = await loadSignals(userId);
  const profile = buildProfile(ctxData.signals);
  if (profile.strength < NEW_USER_STRENGTH_THRESHOLD) {
    return { personalised: false, shelves: await fallbackShelves(ctxData.excluded) };
  }

  const { rows, byId } = await candidates();
  const maxPopularity = Math.max(1, ...rows.map((r) => r.popularityScore));
  const day = new Date().toISOString().slice(0, 10);
  const ctx = { globalMean: await globalMean(), maxPopularity, seed: `${userId}:${day}:${opts.refresh ?? ""}` };
  const pool = rows.filter((r) => !ctxData.excluded.has(r.id));
  const scored = pool.map((r) => scoreCandidate(features(r), profile, ctx));
  const shelves: RecommendationShelf[] = [];

  // 1. Recommended for you
  const main = diversify(scored, limit);
  shelves.push({
    key: "for-you",
    title: "Recommended for you",
    explanation: "Scored from your genres, tags, content types and creators, weighted by your ratings and reading status.",
    items: main.map((s) => toRec(byId.get(s.series.id)!, s.score, s.reasons)),
  });
  const shown = new Set(main.map((m) => m.series.id));

  // 2. Because you read <anchor>
  const anchorEntry =
    ctxData.ratings.filter((r) => r.score >= 8).sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())[0]?.series ??
    ctxData.library.find((l) => l.status === "READING" || l.status === "COMPLETED")?.series;
  if (anchorEntry) {
    const anchor = features(anchorEntry);
    const similar = pool
      .filter((r) => r.id !== anchor.id)
      .map((r) => ({ r, ...similarity(anchor, features(r)) }))
      .filter((x) => x.score > 0.15)
      .sort((a, b) => b.score - a.score || (shown.has(a.r.id) ? 1 : -1))
      .slice(0, 12);
    if (similar.length) {
      shelves.push({
        key: "because-you-read",
        title: `Because you read ${anchor.title}`,
        explanation: `Series sharing genres, tags or creators with ${anchor.title}.`,
        items: similar.map((x) => toRec(x.r, x.score, x.reasons)),
      });
    }
  }

  // 3. Similar to your favorites
  if (ctxData.favorites.length) {
    const favFeatures = ctxData.favorites.slice(0, 10).map((f) => features(f.series));
    const agg = pool
      .map((r) => {
        const f = features(r);
        let best = { score: 0, via: "" };
        let total = 0;
        for (const fav of favFeatures) {
          const s = similarity(fav, f).score;
          total += s;
          if (s > best.score) best = { score: s, via: fav.title };
        }
        return { r, score: total / favFeatures.length + best.score, via: best.via };
      })
      .filter((x) => x.score > 0.2)
      .sort((a, b) => b.score - a.score)
      .slice(0, 12);
    if (agg.length) {
      shelves.push({
        key: "similar-favorites",
        title: "Similar to your favorites",
        explanation: "Closest matches to the series you've favorited.",
        items: agg.map((x) => toRec(x.r, x.score, [`Similar to ${x.via}`])),
      });
    }
  }

  // 4. Popular in your favorite genres
  const topGenre = [...profile.genres.entries()].sort((a, b) => b[1] - a[1])[0];
  if (topGenre && topGenre[1] > 0) {
    const name = profile.names.get(topGenre[0]) ?? topGenre[0];
    const pop = pool
      .filter((r) => r.genres.some((g) => g.genre.slug === topGenre[0]))
      .sort((a, b) => b.popularityScore - a.popularityScore || (b.externalPopularity ?? 0) - (a.externalPopularity ?? 0))
      .slice(0, 12);
    if (pop.length) {
      shelves.push({
        key: "popular-in-genre",
        title: `Popular in ${name}`,
        explanation: `${name} is the genre that shows up most in your activity. These are its most-tracked series you haven't added.`,
        items: pop.map((r) => toRec(r, r.popularityScore, [`Popular ${name} series`])),
      });
    }
  }

  return { personalised: true, shelves };
}

export async function getRelated(seriesId: string, limit = 12, userId?: string) {
  const { rows, byId } = await candidates();
  const self = byId.get(seriesId);
  if (!self) return [];
  let exclude = new Set<string>([seriesId]);
  if (userId) {
    const dismissed = await prisma.dismissedRecommendation.findMany({ where: { userId }, select: { seriesId: true } });
    exclude = new Set([...exclude, ...dismissed.map((d) => d.seriesId)]);
  }
  const a = features(self);
  return rows
    .filter((r) => !exclude.has(r.id))
    .map((r) => ({ r, ...similarity(a, features(r)) }))
    .filter((x) => x.score > 0.1)
    .sort((x, y) => y.score - x.score || y.r.popularityScore - x.r.popularityScore)
    .slice(0, limit)
    .map((x) => toRec(x.r, x.score, x.reasons));
}

export async function dismiss(userId: string, seriesId: string) {
  await prisma.dismissedRecommendation.upsert({
    where: { userId_seriesId: { userId, seriesId } },
    update: {},
    create: { userId, seriesId },
  });
}

export async function undismissAll(userId: string) {
  const { count } = await prisma.dismissedRecommendation.deleteMany({ where: { userId } });
  return { restored: count };
}
