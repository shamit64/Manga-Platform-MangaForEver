import { AppError, badRequest, notFound } from "../lib/errors.js";
import { prisma } from "../lib/prisma.js";
import { pageResult } from "../lib/util.js";
import type { ProviderChapter } from "../providers/chapters.js";
import { audit } from "./audit.service.js";
import { notifyNewChapters, type NewChapter } from "./notifications.service.js";
import { broadcast } from "./realtime.js";
import { recomputeSeriesStats } from "./stats.service.js";

export const REACTION_KINDS = ["LOVED", "HYPE", "SAD", "FUNNY", "SHOCKED"] as const;
export type ReactionKind = (typeof REACTION_KINDS)[number];

type ChapterInput = ProviderChapter & { readable?: boolean };

/**
 * Store chapters for a series from one source and announce the new ones.
 * The (series, number, source) key makes this idempotent: re-running a sync never duplicates.
 * An existing row gains an official link if a later report includes one.
 * `announce: false` is used for the first back-fill of a newly linked series.
 */
export async function recordChapters(seriesId: string, source: string, input: ChapterInput[], opts: { announce: boolean }) {
  // Several translations or uploads can report the same number; keep one, preferring an official link.
  const byNumber = new Map<number, ChapterInput>();
  for (const c of input) {
    const cur = byNumber.get(c.number);
    if (!cur || (!cur.externalUrl && c.externalUrl) || (!!cur.externalUrl === !!c.externalUrl && c.releasedAt < cur.releasedAt)) byNumber.set(c.number, c);
  }
  if (!byNumber.size) return { created: [] as NewChapter[], updated: 0 };
  const existing = await prisma.chapterMetadata.findMany({
    where: { seriesId, source, number: { in: [...byNumber.keys()] } },
    select: { id: true, number: true, externalUrl: true },
  });
  const known = new Map(existing.map((e) => [e.number, e]));
  const created: NewChapter[] = [];
  let updated = 0;
  for (const c of [...byNumber.values()].sort((a, b) => a.number - b.number)) {
    const prev = known.get(c.number);
    if (prev) {
      if (!prev.externalUrl && c.externalUrl) {
        await prisma.chapterMetadata.update({ where: { id: prev.id }, data: { externalUrl: c.externalUrl, publisher: c.publisher } });
        updated++;
      }
      continue;
    }
    const row = await prisma.chapterMetadata.upsert({
      where: { seriesId_number_source: { seriesId, number: c.number, source } },
      update: {},
      create: {
        seriesId,
        source,
        number: c.number,
        title: c.title,
        releasedAt: c.releasedAt,
        language: c.language,
        externalUrl: c.externalUrl,
        publisher: c.publisher,
        readable: c.readable ?? false,
      },
    });
    created.push(row);
  }
  if (created.length) {
    const agg = await prisma.chapterMetadata.aggregate({ where: { seriesId }, _max: { number: true, releasedAt: true } });
    const series = await prisma.mangaSeries.update({
      where: { id: seriesId },
      data: { latestChapter: agg._max.number, lastChapterAt: agg._max.releasedAt },
      select: { id: true, slug: true, title: true, coverUrl: true, type: true },
    });
    if (opts.announce) {
      const latest = created[created.length - 1]!;
      broadcast("chapter", {
        series: { slug: series.slug, title: series.title, coverUrl: series.coverUrl, type: series.type },
        chapter: latest.number,
        title: latest.title,
        releasedAt: latest.releasedAt?.toISOString() ?? null,
        count: created.length,
      });
      await notifyNewChapters(series, created);
    }
  }
  return { created, updated };
}

// ───────── Reading ─────────

async function seriesBySlugOrId(idOrSlug: string) {
  const s = await prisma.mangaSeries.findFirst({
    where: { OR: [{ id: idOrSlug }, { slug: idOrSlug }], isArchived: false },
    select: { id: true, slug: true, title: true, type: true, coverUrl: true, chapterCount: true, status: true, externalUrls: true },
  });
  if (!s) throw notFound("Series");
  return s;
}

type ChapterRow = { id: string; number: number; title: string | null; releasedAt: Date | null; source: string; externalUrl: string | null; publisher: string | null; readable: boolean; language: string | null };

/** One row per chapter number: a readable copy wins, then an official link, then the earliest report. */
function collapse(rows: ChapterRow[]) {
  const rank = (r: ChapterRow) => (r.readable ? 2 : r.externalUrl ? 1 : 0);
  const best = new Map<number, ChapterRow>();
  for (const r of rows) {
    const cur = best.get(r.number);
    if (!cur || rank(r) > rank(cur)) best.set(r.number, r);
  }
  return [...best.values()];
}

const chapterSelect = { id: true, number: true, title: true, releasedAt: true, source: true, externalUrl: true, publisher: true, readable: true, language: true } as const;

