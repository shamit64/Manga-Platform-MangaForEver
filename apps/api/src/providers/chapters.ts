import { env } from "../config/env.js";
import { logger } from "../lib/logger.js";
import { ProviderError } from "./types.js";

/** One chapter release as reported by a chapter source. Never contains page images. */
export interface ProviderChapter {
  number: number;
  title: string | null;
  releasedAt: Date;
  language: string | null;
  /** Official publisher page for the chapter (MANGA Plus, Webtoon...), when the source lists one. */
  externalUrl: string | null;
  publisher: string | null;
}

/**
 * A source of chapter release metadata. Implementations record that a chapter exists, when it came
 * out and where it can be read legally. They must never return scan-site links or page images.
 */
export interface ChapterProvider {
  readonly name: string;
  readonly attribution: { label: string; url: string };
  /** Find the source's record for an AniList series. Only exact AniList-ID matches are accepted. */
  matchAniList(anilistId: string, titles: string[]): Promise<string | null>;
  /** Chapters published since `since` (or the most recent ones when null), newest first. */
  chaptersSince(externalId: string, since: Date | null): Promise<ProviderChapter[]>;
}

const PUBLISHERS: [RegExp, string][] = [
  [/mangaplus\.shueisha/i, "MANGA Plus"],
  [/webtoons?\.com/i, "WEBTOON"],
  [/tapas\.io/i, "Tapas"],
  [/tappytoon/i, "Tappytoon"],
  [/manta\.net/i, "Manta"],
  [/bilibilicomics|bilibili\.com/i, "Bilibili Comics"],
  [/viz\.com/i, "VIZ"],
  [/kmanga\.kodansha|kodansha\.us/i, "Kodansha"],
  [/azuki\.co/i, "Azuki"],
  [/comikey/i, "Comikey"],
  [/inkr\.com/i, "INKR"],
  [/mangamo/i, "Mangamo"],
  [/lezhin/i, "Lezhin"],
  [/pocketcomics/i, "Pocket Comics"],
];

export function publisherFor(url: string | null): string | null {
  if (!url) return null;
  return PUBLISHERS.find(([re]) => re.test(url))?.[1] ?? new URL(url).hostname.replace(/^www\./, "");
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * MangaDex public API (https://api.mangadex.org/docs). Only chapter *metadata* is used: number,
 * title, language, publish time and the official externalUrl. MangaDex-hosted page images are
 * never requested or shown. Requests are spaced to stay well under the ~5 requests/second limit.
 */
export class MangaDexProvider implements ChapterProvider {
  readonly name = "mangadex";
  readonly attribution = { label: "MangaDex", url: "https://mangadex.org" };
  private last = 0;

  constructor(
    private baseUrl: string,
    private languages: string[],
  ) {}

  private async get<T>(path: string, params: [string, string][]): Promise<T> {
    const url = new URL(path, this.baseUrl);
    for (const [k, v] of params) url.searchParams.append(k, v);
    for (let attempt = 0; attempt < 3; attempt++) {
      const wait = this.last + 250 - Date.now();
      if (wait > 0) await sleep(wait);
      this.last = Date.now();
      let res: Response;
      try {
        res = await fetch(url, { headers: { "User-Agent": "MangaForEver/1.0 (+chapter metadata sync)" }, signal: AbortSignal.timeout(10_000) });
      } catch (err) {
        if (attempt === 2) throw new ProviderError(this.name, `MangaDex is unreachable (${(err as Error).message}).`);
        continue;
      }
      if (res.status === 429 || res.status >= 500) {
        const retryAt = Number(res.headers.get("x-ratelimit-retry-after"));
        await sleep(retryAt ? Math.min(30_000, retryAt * 1000 - Date.now()) : 2000 * (attempt + 1));
        continue;
      }
      if (res.status === 404) throw new ProviderError(this.name, "MangaDex record not found.", false);
      if (!res.ok) throw new ProviderError(this.name, `MangaDex answered ${res.status}.`, false);
      return (await res.json()) as T;
    }
    throw new ProviderError(this.name, "MangaDex kept refusing requests.");
  }

  async matchAniList(anilistId: string, titles: string[]) {
    for (const title of titles.slice(0, 3)) {
      const body = await this.get<{ data: { id: string; attributes: { links: Record<string, string> | null } }[] }>("/manga", [
        ["title", title],
        ["limit", "10"],
        ["contentRating[]", "safe"],
        ["contentRating[]", "suggestive"],
        ["contentRating[]", "erotica"],
      ]);
      const hit = body.data.find((m) => m.attributes.links?.al === anilistId);
      if (hit) return hit.id;
    }
    return null;
  }

  async chaptersSince(externalId: string, since: Date | null) {
    const params: [string, string][] = [
      ["limit", since ? "100" : "40"],
      ["order[publishAt]", "desc"],
      ["includeFutureUpdates", "0"],
      ["contentRating[]", "safe"],
      ["contentRating[]", "suggestive"],
      ["contentRating[]", "erotica"],
      ...this.languages.map((l): [string, string] => ["translatedLanguage[]", l]),
    ];
    if (since) params.push(["publishAtSince", since.toISOString().slice(0, 19)]);
    const body = await this.get<{
      data: { attributes: { chapter: string | null; title: string | null; translatedLanguage: string; publishAt: string; externalUrl: string | null } }[];
    }>(`/manga/${encodeURIComponent(externalId)}/feed`, params);
    const out: ProviderChapter[] = [];
    for (const { attributes: a } of body.data) {
      const number = a.chapter === null ? NaN : Number.parseFloat(a.chapter);
      if (!Number.isFinite(number) || number < 0) continue; // oneshots without a number
      out.push({
        number,
        title: a.title?.trim() || null,
        releasedAt: new Date(a.publishAt),
        language: a.translatedLanguage,
        externalUrl: a.externalUrl,
        publisher: publisherFor(a.externalUrl),
      });
    }
    return out;
  }
}

let chapterProvider: ChapterProvider | null | undefined;

export function getChapterProvider(): ChapterProvider | null {
  if (chapterProvider === undefined) {
    chapterProvider = env.CHAPTER_PROVIDER === "mangadex" ? new MangaDexProvider(env.MANGADEX_API_URL, env.chapterLanguages) : null;
    if (chapterProvider) logger.debug("Chapter provider: MangaDex");
  }
  return chapterProvider;
}

/** Test hook: swap in a fake chapter source. */
export function setChapterProvider(p: ChapterProvider | null) {
  chapterProvider = p;
}
