#!/usr/bin/env node
/**
 * Link the sample catalog to AniList: for every series without an AniList id, find its AniList entry
 * (title + country of origin, verified by title match) and store the provider's cover/banner URLs,
 * AniList score and popularity, and a link back to AniList.
 *
 *   npm run db:link-anilist          (also run automatically by scripts/local.mjs on first start)
 *
 * Images are NOT downloaded — the app displays them from AniList's own CDN, with attribution,
 * as the AniList API intends. Community data (ratings, reviews…) is never touched.
 * Respects AniList's rate limit (~90 req/min) and is safe to re-run.
 */
import fs from "node:fs";
import pg from "pg";

try {
  process.loadEnvFile(new URL("../.env", import.meta.url));
} catch {
  /* env may come from the shell */
}
const ENDPOINT = process.env.ANILIST_API_URL ?? "https://graphql.anilist.co";
const COUNTRY = { MANGA: "JP", MANHWA: "KR", MANHUA: "CN" };
/** Hand-verified AniList ids for the sample catalog (same work, not spin-offs or novels). */
const KNOWN_IDS = JSON.parse(fs.readFileSync(new URL("../prisma/seed-data/anilist-ids.json", import.meta.url), "utf8"));
const BY_ID_QUERY = `query ($ids: [Int]) {
  Page(perPage: 50) {
    media(id_in: $ids, type: MANGA) {
      id siteUrl coverImage { extraLarge large } bannerImage averageScore popularity rankings { rank type allTime }
    }
  }
}`;
const QUERY = `query ($search: String, $country: CountryCode) {
  Page(perPage: 6) {
    media(search: $search, type: MANGA, format: MANGA, countryOfOrigin: $country, isAdult: false, sort: [SEARCH_MATCH, POPULARITY_DESC]) {
      id siteUrl startDate { year } title { romaji english native } synonyms
      coverImage { extraLarge large color } bannerImage averageScore popularity
      rankings { rank type allTime }
    }
  }
}`;

const norm = (s) =>
  String(s ?? "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[:!?.,'’"“”\-–—~・·×&]/g, " ")
    .replace(/\bthe\b|\ba\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();

function matches(media, series) {
  // Same work, not a spin-off or adaptation: start year must agree when both are known.
  const y = media.startDate?.year;
  if (y && series.releaseYear && Math.abs(y - series.releaseYear) > 2) return false;
  const ours = [series.title, ...(series.altTitles ?? [])].map(norm).filter(Boolean);
  const theirs = [media.title.english, media.title.romaji, media.title.native, ...(media.synonyms ?? [])].map(norm).filter(Boolean);
  return ours.some((o) => theirs.some((t) => t === o || (o.length > 5 && (t.startsWith(o) || o.startsWith(t)))));
}

async function gql(variables, attempt = 0, query = QUERY) {
  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ query, variables }),
    signal: AbortSignal.timeout(10_000),
  });
  if (res.status === 429 && attempt < 3) {
    const wait = Number(res.headers.get("retry-after") ?? 60);
    console.log(`  rate limited — waiting ${wait}s`);
    await new Promise((r) => setTimeout(r, wait * 1000));
    return gql(variables, attempt + 1, query);
  }
  if (!res.ok) throw new Error(`AniList responded ${res.status}`);
  const body = await res.json();
  if (body.errors?.length) throw new Error(body.errors[0].message);
  return body.data.Page.media;
}

export async function linkAniList({ connectionString = process.env.DATABASE_URL, log = console.log } = {}) {
  const db = new pg.Client({ connectionString });
  await db.connect();
  const { rows } = await db.query(
    `SELECT id, title, "altTitles", type, "releaseYear" FROM "MangaSeries" WHERE "externalId" IS NULL AND "isArchived" = false ORDER BY "popularityScore" DESC`,
  );
  let linked = 0;
  const missed = [];

  async function save(seriesId, m) {
    const rank = m.rankings?.find((r) => r.type === "POPULAR" && r.allTime)?.rank ?? null;
    await db.query(
      `UPDATE "MangaSeries" SET "coverUrl"=$2, "bannerUrl"=$3, "externalProvider"='anilist', "externalId"=$4,
         "externalRating"=$5, "externalRatingSource"=$6, "externalPopularity"=$7, "externalPopularityRank"=$8,
         "externalUrls"=$9::jsonb, "lastSyncedAt"=now()
       WHERE id=$1 AND NOT EXISTS (SELECT 1 FROM "MangaSeries" WHERE "externalProvider"='anilist' AND "externalId"=$4)`,
      [
        seriesId,
        m.coverImage?.extraLarge ?? m.coverImage?.large ?? null,
        m.bannerImage ?? null,
        String(m.id),
        m.averageScore != null ? m.averageScore / 10 : null,
        m.averageScore != null ? "AniList average score" : null,
        m.popularity ?? null,
        rank,
        JSON.stringify([{ label: "AniList", url: m.siteUrl }]),
      ],
    );
    linked++;
  }

  // 1. Known sample titles: fetch by verified id, 50 per request.
  const known = rows.filter((s) => KNOWN_IDS[s.title]);
  for (let i = 0; i < known.length; i += 50) {
    const batch = known.slice(i, i + 50);
    const media = await gql({ ids: batch.map((s) => KNOWN_IDS[s.title]) }, 0, BY_ID_QUERY);
    const byId = new Map(media.map((m) => [m.id, m]));
    for (const s of batch) {
      const m = byId.get(KNOWN_IDS[s.title]);
      if (m) await save(s.id, m);
      else missed.push(s.title);
    }
    log(`  ✓ linked ${batch.length} sample titles by AniList id`);
    await new Promise((r) => setTimeout(r, 750));
  }

  // 2. Anything else (e.g. titles added by editors): search by title + country, verified by title and year.
  for (const s of rows.filter((x) => !KNOWN_IDS[x.title])) {
    let media = [];
    const searches = [s.title, ...(s.altTitles ?? []).filter((t) => /[^\x00-\x7F]/.test(t))];
    for (const search of searches) {
      try {
        media = (await gql({ search, country: COUNTRY[s.type] })).filter((m) => matches(m, s));
      } catch (e) {
        log(`  ${s.title}: ${e.message}`);
      }
      await new Promise((r) => setTimeout(r, 750));
      if (media.length) break;
    }
    if (!media[0]) {
      missed.push(s.title);
      continue;
    }
    await save(s.id, media[0]);
    log(`  ✓ ${s.title} → AniList #${media[0].id}`);
  }
  await db.end();
  return { linked, missed, total: rows.length };
}

if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith("link-anilist.mjs")) {
  console.log("Linking the catalog to AniList (cover art, scores, popularity)…");
  linkAniList()
    .then((r) => {
      console.log(`Linked ${r.linked} of ${r.total}.${r.missed.length ? ` Not found: ${r.missed.join(", ")}` : ""}`);
    })
    .catch((e) => {
      console.error("AniList linking failed:", e.message);
      process.exit(1);
    });
}
