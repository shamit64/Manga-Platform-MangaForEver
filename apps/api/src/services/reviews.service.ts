import type { ReviewDTO } from "@mangaverse/shared";
import type { Prisma } from "../generated/prisma/client.js";
import { badRequest, conflict, forbidden, notFound } from "../lib/errors.js";
import { prisma } from "../lib/prisma.js";
import { pageResult } from "../lib/util.js";
import { audit } from "./audit.service.js";
import { recomputeSeriesStats } from "./stats.service.js";

const reviewInclude = {
  user: { select: { id: true, username: true, displayName: true, avatarUrl: true, role: true, isDemo: true } },
  series: { select: { id: true, slug: true, title: true, coverUrl: true, type: true } },
} satisfies Prisma.ReviewInclude;

type ReviewRow = Prisma.ReviewGetPayload<{ include: typeof reviewInclude }>;

async function scoresFor(rows: { userId: string; seriesId: string }[]) {
  if (!rows.length) return new Map<string, number>();
  const ratings = await prisma.rating.findMany({
    where: { OR: rows.map((r) => ({ userId: r.userId, seriesId: r.seriesId })) },
  });
  return new Map(ratings.map((r) => [`${r.userId}:${r.seriesId}`, r.score]));
}

function toDTO(r: ReviewRow, score: number | null, viewerId?: string, voted?: Set<string>): ReviewDTO {
  return {
    id: r.id,
    title: r.title,
    body: r.body,
    containsSpoilers: r.containsSpoilers,
    isHidden: r.isHidden,
    helpfulCount: r.helpfulCount,
    score,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
    author: r.user,
    series: r.series,
    viewerVotedHelpful: viewerId ? voted?.has(r.id) ?? false : undefined,
    isOwn: viewerId ? viewerId === r.userId : undefined,
  };
}

async function hydrate(rows: ReviewRow[], viewerId?: string) {
  const scores = await scoresFor(rows);
  let voted = new Set<string>();
  if (viewerId && rows.length) {
    const votes = await prisma.reviewHelpfulVote.findMany({ where: { userId: viewerId, reviewId: { in: rows.map((r) => r.id) } } });
    voted = new Set(votes.map((v) => v.reviewId));
  }
  return rows.map((r) => toDTO(r, scores.get(`${r.userId}:${r.seriesId}`) ?? null, viewerId, voted));
}

export async function listSeriesReviews(
  seriesId: string,
  q: { sort: string; page: number; pageSize: number },
  viewerId?: string,
) {
  const where: Prisma.ReviewWhereInput = { seriesId, isHidden: false };
  if (q.sort === "rating") {
    // Sort by the author's stored rating for this series.
    const all = await prisma.review.findMany({ where, include: reviewInclude });
    const items = await hydrate(all, viewerId);
    items.sort((a, b) => (b.score ?? -1) - (a.score ?? -1) || b.createdAt.localeCompare(a.createdAt));
    return pageResult(items.slice((q.page - 1) * q.pageSize, q.page * q.pageSize), items.length, q.page, q.pageSize);
  }
  const orderBy: Prisma.ReviewOrderByWithRelationInput[] =
    q.sort === "newest" ? [{ createdAt: "desc" }] : [{ helpfulCount: "desc" }, { createdAt: "desc" }];
  const [total, rows] = await Promise.all([
    prisma.review.count({ where }),
    prisma.review.findMany({ where, orderBy, skip: (q.page - 1) * q.pageSize, take: q.pageSize, include: reviewInclude }),
  ]);
  return pageResult(await hydrate(rows, viewerId), total, q.page, q.pageSize);
}

export async function listRecentReviews(limit: number, viewerId?: string) {
  const rows = await prisma.review.findMany({
    where: { isHidden: false, series: { isArchived: false } },
    orderBy: { createdAt: "desc" },
    take: limit,
    include: reviewInclude,
  });
  return hydrate(rows, viewerId);
}

export async function listUserReviews(userId: string, viewerId?: string) {
  const rows = await prisma.review.findMany({
    where: { userId, isHidden: false },
    orderBy: { createdAt: "desc" },
    take: 50,
    include: reviewInclude,
  });
  return hydrate(rows, viewerId);
}