const chapterDTO = (c: ChapterRow) => ({
  id: c.id,
  number: c.number,
  title: c.title,
  releasedAt: c.releasedAt?.toISOString() ?? null,
  source: c.source,
  externalUrl: c.externalUrl,
  publisher: c.publisher,
  readable: c.readable,
  language: c.language,
});

export async function listChapters(idOrSlug: string, q: { page: number; pageSize: number; order: "asc" | "desc" }) {
  const s = await seriesBySlugOrId(idOrSlug);
  const all = collapse(await prisma.chapterMetadata.findMany({ where: { seriesId: s.id }, select: chapterSelect }));
  all.sort((a, b) => (q.order === "asc" ? a.number - b.number : b.number - a.number));
  const items = all.slice((q.page - 1) * q.pageSize, q.page * q.pageSize).map(chapterDTO);
  return { ...pageResult(items, all.length, q.page, q.pageSize), first: all.length ? Math.min(...all.map((c) => c.number)) : null, latest: all.length ? Math.max(...all.map((c) => c.number)) : null };
}

export async function getChapter(idOrSlug: string, number: number, viewerId?: string) {
  const s = await seriesBySlugOrId(idOrSlug);
  const all = collapse(await prisma.chapterMetadata.findMany({ where: { seriesId: s.id }, select: chapterSelect })).sort((a, b) => a.number - b.number);
  const i = all.findIndex((c) => c.number === number);
  if (i < 0) throw notFound("Chapter");
  const c = all[i]!;
  const [pages, reactionGroups, viewerReaction, commentCount] = await Promise.all([
    c.readable ? prisma.hostedPage.findMany({ where: { chapterId: c.id }, orderBy: { index: "asc" }, select: { index: true, imageUrl: true, width: true, height: true } }) : [],
    prisma.chapterReaction.groupBy({ by: ["kind"], where: { chapterId: c.id }, _count: { _all: true } }),
    viewerId ? prisma.chapterReaction.findUnique({ where: { userId_chapterId: { userId: viewerId, chapterId: c.id } }, select: { kind: true } }) : null,
    prisma.chapterComment.count({ where: { chapterId: c.id, isHidden: false } }),
  ]);
  const reactions = Object.fromEntries(REACTION_KINDS.map((k) => [k, 0])) as Record<ReactionKind, number>;
  for (const g of reactionGroups) reactions[g.kind] = g._count._all;
  return {
    series: { id: s.id, slug: s.slug, title: s.title, type: s.type, coverUrl: s.coverUrl, officialLinks: Array.isArray(s.externalUrls) ? (s.externalUrls as { label: string; url: string }[]) : [] },
    chapter: chapterDTO(c),
    pages,
    prev: i > 0 ? all[i - 1]!.number : null,
    next: i < all.length - 1 ? all[i + 1]!.number : null,
    chapterNumbers: all.map((x) => x.number),
    reactions,
    viewerReaction: viewerReaction?.kind ?? null,
    commentCount,
  };
}

/**
 * Finishing (or opening the official page of) a chapter moves the member's list entry forward:
 * adds the series as Reading if needed, moves Plan to Read to Reading, never moves progress
 * backwards, and completes the entry when the last chapter of a finished series is read.
 */
export async function markChapterRead(userId: string, chapterId: string) {
  const ch = await prisma.chapterMetadata.findUnique({ where: { id: chapterId }, include: { series: true } });
  if (!ch || ch.series.isArchived) throw notFound("Chapter");
  const { series } = ch;
  let progress = Math.floor(ch.number);
  if (series.chapterCount !== null) progress = Math.min(progress, series.chapterCount);
  const finished = series.status === "COMPLETED" && series.chapterCount !== null && progress >= series.chapterCount;
  const today = new Date(`${new Date().toISOString().slice(0, 10)}T00:00:00.000Z`);
  const entry = await prisma.libraryEntry.findUnique({ where: { userId_seriesId: { userId, seriesId: series.id } } });

  let result;
  if (!entry) {
    result = await prisma.$transaction(async (tx) => {
      const e = await tx.libraryEntry.create({
        data: { userId, seriesId: series.id, status: finished ? "COMPLETED" : "READING", progressChapter: progress, startedAt: today, completedAt: finished ? today : null },
      });
      await tx.readingActivity.create({ data: { userId, seriesId: series.id, type: "ADDED_TO_LIBRARY", data: { status: e.status, via: "reader" } } });
      await tx.seriesFollow.upsert({ where: { userId_seriesId: { userId, seriesId: series.id } }, update: {}, create: { userId, seriesId: series.id } });
      return e;
    });
    await recomputeSeriesStats(series.id);
  } else {
    const nextProgress = Math.max(entry.progressChapter, progress);
    let status = entry.status;
    if (status === "PLAN_TO_READ" || status === "ON_HOLD") status = "READING";
    if (finished && status !== "DROPPED") status = "COMPLETED";
    result = await prisma.$transaction(async (tx) => {
      const e = await tx.libraryEntry.update({
        where: { id: entry.id },
        data: {
          progressChapter: nextProgress,
          status,
          startedAt: entry.startedAt ?? today,
          completedAt: status === "COMPLETED" && !entry.completedAt ? today : entry.completedAt,
        },
      });
      if (nextProgress !== entry.progressChapter) {
        await tx.readingActivity.create({ data: { userId, seriesId: series.id, type: "PROGRESS_UPDATED", data: { from: entry.progressChapter, chapter: nextProgress, via: "reader" } } });
      }
      if (status !== entry.status) {
        await tx.readingActivity.create({ data: { userId, seriesId: series.id, type: "STATUS_CHANGED", data: { from: entry.status, to: status, via: "reader" } } });
      }
      return e;
    });
  }
  await prisma.notification.updateMany({ where: { userId, chapterId, readAt: null }, data: { readAt: new Date() } });
  return { status: result.status, progressChapter: result.progressChapter };
}

