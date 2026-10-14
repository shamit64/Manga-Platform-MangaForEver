import type { Prisma, PrismaClient } from "../generated/prisma/client.js";
import { prisma as defaultPrisma } from "../lib/prisma.js";
import { slugify } from "../lib/util.js";

type ContentType = "MANGA" | "MANHWA" | "MANHUA";

export interface SeriesWriteInput {
  title: string;
  altTitles?: string[];
  localizedTitles?: Record<string, string> | null;
  coverUrl?: string | null;
  bannerUrl?: string | null;
  synopsis?: string | null;
  description?: string | null;
  type: ContentType;
  countryOfOrigin?: string | null;
  publisher?: string | null;
  demographic?: "SHOUNEN" | "SHOUJO" | "SEINEN" | "JOSEI" | "KODOMO" | null;
  status?: "ONGOING" | "COMPLETED" | "HIATUS" | "CANCELLED" | "UPCOMING" | "UNKNOWN";
  releaseYear?: number | null;
  startDate?: Date | null;
  endDate?: Date | null;
  chapterCount?: number | null;
  volumeCount?: number | null;
  isAdult?: boolean;
  externalRating?: number | null;
  externalRatingSource?: string | null;
  externalPopularity?: number | null;
  externalPopularityRank?: number | null;
  externalUrls?: { label: string; url: string }[] | null;
  source: "SEED_SAMPLE" | "ANILIST" | "MANUAL";
  externalProvider?: string | null;
  externalId?: string | null;
  lastSyncedAt?: Date | null;
  genres?: string[];
  tags?: string[];
  authors?: string[];
  artists?: string[];
}

type Tx = Prisma.TransactionClient | PrismaClient;

export function buildSearchText(parts: {
  title: string;
  altTitles?: string[];
  localizedTitles?: Record<string, string> | null;
  creators?: string[];
  genres?: string[];
  tags?: string[];
  type: string;
}) {
  const typeWords: Record<string, string> = { MANGA: "manga japanese", MANHWA: "manhwa korean webtoon", MANHUA: "manhua chinese" };
  const all = [
    parts.title,
    ...(parts.altTitles ?? []),
    ...Object.values(parts.localizedTitles ?? {}),
    ...(parts.creators ?? []),
    ...(parts.genres ?? []),
    ...(parts.tags ?? []),
    typeWords[parts.type] ?? "",
  ]
    .filter(Boolean)
    .map((s) => s.toLowerCase());
  return [...new Set(all)].join(" | ");
}

async function uniqueSlug(tx: Tx, title: string, excludeId?: string) {
  const base = slugify(title);
  let slug = base;
  for (let i = 2; i < 50; i++) {
    const hit = await tx.mangaSeries.findUnique({ where: { slug }, select: { id: true } });
    if (!hit || hit.id === excludeId) return slug;
    slug = `${base}-${i}`;
  }
  return `${base}-${Date.now().toString(36)}`;
}

async function ensureGenres(tx: Tx, names: string[]) {
  const ids: number[] = [];
  for (const name of [...new Set(names.map((n) => n.trim()).filter(Boolean))]) {
    const slug = slugify(name);
    const g = await tx.genre.upsert({ where: { slug }, update: {}, create: { name, slug } });
    ids.push(g.id);
  }
  return ids;
}

async function ensureTags(tx: Tx, names: string[]) {
  const ids: number[] = [];
  for (const name of [...new Set(names.map((n) => n.trim()).filter(Boolean))]) {
    const slug = slugify(name);
    const t = await tx.tag.upsert({ where: { slug }, update: {}, create: { name, slug } });
    ids.push(t.id);
  }
  return ids;
}

async function ensureCreator(tx: Tx, name: string) {
  const slug = slugify(name);
  return tx.creator.upsert({ where: { slug }, update: {}, create: { name: name.trim(), slug } });
}

/**
 * Create or update a catalog entry together with its normalised genres, tags and creators.
 * Relations are replaced wholesale when supplied. Keeps `searchText` in sync for search indexes.
 */
