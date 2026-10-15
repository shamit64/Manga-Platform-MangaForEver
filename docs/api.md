# MangaForEver REST API (v1)

Base URL: `http://localhost:4000/api/v1` (through the web app: `http://localhost:3000/api/v1`).
Interactive docs: `http://localhost:4000/docs` · OpenAPI JSON: `/openapi.json`.

**Conventions**

- Auth: httpOnly `mf_session` cookie set by `/auth/register` or `/auth/login`. 🔒 = sign-in required, 🛡 = moderator+, 👑 = admin.
- Writes must send `Content-Type: application/json` and, from browsers, an allowed `Origin`.
- Errors: `{ "error": { "code": "VALIDATION_ERROR", "message": "Some fields need attention.", "details": [{ "path": "password", "message": "Use at least 8 characters" }] } }`
- Status codes: `200/201/204` success · `400` bad request · `401` not signed in · `403` not allowed · `404` not found (also used for other users' private records) · `409` duplicate · `415` non-JSON body · `422` validation · `429` rate limited · `503` external provider unavailable.
- Pagination: `?page=1&pageSize=24` (max 60) → `{ items, page, pageSize, total, totalPages }`.

## Auth

| Method | Path | Body | Notes |
| --- | --- | --- | --- |
| POST | `/auth/register` | `{ email, username, password }` | 201, sets cookie |
| POST | `/auth/login` | `{ identifier, password }` | identifier = email or username |
| POST | `/auth/logout` | – | 204, deletes the session |
| POST | `/auth/forgot-password` | `{ email }` | always 200 |
| POST | `/auth/reset-password` | `{ token, password }` | single use, signs out everywhere |
| POST | `/auth/change-password` 🔒 | `{ currentPassword, newPassword }` | signs out other sessions |
| GET | `/auth/me` 🔒 | – | user + preferences |

```http
POST /api/v1/auth/login
Content-Type: application/json

{ "identifier": "reader@mangaforever.local", "password": "DemoReader-1" }
```

```json
{
  "user": {
    "id": "cmv8…", "username": "demo_reader", "email": "reader@mangaforever.local", "displayName": "Demo Reader",
    "role": "USER", "isDemo": true, "avatarUrl": null, "bio": "…", "createdAt": "2026-10-14T17:12:00.000Z",
    "preferences": { "theme": "dark", "favoriteGenres": ["fantasy", "adventure"], "libraryVisibility": "PUBLIC",
      "favoritesVisibility": "PUBLIC", "showStats": true, "showRecentlyCompleted": true,
      "trackBrowsingHistory": true, "trackSearchHistory": true }
  }
}
```

## Catalog & discovery

| Method | Path | Query | Notes |
| --- | --- | --- | --- |
| GET | `/manga` | `q, type, genres, genreMode=all\|any, tags, status, demographic, yearFrom, yearTo, creator, minRating, minPopularity, updatedWithinDays, sort, order, page, pageSize` | list values are comma-separated |
| GET | `/manga/search` | same as `/manga` | also records the signed-in user's search history (if enabled) |
| GET | `/manga/suggest` | `q, limit≤12` | autocomplete |
| GET | `/manga/:idOrSlug` | – | detail; adds `viewer` (library entry, favorite, rating, review id) when signed in |
| GET | `/manga/:id/recommendations` | `limit` | related series with reasons |
| GET | `/genres`, `/tags` | – | with series counts |
| GET | `/rankings` | `kind=popular\|top-rated\|trending\|most-reviewed\|most-favorited\|external, type, limit` | includes `explanation`, `source`, `includesDemoActivity` |
| GET | `/featured` | – | editor's picks with `reason` |
| GET | `/seasonal` | `season, year, genre` | curated `collections` + `publishedThisSeason` (provider dates only) |
| GET | `/latest` | `limit, type` | `catalogUpdates` + `chapterReleases` (empty unless a provider supplies them) |
| GET | `/new-releases` | `by=published\|added, type, year, limit` | publication year vs. catalog-added date |
| GET | `/reviews/recent` | `limit` | recent reviews feed |
| GET | `/meta` | – | enabled providers + ranking explanations |

`sort` values: `relevance` (default with `q`), `popularity` (default), `rating`, `reviews`, `newest`, `added`, `updated`, `title`.

```http
GET /api/v1/manga?q=fantasy&type=MANHWA&status=ONGOING&sort=rating&pageSize=2
```

```json
{
  "items": [
    {
      "id": "cmv8…", "slug": "tower-of-god", "title": "Tower of God", "altTitles": ["신의 탑", "Sin-ui Tap"],
      "coverUrl": null, "type": "MANHWA", "status": "ONGOING", "releaseYear": 2010,
      "genres": [{ "name": "Action", "slug": "action" }, { "name": "Fantasy", "slug": "fantasy" }],
      "ratingAvg": 8.25, "ratingCount": 4, "favoriteCount": 1, "reviewCount": 0, "libraryCount": 6,
      "popularityScore": 14, "externalRating": null, "externalRatingSource": null, "externalPopularity": null,
      "chapterCount": null, "source": "SEED_SAMPLE", "synopsis": "Bam enters a mysterious tower…",
      "metadataUpdatedAt": "2026-10-14T17:12:00.000Z", "createdAt": "2026-10-14T17:12:00.000Z"
    }
  ],
  "page": 1, "pageSize": 2, "total": 3, "totalPages": 2
}
```

```http
GET /api/v1/rankings?kind=top-rated&limit=3
```

```json
{
  "kind": "top-rated",
  "explanation": "Bayesian average of MangaForEver member ratings (1–10). Series need at least 3 ratings; small samples are pulled toward the site-wide mean.",
  "source": "community",
  "includesDemoActivity": true,
  "items": [{ "rank": 1, "metric": 8.93, "title": "Vinland Saga", "…": "…" }]
}
```

## Library 🔒

| Method | Path | Body / query |
| --- | --- | --- |
| GET | `/library` | `status, type, q, sort=updated\|added\|title\|score\|progress, page, pageSize` |
| GET | `/library/stats` | – (status counts, totals, chapters tracked, genre distribution, recent activity) |
| GET | `/library/continue` | – (in-progress entries, most recent first) |
| POST | `/library` | `{ seriesId, status?, progressChapter?, progressVolume?, score?, notes?, isPrivate?, startedAt?, completedAt? }` |
| PATCH | `/library/:id` | any of the above except `seriesId` |
| DELETE | `/library/:id` | – |

Rules: one entry per user and series (409); progress above a **known** chapter/volume total is rejected (422) while unknown totals never block; `COMPLETED` fills progress with the known total and sets `completedAt`; `score` is the user's rating for the series.

```http
POST /api/v1/library
Content-Type: application/json

{ "seriesId": "cmv8…", "status": "READING", "progressChapter": 12, "score": 9 }
```

```json
{
  "id": "cmv9…", "seriesId": "cmv8…", "status": "READING", "progressChapter": 12, "progressVolume": 0,
  "score": 9, "notes": null, "isPrivate": false, "startedAt": "2026-10-14", "completedAt": null,
  "createdAt": "2026-10-14T18:01:00.000Z", "updatedAt": "2026-10-14T18:01:00.000Z"
}
```

## Favorites 🔒

| Method | Path | Notes |
| --- | --- | --- |
| GET | `/favorites` | `type, genre, sort=recent\|title\|rating\|popularity` |
| POST | `/favorites` | `{ seriesId }` — 409 if already favorited |
| DELETE | `/favorites/:mangaId` | 404 if not a favorite |

## Ratings & reviews

| Method | Path | Body | Notes |
| --- | --- | --- | --- |
| PUT | `/manga/:id/rating` 🔒 | `{ score: 1–10 }` | create or update; returns new community average |
| DELETE | `/manga/:id/rating` 🔒 | – | |
| GET | `/manga/:id/reviews` | `sort=helpful\|newest\|rating` | visible reviews |
| POST | `/manga/:id/reviews` 🔒 | `{ title, body, containsSpoilers, score? }` | one per member (409) |
| PATCH | `/reviews/:id` 🔒 | same fields | author only (403 otherwise) |
| DELETE | `/reviews/:id` 🔒 | – | author, moderator or admin |
| POST | `/reviews/:id/helpful` 🔒 | – | toggles; `{ voted, helpfulCount }`; no self-votes |
| POST | `/reviews/:id/report` 🔒 | `{ reason: SPAM\|HARASSMENT\|UNMARKED_SPOILERS\|OFF_TOPIC\|OTHER, details? }` | one report per member per review |

## History & recommendations

| Method | Path | Notes |
| --- | --- | --- |
| GET | `/history` 🔒 | browsing history (paginated) |
| GET | `/history/recent` 🔒 | recently viewed |
| POST | `/history/views` 🔒 | `{ seriesId }` → `{ recorded: false }` when tracking is off |
| DELETE | `/history/:id` 🔒 | one entry (owner only) |
| DELETE | `/history?scope=browsing\|activity\|all` 🔒 | clear |
| GET / DELETE | `/search-history`, `/search-history/:id` 🔒 | recent searches |
| GET | `/recommendations` | `refresh?` — personalised shelves, or fallback when signed out/new |
| POST | `/recommendations/dismiss` 🔒 | `{ seriesId }` |
| DELETE | `/recommendations/dismissed` 🔒 | restore all |

```json
{
  "personalised": true,
  "shelves": [
    {
      "key": "for-you", "title": "Recommended for you",
      "explanation": "Scored from your genres, tags, content types and creators, weighted by your ratings and reading status.",
      "items": [{ "series": { "title": "Tower of God", "…": "…" }, "score": 4.71, "reasons": ["Because you like Fantasy", "You read a lot of manhwa"] }]
    }
  ]
}
```

## Profiles & community

| Method | Path | Notes |
| --- | --- | --- |
| GET | `/users/:username` | public profile (privacy-aware) |
| GET | `/users/:username/library` | `{ private: true, items: [] }` when hidden; never includes notes or private entries |
| PATCH | `/users/me` 🔒 | `{ displayName?, bio?, avatarUrl?, preferences? }` |
| POST / DELETE | `/users/:username/follow` 🔒 | follow / unfollow |
| GET | `/feed` 🔒 | activity from followed members with public libraries |

## Moderation 🛡

| Method | Path | Body |
| --- | --- | --- |
| GET | `/admin/reports` | `status=OPEN\|RESOLVED\|DISMISSED` |
| POST | `/admin/reports/:id/resolve` | `{ action: HIDE_REVIEW\|RESTORE_REVIEW\|DISMISS, note? }` |
| PATCH | `/admin/reviews/:id/visibility` | `{ hidden, reason? }` |

## Administration 👑

| Method | Path | Notes |
| --- | --- | --- |
| GET | `/admin/statistics` | live counts from stored rows |
| GET / POST | `/admin/manga` | list (q, archived) / create |
| PATCH / DELETE | `/admin/manga/:id` | edit (incl. `isArchived`) / archive (`?hard=true` to delete) |
| POST | `/admin/manga/:id/refresh` | re-sync from provider |
| GET | `/admin/manga/duplicates` | trigram-similar title pairs |
| POST | `/admin/manga/merge` | `{ keepId, mergeId }` |
| GET | `/admin/import/search?q=` | AniList preview |
| POST | `/admin/import` | `{ provider: "anilist", externalId? \| search? , limit }` (neither = most popular) |
| GET / PUT / DELETE | `/admin/featured`, `/admin/featured/:seriesId` | editor's picks |
| GET / POST / PUT / DELETE | `/admin/collections`, `/admin/collections/:id` | curated seasonal collections |
| GET / PATCH | `/admin/users`, `/admin/users/:id` | `{ role?, isSuspended? }` |
| GET | `/admin/audit-log` | paginated |

```http
POST /api/v1/admin/import
Content-Type: application/json

{ "provider": "anilist", "search": "Vagabond", "limit": 5 }
```

```json
{ "imported": 1, "refreshed": 0, "items": [{ "id": "cmva…", "slug": "vagabond-2", "title": "Vagabond", "created": true }] }
```

When AniList is unreachable:

```json
{ "error": { "code": "SERVICE_UNAVAILABLE", "message": "Couldn't reach AniList. The local catalog still works." } }
```

## Health

`GET /health` → `{ "status": "ok", "database": "up" }` (503 with `"database": "down"` if Postgres is unreachable).
