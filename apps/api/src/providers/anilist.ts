import { logger } from "../lib/logger.js";
import { ProviderError, type MetadataProvider, type ProviderSearchResult, type ProviderSeries } from "./types.js";

/**
 * AniList GraphQL provider (https://docs.anilist.co).
 * AniList's API is free for non-commercial use; it asks for attribution and allows ~90 requests/minute.
 * We respect 429 Retry-After headers, time out slow calls, retry transient failures and cache responses.
 */

const MEDIA_FIELDS = `
  id siteUrl isAdult format status countryOfOrigin chapters volumes
  title { romaji english native } synonyms
  description(asHtml: false)
  startDate { year month day } endDate { year month day }
  coverImage { extraLarge large } bannerImage
  genres averageScore popularity
  tags { name rank isMediaSpoiler isAdult category }
  staff(perPage: 8, sort: RELEVANCE) { edges { role node { name { full } } } }
  rankings { rank type allTime context }
  externalLinks { url site type language isDisabled }
`;

const SEARCH_QUERY = `query ($search: String, $page: Int, $perPage: Int) {
  Page(page: $page, perPage: $perPage) {
    pageInfo { hasNextPage }
    media(search: $search, type: MANGA, isAdult: false, sort: [SEARCH_MATCH, POPULARITY_DESC]) { ${MEDIA_FIELDS} }
  }
}`;

const POPULAR_QUERY = `query ($page: Int, $perPage: Int) {
  Page(page: $page, perPage: $perPage) {
    pageInfo { hasNextPage }
    media(type: MANGA, sort: [POPULARITY_DESC]) { ${MEDIA_FIELDS} }
  }
}`;

const POPULAR_BY_COUNTRY_QUERY = `query ($page: Int, $perPage: Int, $country: CountryCode) {
  Page(page: $page, perPage: $perPage) {
    pageInfo { hasNextPage }
    media(type: MANGA, format_in: [MANGA], isAdult: false, countryOfOrigin: $country, sort: [POPULARITY_DESC]) { ${MEDIA_FIELDS} }
  }
}`;

/**
 * AniList answers country-filtered queries for the (very large) Japanese catalogue with an empty page,
 * so Japanese titles are taken from the overall popularity list and filtered here instead.
 */
const FILTER_LOCALLY = new Set(["JP"]);

const BY_ID_QUERY = `query ($id: Int) { Media(id: $id, type: MANGA) { ${MEDIA_FIELDS} } }`;

interface FuzzyDate { year: number | null; month: number | null; day: number | null }
export interface AniListMedia {
  id: number;
  siteUrl: string;
  isAdult: boolean;
  format: string | null;
  status: string | null;
  countryOfOrigin: string | null;
  chapters: number | null;
  volumes: number | null;
  title: { romaji: string | null; english: string | null; native: string | null };
  synonyms: string[] | null;
  description: string | null;
  startDate: FuzzyDate | null;
  endDate: FuzzyDate | null;
  coverImage: { extraLarge: string | null; large: string | null } | null;
  bannerImage: string | null;
  genres: string[] | null;
  averageScore: number | null;
  popularity: number | null;
  tags: { name: string; rank: number; isMediaSpoiler: boolean; isAdult: boolean; category: string }[] | null;
  staff: { edges: { role: string; node: { name: { full: string } } }[] } | null;
  rankings: { rank: number; type: string; allTime: boolean; context: string }[] | null;
  /** Official reading sites are listed with type "STREAMING" (e.g. MANGA Plus, WEBTOON, Tapas). */
  externalLinks?: { url: string; site: string; type: string | null; language: string | null; isDisabled: boolean | null }[] | null;
}

const STATUS: Record<string, ProviderSeries["status"]> = {
  FINISHED: "COMPLETED",
  RELEASING: "ONGOING",
  NOT_YET_RELEASED: "UPCOMING",
  CANCELLED: "CANCELLED",
  HIATUS: "HIATUS",
};

const COUNTRY: Record<string, { type: ProviderSeries["type"]; name: string }> = {
  JP: { type: "MANGA", name: "Japan" },
  KR: { type: "MANHWA", name: "South Korea" },
  CN: { type: "MANHUA", name: "China" },
  TW: { type: "MANHUA", name: "Taiwan" },
  HK: { type: "MANHUA", name: "Hong Kong" },
};

