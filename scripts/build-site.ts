/**
 * Build the MangaForEver website edition: one self-contained HTML page (React from a CDN, catalog
 * embedded as JSON) that can be published anywhere static, e.g. on any static host.
 *
 *   npm run site:build              # reads the catalog from DATABASE_URL → site/dist/mangaforever.html
 *   npm run site:build -- --offline # skip refreshing curated entries' facts from AniList
 *
 * What goes into the page, and what deliberately doesn't:
 *  - Facts only: titles (English, romaji, original script), type, status, dates, chapter/volume
 *    counts, genres, tags, creators, AniList score and popularity, and a link to the AniList page.
 *  - Summaries only where MangaForEver wrote its own (the curated sample entries). AniList's
 *    description text is not copied into the page; each series links to AniList instead.
 *  - No cover images: the page can't hotlink AniList's CDN and we don't re-host publishers' art,
 *    so it draws generated covers from each series' genres (the same palette as the app).
 */
import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import pg from "pg";

const ROOT = path.resolve(import.meta.dirname, "..");
const OFFLINE = process.argv.includes("--offline");

async function main() {
  process.env.METADATA_PROVIDER ??= "anilist";
  const { mapAniList } = await import("../apps/api/src/providers/anilist.js");
  const db = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await db.connect();
  const q = async <T = Record<string, any>>(sql: string) => (await db.query(sql)).rows as T[];

  const rows = await q(`
    select s.id, s.slug, s.title, s."altTitles", s."localizedTitles", s.synopsis, s.type, s.status, s."releaseYear",
      s."startDate", s."endDate", s."chapterCount", s."volumeCount", s.demographic, s."externalRating", s."externalPopularity",
      s."externalPopularityRank", s."externalId", s.source,
      coalesce((select array_agg(g.name order by g.name) from "SeriesGenre" sg join "Genre" g on g.id = sg."genreId" where sg."seriesId" = s.id), '{}') genres,
      coalesce((select array_agg(t.name) from "SeriesTag" st join "Tag" t on t.id = st."tagId" where st."seriesId" = s.id), '{}') tags,
      coalesce((select json_agg(json_build_object('n', c.name, 'r', sc.role)) from "SeriesCreator" sc join "Creator" c on c.id = sc."creatorId" where sc."seriesId" = s.id), '[]') creators
    from "MangaSeries" s where not s."isArchived" and not s."isAdult"`);

  // Curated entries were typed in by hand before they were linked to AniList; refresh their facts.
  const fresh = new Map<string, ReturnType<typeof mapAniList>>();
  const curatedIds = rows.filter((r) => r.source !== "ANILIST" && r.externalId).map((r) => Number(r.externalId));
  if (!OFFLINE && curatedIds.length) {
    const MEDIA = `id siteUrl isAdult format status countryOfOrigin chapters volumes title { romaji english native } synonyms
      description(asHtml: false) startDate { year month day } endDate { year month day } coverImage { extraLarge large } bannerImage
      genres averageScore popularity tags { name rank isMediaSpoiler isAdult category }
      staff(perPage: 8, sort: RELEVANCE) { edges { role node { name { full } } } } rankings { rank type allTime context }`;
    for (let i = 0; i < curatedIds.length; i += 50) {
      const res = await fetch(process.env.ANILIST_API_URL ?? "https://graphql.anilist.co", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ query: `query ($ids:[Int]) { Page(perPage:50) { media(id_in:$ids, type: MANGA) { ${MEDIA} } } }`, variables: { ids: curatedIds.slice(i, i + 50) } }),
        signal: AbortSignal.timeout(15_000),
      });
      const body = await res.json();
      if (!res.ok || body.errors) throw new Error(`AniList: ${JSON.stringify(body.errors ?? res.status)}`);
      for (const m of body.data.Page.media) fresh.set(String(m.id), mapAniList(m));
      await new Promise((r) => setTimeout(r, 2500));
    }
  }

  const featured = await q(`select "seriesId", reason from "FeaturedSeries" where "isActive" order by position`);
  const seasonal = await q(`select c.title, c.description, c.season, c.year,
    (select json_agg(json_build_object('id', i."seriesId", 'note', i.note) order by i.position) from "SeasonalCollectionItem" i where i."collectionId" = c.id) items
    from "SeasonalCollection" c where c."isPublished" order by c.year desc, c.season`);
  await db.end();

  const cjk = /[぀-ヿ㐀-鿿가-힯]/;
  const iso = (d: unknown) => (d ? new Date(d as string).toISOString().slice(0, 10) : null);
  const drop = (o: Record<string, unknown>) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== null && v !== undefined && v !== false && v !== ""));
  const series = rows.map((r) => {
    const f = r.externalId ? fresh.get(r.externalId) : undefined;
    const facts: any = f ?? {
      altTitles: r.altTitles, localizedTitles: r.localizedTitles, status: r.status, releaseYear: r.releaseYear, startDate: r.startDate,
      endDate: r.endDate, chapterCount: r.chapterCount, volumeCount: r.volumeCount, demographic: r.demographic,
      externalRating: r.externalRating, externalPopularity: r.externalPopularity, externalPopularityRank: r.externalPopularityRank,
      genres: r.genres, tags: r.tags,
      authors: r.creators.filter((c: any) => c.r !== "ARTIST").map((c: any) => c.n),
      artists: r.creators.filter((c: any) => c.r !== "AUTHOR").map((c: any) => c.n),
    };
    const alts: string[] = facts.altTitles ?? [];
    const native = facts.localizedTitles?.native ?? alts.find((a) => cjk.test(a)) ?? null;
    const romaji = facts.localizedTitles?.romaji ?? alts.find((a) => !cjk.test(a) && a !== r.title) ?? null;
    return {
      ...drop({
        id: r.slug, title: r.title, native, romaji: romaji && romaji !== r.title ? romaji : null,
        type: r.type, status: facts.status, year: facts.releaseYear ?? r.releaseYear, start: iso(facts.startDate), end: iso(facts.endDate),
        ch: facts.chapterCount, vol: facts.volumeCount, demo: facts.demographic ?? r.demographic,
        score: facts.externalRating != null ? Number(facts.externalRating) : null, pop: facts.externalPopularity, popRank: facts.externalPopularityRank,
        al: r.externalId ? Number(r.externalId) : null,
        summary: r.source !== "ANILIST" ? r.synopsis : null, // MangaForEver's own text only
        curated: r.source !== "ANILIST",
      }),
      genres: facts.genres?.length ? facts.genres : r.genres,
      tags: (facts.tags ?? []).slice(0, 6),
      authors: facts.authors ?? [],
      artists: facts.artists ?? [],
    };
  });
  const slugById = new Map(rows.map((r) => [r.id, r.slug]));
  const data = {
    syncedAt: new Date().toISOString().slice(0, 10),
    series,
    featured: featured.map((f) => ({ id: slugById.get(f.seriesId), reason: f.reason })).filter((f) => f.id),
    seasonal: seasonal.map((c) => ({ ...c, items: (c.items ?? []).map((i: any) => ({ id: slugById.get(i.id), note: i.note })).filter((i: any) => i.id) })),
  };

  const src = (f: string) => fs.readFileSync(path.join(ROOT, "site/src", f), "utf8");
  const js = ["core.js", "ui.js", "pages.js", "pages2.js", "app.js"].map(src).join("\n");
  const json = JSON.stringify(data).replace(/<\//g, "<\\/");
  const html = `${src("head.html")}
<div id="root"><div class="boot">Loading MangaForEver…</div></div>
<script type="application/json" id="catalog">${json}</script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/react/18.3.1/umd/react.production.min.js"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/react-dom/18.3.1/umd/react-dom.production.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/htm@3.1.1/dist/htm.umd.js"></script>
<script>
${js}
</script>
`;
  const outDir = path.join(ROOT, "site/dist");
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, "mangaforever.html"), html);
  // A standalone copy with its own document skeleton, for opening straight from disk.
  fs.writeFileSync(
    path.join(outDir, "index.html"),
    `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"></head><body>${html}</body></html>`,
  );
  console.log(`Built site/dist/mangaforever.html: ${series.length} series, ${(Buffer.byteLength(html) / 1024).toFixed(0)} KB${OFFLINE ? " (offline)" : ""}.`);
}

main().catch((e) => {
  console.error(`Site build failed: ${(e as Error).message}`);
  process.exitCode = 1;
});
