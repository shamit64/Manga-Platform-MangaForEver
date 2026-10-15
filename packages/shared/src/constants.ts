export const CONTENT_TYPES = ["MANGA", "MANHWA", "MANHUA"] as const;
export type ContentType = (typeof CONTENT_TYPES)[number];

export const CONTENT_TYPE_LABELS: Record<ContentType, string> = {
  MANGA: "Manga",
  MANHWA: "Manhwa",
  MANHUA: "Manhua",
};

export const CONTENT_TYPE_ORIGIN: Record<ContentType, string> = {
  MANGA: "Japan",
  MANHWA: "South Korea",
  MANHUA: "China",
};

export const PUBLICATION_STATUSES = ["ONGOING", "COMPLETED", "HIATUS", "CANCELLED", "UPCOMING", "UNKNOWN"] as const;
export type PublicationStatus = (typeof PUBLICATION_STATUSES)[number];

export const PUBLICATION_STATUS_LABELS: Record<PublicationStatus, string> = {
  ONGOING: "Ongoing",
  COMPLETED: "Completed",
  HIATUS: "On hiatus",
  CANCELLED: "Cancelled",
  UPCOMING: "Upcoming",
  UNKNOWN: "Unknown",
};

export const DEMOGRAPHICS = ["SHOUNEN", "SHOUJO", "SEINEN", "JOSEI", "KODOMO"] as const;
export type Demographic = (typeof DEMOGRAPHICS)[number];

export const DEMOGRAPHIC_LABELS: Record<Demographic, string> = {
  SHOUNEN: "Shounen",
  SHOUJO: "Shoujo",
  SEINEN: "Seinen",
  JOSEI: "Josei",
  KODOMO: "Kodomo",
};

export const READING_STATUSES = ["READING", "PLAN_TO_READ", "COMPLETED", "ON_HOLD", "DROPPED"] as const;
export type ReadingStatus = (typeof READING_STATUSES)[number];

export const READING_STATUS_LABELS: Record<ReadingStatus, string> = {
  READING: "Currently reading",
  PLAN_TO_READ: "Plan to read",
  COMPLETED: "Completed",
  ON_HOLD: "On hold",
  DROPPED: "Dropped",
};

export const ROLES = ["USER", "MODERATOR", "ADMIN"] as const;
export type Role = (typeof ROLES)[number];

export const SEASONS = ["WINTER", "SPRING", "SUMMER", "FALL"] as const;
export type Season = (typeof SEASONS)[number];

export const SEASON_LABELS: Record<Season, string> = {
  WINTER: "Winter",
  SPRING: "Spring",
  SUMMER: "Summer",
  FALL: "Fall",
};

export const DATA_SOURCES = ["SEED_SAMPLE", "ANILIST", "MANUAL"] as const;
export type DataSource = (typeof DATA_SOURCES)[number];

export const DATA_SOURCE_LABELS: Record<DataSource, string> = {
  SEED_SAMPLE: "Sample data",
  ANILIST: "AniList",
  MANUAL: "Added by MangaForEver editors",
};

export const CATALOG_SORTS = [
  "popularity",
  "rating",
  "reviews",
  "newest",
  "added",
  "updated",
  "title",
  "relevance",
] as const;
export type CatalogSort = (typeof CATALOG_SORTS)[number];

export const CATALOG_SORT_LABELS: Record<CatalogSort, string> = {
  relevance: "Best match",
  popularity: "Most popular",
  rating: "Highest rated",
  reviews: "Most reviewed",
  newest: "Newest published",
  added: "Recently added",
  updated: "Recently updated",
  title: "Title A–Z",
};

export const REPORT_REASONS = ["SPAM", "HARASSMENT", "UNMARKED_SPOILERS", "OFF_TOPIC", "OTHER"] as const;
export type ReportReason = (typeof REPORT_REASONS)[number];

export const REPORT_REASON_LABELS: Record<ReportReason, string> = {
  SPAM: "Spam or advertising",
  HARASSMENT: "Harassment or hate",
  UNMARKED_SPOILERS: "Spoilers without a warning",
  OFF_TOPIC: "Not about this series",
  OTHER: "Something else",
};

export const RANKING_KINDS = ["popular", "top-rated", "most-reviewed", "most-favorited", "trending", "external"] as const;
export type RankingKind = (typeof RANKING_KINDS)[number];

/**
 * Plain-language explanations shown next to every ranking so readers know what the numbers mean.
 */
export const RANKING_EXPLANATIONS: Record<RankingKind, string> = {
  popular:
    "MangaForEver popularity score = library adds × 1 + favorites × 2 + ratings × 1.5 + reviews × 2, computed from stored member activity.",
  "top-rated":
    "Bayesian average of MangaForEver member ratings (1–10). Series need at least 3 ratings; small samples are pulled toward the site-wide mean.",
  "most-reviewed": "Count of visible MangaForEver member reviews.",
  "most-favorited": "Count of MangaForEver members who favorited the series.",
  trending:
    "Library adds, favorites, ratings and reviews from MangaForEver members in the last 30 days, weighted like the popularity score.",
  external:
    "Popularity reported by the external metadata provider (for AniList: number of AniList users tracking the series). Only shown for imported titles.",
};

export const PAGE_SIZE_MAX = 60;
