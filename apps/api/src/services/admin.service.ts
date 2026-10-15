import type { AdminSeriesInput } from "@mangaforever/shared";
import { badRequest, notFound } from "../lib/errors.js";
import { prisma } from "../lib/prisma.js";
import { slugify } from "../lib/util.js";
import { audit } from "./audit.service.js";
import { writeSeries } from "./catalog-writer.js";
import { cardInclude, toCard } from "./series-mapper.js";
import { recomputeSeriesStats } from "./stats.service.js";

/** Dashboard numbers — every figure is a live count over stored rows. */
export async function statistics() {
  const since30 = new Date(Date.now() - 30 * 86_400_000);
  const [users, demoUsers, newUsers, series, archived, byType, reviews, ratings, libraryEntries, favorites, openReports, popular, topRated, genreRows, recentReports, active30] =
    await Promise.all([
      prisma.user.count(),
      prisma.user.count({ where: { isDemo: true } }),
      prisma.user.count({ where: { createdAt: { gte: since30 } } }),
      prisma.mangaSeries.count({ where: { isArchived: false } }),
      prisma.mangaSeries.count({ where: { isArchived: true } }),
      prisma.mangaSeries.groupBy({ by: ["type", "source"], where: { isArchived: false }, _count: { _all: true } }),
      prisma.review.count(),
      prisma.rating.count(),
      prisma.libraryEntry.count(),
      prisma.favorite.count(),
      prisma.reviewReport.count({ where: { status: "OPEN" } }),
      prisma.mangaSeries.findMany({ where: { isArchived: false, popularityScore: { gt: 0 } }, orderBy: { popularityScore: "desc" }, take: 5, include: cardInclude }),
      prisma.mangaSeries.findMany({ where: { isArchived: false, ratingCount: { gte: 3 } }, orderBy: { ratingAvg: "desc" }, take: 5, include: cardInclude }),
      prisma.$queryRaw<{ name: string; slug: string; entries: bigint }[]>`
        SELECT g.name, g.slug, COUNT(le.id) AS entries
        FROM "Genre" g
        JOIN "SeriesGenre" sg ON sg."genreId" = g.id
        JOIN "LibraryEntry" le ON le."seriesId" = sg."seriesId"
        GROUP BY g.id ORDER BY entries DESC LIMIT 8`,
      prisma.reviewReport.findMany({
        where: { status: "OPEN" },
        orderBy: { createdAt: "desc" },
        take: 5,
        include: { review: { select: { id: true, title: true, series: { select: { title: true, slug: true } } } }, reporter: { select: { username: true } } },
      }),
      prisma.readingActivity.findMany({ where: { createdAt: { gte: since30 } }, distinct: ["userId"], select: { userId: true } }),
    ]);
  return {
    users: { total: users, demo: demoUsers, newLast30Days: newUsers, activeLast30Days: active30.length },
    catalog: {
      total: series,
      archived,
      byType: byType.map((r) => ({ type: r.type, source: r.source, count: r._count._all })),
    },
    engagement: { reviews, ratings, libraryEntries, favorites, openReports },
    mostPopular: popular.map(toCard),
    highestRated: topRated.map(toCard),
    mostActiveGenres: genreRows.map((g) => ({ name: g.name, slug: g.slug, libraryEntries: Number(g.entries) })),
    recentReports: recentReports.map((r) => ({
      id: r.id,
      reason: r.reason,
      createdAt: r.createdAt.toISOString(),
      reporter: r.reporter.username,
      review: r.review,
    })),
  };
}

export async function listAdminSeries(q: { q?: string; page: number; pageSize: number; archived?: boolean }) {
  const where = {
    ...(q.archived !== undefined ? { isArchived: q.archived } : {}),
    ...(q.q ? { OR: [{ title: { contains: q.q, mode: "insensitive" as const } }, { searchText: { contains: q.q.toLowerCase() } }] } : {}),
  };
  const [total, rows] = await Promise.all([
    prisma.mangaSeries.count({ where }),
    prisma.mangaSeries.findMany({
      where,
      orderBy: { metadataUpdatedAt: "desc" },
      skip: (q.page - 1) * q.pageSize,
      take: q.pageSize,
      include: { ...cardInclude, featured: true },
    }),
  ]);
  return {
    items: rows.map((r) => ({ ...toCard(r), isArchived: r.isArchived, isFeatured: !!r.featured, externalProvider: r.externalProvider, externalId: r.externalId, lastSyncedAt: r.lastSyncedAt?.toISOString() ?? null })),
    total,
    page: q.page,
    pageSize: q.pageSize,
    totalPages: Math.max(1, Math.ceil(total / q.pageSize)),
  };
}