function fuzzyToDate(d: FuzzyDate | null): Date | null {
  if (!d?.year) return null;
  // Only build a full date when month is known; day defaults to the 1st.
  if (!d.month) return null;
  return new Date(Date.UTC(d.year, d.month - 1, d.day ?? 1));
}

export function stripHtml(s: string | null) {
  if (!s) return null;
  return s
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&quot;/g, '"')
    .replace(/&#039;|&apos;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

const DEMOGRAPHICS: Record<string, ProviderSeries["demographic"]> = {
  Shounen: "SHOUNEN",
  Shoujo: "SHOUJO",
  Seinen: "SEINEN",
  Josei: "JOSEI",
  Kids: "KODOMO",
};

function demographicFromTags(tags: AniListMedia["tags"]): ProviderSeries["demographic"] {
  const t = (tags ?? []).filter((x) => x.category === "Demographic" && DEMOGRAPHICS[x.name]).sort((a, b) => b.rank - a.rank)[0];
  return t ? DEMOGRAPHICS[t.name] : null;
}

export function mapAniList(m: AniListMedia): ProviderSeries {
  const country = COUNTRY[m.countryOfOrigin ?? ""] ?? { type: "MANGA" as const, name: m.countryOfOrigin ?? null };
  const title = m.title.english || m.title.romaji || m.title.native || `AniList #${m.id}`;
  const alt = [m.title.romaji, m.title.native, ...(m.synonyms ?? [])].filter((t): t is string => !!t && t !== title);
  const description = stripHtml(m.description);
  const authors: string[] = [];
  const artists: string[] = [];
  for (const e of m.staff?.edges ?? []) {
    const role = e.role.toLowerCase();
    if (role.includes("story")) authors.push(e.node.name.full);
    if (role.includes("art")) artists.push(e.node.name.full);
  }
  const popularRank = m.rankings?.find((r) => r.type === "POPULAR" && r.allTime)?.rank ?? null;
  return {
    title,
    altTitles: [...new Set(alt)].slice(0, 15),
    localizedTitles: Object.fromEntries(
      Object.entries({ en: m.title.english, romaji: m.title.romaji, native: m.title.native }).filter(([, v]) => !!v),
    ) as Record<string, string>,
    coverUrl: m.coverImage?.extraLarge ?? m.coverImage?.large ?? null,
    bannerUrl: m.bannerImage,
    synopsis: description ? description.split(/\n\n/)[0].slice(0, 600) : null,
    description,
    type: country.type,
    countryOfOrigin: country.name,
    // AniList doesn't expose the serialising magazine, so publisher is left untouched (undefined).
    demographic: demographicFromTags(m.tags),
    status: STATUS[m.status ?? ""] ?? "UNKNOWN",
    releaseYear: m.startDate?.year ?? null,
    startDate: fuzzyToDate(m.startDate),
    endDate: fuzzyToDate(m.endDate),
    chapterCount: m.chapters,
    volumeCount: m.volumes,
    isAdult: m.isAdult,
    externalRating: m.averageScore !== null ? Math.round(m.averageScore) / 10 : null,
    externalRatingSource: m.averageScore !== null ? "AniList average score" : null,
    externalPopularity: m.popularity,
    externalPopularityRank: popularRank,
    externalUrls: [
      { label: "AniList", url: m.siteUrl },
      ...(m.externalLinks ?? [])
        .filter((l) => l.type === "STREAMING" && !l.isDisabled && /^https:\/\//.test(l.url) && (!l.language || l.language === "English"))
        .slice(0, 6)
        .map((l) => ({ label: l.site, url: l.url })),
    ],
    source: "ANILIST",
    externalProvider: "anilist",
    externalId: String(m.id),
    lastSyncedAt: new Date(),
    genres: m.genres ?? [],
    tags: (m.tags ?? [])
      .filter((t) => !t.isMediaSpoiler && !t.isAdult && t.rank >= 60 && t.category !== "Demographic")
      .slice(0, 12)
      .map((t) => t.name),
    authors: [...new Set(authors)],
    artists: [...new Set(artists)],
  };
}

type Fetch = typeof fetch;

export class AniListProvider implements MetadataProvider {
  readonly name = "anilist";
  readonly attribution = { label: "AniList", url: "https://anilist.co" };
  private cache = new Map<string, { at: number; value: unknown }>();
  private blockedUntil = 0;

  constructor(
    private endpoint = "https://graphql.anilist.co",
    private fetchImpl: Fetch = fetch,
    private opts = { timeoutMs: 8000, retries: 2, cacheTtlMs: 10 * 60_000 },
  ) {}

  private async gql<T>(query: string, variables: Record<string, unknown>): Promise<T> {
    const key = JSON.stringify([query.length, variables]);
    const hit = this.cache.get(key);
    if (hit && Date.now() - hit.at < this.opts.cacheTtlMs) return hit.value as T;
    if (Date.now() < this.blockedUntil) {
      throw new ProviderError(this.name, "AniList rate limit reached. Try again in a minute.");
    }

    let lastErr: unknown;
    for (let attempt = 0; attempt <= this.opts.retries; attempt++) {
      try {
        const res = await this.fetchImpl(this.endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json", Accept: "application/json" },
          body: JSON.stringify({ query, variables }),
          signal: AbortSignal.timeout(this.opts.timeoutMs),
        });
        if (res.status === 429) {
          const retryAfter = Number(res.headers.get("retry-after") ?? 60);
          this.blockedUntil = Date.now() + retryAfter * 1000;
          throw new ProviderError(this.name, "AniList rate limit reached. Try again in a minute.", false);
        }
        if (res.status >= 500) throw new ProviderError(this.name, `AniList returned ${res.status}`);
        const body = (await res.json()) as { data?: T; errors?: { message: string; status?: number }[] };
        if (body.errors?.length) {
          const notFound = body.errors.some((e) => e.status === 404);
          if (notFound) return null as T;
          throw new ProviderError(this.name, body.errors[0].message, false);
        }
        this.cache.set(key, { at: Date.now(), value: body.data });
        if (this.cache.size > 200) this.cache.delete(this.cache.keys().next().value!);
        return body.data as T;
      } catch (err) {
        lastErr = err;
        const retryable = !(err instanceof ProviderError) || err.retryable;
        if (!retryable || attempt === this.opts.retries) break;
        await new Promise((r) => setTimeout(r, 400 * 2 ** attempt));
      }
    }
    logger.warn({ err: lastErr }, "AniList request failed");
    if (lastErr instanceof ProviderError) throw lastErr;
    const timeout = (lastErr as Error)?.name === "TimeoutError";
    throw new ProviderError(this.name, timeout ? "AniList took too long to respond." : "Couldn't reach AniList.");
  }

  async search(query: string, page = 1, perPage = 10): Promise<ProviderSearchResult> {
    const data = await this.gql<{ Page: { pageInfo: { hasNextPage: boolean }; media: AniListMedia[] } }>(SEARCH_QUERY, {
      search: query,
      page,
      perPage,
    });
    return { items: data.Page.media.filter((m) => !m.isAdult).map(mapAniList), hasNextPage: data.Page.pageInfo.hasNextPage };
  }

  async popular(page = 1, perPage = 25, country?: string): Promise<ProviderSearchResult> {
    type PageData = { Page: { pageInfo: { hasNextPage: boolean }; media: AniListMedia[] } };
    if (country && !FILTER_LOCALLY.has(country)) {
      const data = await this.gql<PageData>(POPULAR_BY_COUNTRY_QUERY, { page, perPage, country });
      return { items: data.Page.media.filter((m) => !m.isAdult).map(mapAniList), hasNextPage: data.Page.pageInfo.hasNextPage };
    }
    const data = await this.gql<PageData>(POPULAR_QUERY, { page, perPage });
    const media = data.Page.media.filter(
      (m) => !m.isAdult && (!country || (m.countryOfOrigin === country && (m.format === "MANGA" || m.format === null))),
    );
    return { items: media.map(mapAniList), hasNextPage: data.Page.pageInfo.hasNextPage };
  }

  async getById(externalId: string): Promise<ProviderSeries | null> {
    const data = await this.gql<{ Media: AniListMedia | null } | null>(BY_ID_QUERY, { id: Number(externalId) });
    if (!data?.Media || data.Media.isAdult) return null;
    return mapAniList(data.Media);
  }
}