// ───────── Reactions ─────────

export async function react(userId: string, chapterId: string, kind: ReactionKind | null) {
  if (!(await prisma.chapterMetadata.findUnique({ where: { id: chapterId }, select: { id: true } }))) throw notFound("Chapter");
  if (kind === null) await prisma.chapterReaction.deleteMany({ where: { userId, chapterId } });
  else await prisma.chapterReaction.upsert({ where: { userId_chapterId: { userId, chapterId } }, update: { kind }, create: { userId, chapterId, kind } });
  const groups = await prisma.chapterReaction.groupBy({ by: ["kind"], where: { chapterId }, _count: { _all: true } });
  const reactions = Object.fromEntries(REACTION_KINDS.map((k) => [k, 0])) as Record<ReactionKind, number>;
  for (const g of groups) reactions[g.kind] = g._count._all;
  return { reactions, viewerReaction: kind };
}

// ───────── Comments ─────────

const BLOCKED = [/\b(?:viagra|casino|crypto\s*giveaway|onlyfans|free\s*robux)\b/i, /(?:t\.me|discord\.gg)\//i];

/** Automatic moderation: obvious spam is held for a moderator instead of being published. */
export function autoModerate(body: string): string | null {
  const links = body.match(/https?:\/\//gi)?.length ?? 0;
  if (links > 2) return "Held for review: too many links.";
  if (BLOCKED.some((re) => re.test(body))) return "Held for review: matched the spam filter.";
  if (/(.)\1{14,}/.test(body)) return "Held for review: repeated characters.";
  return null;
}

const commentAuthor = { select: { id: true, username: true, displayName: true, avatarUrl: true, role: true, isDemo: true } } as const;

export async function listComments(chapterId: string, page: number, pageSize: number, viewer?: { id: string; role: string }) {
  const isMod = viewer && viewer.role !== "USER";
  const where = { chapterId, OR: [{ isHidden: false }, ...(viewer ? [{ userId: viewer.id }] : [])] };
  const [total, rows] = await Promise.all([
    prisma.chapterComment.count({ where }),
    prisma.chapterComment.findMany({ where, orderBy: { createdAt: "desc" }, skip: (page - 1) * pageSize, take: pageSize, include: { user: commentAuthor } }),
  ]);
  return pageResult(
    rows.map((c) => ({
      id: c.id,
      body: c.body,
      containsSpoilers: c.containsSpoilers,
      isHidden: c.isHidden,
      hiddenReason: c.isHidden && (isMod || c.userId === viewer?.id) ? c.hiddenReason : null,
      createdAt: c.createdAt.toISOString(),
      author: c.user,
      isOwn: c.userId === viewer?.id,
    })),
    total,
    page,
    pageSize,
  );
}

export async function createComment(userId: string, chapterId: string, input: { body: string; containsSpoilers: boolean }) {
  if (!(await prisma.chapterMetadata.findUnique({ where: { id: chapterId }, select: { id: true } }))) throw notFound("Chapter");
  // Simple flood control on top of the route's rate limit.
  const recent = await prisma.chapterComment.count({ where: { userId, createdAt: { gt: new Date(Date.now() - 30_000) } } });
  if (recent >= 3) throw new AppError(429, "RATE_LIMITED", "You're commenting very fast. Wait a moment and try again.");
  const held = autoModerate(input.body);
  const c = await prisma.chapterComment.create({
    data: { userId, chapterId, body: input.body, containsSpoilers: input.containsSpoilers, isHidden: !!held, hiddenReason: held },
    include: { user: commentAuthor },
  });
  return { id: c.id, body: c.body, containsSpoilers: c.containsSpoilers, isHidden: c.isHidden, hiddenReason: c.hiddenReason, createdAt: c.createdAt.toISOString(), author: c.user, isOwn: true };
}

export async function deleteComment(user: { id: string; role: string }, id: string) {
  const c = await prisma.chapterComment.findUnique({ where: { id } });
  if (!c || (c.userId !== user.id && user.role === "USER")) throw notFound("Comment");
  await prisma.chapterComment.delete({ where: { id } });
  if (c.userId !== user.id) await audit(user.id, "chapterComment.delete", "ChapterComment", id, { authorId: c.userId });
}

export async function setCommentVisibility(actorId: string, id: string, hidden: boolean, reason?: string) {
  const c = await prisma.chapterComment.findUnique({ where: { id } });
  if (!c) throw notFound("Comment");
  await prisma.chapterComment.update({ where: { id }, data: { isHidden: hidden, hiddenReason: hidden ? (reason ?? "Hidden by a moderator.") : null } });
  await audit(actorId, hidden ? "chapterComment.hide" : "chapterComment.restore", "ChapterComment", id, { reason });
}

export async function heldComments(limit = 50) {
  const rows = await prisma.chapterComment.findMany({
    where: { isHidden: true },
    orderBy: { createdAt: "desc" },
    take: limit,
    include: { user: commentAuthor, chapter: { select: { number: true, series: { select: { slug: true, title: true } } } } },
  });
  return rows.map((c) => ({ id: c.id, body: c.body, hiddenReason: c.hiddenReason, createdAt: c.createdAt.toISOString(), author: c.user, chapter: c.chapter }));
}

// ───────── Follows ─────────

export async function followSeries(userId: string, idOrSlug: string, opts: { notifyEmail?: boolean; notifyPush?: boolean } = {}) {
  const s = await seriesBySlugOrId(idOrSlug);
  await prisma.seriesFollow.upsert({
    where: { userId_seriesId: { userId, seriesId: s.id } },
    update: opts,
    create: { userId, seriesId: s.id, ...opts },
  });
  return { following: true, followers: await prisma.seriesFollow.count({ where: { seriesId: s.id } }) };
}

export async function unfollowSeries(userId: string, idOrSlug: string) {
  const s = await seriesBySlugOrId(idOrSlug);
  await prisma.seriesFollow.deleteMany({ where: { userId, seriesId: s.id } });
  return { following: false, followers: await prisma.seriesFollow.count({ where: { seriesId: s.id } }) };
}

export async function listFollows(userId: string) {
  const rows = await prisma.seriesFollow.findMany({
    where: { userId, series: { isArchived: false } },
    orderBy: { series: { lastChapterAt: { sort: "desc", nulls: "last" } } },
    include: { series: { select: { id: true, slug: true, title: true, coverUrl: true, type: true, latestChapter: true, lastChapterAt: true } } },
  });
  return rows.map((f) => ({ notifyEmail: f.notifyEmail, notifyPush: f.notifyPush, createdAt: f.createdAt.toISOString(), series: { ...f.series, lastChapterAt: f.series.lastChapterAt?.toISOString() ?? null } }));
}

// ───────── Hosted (rights-cleared) chapters ─────────

export async function addHostedChapter(
  actorId: string,
  seriesId: string,
  input: { number: number; title?: string | null; pages: { url: string; width?: number; height?: number }[] },
) {
  const s = await prisma.mangaSeries.findUnique({ where: { id: seriesId }, select: { id: true } });
  if (!s) throw notFound("Series");
  if (await prisma.chapterMetadata.findUnique({ where: { seriesId_number_source: { seriesId, number: input.number, source: "hosted" } } })) {
    throw badRequest(`Chapter ${input.number} is already hosted for this series.`);
  }
  const { created } = await recordChapters(
    seriesId,
    "hosted",
    [{ number: input.number, title: input.title ?? null, releasedAt: new Date(), language: null, externalUrl: null, publisher: null, readable: true }],
    { announce: false },
  );
  const chapter = created[0]!;
  await prisma.hostedPage.createMany({
    data: input.pages.map((p, index) => ({ chapterId: chapter.id, index, imageUrl: p.url, width: p.width ?? null, height: p.height ?? null })),
  });
  const series = await prisma.mangaSeries.findUniqueOrThrow({ where: { id: seriesId }, select: { id: true, slug: true, title: true, coverUrl: true, type: true } });
  broadcast("chapter", { series: { slug: series.slug, title: series.title, coverUrl: series.coverUrl, type: series.type }, chapter: chapter.number, title: chapter.title, releasedAt: chapter.releasedAt?.toISOString() ?? null, count: 1 });
  await notifyNewChapters(series, created);
  await audit(actorId, "chapter.host", "ChapterMetadata", chapter.id, { seriesId, number: input.number, pages: input.pages.length });
  return { id: chapter.id, number: chapter.number, pages: input.pages.length };
}