export async function writeSeries(input: Partial<SeriesWriteInput>, opts: { id?: string; db?: Tx } = {}) {
  const db = opts.db ?? defaultPrisma;
  const run = async (tx: Tx) => {
    const existing = opts.id
      ? await tx.mangaSeries.findUnique({
          where: { id: opts.id },
          include: { genres: { include: { genre: true } }, tags: { include: { tag: true } }, creators: { include: { creator: true } } },
        })
      : null;

    const scalar: Prisma.MangaSeriesUncheckedCreateInput = {
      title: input.title ?? existing?.title ?? "Untitled",
      slug: "",
      type: input.type ?? existing?.type ?? "MANGA",
      source: input.source ?? existing?.source ?? "MANUAL",
    };
    const fields = [
      "altTitles", "coverUrl", "bannerUrl", "synopsis", "description", "countryOfOrigin", "publisher", "demographic",
      "status", "releaseYear", "startDate", "endDate", "chapterCount", "volumeCount", "isAdult", "externalRating",
      "externalRatingSource", "externalPopularity", "externalPopularityRank", "externalProvider", "externalId", "lastSyncedAt",
    ] as const;
    const data: Record<string, unknown> = {};
    for (const f of fields) if (input[f] !== undefined) data[f] = input[f];
    if (input.localizedTitles !== undefined) data.localizedTitles = input.localizedTitles ?? undefined;
    if (input.externalUrls !== undefined) data.externalUrls = input.externalUrls ?? undefined;
    if (input.title !== undefined && input.title !== existing?.title) data.title = input.title;
    if (input.type !== undefined) data.type = input.type;
    if (input.source !== undefined) data.source = input.source;

    const genreIds = input.genres ? await ensureGenres(tx, input.genres) : null;
    const tagIds = input.tags ? await ensureTags(tx, input.tags) : null;
    let creatorRows: { creatorId: string; role: "STORY" | "ART" }[] | null = null;
    if (input.authors || input.artists) {
      creatorRows = [];
      for (const a of input.authors ?? []) creatorRows.push({ creatorId: (await ensureCreator(tx, a)).id, role: "STORY" });
      for (const a of input.artists ?? []) creatorRows.push({ creatorId: (await ensureCreator(tx, a)).id, role: "ART" });
      creatorRows = creatorRows.filter((r, i, arr) => arr.findIndex((x) => x.creatorId === r.creatorId && x.role === r.role) === i);
    }

    let id = opts.id;
    if (!existing) {
      const created = await tx.mangaSeries.create({
        data: { ...scalar, ...data, slug: await uniqueSlug(tx, scalar.title) } as Prisma.MangaSeriesUncheckedCreateInput,
      });
      id = created.id;
    } else {
      if (data.title) data.slug = await uniqueSlug(tx, data.title as string, existing.id);
      data.metadataUpdatedAt = new Date();
      await tx.mangaSeries.update({ where: { id: existing.id }, data: data as Prisma.MangaSeriesUncheckedUpdateInput });
    }

    if (genreIds) {
      await tx.seriesGenre.deleteMany({ where: { seriesId: id! } });
      await tx.seriesGenre.createMany({ data: genreIds.map((genreId) => ({ seriesId: id!, genreId })) });
    }
    if (tagIds) {
      await tx.seriesTag.deleteMany({ where: { seriesId: id! } });
      await tx.seriesTag.createMany({ data: tagIds.map((tagId) => ({ seriesId: id!, tagId })) });
    }
    if (creatorRows) {
      await tx.seriesCreator.deleteMany({ where: { seriesId: id! } });
      await tx.seriesCreator.createMany({ data: creatorRows.map((r) => ({ ...r, seriesId: id! })) });
    }

    // Rebuild search text from the final state.
    const full = await tx.mangaSeries.findUniqueOrThrow({
      where: { id: id! },
      include: { genres: { include: { genre: true } }, tags: { include: { tag: true } }, creators: { include: { creator: true } } },
    });
    const searchText = buildSearchText({
      title: full.title,
      altTitles: full.altTitles,
      localizedTitles: full.localizedTitles as Record<string, string> | null,
      creators: full.creators.map((c) => c.creator.name),
      genres: full.genres.map((g) => g.genre.name),
      tags: full.tags.map((t) => t.tag.name),
      type: full.type,
    });
    await tx.mangaSeries.update({ where: { id: id! }, data: { searchText } });
    return full;
  };
  // Use an interactive transaction when we were given the root client.
  if ("$transaction" in db) return (db as PrismaClient).$transaction((tx) => run(tx), { timeout: 20_000 });
  return run(db);
}
