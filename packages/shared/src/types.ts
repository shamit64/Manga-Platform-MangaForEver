import type {
  ContentType,
  DataSource,
  Demographic,
  PublicationStatus,
  ReadingStatus,
  Role,
  Season,
} from "./constants.js";

export interface Paginated<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface ApiErrorBody {
  error: { code: string; message: string; details?: unknown };
}

export interface GenreRef {
  name: string;
  slug: string;
}

export interface CreatorRef {
  name: string;
  slug: string;
  role: "STORY" | "ART" | "STORY_AND_ART";
}

/** Lightweight card representation used in grids, rankings and suggestions. */
export interface SeriesCard {
  id: string;
  slug: string;
  title: string;
  altTitles: string[];
  coverUrl: string | null;
  type: ContentType;
  status: PublicationStatus;
  releaseYear: number | null;
  genres: GenreRef[];
  ratingAvg: number | null;
  ratingCount: number;
  favoriteCount: number;
  reviewCount: number;
  libraryCount: number;
  popularityScore: number;
  externalRating: number | null;
  externalRatingSource: string | null;
  externalPopularity: number | null;
  chapterCount: number | null;
  latestChapter: number | null;
  lastChapterAt: string | null;
  source: DataSource;
  synopsis: string | null;
  metadataUpdatedAt: string;
  createdAt: string;
}

export interface SeriesDetail extends SeriesCard {
  localizedTitles: Record<string, string> | null;
  bannerUrl: string | null;
  description: string | null;
  countryOfOrigin: string | null;
  publisher: string | null;
  demographic: Demographic | null;
  startDate: string | null;
  endDate: string | null;
  volumeCount: number | null;
  externalPopularityRank: number | null;
  externalUrls: { label: string; url: string }[];
  externalProvider: string | null;
  externalId: string | null;
  lastSyncedAt: string | null;
  tags: GenreRef[];
  creators: CreatorRef[];
  communityRank: number | null;
  chapters: ChapterDTO[];
  followerCount: number;
  updatedAt: string;
  /** Present when the request is authenticated. */
  viewer?: ViewerSeriesState;
}

export interface ViewerSeriesState {
  libraryEntry: LibraryEntryDTO | null;
  isFavorite: boolean;
  rating: number | null;
  reviewId: string | null;
  isFollowing: boolean;
}

export interface ChapterDTO {
  id: string;
  number: number;
  title: string | null;
  releasedAt: string | null;
  source: string;
  externalUrl: string | null;
  publisher: string | null;
  readable: boolean;
  language: string | null;
}

/** A series in the Latest Updates grid with its newest chapters. */
export interface LatestUpdate {
  series: SeriesCard;
  chapters: Pick<ChapterDTO, "number" | "title" | "releasedAt" | "readable" | "externalUrl" | "publisher">[];
}

export interface NotificationDTO {
  id: string;
  type: "NEW_CHAPTER" | "REVIEW_HELPFUL" | "SYSTEM";
  readAt: string | null;
  createdAt: string;
  data: Record<string, unknown> | null;
  series: { id: string; slug: string; title: string; coverUrl: string | null; type: ContentType } | null;
  chapter: { number: number; title: string | null; externalUrl: string | null; publisher: string | null; readable: boolean } | null;
}

export interface ChapterCommentDTO {
  id: string;
  body: string;
  containsSpoilers: boolean;
  isHidden: boolean;
  hiddenReason: string | null;
  createdAt: string;
  author: PublicUser;
  isOwn: boolean;
}

export interface ReaderChapter {
  series: { id: string; slug: string; title: string; type: ContentType; coverUrl: string | null; officialLinks: { label: string; url: string }[] };
  chapter: ChapterDTO;
  pages: { index: number; imageUrl: string; width: number | null; height: number | null }[];
  prev: number | null;
  next: number | null;
  chapterNumbers: number[];
  reactions: Record<"LOVED" | "HYPE" | "SAD" | "FUNNY" | "SHOCKED", number>;
  viewerReaction: "LOVED" | "HYPE" | "SAD" | "FUNNY" | "SHOCKED" | null;
  commentCount: number;
}

export interface PublicUser {
  id: string;
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
  role: Role;
  isDemo: boolean;
}

export interface Me extends PublicUser {
  email: string;
  emailVerified: boolean;
  bio: string | null;
  createdAt: string;
  preferences: Preferences;
}

export interface Preferences {
  theme: "dark" | "light" | "system";
  favoriteGenres: string[];
  favoriteTypes: ContentType[];
  readerMode: "strip" | "paged" | null;
  emailDigest: boolean;
  libraryVisibility: "PUBLIC" | "PRIVATE";
  favoritesVisibility: "PUBLIC" | "PRIVATE";
  showStats: boolean;
  showRecentlyCompleted: boolean;
  trackBrowsingHistory: boolean;
  trackSearchHistory: boolean;
}

export interface LibraryEntryDTO {
  id: string;
  seriesId: string;
  status: ReadingStatus;
  progressChapter: number;
  progressVolume: number;
  score: number | null;
  notes: string | null;
  isPrivate: boolean;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
  series?: SeriesCard;
}

export interface ReviewDTO {
  id: string;
  title: string;
  body: string;
  containsSpoilers: boolean;
  isHidden: boolean;
  helpfulCount: number;
  score: number | null;
  createdAt: string;
  updatedAt: string;
  author: PublicUser;
  series?: { id: string; slug: string; title: string; coverUrl: string | null; type: ContentType };
  viewerVotedHelpful?: boolean;
  isOwn?: boolean;
}

export interface Recommendation {
  series: SeriesCard;
  score: number;
  reasons: string[];
}

export interface RecommendationShelf {
  key: string;
  title: string;
  explanation: string;
  items: Recommendation[];
}

export interface RankingResponse {
  kind: string;
  explanation: string;
  source: "community" | "external";
  includesDemoActivity: boolean;
  items: (SeriesCard & { rank: number; metric: number | null })[];
}

export interface SeasonalCollectionDTO {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  season: Season;
  year: number;
  isCurated: true;
  items: { series: SeriesCard; note: string | null }[];
}
