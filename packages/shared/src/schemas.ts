import { z } from "zod";
import {
  CATALOG_SORTS,
  CONTENT_TYPES,
  DEMOGRAPHICS,
  PAGE_SIZE_MAX,
  PUBLICATION_STATUSES,
  READING_STATUSES,
  REPORT_REASONS,
  SEASONS,
} from "./constants.js";

// Query-string helpers: accept "a,b" or repeated params.
const csv = <T extends z.ZodTypeAny>(item: T) =>
  z.preprocess((v) => {
    if (v === undefined || v === null || v === "") return undefined;
    const arr = Array.isArray(v) ? v : String(v).split(",");
    const cleaned = arr.map((s) => String(s).trim()).filter(Boolean);
    return cleaned.length ? cleaned : undefined;
  }, z.array(item).max(20).optional());

const optionalInt = (min: number, max: number) =>
  z.preprocess((v) => (v === undefined || v === "" ? undefined : Number(v)), z.number().int().min(min).max(max).optional());

const optionalNumber = (min: number, max: number) =>
  z.preprocess((v) => (v === undefined || v === "" ? undefined : Number(v)), z.number().min(min).max(max).optional());

export const paginationSchema = z.object({
  page: z.preprocess((v) => (v === undefined || v === "" ? 1 : Number(v)), z.number().int().min(1).max(10_000)),
  pageSize: z.preprocess(
    (v) => (v === undefined || v === "" ? 24 : Number(v)),
    z.number().int().min(1).max(PAGE_SIZE_MAX),
  ),
});

export const catalogQuerySchema = paginationSchema.extend({
  q: z.string().trim().max(120).optional(),
  type: csv(z.enum(CONTENT_TYPES)),
  genres: csv(z.string().max(60)),
  /** "all" requires every selected genre; "any" matches at least one. */
  genreMode: z.enum(["all", "any"]).default("all"),
  tags: csv(z.string().max(60)),
  status: csv(z.enum(PUBLICATION_STATUSES)),
  demographic: csv(z.enum(DEMOGRAPHICS)),
  yearFrom: optionalInt(1900, 2100),
  yearTo: optionalInt(1900, 2100),
  creator: z.string().trim().max(120).optional(),
  minRating: optionalNumber(0, 10),
  minPopularity: optionalNumber(0, 1_000_000),
  updatedWithinDays: optionalInt(1, 3650),
  sort: z.enum(CATALOG_SORTS).optional(),
  order: z.enum(["asc", "desc"]).optional(),
});
export type CatalogQuery = z.infer<typeof catalogQuerySchema>;

export const suggestQuerySchema = z.object({
  q: z.string().trim().min(1).max(120),
  limit: z.preprocess((v) => (v === undefined ? 8 : Number(v)), z.number().int().min(1).max(12)),
});

// ───────── Auth ─────────

export const usernameSchema = z
  .string()
  .trim()
  .min(3, "Use at least 3 characters")
  .max(24, "Use at most 24 characters")
  .regex(/^[a-zA-Z0-9_]+$/, "Use letters, numbers and underscores only");

export const passwordSchema = z
  .string()
  .min(8, "Use at least 8 characters")
  .max(128, "Use at most 128 characters")
  .regex(/[a-zA-Z]/, "Include at least one letter")
  .regex(/[0-9]/, "Include at least one number");

export const registerSchema = z.object({
  email: z.email("Enter a valid email address").trim().toLowerCase().max(254),
  username: usernameSchema,
  password: passwordSchema,
});
export type RegisterInput = z.infer<typeof registerSchema>;

