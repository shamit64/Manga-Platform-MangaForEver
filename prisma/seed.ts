/**
 * MangaForEver seed script.
 *
 *   npm run db:seed
 *
 * Creates:
 *   • the SAMPLE catalog (source = SEED_SAMPLE) from prisma/seed-data/catalog.ts
 *   • an admin and a moderator account (credentials from env, see .env.example)
 *   • a demo reader account you can sign in with
 *   • a handful of demo community members (isDemo = true) whose library adds, ratings,
 *     favorites and reviews give the rankings something to rank. All community numbers in a
 *     freshly seeded database therefore come from these demo accounts, and the UI says so.
 *   • editor's picks and editor-curated seasonal collections
 *
 * The script is idempotent for the catalog (matched by title) and resets demo activity each run.
 */
import "dotenv/config";
import bcrypt from "bcryptjs";
import { createPrismaClient } from "../apps/api/src/lib/prisma.js";
import { writeSeries } from "../apps/api/src/services/catalog-writer.js";
import { recomputeSeriesStats } from "../apps/api/src/services/stats.service.js";
import { COLLECTIONS, FEATURED, SEED_CATALOG, SEED_GENRES } from "./seed-data/catalog.js";
import { DEMO_REVIEWS } from "./seed-data/reviews.js";

const prisma = createPrismaClient(process.env.DATABASE_URL!);

const COUNTRY: Record<string, string> = { MANGA: "Japan", MANHWA: "South Korea", MANHUA: "China" };