export async function rate(userId: string, seriesId: string, score: number) {
  const series = await prisma.mangaSeries.findFirst({ where: { id: seriesId, isArchived: false }, select: { id: true } });
  if (!series) throw notFound("Series");
  await prisma.rating.upsert({
    where: { userId_seriesId: { userId, seriesId } },
    update: { score },
    create: { userId, seriesId, score },
  });
  await prisma.readingActivity.create({ data: { userId, seriesId, type: "RATED", data: { score } } });
  return recomputeSeriesStats(seriesId);
}

export async function unrate(userId: string, seriesId: string) {
  const { count } = await prisma.rating.deleteMany({ where: { userId, seriesId } });
  if (!count) throw notFound("Rating");
  return recomputeSeriesStats(seriesId);
}

export async function createReview(
  userId: string,
  seriesId: string,
  input: { title: string; body: string; containsSpoilers: boolean; score?: number },
) {
  const series = await prisma.mangaSeries.findFirst({ where: { id: seriesId, isArchived: false }, select: { id: true } });
  if (!series) throw notFound("Series");
  const existing = await prisma.review.findUnique({ where: { userId_seriesId: { userId, seriesId } } });
  if (existing) throw conflict("You've already reviewed this series — edit your existing review instead.");
  const review = await prisma.$transaction(async (tx) => {
    const r = await tx.review.create({
      data: { userId, seriesId, title: input.title, body: input.body, containsSpoilers: input.containsSpoilers },
      include: reviewInclude,
    });
    if (input.score !== undefined) {
      await tx.rating.upsert({
        where: { userId_seriesId: { userId, seriesId } },
        update: { score: input.score },
        create: { userId, seriesId, score: input.score },
      });
    }
    await tx.readingActivity.create({ data: { userId, seriesId, type: "REVIEWED" } });
    return r;
  });
  await recomputeSeriesStats(seriesId);
  return (await hydrate([review], userId))[0];
}

/** Only the author may edit their review. Moderators use the moderation endpoints instead. */
export async function updateReview(
  userId: string,
  reviewId: string,
  input: { title?: string; body?: string; containsSpoilers?: boolean; score?: number },
) {
  const review = await prisma.review.findUnique({ where: { id: reviewId } });
  if (!review) throw notFound("Review");
  if (review.userId !== userId) throw forbidden("You can only edit your own reviews.");
  const updated = await prisma.$transaction(async (tx) => {
    const r = await tx.review.update({
      where: { id: reviewId },
      data: { title: input.title, body: input.body, containsSpoilers: input.containsSpoilers },
      include: reviewInclude,
    });
    if (input.score !== undefined) {
      await tx.rating.upsert({
        where: { userId_seriesId: { userId, seriesId: review.seriesId } },
        update: { score: input.score },
        create: { userId, seriesId: review.seriesId, score: input.score },
      });
    }
    return r;
  });
  await recomputeSeriesStats(review.seriesId);
  return (await hydrate([updated], userId))[0];
}

export async function deleteReview(user: { id: string; role: string }, reviewId: string) {
  const review = await prisma.review.findUnique({ where: { id: reviewId } });
  if (!review) throw notFound("Review");
  const isStaff = user.role === "ADMIN" || user.role === "MODERATOR";
  if (review.userId !== user.id && !isStaff) throw forbidden("You can only delete your own reviews.");
  await prisma.review.delete({ where: { id: reviewId } });
  if (review.userId !== user.id) {
    await audit(user.id, "review.delete", "Review", reviewId, { authorId: review.userId, seriesId: review.seriesId });
  }
  await recomputeSeriesStats(review.seriesId);
}

/**
 * Toggle a helpful vote. The count is derived from vote rows inside the same transaction,
 * so it can't be inflated: one vote per member, and authors can't vote for themselves.
 */
export async function toggleHelpful(userId: string, reviewId: string) {
  const review = await prisma.review.findUnique({ where: { id: reviewId } });
  if (!review || review.isHidden) throw notFound("Review");
  if (review.userId === userId) throw badRequest("You can't mark your own review as helpful.");
  return prisma.$transaction(async (tx) => {
    const existing = await tx.reviewHelpfulVote.findUnique({ where: { userId_reviewId: { userId, reviewId } } });
    if (existing) await tx.reviewHelpfulVote.delete({ where: { userId_reviewId: { userId, reviewId } } });
    else await tx.reviewHelpfulVote.create({ data: { userId, reviewId } });
    const count = await tx.reviewHelpfulVote.count({ where: { reviewId } });
    await tx.review.update({ where: { id: reviewId }, data: { helpfulCount: count } });
    return { voted: !existing, helpfulCount: count };
  });
}

