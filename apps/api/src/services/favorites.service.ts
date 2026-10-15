import type { Prisma } from "../generated/prisma/client.js";
import { conflict, notFound } from "../lib/errors.js";
import { prisma } from "../lib/prisma.js";
import { pageResult } from "../lib/util.js";
import { cardInclude, toCard } from "./series-mapper.js";
import { recomputeSeriesStats } from "./stats.service.js";

export async function addFavorite(userId: string, seriesId: string) {
  const series = await prisma.mangaSeries.findFirst({ where: { id: seriesId, isArchived: false }, select: { id: true } });
  if (!series) throw notFound("Series");
  const exists = await prisma.favorite.findUnique({ where: { userId_seriesId: { userId, seriesId } } });
  if (exists) throw conflict("Already in your favorites.");
  const fav = await prisma.favorite.create({ data: { userId, seriesId } });
  await prisma.readingActivity.create({ data: { userId, seriesId, type: "FAVORITED" } });
  await recomputeSeriesStats(seriesId);
  return { id: fav.id, seriesId, createdAt: fav.createdAt.toISOString() };
}

export async function removeFavorite(userId: string, seriesId: string) {
  const { count } = await prisma.favorite.deleteMany({ where: { userId, seriesId } });
  if (!count) throw notFound("Favorite");
  await recomputeSeriesStats(seriesId);
}

export async function listFavorites(
  userId: string,
  q: { type?: string; genre?: string; sort: string; page: number; pageSize: number },
) {
  const where: Prisma.FavoriteWhereInput = { userId };
  const s: Prisma.MangaSeriesWhereInput = {};
  if (q.type) s.type = q.type as "MANGA";
  if (q.genre) s.genres = { some: { genre: { slug: q.genre } } };
  if (Object.keys(s).length) where.series = s;
  const orderBy: Prisma.FavoriteOrderByWithRelationInput[] =
    q.sort === "title" ? [{ series: { title: "asc" } }]
    : q.sort === "rating" ? [{ series: { ratingAvg: { sort: "desc", nulls: "last" } } }]
    : q.sort === "popularity" ? [{ series: { popularityScore: "desc" } }]
    : [{ createdAt: "desc" }];
  const [total, rows] = await Promise.all([
    prisma.favorite.count({ where }),
    prisma.favorite.findMany({
      where,
      orderBy: [...orderBy, { id: "asc" }],
      skip: (q.page - 1) * q.pageSize,
      take: q.pageSize,
      include: { series: { include: cardInclude } },
    }),
  ]);
  return pageResult(
    rows.map((f) => ({ id: f.id, favoritedAt: f.createdAt.toISOString(), series: toCard(f.series) })),
    total,
    q.page,
    q.pageSize,
  );
}
