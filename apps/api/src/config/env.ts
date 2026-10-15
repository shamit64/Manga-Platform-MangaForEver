import { z } from "zod";

const bool = z
  .enum(["true", "false", "1", "0"])
  .optional()
  .transform((v) => (v === undefined ? undefined : v === "true" || v === "1"));

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().default(4000),
  /** Interface to bind. Leave unset in production (all interfaces); 127.0.0.1 for local-only. */
  HOST: z.string().optional(),
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  /** Comma-separated list of browser origins allowed to call the API. */
  WEB_ORIGIN: z.string().default("http://localhost:3000"),
  /** Public URL of the web app, used to build password-reset links. */
  APP_URL: z.string().default("http://localhost:3000"),
  SESSION_TTL_DAYS: z.coerce.number().int().min(1).max(365).default(30),
  COOKIE_SECURE: bool,
  COOKIE_DOMAIN: z.string().optional(),
  TRUST_PROXY: z.coerce.number().int().min(0).default(1),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).default("info"),
  /** "anilist" enables live AniList imports; "none" runs on the local catalog only. */
  METADATA_PROVIDER: z.enum(["anilist", "none"]).default("anilist"),
  ANILIST_API_URL: z.string().default("https://graphql.anilist.co"),
  /**
   * Shared secret the web server sends on server-side render requests. Those requests fan out to many
   * endpoints per page view, so they skip the global per-IP limit (per-route limits still apply).
   */
  INTERNAL_API_TOKEN: z.string().min(16).optional(),
  /** Sign-ups must click the emailed link before they can sign in. */
  REQUIRE_EMAIL_VERIFICATION: bool,
  /** Comma-separated emails that are always given the Admin role (checked at sign-in and on start-up). */
  ADMIN_EMAILS: z.string().default(""),
  /** Email delivery through Resend (https://resend.com). Without a key, emails are logged instead. */
  RESEND_API_KEY: z.string().optional(),
  MAIL_FROM: z.string().default("MangaForEver <onboarding@resend.dev>"),
  /** Secret the scheduler (GitHub Actions) sends to POST /internal/jobs/:job. Jobs are disabled without it. */
  JOBS_TOKEN: z.string().min(16).optional(),
  /** "mangadex" enables the automatic chapter feed; "none" turns it off. */
  CHAPTER_PROVIDER: z.enum(["mangadex", "none"]).default("mangadex"),
  MANGADEX_API_URL: z.string().default("https://api.mangadex.org"),
  /** Translated languages to record from the chapter feed (comma-separated ISO codes). */
  CHAPTER_LANGUAGES: z.string().default("en"),
  /** Web Push keys (generate with: npx web-push generate-vapid-keys). Push is off without them. */
  VAPID_PUBLIC_KEY: z.string().optional(),
  VAPID_PRIVATE_KEY: z.string().optional(),
  VAPID_SUBJECT: z.string().default("mailto:admin@example.com"),
  /** Disable rate limits (tests only). */
  DISABLE_RATE_LIMIT: bool,
});

const parsed = envSchema.safeParse(process.env);
if (!parsed.success) {
  console.error("Invalid environment configuration:", z.treeifyError(parsed.error));
  process.exit(1);
}

export const env = {
  ...parsed.data,
  isProd: parsed.data.NODE_ENV === "production",
  isTest: parsed.data.NODE_ENV === "test",
  cookieSecure: parsed.data.COOKIE_SECURE ?? parsed.data.NODE_ENV === "production",
  allowedOrigins: parsed.data.WEB_ORIGIN.split(",").map((o) => o.trim()).filter(Boolean),
  requireEmailVerification: parsed.data.REQUIRE_EMAIL_VERIFICATION ?? true,
  adminEmails: parsed.data.ADMIN_EMAILS.split(",").map((e) => e.trim().toLowerCase()).filter(Boolean),
  chapterLanguages: parsed.data.CHAPTER_LANGUAGES.split(",").map((l) => l.trim()).filter(Boolean),
};