export async function reportReview(userId: string, reviewId: string, reason: string, details?: string) {
  const review = await prisma.review.findUnique({ where: { id: reviewId } });
  if (!review) throw notFound("Review");
  if (review.userId === userId) throw badRequest("You can't report your own review.");
  const existing = await prisma.reviewReport.findUnique({ where: { reviewId_reporterId: { reviewId, reporterId: userId } } });
  if (existing) throw conflict("You've already reported this review. Moderators will take a look.");
  const report = await prisma.reviewReport.create({ data: { reviewId, reporterId: userId, reason, details } });
  return { id: report.id, status: report.status };
}

// ───────── Moderation ─────────

export async function listReports(status: "OPEN" | "RESOLVED" | "DISMISSED" | undefined, page: number, pageSize: number) {
  const where: Prisma.ReviewReportWhereInput = status ? { status } : {};
  const [total, rows] = await Promise.all([
    prisma.reviewReport.count({ where }),
    prisma.reviewReport.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: {
        reporter: { select: { id: true, username: true } },
        resolvedBy: { select: { id: true, username: true } },
        review: { include: reviewInclude },
      },
    }),
  ]);
  return pageResult(
    rows.map((r) => ({
      id: r.id,
      reason: r.reason,
      details: r.details,
      status: r.status,
      createdAt: r.createdAt.toISOString(),
      resolvedAt: r.resolvedAt?.toISOString() ?? null,
      resolutionNote: r.resolutionNote,
      reporter: r.reporter,
      resolvedBy: r.resolvedBy,
      review: toDTO(r.review, null),
    })),
    total,
    page,
    pageSize,
  );
}

/**
 * Documented moderation actions:
 *   HIDE_REVIEW    — hides the review from public lists; resolves all open reports on it.
 *   RESTORE_REVIEW — makes a hidden review visible again; resolves the report.
 *   DISMISS        — closes the report with no change to the review.
 */
export async function resolveReport(moderatorId: string, reportId: string, action: string, note?: string) {
  const report = await prisma.reviewReport.findUnique({ where: { id: reportId } });
  if (!report) throw notFound("Report");
  const now = new Date();
  await prisma.$transaction(async (tx) => {
    if (action === "HIDE_REVIEW") {
      await tx.review.update({ where: { id: report.reviewId }, data: { isHidden: true, hiddenReason: note ?? report.reason } });
      await tx.reviewReport.updateMany({
        where: { reviewId: report.reviewId, status: "OPEN" },
        data: { status: "RESOLVED", resolvedById: moderatorId, resolvedAt: now, resolutionNote: note ?? "Review hidden" },
      });
    } else if (action === "RESTORE_REVIEW") {
      await tx.review.update({ where: { id: report.reviewId }, data: { isHidden: false, hiddenReason: null } });
      await tx.reviewReport.update({
        where: { id: reportId },
        data: { status: "RESOLVED", resolvedById: moderatorId, resolvedAt: now, resolutionNote: note ?? "Review restored" },
      });
    } else {
      await tx.reviewReport.update({
        where: { id: reportId },
        data: { status: "DISMISSED", resolvedById: moderatorId, resolvedAt: now, resolutionNote: note ?? null },
      });
    }
  });
  await audit(moderatorId, `report.${action.toLowerCase()}`, "ReviewReport", reportId, { reviewId: report.reviewId, note });
  const review = await prisma.review.findUnique({ where: { id: report.reviewId }, select: { seriesId: true } });
  if (review) await recomputeSeriesStats(review.seriesId);
}

export async function setReviewHidden(moderatorId: string, reviewId: string, hidden: boolean, reason?: string) {
  const review = await prisma.review.update({
    where: { id: reviewId },
    data: { isHidden: hidden, hiddenReason: hidden ? reason ?? "Hidden by moderator" : null },
  });
  await audit(moderatorId, hidden ? "review.hide" : "review.restore", "Review", reviewId, { reason });
  await recomputeSeriesStats(review.seriesId);
}