export async function createSeries(actorId: string, input: AdminSeriesInput) {
  const row = await writeSeries({ ...input, source: "MANUAL" });
  await audit(actorId, "series.create", "MangaSeries", row.id, { title: row.title });
  return { id: row.id, slug: row.slug };
}

export async function updateSeries(actorId: string, id: string, input: Partial<AdminSeriesInput> & { isArchived?: boolean }) {
  const existing = await prisma.mangaSeries.findUnique({ where: { id } });
  if (!existing) throw notFound("Series");
  const { isArchived, ...rest } = input;
  const row = Object.keys(rest).length ? await writeSeries(rest, { id }) : existing;
  if (isArchived !== undefined) await prisma.mangaSeries.update({ where: { id }, data: { isArchived } });
  await audit(actorId, "series.update", "MangaSeries", id, { fields: Object.keys(input) });
  return { id: row.id, slug: row.slug };
}

/** Archive by default (keeps user data intact); hard delete only when explicitly requested by an admin. */
export async function deleteSeries(actorId: string, id: string, hard: boolean) {
  const existing = await prisma.mangaSeries.findUnique({ where: { id } });
  if (!existing) throw notFound("Series");
  if (hard) {
    await prisma.mangaSeries.delete({ where: { id } });
    await audit(actorId, "series.delete", "MangaSeries", id, { title: existing.title });
  } else {
    await prisma.mangaSeries.update({ where: { id }, data: { isArchived: true } });
    await prisma.featuredSeries.deleteMany({ where: { seriesId: id } });
    await audit(actorId, "series.archive", "MangaSeries", id, { title: existing.title });
  }
}

/**
 * Merge a duplicate catalog entry into the one to keep. User rows are moved across; where the same user
 * has rows on both, the kept series' row wins. The duplicate is archived and its external ID copied if
 * the kept entry has none.
 */
export async function mergeSeries(actorId: string, keepId: string, mergeId: string) {
  if (keepId === mergeId) throw badRequest("Pick two different series to merge.");
  const [keep, dup] = await Promise.all([
    prisma.mangaSeries.findUnique({ where: { id: keepId } }),
    prisma.mangaSeries.findUnique({ where: { id: mergeId } }),
  ]);
  if (!keep || !dup) throw notFound("Series");

  await prisma.$transaction(async (tx) => {
    const moveUnique = async (model: "libraryEntry" | "favorite" | "rating" | "review" | "readingHistory") => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const m = tx[model] as any;
      const keepRows: { userId: string }[] = await m.findMany({ where: { seriesId: keepId }, select: { userId: true } });
      const taken = keepRows.map((r) => r.userId);
      await m.deleteMany({ where: { seriesId: mergeId, userId: { in: taken } } });
      await m.updateMany({ where: { seriesId: mergeId }, data: { seriesId: keepId } });
    };
    for (const model of ["libraryEntry", "favorite", "rating", "review", "readingHistory"] as const) await moveUnique(model);
    await tx.readingActivity.updateMany({ where: { seriesId: mergeId }, data: { seriesId: keepId } });
    await tx.dismissedRecommendation.deleteMany({ where: { seriesId: mergeId } });
    await tx.featuredSeries.deleteMany({ where: { seriesId: mergeId } });
    await tx.seasonalCollectionItem.deleteMany({ where: { seriesId: mergeId } });
    const alt = [...new Set([...keep.altTitles, dup.title, ...dup.altTitles])].filter((t) => t !== keep.title);
    await tx.mangaSeries.update({
      where: { id: mergeId },
      data: { isArchived: true, externalId: null, externalProvider: null, slug: `${dup.slug}-merged-${Date.now().toString(36)}` },
    });
    await tx.mangaSeries.update({
      where: { id: keepId },
      data: {
        altTitles: alt,
        ...(keep.externalId ? {} : { externalId: dup.externalId, externalProvider: dup.externalProvider }),
      },
    });
  });
  await recomputeSeriesStats(keepId);
  await recomputeSeriesStats(mergeId);
  await audit(actorId, "series.merge", "MangaSeries", keepId, { mergedFrom: mergeId, mergedTitle: dup.title });
  return { keptId: keepId };
}

/** Candidate duplicates: series whose titles are very similar (pg_trgm). */
export async function findDuplicates(limit = 20) {
  const rows = await prisma.$queryRaw<{ a: string; b: string; a_title: string; b_title: string; sim: number }[]>`
    SELECT a.id AS a, b.id AS b, a.title AS a_title, b.title AS b_title, similarity(lower(a.title), lower(b.title))::float AS sim
    FROM "MangaSeries" a
    JOIN "MangaSeries" b ON a.id < b.id AND a.type = b.type AND lower(a.title) % lower(b.title)
    WHERE a."isArchived" = false AND b."isArchived" = false
    ORDER BY sim DESC
    LIMIT ${limit}`;
  return rows.map((r) => ({ a: { id: r.a, title: r.a_title }, b: { id: r.b, title: r.b_title }, similarity: Math.round(r.sim * 100) / 100 }));
}