// Small deterministic PRNG so every seed produces the same demo community.
function mulberry32(a: number) {
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const DEMO_MEMBERS: { username: string; displayName: string; bio: string; likes: string[]; types: string[] }[] = [
  { username: "inkandpanels", displayName: "Mika", bio: "Seinen first, questions later.", likes: ["Psychological", "Drama", "Thriller"], types: ["MANGA"] },
  { username: "webtoonweekly", displayName: "Joon", bio: "Scrolling vertically since 2012.", likes: ["Action", "Fantasy", "Adventure"], types: ["MANHWA"] },
  { username: "cultivation_cat", displayName: "Lin", bio: "If there's a sect, I'm reading it.", likes: ["Fantasy", "Action", "Historical"], types: ["MANHUA", "MANHWA"] },
  { username: "shoujo_sunday", displayName: "Aiko", bio: "Romance, found family, crying on trains.", likes: ["Romance", "Slice of Life", "Comedy"], types: ["MANGA"] },
  { username: "courtside", displayName: "Theo", bio: "Sports manga apologist.", likes: ["Sports", "Comedy", "Drama"], types: ["MANGA", "MANHWA"] },
  { username: "night_reader", displayName: "Rosa", bio: "Horror at 2am is a lifestyle.", likes: ["Horror", "Supernatural", "Mystery"], types: ["MANGA", "MANHWA"] },
  { username: "battle_shounen", displayName: "Kai", bio: "Power systems are my love language.", likes: ["Action", "Adventure", "Supernatural"], types: ["MANGA"] },
  { username: "quiet_pages", displayName: "Noor", bio: "Slow stories, good art.", likes: ["Slice of Life", "Fantasy", "Drama"], types: ["MANGA", "MANHUA"] },
  { username: "strategist", displayName: "Wei", bio: "Three Kingdoms everything.", likes: ["Historical", "Drama", "Action"], types: ["MANHUA", "MANGA"] },
  { username: "romcom_radar", displayName: "Hana", bio: "Will-they-won't-they enjoyer.", likes: ["Romance", "Comedy"], types: ["MANGA", "MANHWA"] },
  { username: "panel_by_panel", displayName: "Sam", bio: "I read the classics so you don't have to.", likes: ["Sci-Fi", "Mystery", "Action"], types: ["MANGA"] },
  { username: "manhwa_mood", displayName: "Yuna", bio: "Regression, revenge, remarriage.", likes: ["Romance", "Fantasy", "Drama"], types: ["MANHWA"] },
];

async function main() {
  console.log("Seeding MangaForEver sample data…");

  // ── Genres (fixed list so filters always show them)
  for (const name of SEED_GENRES) {
    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-");
    await prisma.genre.upsert({ where: { slug }, update: {}, create: { name, slug } });
  }

  // ── Catalog
  const idByTitle = new Map<string, string>();
  let created = 0;
  for (const s of SEED_CATALOG) {
    const existing = await prisma.mangaSeries.findFirst({ where: { title: s.title, source: "SEED_SAMPLE" }, select: { id: true } });
    const input = {
      title: s.title,
      altTitles: [...(s.native ? [s.native] : []), ...(s.alt ?? [])],
      localizedTitles: s.native ? { native: s.native, en: s.title } : { en: s.title },
      synopsis: s.synopsis,
      description: null,
      type: s.type,
      countryOfOrigin: COUNTRY[s.type],
      publisher: s.publisher,
      demographic: s.demographic,
      status: s.status,
      releaseYear: s.year,
      startDate: null,
      endDate: null,
      chapterCount: s.chapters ?? null,
      volumeCount: s.volumes ?? null,
      source: "SEED_SAMPLE" as const,
      genres: s.genres,
      tags: s.tags,
      authors: s.authors,
      artists: s.artists ?? s.authors,
    };
    const row = await writeSeries(input, { id: existing?.id, db: prisma });
    if (!existing) created++;
    idByTitle.set(s.title, row.id);
  }
  console.log(`  catalog: ${SEED_CATALOG.length} sample series (${created} new)`);

  // ── Staff + demo accounts
  const adminEmail = (process.env.SEED_ADMIN_EMAIL ?? "admin@mangaforever.local").toLowerCase();
  const adminPassword = process.env.SEED_ADMIN_PASSWORD ?? "ChangeMe-Admin-1";
  const modEmail = (process.env.SEED_MODERATOR_EMAIL ?? "moderator@mangaforever.local").toLowerCase();
  const modPassword = process.env.SEED_MODERATOR_PASSWORD ?? "ChangeMe-Mod-1";
  const demoPassword = process.env.SEED_DEMO_PASSWORD ?? "DemoReader-1";

  const admin = await prisma.user.upsert({
    where: { email: adminEmail },
    update: { role: "ADMIN" },
    create: { email: adminEmail, username: "mf_admin", displayName: "MangaForEver Admin", role: "ADMIN", passwordHash: await bcrypt.hash(adminPassword, 12), emailVerifiedAt: new Date(), preference: { create: {} } },
  });
  await prisma.user.upsert({
    where: { email: modEmail },
    update: { role: "MODERATOR" },
    create: { email: modEmail, username: "mf_moderator", displayName: "MangaForEver Moderator", role: "MODERATOR", passwordHash: await bcrypt.hash(modPassword, 12), emailVerifiedAt: new Date(), preference: { create: {} } },
  });
  await prisma.user.upsert({
    where: { email: "reader@mangaforever.local" },
    update: {},
    create: {
      email: "reader@mangaforever.local", username: "demo_reader", displayName: "Demo Reader", isDemo: true,
      bio: "A demo account for trying MangaForEver. Everything here can be edited or deleted.",
      passwordHash: await bcrypt.hash(demoPassword, 12),
      emailVerifiedAt: new Date(),
      preference: { create: { favoriteGenres: ["fantasy", "adventure"] } },
    },
  });

  // ── Demo community: reset and regenerate deterministic activity
  const demoHash = await bcrypt.hash(randomPassword(), 10); // demo members cannot be signed into
  const catalog = await prisma.mangaSeries.findMany({
    where: { source: "SEED_SAMPLE" },
    include: { genres: { include: { genre: true } } },
  });
  const memberIds: string[] = [];
  for (const [i, m] of DEMO_MEMBERS.entries()) {
    const user = await prisma.user.upsert({
      where: { username: m.username },
      update: {},
      create: {
        email: `${m.username}@demo.mangaforever.local`, username: m.username, displayName: m.displayName, bio: m.bio,
        isDemo: true, passwordHash: demoHash, emailVerifiedAt: new Date(),
        preference: { create: { favoriteGenres: m.likes.map((g) => g.toLowerCase().replace(/[^a-z0-9]+/g, "-")) } },
      },
    });
    memberIds.push(user.id);
    await prisma.$transaction([
      prisma.libraryEntry.deleteMany({ where: { userId: user.id } }),
      prisma.favorite.deleteMany({ where: { userId: user.id } }),
      prisma.rating.deleteMany({ where: { userId: user.id } }),
      prisma.review.deleteMany({ where: { userId: user.id } }),
      prisma.readingActivity.deleteMany({ where: { userId: user.id } }),
    ]);

    const rand = mulberry32(1000 + i * 97);
    const scored = catalog
      .map((s) => {
        const overlap = s.genres.filter((g) => m.likes.includes(g.genre.name)).length;
        const typeBoost = m.types.includes(s.type) ? 1.2 : 0;
        return { s, affinity: overlap + typeBoost + rand() * 1.5 };
      })
      .sort((a, b) => b.affinity - a.affinity)
      .slice(0, 14 + Math.floor(rand() * 8));

    for (const [rank, { s, affinity }] of scored.entries()) {
      const r = rand();
      const status = s.status === "COMPLETED" && r < 0.45 ? "COMPLETED" : r < 0.6 ? "READING" : r < 0.8 ? "PLAN_TO_READ" : r < 0.9 ? "ON_HOLD" : "DROPPED";
      const progress =
        status === "COMPLETED" ? s.chapterCount ?? 0
        : status === "PLAN_TO_READ" ? 0
        : s.chapterCount ? Math.max(1, Math.floor(s.chapterCount * (0.1 + rand() * 0.8)))
        : 5 + Math.floor(rand() * 80);
      const daysAgo = Math.floor(rand() * 120);
      const when = new Date(Date.now() - daysAgo * 86_400_000);
      await prisma.libraryEntry.create({
        data: {
          userId: user.id, seriesId: s.id, status, progressChapter: progress,
          startedAt: status === "PLAN_TO_READ" ? null : new Date(when.getTime() - 30 * 86_400_000),
          completedAt: status === "COMPLETED" ? when : null,
          createdAt: when, updatedAt: when,
        },
      });
      await prisma.readingActivity.create({ data: { userId: user.id, seriesId: s.id, type: "ADDED_TO_LIBRARY", data: { status }, createdAt: when } });
      if (status !== "PLAN_TO_READ") {
        const score = Math.max(4, Math.min(10, Math.round(5.5 + affinity * 0.9 + (rand() - 0.5) * 2.5 - (status === "DROPPED" ? 3 : 0))));
        await prisma.rating.create({ data: { userId: user.id, seriesId: s.id, score, createdAt: when } });
      }
      if (rank < 4 && status !== "DROPPED" && rand() < 0.75) {
        await prisma.favorite.create({ data: { userId: user.id, seriesId: s.id, createdAt: when } });
      }
    }
  }

  // ── Demo reviews (written for the seed, attributed to demo members)
  for (const rv of DEMO_REVIEWS) {
    const seriesId = idByTitle.get(rv.series);
    const author = await prisma.user.findUnique({ where: { username: rv.author } });
    if (!seriesId || !author) continue;
    await prisma.libraryEntry.upsert({
      where: { userId_seriesId: { userId: author.id, seriesId } },
      update: {},
      create: { userId: author.id, seriesId, status: "COMPLETED" },
    });
    await prisma.rating.upsert({
      where: { userId_seriesId: { userId: author.id, seriesId } },
      update: { score: rv.score },
      create: { userId: author.id, seriesId, score: rv.score },
    });
    const review = await prisma.review.create({
      data: { userId: author.id, seriesId, title: rv.title, body: rv.body, containsSpoilers: rv.spoilers ?? false },
    });
    // Helpful votes from other demo members, stored as real vote rows.
    const voters = memberIds.filter((id) => id !== author.id).slice(0, rv.helpful ?? 0);
    if (voters.length) {
      await prisma.reviewHelpfulVote.createMany({ data: voters.map((userId) => ({ userId, reviewId: review.id })) });
      await prisma.$executeRaw`UPDATE "Review" SET "helpfulCount" = ${voters.length} WHERE id = ${review.id}`;
    }
  }

  // ── Recompute every series' stats from stored rows
  for (const s of catalog) await recomputeSeriesStats(s.id, prisma);

  // ── Editor's picks
  await prisma.featuredSeries.deleteMany({});
  for (const [position, f] of FEATURED.entries()) {
    const seriesId = idByTitle.get(f.title);
    if (seriesId) await prisma.featuredSeries.create({ data: { seriesId, reason: f.reason, position, createdById: admin.id } });
  }

  // ── Editor-curated seasonal collections
  for (const c of COLLECTIONS) {
    const col = await prisma.seasonalCollection.upsert({
      where: { slug: c.slug },
      update: { title: c.title, description: c.description, season: c.season, year: c.year },
      create: { slug: c.slug, title: c.title, description: c.description, season: c.season, year: c.year, createdById: admin.id },
    });
    await prisma.seasonalCollectionItem.deleteMany({ where: { collectionId: col.id } });
    await prisma.seasonalCollectionItem.createMany({
      data: c.items
        .map(([title, note], position) => ({ collectionId: col.id, seriesId: idByTitle.get(title)!, note, position }))
        .filter((i) => i.seriesId),
    });
  }

  console.log(`  accounts: admin ${adminEmail}, moderator ${modEmail}, demo reader reader@mangaforever.local`);
  if (!process.env.SEED_ADMIN_PASSWORD) console.log(`  ⚠ Using default local admin password "${adminPassword}" — set SEED_ADMIN_PASSWORD before seeding anything public.`);
  console.log(`  demo reader password: ${demoPassword}`);
  console.log("Done.");
}

function randomPassword() {
  return `demo-${Math.random().toString(36).slice(2)}-${Date.now()}`;
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
