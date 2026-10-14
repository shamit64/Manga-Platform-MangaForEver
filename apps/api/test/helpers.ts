import request from "supertest";
import { createApp } from "../src/app.js";
import { prisma } from "../src/lib/prisma.js";
import { hashPassword } from "../src/services/auth.service.js";
import { writeSeries } from "../src/services/catalog-writer.js";

export const app = createApp();
export { prisma };

/** Wipe every table (keeps the schema). Requires migrations to have been applied to the test DB. */
export async function resetDb() {
  const tables = await prisma.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
  const list = tables.map((t) => `"public"."${t.tablename}"`).join(", ");
  if (list) await prisma.$executeRawUnsafe(`TRUNCATE ${list} RESTART IDENTITY CASCADE`);
}

export const FIXTURE = [
  { title: "Berserk", alt: ["ベルセルク"], type: "MANGA", status: "ONGOING", year: 1989, genres: ["Action", "Fantasy", "Horror"], tags: ["Dark fantasy"], authors: ["Kentaro Miura"], chapters: null },
  { title: "Death Note", alt: ["デスノート"], type: "MANGA", status: "COMPLETED", year: 2003, genres: ["Mystery", "Thriller", "Supernatural"], tags: ["Detective"], authors: ["Tsugumi Ohba"], artists: ["Takeshi Obata"], chapters: 108 },
  { title: "Bakuman", alt: [], type: "MANGA", status: "COMPLETED", year: 2008, genres: ["Comedy", "Drama"], tags: ["Manga industry"], authors: ["Tsugumi Ohba"], artists: ["Takeshi Obata"], chapters: 176 },
  { title: "Solo Leveling", alt: ["나 혼자만 레벨업"], type: "MANHWA", status: "COMPLETED", year: 2018, genres: ["Action", "Fantasy", "Adventure"], tags: ["Dungeons"], authors: ["Chugong"], chapters: null },
  { title: "Tower of God", alt: ["신의 탑"], type: "MANHWA", status: "ONGOING", year: 2010, genres: ["Action", "Fantasy", "Mystery"], tags: ["Tower climbing"], authors: ["SIU"], chapters: null },
  { title: "True Beauty", alt: [], type: "MANHWA", status: "COMPLETED", year: 2018, genres: ["Romance", "Comedy"], tags: ["Makeup"], authors: ["Yaongyi"], chapters: null },
  { title: "Heaven Official's Blessing", alt: ["天官赐福"], type: "MANHUA", status: "ONGOING", year: 2020, genres: ["Fantasy", "Romance"], tags: ["Gods"], authors: ["Mo Xiang Tong Xiu"], chapters: null },
  { title: "The Ravages of Time", alt: ["火鳳燎原"], type: "MANHUA", status: "COMPLETED", year: 2001, genres: ["Action", "Historical", "Drama"], tags: ["Three Kingdoms"], authors: ["Chan Mou"], chapters: null },
] as const;

export async function seedCatalog() {
  const ids: Record<string, string> = {};
  for (const s of FIXTURE) {
    const row = await writeSeries({
      title: s.title,
      altTitles: [...s.alt],
      type: s.type,
      status: s.status,
      releaseYear: s.year,
      genres: [...s.genres],
      tags: [...s.tags],
      authors: [...s.authors],
      artists: "artists" in s ? [...s.artists] : [...s.authors],
      chapterCount: s.chapters,
      source: "SEED_SAMPLE",
      synopsis: `${s.title} synopsis`,
    });
    ids[s.title] = row.id;
  }
  return ids;
}

let counter = 0;
export async function createUser(role: "USER" | "MODERATOR" | "ADMIN" = "USER", password = "password123") {
  counter++;
  const username = `user${counter}_${Date.now().toString(36)}`;
  const user = await prisma.user.create({
    data: { email: `${username}@test.dev`, username, role, passwordHash: await hashPassword(password), preference: { create: {} } },
  });
  const agent = request.agent(app);
  const res = await agent.post("/api/v1/auth/login").send({ identifier: user.email, password });
  if (res.status !== 200) throw new Error(`login failed: ${res.status} ${JSON.stringify(res.body)}`);
  return { user, agent };
}