// ───────── Featured & collections ─────────

export async function upsertFeatured(actorId: string, input: { seriesId: string; reason: string; position: number; isActive: boolean }) {
  const s = await prisma.mangaSeries.findFirst({ where: { id: input.seriesId, isArchived: false } });
  if (!s) throw notFound("Series");
  const row = await prisma.featuredSeries.upsert({
    where: { seriesId: input.seriesId },
    update: { reason: input.reason, position: input.position, isActive: input.isActive },
    create: { ...input, createdById: actorId },
  });
  await audit(actorId, "featured.set", "FeaturedSeries", row.id, { seriesId: input.seriesId });
  return row;
}

export async function removeFeatured(actorId: string, seriesId: string) {
  const { count } = await prisma.featuredSeries.deleteMany({ where: { seriesId } });
  if (!count) throw notFound("Featured entry");
  await audit(actorId, "featured.remove", "FeaturedSeries", seriesId);
}

export async function listFeaturedAdmin() {
  const rows = await prisma.featuredSeries.findMany({ orderBy: { position: "asc" }, include: { series: { include: cardInclude } } });
  return rows.map((r) => ({ id: r.id, reason: r.reason, position: r.position, isActive: r.isActive, series: toCard(r.series) }));
}

export async function listCollectionsAdmin() {
  const rows = await prisma.seasonalCollection.findMany({
    orderBy: [{ year: "desc" }, { season: "asc" }],
    include: { items: { orderBy: { position: "asc" }, include: { series: { select: { id: true, title: true } } } } },
  });
  return rows;
}

export async function saveCollection(
  actorId: string,
  input: { title: string; description?: string | null; season: "WINTER" | "SPRING" | "SUMMER" | "FALL"; year: number; isPublished: boolean; items: { seriesId: string; note?: string }[] },
  id?: string,
) {
  const slugBase = slugify(`${input.season}-${input.year}-${input.title}`);
  const col = await prisma.$transaction(async (tx) => {
    const c = id
      ? await tx.seasonalCollection.update({
          where: { id },
          data: { title: input.title, description: input.description ?? null, season: input.season, year: input.year, isPublished: input.isPublished },
        })
      : await tx.seasonalCollection.create({
          data: { slug: `${slugBase}-${Date.now().toString(36)}`, title: input.title, description: input.description ?? null, season: input.season, year: input.year, isPublished: input.isPublished, createdById: actorId },
        });
    await tx.seasonalCollectionItem.deleteMany({ where: { collectionId: c.id } });
    const unique = input.items.filter((it, i, arr) => arr.findIndex((x) => x.seriesId === it.seriesId) === i);
    if (unique.length) {
      await tx.seasonalCollectionItem.createMany({
        data: unique.map((it, position) => ({ collectionId: c.id, seriesId: it.seriesId, note: it.note ?? null, position })),
      });
    }
    return c;
  });
  await audit(actorId, id ? "collection.update" : "collection.create", "SeasonalCollection", col.id, { title: input.title });
  return col;
}

export async function deleteCollection(actorId: string, id: string) {
  await prisma.seasonalCollection.delete({ where: { id } });
  await audit(actorId, "collection.delete", "SeasonalCollection", id);
}

// ───────── Users ─────────

export async function listUsers(q: { q?: string; page: number; pageSize: number }) {
  const where = q.q
    ? { OR: [{ username: { contains: q.q, mode: "insensitive" as const } }, { email: { contains: q.q, mode: "insensitive" as const } }] }
    : {};
  const [total, rows] = await Promise.all([
    prisma.user.count({ where }),
    prisma.user.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (q.page - 1) * q.pageSize,
      take: q.pageSize,
      select: { id: true, username: true, email: true, role: true, isDemo: true, isSuspended: true, createdAt: true, lastLoginAt: true, _count: { select: { reviews: true, library: true } } },
    }),
  ]);
  return { items: rows, total, page: q.page, pageSize: q.pageSize, totalPages: Math.max(1, Math.ceil(total / q.pageSize)) };
}

export async function updateUser(actorId: string, id: string, input: { role?: "USER" | "MODERATOR" | "ADMIN"; isSuspended?: boolean }) {
  if (id === actorId && (input.role && input.role !== "ADMIN")) throw badRequest("You can't remove your own admin role.");
  if (id === actorId && input.isSuspended) throw badRequest("You can't suspend yourself.");
  const user = await prisma.user.update({ where: { id }, data: input, select: { id: true, username: true, role: true, isSuspended: true } });
  if (input.isSuspended) await prisma.session.deleteMany({ where: { userId: id } });
  await audit(actorId, "user.update", "User", id, input);
  return user;
}
