/**
 * OpenAPI 3.1 description of the MangaForEver REST API, served at /openapi.json and rendered at /docs.
 * Kept next to the routes so it's updated in the same change as the code.
 */

type Json = Record<string, unknown>;

const ref = (name: string) => ({ $ref: `#/components/schemas/${name}` });
const json = (schema: Json, example?: unknown) => ({ "application/json": { schema, ...(example !== undefined ? { example } : {}) } });
const ok = (description: string, schema?: Json, example?: unknown) => ({ description, ...(schema ? { content: json(schema, example) } : {}) });
const errors = (...codes: number[]) =>
  Object.fromEntries(codes.map((c) => [String(c), { $ref: `#/components/responses/E${c}` }]));
const q = (name: string, schema: Json, description?: string, required = false) => ({ name, in: "query", required, schema, description });
const p = (name: string, description = "ID or slug") => ({ name, in: "path", required: true, schema: { type: "string" }, description });
const auth = [{ session: [] }];
const body = (schema: Json, example?: unknown) => ({ required: true, content: json(schema, example) });

const paging = [q("page", { type: "integer", minimum: 1, default: 1 }), q("pageSize", { type: "integer", minimum: 1, maximum: 60, default: 24 })];

const seriesExample = {
  id: "cm2x8w1q0000abc",
  slug: "frieren-beyond-journey-s-end",
  title: "Frieren: Beyond Journey's End",
  altTitles: ["葬送のフリーレン", "Sousou no Frieren"],
  coverUrl: null,
  type: "MANGA",
  status: "ONGOING",
  releaseYear: 2020,
  genres: [{ name: "Adventure", slug: "adventure" }, { name: "Fantasy", slug: "fantasy" }],
  ratingAvg: 8.75,
  ratingCount: 4,
  favoriteCount: 2,
  reviewCount: 1,
  libraryCount: 5,
  popularityScore: 18,
  externalRating: null,
  externalRatingSource: null,
  externalPopularity: null,
  chapterCount: null,
  source: "SEED_SAMPLE",
  synopsis: "An elf mage who outlives the hero's party…",
  metadataUpdatedAt: "2026-10-14T17:12:00.000Z",
  createdAt: "2026-10-14T17:12:00.000Z",
};