export const loginSchema = z.object({
  identifier: z.string().trim().min(1, "Enter your email or username").max(254),
  password: z.string().min(1, "Enter your password").max(128),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const forgotPasswordSchema = z.object({
  email: z.email("Enter a valid email address").trim().toLowerCase(),
});

export const resetPasswordSchema = z.object({
  token: z.string().min(20).max(200),
  password: passwordSchema,
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1).max(128),
  newPassword: passwordSchema,
});

// ───────── Profile & preferences ─────────

export const updateProfileSchema = z.object({
  displayName: z.string().trim().max(40).nullable().optional(),
  bio: z.string().trim().max(500).nullable().optional(),
  avatarUrl: z
    .url()
    .refine((u) => u.startsWith("https://"), "Avatar URL must use https")
    .max(500)
    .nullable()
    .optional(),
  preferences: z
    .object({
      theme: z.enum(["dark", "light", "system"]).optional(),
      favoriteGenres: z.array(z.string().max(60)).max(15).optional(),
      libraryVisibility: z.enum(["PUBLIC", "PRIVATE"]).optional(),
      favoritesVisibility: z.enum(["PUBLIC", "PRIVATE"]).optional(),
      showStats: z.boolean().optional(),
      showRecentlyCompleted: z.boolean().optional(),
      trackBrowsingHistory: z.boolean().optional(),
      trackSearchHistory: z.boolean().optional(),
    })
    .optional(),
});
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;

// ───────── Library ─────────

const dateString = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD")
  .nullable()
  .optional();

export const libraryCreateSchema = z.object({
  seriesId: z.string().min(1).max(40),
  status: z.enum(READING_STATUSES).default("PLAN_TO_READ"),
  progressChapter: z.number().int().min(0).max(100_000).optional(),
  progressVolume: z.number().int().min(0).max(10_000).optional(),
  score: z.number().int().min(1).max(10).nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
  isPrivate: z.boolean().optional(),
  startedAt: dateString,
  completedAt: dateString,
});
export type LibraryCreateInput = z.infer<typeof libraryCreateSchema>;

export const libraryUpdateSchema = libraryCreateSchema.omit({ seriesId: true }).partial().extend({
  status: z.enum(READING_STATUSES).optional(),
});
export type LibraryUpdateInput = z.infer<typeof libraryUpdateSchema>;

export const libraryQuerySchema = paginationSchema.extend({
  status: z.enum(READING_STATUSES).optional(),
  type: z.enum(CONTENT_TYPES).optional(),
  q: z.string().trim().max(120).optional(),
  sort: z.enum(["updated", "title", "score", "progress", "added"]).default("updated"),
});

// ───────── Favorites ─────────

export const favoriteCreateSchema = z.object({ seriesId: z.string().min(1).max(40) });

export const favoritesQuerySchema = paginationSchema.extend({
  type: z.enum(CONTENT_TYPES).optional(),
  genre: z.string().max(60).optional(),
  sort: z.enum(["recent", "title", "rating", "popularity"]).default("recent"),
});

// ───────── Ratings & reviews ─────────

export const ratingSchema = z.object({ score: z.number().int().min(1).max(10) });

export const reviewCreateSchema = z.object({
  title: z.string().trim().min(3, "Give your review a title").max(120),
  body: z.string().trim().min(30, "Write at least 30 characters").max(10_000),
  containsSpoilers: z.boolean().default(false),
  score: z.number().int().min(1).max(10).optional(),
});
export type ReviewCreateInput = z.infer<typeof reviewCreateSchema>;

export const reviewUpdateSchema = reviewCreateSchema.partial();

export const reviewQuerySchema = paginationSchema.extend({
  sort: z.enum(["newest", "rating", "helpful"]).default("helpful"),
});

export const reportCreateSchema = z.object({
  reason: z.enum(REPORT_REASONS),
  details: z.string().trim().max(1000).optional(),
});

export const reportResolveSchema = z.object({
  action: z.enum(["HIDE_REVIEW", "RESTORE_REVIEW", "DISMISS"]),
  note: z.string().trim().max(500).optional(),
});

// ───────── Admin catalog ─────────

export const adminSeriesSchema = z.object({
  title: z.string().trim().min(1).max(200),
  altTitles: z.array(z.string().trim().min(1).max(200)).max(20).default([]),
  synopsis: z.string().trim().max(2000).nullable().optional(),
  description: z.string().trim().max(10_000).nullable().optional(),
  coverUrl: z.url().max(500).nullable().optional(),
  bannerUrl: z.url().max(500).nullable().optional(),
  type: z.enum(CONTENT_TYPES),
  countryOfOrigin: z.string().trim().max(60).nullable().optional(),
  publisher: z.string().trim().max(120).nullable().optional(),
  demographic: z.enum(DEMOGRAPHICS).nullable().optional(),
  status: z.enum(PUBLICATION_STATUSES).default("UNKNOWN"),
  releaseYear: z.number().int().min(1900).max(2100).nullable().optional(),
  chapterCount: z.number().int().min(0).max(100_000).nullable().optional(),
  volumeCount: z.number().int().min(0).max(10_000).nullable().optional(),
  genres: z.array(z.string().trim().min(1).max(60)).max(15).default([]),
  tags: z.array(z.string().trim().min(1).max(60)).max(30).default([]),
  authors: z.array(z.string().trim().min(1).max(120)).max(10).default([]),
  artists: z.array(z.string().trim().min(1).max(120)).max(10).default([]),
});
export type AdminSeriesInput = z.infer<typeof adminSeriesSchema>;
export const adminSeriesUpdateSchema = adminSeriesSchema.partial();

export const featuredSchema = z.object({
  seriesId: z.string().min(1).max(40),
  reason: z.string().trim().min(10).max(300),
  position: z.number().int().min(0).max(100).default(0),
  isActive: z.boolean().default(true),
});

export const collectionSchema = z.object({
  title: z.string().trim().min(3).max(120),
  description: z.string().trim().max(500).nullable().optional(),
  season: z.enum(SEASONS),
  year: z.number().int().min(1950).max(2100),
  isPublished: z.boolean().default(true),
  items: z
    .array(z.object({ seriesId: z.string().min(1).max(40), note: z.string().trim().max(200).optional() }))
    .max(50)
    .default([]),
});

export const importSchema = z.object({
  provider: z.enum(["anilist"]).default("anilist"),
  /** Import a single provider ID, the first page of a search, or a page of the most popular titles. */
  externalId: z.string().regex(/^\d+$/).optional(),
  search: z.string().trim().min(1).max(100).optional(),
  /** With neither externalId nor search: most popular titles of this type (manga JP, manhwa KR, manhua CN). */
  contentType: z.enum(CONTENT_TYPES).optional(),
  page: z.number().int().min(1).max(40).default(1),
  limit: z.number().int().min(1).max(50).default(10),
  skipExisting: z.boolean().default(false),
});

export const mergeSchema = z.object({
  keepId: z.string().min(1).max(40),
  mergeId: z.string().min(1).max(40),
});

export const seasonalQuerySchema = z.object({
  season: z.enum(SEASONS).optional(),
  year: optionalInt(1950, 2100),
  genre: z.string().max(60).optional(),
});

export const rankingQuerySchema = z.object({
  kind: z
    .enum(["popular", "top-rated", "most-reviewed", "most-favorited", "trending", "external"])
    .default("popular"),
  type: z.enum(CONTENT_TYPES).optional(),
  limit: z.preprocess((v) => (v === undefined ? 10 : Number(v)), z.number().int().min(1).max(100)),
});
