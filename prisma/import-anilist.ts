/**
 * Import a real catalog from the AniList database: the most popular manga (Japan), manhwa (Korea)
 * and manhua (China), with titles, synopses, genres, tags, creators, dates, chapter counts, AniList
 * scores and popularity, and cover/banner image links (shown from AniList's CDN with attribution).
 *
 *   npm run db:import-anilist                       # 200 manga, 120 manhwa, 100 manhua
 *   npm run db:import-anilist -- --manga 500 --manhwa 200 --manhua 150
 *
 * Existing rows (sample titles already linked to AniList, earlier imports) are kept as they are.
 * Re-run any time to add more; use Admin → Catalog → Re-sync to refresh a single title.
 * Respects AniList's rate limit (about 90 requests/minute).
 */
import "dotenv/config";

const args = process.argv.slice(2);
function count(flag: string, fallback: number) {
  const i = args.indexOf(`--${flag}`);
  const n = i >= 0 ? Number(args[i + 1]) : fallback;
  return Number.isFinite(n) && n >= 0 ? Math.min(n, 2000) : fallback;
}

const PLAN = [
  { contentType: "MANGA" as const, label: "manga", count: count("manga", 200) },
  { contentType: "MANHWA" as const, label: "manhwa", count: count("manhwa", 120) },
  { contentType: "MANHUA" as const, label: "manhua", count: count("manhua", 100) },
];

process.env.METADATA_PROVIDER ??= "anilist";
const PER_PAGE = 50;

async function main() {
const { importSeries } = await import("../apps/api/src/providers/import.service.js");
const { prisma } = await import("../apps/api/src/lib/prisma.js");
let added = 0;
let kept = 0;
try {
  for (const step of PLAN) {
    if (!step.count) continue;
    let done = 0;
    for (let page = 1; done < step.count; page++) {
      const limit = Math.min(PER_PAGE, step.count - done);
      // AniList pages are fixed-size, so always request full pages and trim.
      const r = await importSeries(null, { provider: "anilist", contentType: step.contentType, page, limit: PER_PAGE, skipExisting: true });
      const slice = r.items.slice(0, limit);
      done += slice.length;
      added += slice.filter((i) => i.created).length;
      kept += slice.filter((i) => "skipped" in i).length;
      console.log(`  ${step.label}: ${done}/${step.count}`);
      if (r.items.length === 0 || page >= 40) break; // no more results
      // AniList allows 90 requests/minute normally (30 when degraded) — stay well under either.
      await new Promise((res) => setTimeout(res, 2200));
    }
  }
  console.log(`Imported ${added} new series from AniList (${kept} already in the catalog).`);
} catch (e) {
  console.error(`AniList import stopped: ${(e as Error).message}`);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
}

main();