export const openApiDocument = {
  openapi: "3.1.0",
  info: {
    title: "MangaForEver API",
    version: "1.0.0",
    description:
      "REST API for MangaForEver — Discover. Track. Review. Explore.\n\n" +
      "Authentication uses an httpOnly session cookie (`mf_session`) set by `/auth/login` or `/auth/register`. " +
      "State-changing requests must send JSON and come from an allowed Origin. Errors share one shape: " +
      "`{ error: { code, message, details? } }`. Lists are paginated with `page` & `pageSize` and return " +
      "`{ items, page, pageSize, total, totalPages }`.\n\n" +
      "Community numbers (ratings, favorites, popularity) are computed from stored MangaForEver activity. " +
      "External numbers (`externalRating`, `externalPopularity`) come from the metadata provider and are labelled with their source.",
  },
  servers: [{ url: "/api/v1" }],
  tags: [
    { name: "Auth" }, { name: "Catalog" }, { name: "Discovery" }, { name: "Library" }, { name: "Favorites" },
    { name: "Reviews" }, { name: "History" }, { name: "Recommendations" }, { name: "Profiles" }, { name: "Moderation" }, { name: "Admin" },
  ],
  components: {
    securitySchemes: { session: { type: "apiKey", in: "cookie", name: "mf_session" } },
    responses: {
      E400: { description: "Bad request", content: json(ref("Error"), { error: { code: "BAD_REQUEST", message: "…" } }) },
      E401: { description: "Not signed in", content: json(ref("Error"), { error: { code: "UNAUTHORIZED", message: "Sign in to continue." } }) },
      E403: { description: "Not allowed", content: json(ref("Error"), { error: { code: "FORBIDDEN", message: "You don't have permission to do that." } }) },
      E404: { description: "Not found", content: json(ref("Error"), { error: { code: "NOT_FOUND", message: "Series not found." } }) },
      E409: { description: "Conflict / duplicate", content: json(ref("Error"), { error: { code: "CONFLICT", message: "This series is already in your library." } }) },
      E422: {
        description: "Validation error",
        content: json(ref("Error"), { error: { code: "VALIDATION_ERROR", message: "Some fields need attention.", details: [{ path: "password", message: "Use at least 8 characters" }] } }),
      },
      E429: { description: "Rate limited", content: json(ref("Error"), { error: { code: "RATE_LIMITED", message: "Too many requests." } }) },
      E503: { description: "External provider unavailable", content: json(ref("Error"), { error: { code: "SERVICE_UNAVAILABLE", message: "Couldn't reach AniList. The local catalog still works." } }) },
    },
    schemas: {
      Error: {
        type: "object",
        properties: { error: { type: "object", properties: { code: { type: "string" }, message: { type: "string" }, details: {} }, required: ["code", "message"] } },
      },
      Genre: { type: "object", properties: { name: { type: "string" }, slug: { type: "string" } } },
      SeriesCard: {
        type: "object",
        properties: {
          id: { type: "string" }, slug: { type: "string" }, title: { type: "string" }, altTitles: { type: "array", items: { type: "string" } },
          coverUrl: { type: ["string", "null"] }, type: { enum: ["MANGA", "MANHWA", "MANHUA"] },
          status: { enum: ["ONGOING", "COMPLETED", "HIATUS", "CANCELLED", "UPCOMING", "UNKNOWN"] },
          releaseYear: { type: ["integer", "null"] }, genres: { type: "array", items: ref("Genre") },
          ratingAvg: { type: ["number", "null"], description: "MangaForEver community average (1–10)" },
          ratingCount: { type: "integer" }, favoriteCount: { type: "integer" }, reviewCount: { type: "integer" }, libraryCount: { type: "integer" },
          popularityScore: { type: "number", description: "library×1 + favorites×2 + ratings×1.5 + reviews×2" },
          externalRating: { type: ["number", "null"], description: "Provider rating normalised to 0–10" },
          externalRatingSource: { type: ["string", "null"] }, externalPopularity: { type: ["integer", "null"] },
          chapterCount: { type: ["integer", "null"], description: "Null when unknown" },
          source: { enum: ["SEED_SAMPLE", "ANILIST", "MANUAL"] }, synopsis: { type: ["string", "null"] },
          metadataUpdatedAt: { type: "string", format: "date-time" }, createdAt: { type: "string", format: "date-time" },
        },
        example: seriesExample,
      },
      SeriesDetail: {
        allOf: [
          ref("SeriesCard"),
          {
            type: "object",
            properties: {
              description: { type: ["string", "null"] }, publisher: { type: ["string", "null"] }, demographic: { type: ["string", "null"] },
              volumeCount: { type: ["integer", "null"] }, tags: { type: "array", items: ref("Genre") },
              creators: { type: "array", items: { type: "object", properties: { name: { type: "string" }, slug: { type: "string" }, role: { enum: ["STORY", "ART", "STORY_AND_ART"] } } } },
              externalUrls: { type: "array", items: { type: "object", properties: { label: { type: "string" }, url: { type: "string" } } } },
              communityRank: { type: ["integer", "null"] },
              chapters: { type: "array", description: "Only provider-supplied chapter metadata; never fabricated", items: { type: "object" } },
              viewer: { type: "object", description: "Present when signed in", properties: { libraryEntry: { oneOf: [ref("LibraryEntry"), { type: "null" }] }, isFavorite: { type: "boolean" }, rating: { type: ["integer", "null"] }, reviewId: { type: ["string", "null"] } } },
            },
          },
        ],
      },
      Paginated: {
        type: "object",
        properties: { items: { type: "array", items: {} }, page: { type: "integer" }, pageSize: { type: "integer" }, total: { type: "integer" }, totalPages: { type: "integer" } },
      },
      User: {
        type: "object",
        properties: { id: { type: "string" }, username: { type: "string" }, email: { type: "string" }, displayName: { type: ["string", "null"] }, role: { enum: ["USER", "MODERATOR", "ADMIN"] }, preferences: { type: "object" } },
      },
      LibraryEntry: {
        type: "object",
        properties: {
          id: { type: "string" }, seriesId: { type: "string" }, status: { enum: ["READING", "PLAN_TO_READ", "COMPLETED", "ON_HOLD", "DROPPED"] },
          progressChapter: { type: "integer" }, progressVolume: { type: "integer" }, score: { type: ["integer", "null"] },
          notes: { type: ["string", "null"], description: "Private — only returned to the owner" }, isPrivate: { type: "boolean" },
          startedAt: { type: ["string", "null"], format: "date" }, completedAt: { type: ["string", "null"], format: "date" },
          series: ref("SeriesCard"),
        },
      },
      Review: {
        type: "object",
        properties: {
          id: { type: "string" }, title: { type: "string" }, body: { type: "string" }, containsSpoilers: { type: "boolean" },
          helpfulCount: { type: "integer" }, score: { type: ["integer", "null"] }, author: { type: "object" },
          viewerVotedHelpful: { type: "boolean" }, isOwn: { type: "boolean" }, createdAt: { type: "string", format: "date-time" },
        },
      },
      Ranking: {
        type: "object",
        properties: {
          kind: { type: "string" }, explanation: { type: "string" }, source: { enum: ["community", "external"] },
          includesDemoActivity: { type: "boolean", description: "True while seeded demo accounts contribute to community numbers" },
          items: { type: "array", items: { allOf: [ref("SeriesCard"), { type: "object", properties: { rank: { type: "integer" }, metric: { type: ["number", "null"] } } }] } },
        },
      },
      Shelf: {
        type: "object",
        properties: {
          key: { type: "string" }, title: { type: "string" }, explanation: { type: "string" },
          items: { type: "array", items: { type: "object", properties: { series: ref("SeriesCard"), score: { type: "number" }, reasons: { type: "array", items: { type: "string" } } } } },
        },
      },
    },
  },
  paths: {
    // ── Auth
    "/auth/register": {
      post: {
        tags: ["Auth"], summary: "Create an account and start a session",
        requestBody: body({ type: "object", required: ["email", "username", "password"], properties: { email: { type: "string" }, username: { type: "string" }, password: { type: "string" } } }, { email: "reader@example.com", username: "panel_reader", password: "s3cure-pass" }),
        responses: { 201: ok("Created; sets mf_session cookie", { type: "object", properties: { user: ref("User") } }), ...errors(409, 422, 429) },
      },
    },
    "/auth/login": {
      post: {
        tags: ["Auth"], summary: "Sign in with email or username",
        requestBody: body({ type: "object", properties: { identifier: { type: "string" }, password: { type: "string" } } }, { identifier: "reader@example.com", password: "s3cure-pass" }),
        responses: { 200: ok("Signed in; sets mf_session cookie", { type: "object", properties: { user: ref("User") } }), ...errors(401, 422, 429) },
      },
    },
    "/auth/logout": { post: { tags: ["Auth"], summary: "End the current session", responses: { 204: ok("Signed out") } } },
    "/auth/forgot-password": {
      post: { tags: ["Auth"], summary: "Email a reset link (always returns 200)", requestBody: body({ type: "object", properties: { email: { type: "string" } } }), responses: { 200: ok("Accepted"), ...errors(422, 429) } },
    },
    "/auth/reset-password": {
      post: { tags: ["Auth"], summary: "Set a new password with a reset token; signs out all sessions", requestBody: body({ type: "object", properties: { token: { type: "string" }, password: { type: "string" } } }), responses: { 200: ok("Password updated"), ...errors(400, 422) } },
    },
    "/auth/change-password": {
      post: { tags: ["Auth"], security: auth, summary: "Change password while signed in", requestBody: body({ type: "object", properties: { currentPassword: { type: "string" }, newPassword: { type: "string" } } }), responses: { 200: ok("Updated"), ...errors(400, 401, 422) } },
    },
    "/auth/me": { get: { tags: ["Auth"], security: auth, summary: "Current user and preferences", responses: { 200: ok("Current user", { type: "object", properties: { user: ref("User") } }), ...errors(401) } } },

    // ── Catalog
    "/manga": {
      get: {
        tags: ["Catalog"], summary: "Browse the catalog with filters, sorting and pagination",
        parameters: [
          q("q", { type: "string" }, "Text query (titles, alt titles, creators, genres, tags)"),
          q("type", { type: "string" }, "Comma list: MANGA,MANHWA,MANHUA"),
          q("genres", { type: "string" }, "Comma list of genre slugs"),
          q("genreMode", { enum: ["all", "any"] }),
          q("tags", { type: "string" }, "Comma list of tag slugs"),
          q("status", { type: "string" }, "Comma list of publication statuses"),
          q("demographic", { type: "string" }),
          q("yearFrom", { type: "integer" }), q("yearTo", { type: "integer" }),
          q("creator", { type: "string" }, "Author/artist name (partial) or slug"),
          q("minRating", { type: "number" }, "Minimum MangaForEver member rating"),
          q("minPopularity", { type: "number" }),
          q("updatedWithinDays", { type: "integer" }, "Catalog metadata changed within N days"),
          q("sort", { enum: ["relevance", "popularity", "rating", "reviews", "newest", "added", "updated", "title"] }),
          q("order", { enum: ["asc", "desc"] }),
          ...paging,
        ],
        responses: { 200: ok("Page of series", ref("Paginated"), { items: [seriesExample], page: 1, pageSize: 24, total: 1, totalPages: 1 }), ...errors(422, 429) },
      },
    },
    "/manga/search": {
      get: { tags: ["Catalog"], summary: "Same as /manga, and records the query in the signed-in user's search history (if enabled)", parameters: [q("q", { type: "string" }, "Query", true), ...paging], responses: { 200: ok("Page of series", ref("Paginated")), ...errors(422, 429) } },
    },
    "/manga/suggest": {
      get: { tags: ["Catalog"], summary: "Autocomplete suggestions", parameters: [q("q", { type: "string" }, "Partial query", true), q("limit", { type: "integer", maximum: 12 })], responses: { 200: ok("Suggestions", { type: "object", properties: { items: { type: "array", items: ref("SeriesCard") } } }) } },
    },
    "/manga/{id}": { get: { tags: ["Catalog"], summary: "Series details (adds `viewer` when signed in)", parameters: [p("id")], responses: { 200: ok("Series", ref("SeriesDetail")), ...errors(404) } } },
    "/manga/{id}/recommendations": { get: { tags: ["Catalog"], summary: "Related series by shared genres, tags and creators", parameters: [p("id")], responses: { 200: ok("Related") } } },
    "/manga/{id}/reviews": {
      get: { tags: ["Reviews"], summary: "Visible reviews for a series", parameters: [p("id"), q("sort", { enum: ["helpful", "newest", "rating"] }), ...paging], responses: { 200: ok("Reviews", ref("Paginated")) } },
      post: {
        tags: ["Reviews"], security: auth, summary: "Write a review (one per member per series)", parameters: [p("id")],
        requestBody: body({ type: "object", properties: { title: { type: "string" }, body: { type: "string" }, containsSpoilers: { type: "boolean" }, score: { type: "integer", minimum: 1, maximum: 10 } } }, { title: "Quietly brilliant", body: "A fantasy story about what happens after the adventure ends…", containsSpoilers: false, score: 9 }),
        responses: { 201: ok("Created", ref("Review")), ...errors(401, 404, 409, 422) },
      },
    },
    "/manga/{id}/rating": {
      put: { tags: ["Reviews"], security: auth, summary: "Rate 1–10 (creates or updates)", parameters: [p("id")], requestBody: body({ type: "object", properties: { score: { type: "integer" } } }, { score: 8 }), responses: { 200: ok("Rating saved; returns new community average", undefined), ...errors(401, 404, 422) } },
      delete: { tags: ["Reviews"], security: auth, summary: "Remove your rating", parameters: [p("id")], responses: { 200: ok("Removed"), ...errors(401, 404) } },
    },
    "/genres": { get: { tags: ["Catalog"], summary: "All genres with series counts", responses: { 200: ok("Genres") } } },
    "/tags": { get: { tags: ["Catalog"], summary: "Most-used tags", responses: { 200: ok("Tags") } } },
    "/meta": { get: { tags: ["Catalog"], summary: "Enabled metadata providers and ranking explanations", responses: { 200: ok("Meta") } } },

    // ── Discovery
    "/rankings": {
      get: {
        tags: ["Discovery"], summary: "Rankings with an explanation of how each is calculated",
        parameters: [q("kind", { enum: ["popular", "top-rated", "most-reviewed", "most-favorited", "trending", "external"] }), q("type", { enum: ["MANGA", "MANHWA", "MANHUA"] }), q("limit", { type: "integer", maximum: 100 })],
        responses: { 200: ok("Ranking", ref("Ranking")) },
      },
    },
    "/featured": { get: { tags: ["Discovery"], summary: "Editor's picks with reasons", responses: { 200: ok("Featured") } } },
    "/seasonal": {
      get: {
        tags: ["Discovery"], summary: "Editor-curated seasonal collections + series whose known start date is in the season",
        parameters: [q("season", { enum: ["WINTER", "SPRING", "SUMMER", "FALL"] }), q("year", { type: "integer" }), q("genre", { type: "string" })],
        responses: { 200: ok("Seasonal") },
      },
    },
    "/latest": { get: { tags: ["Discovery"], summary: "Recent catalog metadata updates, and provider-supplied chapter releases (if any)", parameters: [q("limit", { type: "integer" }), q("type", { type: "string" })], responses: { 200: ok("Latest") } } },
    "/new-releases": { get: { tags: ["Discovery"], summary: "Newest by original publication year (`by=published`) or newly added to MangaForEver (`by=added`)", parameters: [q("by", { enum: ["published", "added"] }), q("type", { type: "string" }), q("year", { type: "integer" }), q("limit", { type: "integer" })], responses: { 200: ok("Series") } } },
    "/reviews/recent": { get: { tags: ["Reviews"], summary: "Recent reviews feed", responses: { 200: ok("Reviews") } } },

    // ── Library
    "/library": {
      get: { tags: ["Library"], security: auth, summary: "Your library", parameters: [q("status", { type: "string" }), q("type", { type: "string" }), q("q", { type: "string" }), q("sort", { enum: ["updated", "title", "score", "progress", "added"] }), ...paging], responses: { 200: ok("Entries", ref("Paginated")), ...errors(401) } },
      post: {
        tags: ["Library"], security: auth, summary: "Add a series",
        requestBody: body(ref("LibraryEntry"), { seriesId: "cm2x8w1q0000abc", status: "READING", progressChapter: 12, score: 9 }),
        responses: { 201: ok("Created", ref("LibraryEntry")), ...errors(401, 404, 409, 422) },
      },
    },
    "/library/{id}": {
      patch: { tags: ["Library"], security: auth, summary: "Update status, progress, score, notes or dates (owner only)", parameters: [p("id", "Library entry ID")], requestBody: body(ref("LibraryEntry"), { progressChapter: 40, status: "READING" }), responses: { 200: ok("Updated", ref("LibraryEntry")), ...errors(401, 404, 422) } },
      delete: { tags: ["Library"], security: auth, summary: "Remove from library (owner only)", parameters: [p("id", "Library entry ID")], responses: { 204: ok("Removed"), ...errors(401, 404) } },
    },
    "/library/stats": { get: { tags: ["Library"], security: auth, summary: "Dashboard: counts per status, chapters tracked, genre distribution, recent activity", responses: { 200: ok("Stats"), ...errors(401) } } },
    "/library/continue": { get: { tags: ["Library"], security: auth, summary: "Continue reading: most recently updated in-progress entries", responses: { 200: ok("Entries"), ...errors(401) } } },

    // ── Favorites
    "/favorites": {
      get: { tags: ["Favorites"], security: auth, summary: "Your favorites", parameters: [q("type", { type: "string" }), q("genre", { type: "string" }), q("sort", { enum: ["recent", "title", "rating", "popularity"] }), ...paging], responses: { 200: ok("Favorites", ref("Paginated")), ...errors(401) } },
      post: { tags: ["Favorites"], security: auth, summary: "Favorite a series", requestBody: body({ type: "object", properties: { seriesId: { type: "string" } } }), responses: { 201: ok("Created"), ...errors(401, 404, 409) } },
    },
    "/favorites/{mangaId}": { delete: { tags: ["Favorites"], security: auth, summary: "Unfavorite", parameters: [p("mangaId", "Series ID")], responses: { 204: ok("Removed"), ...errors(401, 404) } } },

    // ── Reviews by id
    "/reviews/{id}": {
      patch: { tags: ["Reviews"], security: auth, summary: "Edit your review (author only)", parameters: [p("id", "Review ID")], requestBody: body(ref("Review")), responses: { 200: ok("Updated", ref("Review")), ...errors(401, 403, 404, 422) } },
      delete: { tags: ["Reviews"], security: auth, summary: "Delete your review (author, moderator or admin)", parameters: [p("id", "Review ID")], responses: { 204: ok("Deleted"), ...errors(401, 403, 404) } },
    },
    "/reviews/{id}/helpful": { post: { tags: ["Reviews"], security: auth, summary: "Toggle your helpful vote (not on your own review)", parameters: [p("id", "Review ID")], responses: { 200: ok("Vote state", { type: "object", properties: { voted: { type: "boolean" }, helpfulCount: { type: "integer" } } }), ...errors(400, 401, 404) } } },
    "/reviews/{id}/report": { post: { tags: ["Reviews"], security: auth, summary: "Report a review", parameters: [p("id", "Review ID")], requestBody: body({ type: "object", properties: { reason: { enum: ["SPAM", "HARASSMENT", "UNMARKED_SPOILERS", "OFF_TOPIC", "OTHER"] }, details: { type: "string" } } }), responses: { 201: ok("Reported"), ...errors(400, 401, 404, 409) } } },

    // ── History
    "/history": {
      get: { tags: ["History"], security: auth, summary: "Your browsing history (series you opened)", parameters: paging, responses: { 200: ok("History", ref("Paginated")), ...errors(401) } },
      delete: { tags: ["History"], security: auth, summary: "Clear history", parameters: [q("scope", { enum: ["browsing", "activity", "all"] })], responses: { 200: ok("Cleared"), ...errors(401) } },
    },
    "/history/{id}": { delete: { tags: ["History"], security: auth, summary: "Remove one history entry (owner only)", parameters: [p("id", "History entry ID")], responses: { 204: ok("Removed"), ...errors(401, 404) } } },
    "/history/views": { post: { tags: ["History"], security: auth, summary: "Record a series view (no-op when browsing history is off)", requestBody: body({ type: "object", properties: { seriesId: { type: "string" } } }), responses: { 200: ok("Recorded flag"), ...errors(401, 404) } } },
    "/history/recent": { get: { tags: ["History"], security: auth, summary: "Recently viewed series", responses: { 200: ok("Recent") } } },
    "/search-history": {
      get: { tags: ["History"], security: auth, summary: "Recent searches", responses: { 200: ok("Searches") } },
      delete: { tags: ["History"], security: auth, summary: "Clear search history", responses: { 204: ok("Cleared") } },
    },
    "/search-history/{id}": { delete: { tags: ["History"], security: auth, summary: "Remove one search", parameters: [p("id", "Search ID")], responses: { 204: ok("Removed") } } },

    // ── Recommendations
    "/recommendations": { get: { tags: ["Recommendations"], summary: "Personalised shelves (fallback shelves when signed out or new)", parameters: [q("refresh", { type: "string" }, "Any value reshuffles near-ties")], responses: { 200: ok("Shelves", { type: "object", properties: { personalised: { type: "boolean" }, shelves: { type: "array", items: ref("Shelf") } } }) } } },
    "/recommendations/dismiss": { post: { tags: ["Recommendations"], security: auth, summary: "Hide a series from recommendations", requestBody: body({ type: "object", properties: { seriesId: { type: "string" } } }), responses: { 204: ok("Dismissed") } } },
    "/recommendations/dismissed": { delete: { tags: ["Recommendations"], security: auth, summary: "Restore all dismissed recommendations", responses: { 200: ok("Restored count") } } },

    // ── Profiles
    "/users/me": { patch: { tags: ["Profiles"], security: auth, summary: "Update profile and privacy preferences", requestBody: body({ type: "object" }, { displayName: "Mika", bio: "Seinen first.", preferences: { libraryVisibility: "PRIVATE", trackBrowsingHistory: false } }), responses: { 200: ok("Updated user"), ...errors(401, 422) } } },
    "/users/{username}": { get: { tags: ["Profiles"], summary: "Public profile (respects privacy settings)", parameters: [p("username", "Username")], responses: { 200: ok("Profile"), ...errors(404) } } },
    "/users/{username}/library": { get: { tags: ["Profiles"], summary: "Public library (empty with private=true when hidden)", parameters: [p("username", "Username"), ...paging], responses: { 200: ok("Library") } } },
    "/users/{username}/follow": {
      post: { tags: ["Profiles"], security: auth, summary: "Follow", parameters: [p("username", "Username")], responses: { 200: ok("Following") } },
      delete: { tags: ["Profiles"], security: auth, summary: "Unfollow", parameters: [p("username", "Username")], responses: { 200: ok("Not following") } },
    },
    "/feed": { get: { tags: ["Profiles"], security: auth, summary: "Activity from people you follow", responses: { 200: ok("Feed") } } },

    // ── Moderation
    "/admin/reports": { get: { tags: ["Moderation"], security: auth, summary: "Review reports (moderator+)", parameters: [q("status", { enum: ["OPEN", "RESOLVED", "DISMISSED"] }), ...paging], responses: { 200: ok("Reports"), ...errors(401, 403) } } },
    "/admin/reports/{id}/resolve": { post: { tags: ["Moderation"], security: auth, summary: "Resolve: HIDE_REVIEW, RESTORE_REVIEW or DISMISS", parameters: [p("id", "Report ID")], requestBody: body({ type: "object", properties: { action: { enum: ["HIDE_REVIEW", "RESTORE_REVIEW", "DISMISS"] }, note: { type: "string" } } }), responses: { 204: ok("Resolved"), ...errors(401, 403, 404) } } },
    "/admin/reviews/{id}/visibility": { patch: { tags: ["Moderation"], security: auth, summary: "Hide or restore a review", parameters: [p("id", "Review ID")], requestBody: body({ type: "object", properties: { hidden: { type: "boolean" }, reason: { type: "string" } } }), responses: { 204: ok("Updated"), ...errors(401, 403) } } },

    // ── Admin
    "/admin/statistics": { get: { tags: ["Admin"], security: auth, summary: "Dashboard statistics from stored data (admin)", responses: { 200: ok("Stats"), ...errors(401, 403) } } },
    "/admin/manga": {
      get: { tags: ["Admin"], security: auth, summary: "Catalog management list", parameters: [q("q", { type: "string" }), q("archived", { enum: ["true", "false"] }), ...paging], responses: { 200: ok("Series") } },
      post: { tags: ["Admin"], security: auth, summary: "Create a series", requestBody: body({ type: "object" }, { title: "New Series", type: "MANHWA", status: "ONGOING", genres: ["Fantasy"], authors: ["Someone"] }), responses: { 201: ok("Created"), ...errors(401, 403, 422) } },
    },
    "/admin/manga/{id}": {
      patch: { tags: ["Admin"], security: auth, summary: "Edit or (un)archive a series", parameters: [p("id", "Series ID")], requestBody: body({ type: "object" }), responses: { 200: ok("Updated"), ...errors(401, 403, 404) } },
      delete: { tags: ["Admin"], security: auth, summary: "Archive (default) or hard-delete with ?hard=true", parameters: [p("id", "Series ID"), q("hard", { enum: ["true", "false"] })], responses: { 204: ok("Archived/deleted"), ...errors(401, 403, 404) } },
    },
    "/admin/manga/{id}/refresh": { post: { tags: ["Admin"], security: auth, summary: "Re-sync metadata from the external provider", parameters: [p("id", "Series ID")], responses: { 200: ok("Refreshed"), ...errors(400, 503) } } },
    "/admin/manga/duplicates": { get: { tags: ["Admin"], security: auth, summary: "Likely duplicate titles (trigram similarity)", responses: { 200: ok("Pairs") } } },
    "/admin/manga/merge": { post: { tags: ["Admin"], security: auth, summary: "Merge a duplicate into another entry", requestBody: body({ type: "object", properties: { keepId: { type: "string" }, mergeId: { type: "string" } } }), responses: { 200: ok("Merged") } } },
    "/admin/import/search": { get: { tags: ["Admin"], security: auth, summary: "Preview provider search results", parameters: [q("q", { type: "string" }, "Query", true)], responses: { 200: ok("Preview"), ...errors(503) } } },
    "/admin/import": { post: { tags: ["Admin"], security: auth, summary: "Import/refresh from provider by externalId, search, or popular", requestBody: body({ type: "object", properties: { provider: { enum: ["anilist"] }, externalId: { type: "string" }, search: { type: "string" }, limit: { type: "integer" } } }, { provider: "anilist", search: "Vagabond", limit: 5 }), responses: { 200: ok("Import result"), ...errors(400, 503) } } },
    "/admin/featured": {
      get: { tags: ["Admin"], security: auth, summary: "Editor's picks", responses: { 200: ok("Featured") } },
      put: { tags: ["Admin"], security: auth, summary: "Feature a series (upsert)", requestBody: body({ type: "object", properties: { seriesId: { type: "string" }, reason: { type: "string" }, position: { type: "integer" }, isActive: { type: "boolean" } } }), responses: { 200: ok("Saved") } },
    },
    "/admin/featured/{seriesId}": { delete: { tags: ["Admin"], security: auth, summary: "Unfeature", parameters: [p("seriesId", "Series ID")], responses: { 204: ok("Removed") } } },
    "/admin/collections": {
      get: { tags: ["Admin"], security: auth, summary: "Curated seasonal collections", responses: { 200: ok("Collections") } },
      post: { tags: ["Admin"], security: auth, summary: "Create collection", requestBody: body({ type: "object" }), responses: { 201: ok("Created") } },
    },
    "/admin/collections/{id}": {
      put: { tags: ["Admin"], security: auth, summary: "Replace collection", parameters: [p("id", "Collection ID")], requestBody: body({ type: "object" }), responses: { 200: ok("Saved") } },
      delete: { tags: ["Admin"], security: auth, summary: "Delete collection", parameters: [p("id", "Collection ID")], responses: { 204: ok("Deleted") } },
    },
    "/admin/users": { get: { tags: ["Admin"], security: auth, summary: "Users", parameters: [q("q", { type: "string" }), ...paging], responses: { 200: ok("Users") } } },
    "/admin/users/{id}": { patch: { tags: ["Admin"], security: auth, summary: "Change role or suspend", parameters: [p("id", "User ID")], requestBody: body({ type: "object", properties: { role: { enum: ["USER", "MODERATOR", "ADMIN"] }, isSuspended: { type: "boolean" } } }), responses: { 200: ok("Updated") } } },
    "/admin/audit-log": { get: { tags: ["Admin"], security: auth, summary: "Audit log of administrative changes", parameters: paging, responses: { 200: ok("Audit entries") } } },
  },
};
