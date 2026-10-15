import type { PrismaClient } from "../generated/prisma/client.js";
import { prisma as defaultPrisma } from "../lib/prisma.js";

type Db = Pick<PrismaClient, "mangaSeries" | "libraryEntry" | "favorite" | "rating" | "review">;

/** Weights of the documented MangaForEver popularity score. */
export const POPULARITY_WEIGHTS = { library: 1, favorite: 2, rating: 1.5, review: 2 } as const;

export function popularityScore(c: { library: number; favorites: number; ratings: number; reviews: number }) {
  return (
    c.library * POPULARITY_WEIGHTS.library +
    c.favorites * POPULARITY_WEIGHTS.favorite +
    c.ratings * POPULARITY_WEIGHTS.rating +
    c.reviews * POPULARITY_WEIGHTS.review
  );
}

/**
 * Recompute a series' denormalised community statistics from the stored rows.
 * Called after every library/favorite/rating/review change so the cached numbers can never drift.
 */
export async function recomputeSeriesStats(seriesId: string, db: Db = defaultPrisma) {
  const [library, favorites, ratingAgg, reviews] = await Promise.all([
    db.libraryEntry.count({ where: { seriesId } }),
    db.favorite.count({ where: { seriesId } }),
    db.rating.aggregate({ where: { seriesId }, _avg: { score: true }, _count: { _all: true } }),
    db.review.count({ where: { seriesId, isHidden: false } }),
  ]);
  const ratings = ratingAgg._count._all;
  const avg = ratingAgg._avg.score;
  return db.mangaSeries.update({
    where: { id: seriesId },
    data: {
      libraryCount: library,
      favoriteCount: favorites,
      ratingCount: ratings,
      ratingAvg: avg === null ? null : Math.round(avg * 100) / 100,
      reviewCount: reviews,
      popularityScore: popularityScore({ library, favorites, ratings, reviews }),
    },
    select: { id: true, ratingAvg: true, ratingCount: true, favoriteCount: true, libraryCount: true, reviewCount: true },
  });
}

/**
 * Bayesian average used by the "Top rated" ranking:
 *   (v / (v + m)) * R + (m / (v + m)) * C
 * where R = series mean, v = its rating count, C = site-wide mean, m = minimum votes weight.
 */
export function bayesianAverage(mean: number, votes: number, globalMean: number, m = 5) {
  return (votes / (votes + m)) * mean + (m / (votes + m)) * globalMean;
}
