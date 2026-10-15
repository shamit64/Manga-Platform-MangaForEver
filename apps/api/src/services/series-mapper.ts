import type { SeriesCard, SeriesDetail } from "@mangaforever/shared";
import type { Prisma } from "../generated/prisma/client.js";
import { isoDate } from "../lib/util.js";

export const cardInclude = {
  genres: { include: { genre: true } },
} satisfies Prisma.MangaSeriesInclude;

export const detailInclude = {
  genres: { include: { genre: true } },
  tags: { include: { tag: true } },
  creators: { include: { creator: true } },
  chapters: { orderBy: { number: "desc" }, take: 60 },
  _count: { select: { follows: true } },
} satisfies Prisma.MangaSeriesInclude;

export type CardRow = Prisma.MangaSeriesGetPayload<{ include: typeof cardInclude }>;
export type DetailRow = Prisma.MangaSeriesGetPayload<{ include: typeof detailInclude }>;

export function toCard(s: CardRow): SeriesCard {
  return {
    id: s.id,
    slug: s.slug,
    title: s.title,
    altTitles: s.altTitles,
    coverUrl: s.coverUrl,
    type: s.type,
    status: s.status,
    releaseYear: s.releaseYear,
    genres: s.genres.map((g) => ({ name: g.genre.name, slug: g.genre.slug })).sort((a, b) => a.name.localeCompare(b.name)),
    ratingAvg: s.ratingAvg,
    ratingCount: s.ratingCount,
    favoriteCount: s.favoriteCount,
    reviewCount: s.reviewCount,
    libraryCount: s.libraryCount,
    popularityScore: s.popularityScore,
    externalRating: s.externalRating,
    externalRatingSource: s.externalRatingSource,
    externalPopularity: s.externalPopularity,
    chapterCount: s.chapterCount,
    latestChapter: s.latestChapter,
    lastChapterAt: s.lastChapterAt?.toISOString() ?? null,
    source: s.source,
    synopsis: s.synopsis,
    metadataUpdatedAt: s.metadataUpdatedAt.toISOString(),
    createdAt: s.createdAt.toISOString(),
  };
}

export function toDetail(s: DetailRow, communityRank: number | null): SeriesDetail {
  const creatorMap = new Map<string, SeriesDetail["creators"][number]>();
  for (const c of s.creators) {
    const existing = creatorMap.get(c.creator.slug);
    if (existing && existing.role !== c.role) existing.role = "STORY_AND_ART";
    else if (!existing) creatorMap.set(c.creator.slug, { name: c.creator.name, slug: c.creator.slug, role: c.role });
  }
  return {
    ...toCard(s),
    localizedTitles: (s.localizedTitles as Record<string, string> | null) ?? null,
    bannerUrl: s.bannerUrl,
    description: s.description,
    countryOfOrigin: s.countryOfOrigin,
    publisher: s.publisher,
    demographic: s.demographic,
    startDate: isoDate(s.startDate),
    endDate: isoDate(s.endDate),
    volumeCount: s.volumeCount,
    externalPopularityRank: s.externalPopularityRank,
    externalUrls: Array.isArray(s.externalUrls) ? (s.externalUrls as { label: string; url: string }[]) : [],
    externalProvider: s.externalProvider,
    externalId: s.externalId,
    lastSyncedAt: s.lastSyncedAt?.toISOString() ?? null,
    tags: s.tags.map((t) => ({ name: t.tag.name, slug: t.tag.slug })),
    creators: [...creatorMap.values()],
    communityRank,
    // One row per chapter number: a readable copy wins, then an official link.
    chapters: [...new Map(
      [...s.chapters]
        .sort((a, b) => Number(a.readable) - Number(b.readable) || Number(!!a.externalUrl) - Number(!!b.externalUrl))
        .map((c) => [c.number, c] as const),
    ).values()]
      .sort((a, b) => b.number - a.number)
      .slice(0, 20)
      .map((c) => ({
        id: c.id,
        number: c.number,
        title: c.title,
        releasedAt: c.releasedAt?.toISOString() ?? null,
        source: c.source,
        externalUrl: c.externalUrl,
        publisher: c.publisher,
        readable: c.readable,
        language: c.language,
      })),
    followerCount: s._count.follows,
    updatedAt: s.updatedAt.toISOString(),
  };
}
