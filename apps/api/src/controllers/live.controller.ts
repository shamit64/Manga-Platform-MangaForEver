import { timingSafeEqual } from "node:crypto";
import type { NextFunction, Request, Response } from "express";
import {
  chapterCommentSchema,
  chapterListQuerySchema,
  followSeriesSchema,
  hostedChapterSchema,
  latestUpdatesQuerySchema,
  paginationSchema,
  pushSubscriptionSchema,
  reactionSchema,
  sourceLinkSchema,
} from "@mangaforever/shared";
import { z } from "zod";
import { env } from "../config/env.js";
import { AppError, notFound } from "../lib/errors.js";
import { prisma } from "../lib/prisma.js";
import { JOBS, jobStatus, runJob } from "../jobs/index.js";
import { parse } from "../middleware/validate.js";
import { audit } from "../services/audit.service.js";
import { getLatestUpdates } from "../services/catalog.service.js";
import * as chapters from "../services/chapters.service.js";
import * as notifications from "../services/notifications.service.js";
import { connect } from "../services/realtime.js";

const uid = (req: Request) => req.user!.id;
const param = (req: Request, k: string) => String(req.params[k]);
const chapterNumber = (req: Request) => parse(z.coerce.number().min(0).max(100_000), req.params.number);

// ───────── Chapters & reader ─────────
export const chapterList = async (req: Request, res: Response) => res.json(await chapters.listChapters(param(req, "id"), parse(chapterListQuerySchema, req.query)));
export const chapterGet = async (req: Request, res: Response) => res.json(await chapters.getChapter(param(req, "id"), chapterNumber(req), req.user?.id));
export const chapterRead = async (req: Request, res: Response) => res.json(await chapters.markChapterRead(uid(req), param(req, "chapterId")));
export const chapterReact = async (req: Request, res: Response) => res.json(await chapters.react(uid(req), param(req, "chapterId"), parse(reactionSchema, req.body).kind));
export const commentsList = async (req: Request, res: Response) => {
  const { page, pageSize } = parse(paginationSchema, req.query);
  res.json(await chapters.listComments(param(req, "chapterId"), page, Math.min(pageSize, 50), req.user ? { id: req.user.id, role: req.user.role } : undefined));
};
export const commentCreate = async (req: Request, res: Response) => res.status(201).json(await chapters.createComment(uid(req), param(req, "chapterId"), parse(chapterCommentSchema, req.body)));
export const commentDelete = async (req: Request, res: Response) => {
  await chapters.deleteComment(req.user!, param(req, "id"));
  res.status(204).end();
};
export const latestUpdates = async (req: Request, res: Response) => {
  const q = parse(latestUpdatesQuerySchema, req.query);
  res.json(await getLatestUpdates(q.page, q.pageSize, q.type));
};

// ───────── Follows ─────────
export const follow = async (req: Request, res: Response) => res.json(await chapters.followSeries(uid(req), param(req, "id"), parse(followSeriesSchema, req.body ?? {})));
export const unfollow = async (req: Request, res: Response) => res.json(await chapters.unfollowSeries(uid(req), param(req, "id")));
export const followsList = async (req: Request, res: Response) => res.json({ items: await chapters.listFollows(uid(req)) });

// ───────── Notifications ─────────
export const notificationsList = async (req: Request, res: Response) => {
  const q = parse(paginationSchema.extend({ unread: z.enum(["true", "false"]).optional() }), req.query);
  res.json(await notifications.listNotifications(uid(req), q.page, Math.min(q.pageSize, 50), q.unread === "true"));
};
export const notificationsUnread = async (req: Request, res: Response) => res.json({ count: await notifications.unreadCount(uid(req)) });
export const notificationRead = async (req: Request, res: Response) => {
  await notifications.markRead(uid(req), param(req, "id"));
  res.status(204).end();
};
export const notificationsReadAll = async (req: Request, res: Response) => res.json({ updated: await notifications.markAllRead(uid(req)) });

// ───────── Push & live events ─────────
export const pushKey = (_req: Request, res: Response) => res.json({ publicKey: notifications.pushPublicKey() });
export const pushSubscribe = async (req: Request, res: Response) => {
  await notifications.savePushSubscription(uid(req), parse(pushSubscriptionSchema, req.body));
  res.status(201).json({ subscribed: true });
};
export const pushUnsubscribe = async (req: Request, res: Response) => {
  await notifications.removePushSubscription(uid(req), parse(z.object({ endpoint: z.string().max(1000) }), req.body).endpoint);
  res.status(204).end();
};
export const events = (req: Request, res: Response) => connect(req, res);

// ───────── Scheduled jobs (called by GitHub Actions) ─────────
export function requireJobsToken(req: Request, _res: Response, next: NextFunction) {
  const expected = env.JOBS_TOKEN;
  if (!expected) return next(new AppError(503, "JOBS_DISABLED", "Scheduled jobs are disabled: set JOBS_TOKEN on the API."));
  const given = (req.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return next(new AppError(401, "UNAUTHORIZED", "Invalid jobs token."));
  next();
}
export const jobRun = async (req: Request, res: Response) => {
  const limit = parse(z.object({ limit: z.coerce.number().int().min(1).max(500).optional() }), req.query).limit;
  res.json(await runJob(param(req, "job"), { limit }));
};

// ───────── Admin ─────────
export const adminJobs = async (_req: Request, res: Response) => res.json({ items: await jobStatus() });
export const adminJobRun = async (req: Request, res: Response) => {
  const name = param(req, "job");
  if (!JOBS[name]) throw notFound("Job");
  await audit(uid(req), "job.run", "JobRun", null, { job: name });
  res.json(await runJob(name));
};
export const adminHostChapter = async (req: Request, res: Response) => res.status(201).json(await chapters.addHostedChapter(uid(req), param(req, "id"), parse(hostedChapterSchema, req.body)));
export const adminHeldComments = async (_req: Request, res: Response) => res.json({ items: await chapters.heldComments() });
export const adminCommentVisibility = async (req: Request, res: Response) => {
  const body = parse(z.object({ hidden: z.boolean(), reason: z.string().trim().max(300).optional() }), req.body);
  await chapters.setCommentVisibility(uid(req), param(req, "id"), body.hidden, body.reason);
  res.status(204).end();
};
export const adminUnlinked = async (_req: Request, res: Response) => {
  const rows = await prisma.mangaSeries.findMany({
    where: { isArchived: false, sourceLinkCheckedAt: { not: null }, sourceLinks: { none: {} } },
    orderBy: [{ externalPopularity: { sort: "desc", nulls: "last" } }],
    take: 100,
    select: { id: true, slug: true, title: true, type: true, status: true, sourceLinkCheckedAt: true },
  });
  const linked = await prisma.seriesSourceLink.count();
  res.json({ linked, items: rows.map((r) => ({ ...r, sourceLinkCheckedAt: r.sourceLinkCheckedAt?.toISOString() ?? null })) });
};
export const adminSetSourceLink = async (req: Request, res: Response) => {
  const seriesId = param(req, "id");
  const body = parse(sourceLinkSchema, req.body);
  if (!(await prisma.mangaSeries.findUnique({ where: { id: seriesId }, select: { id: true } }))) throw notFound("Series");
  const taken = await prisma.seriesSourceLink.findUnique({ where: { provider_externalId: { provider: body.provider, externalId: body.externalId } } });
  if (taken && taken.seriesId !== seriesId) throw new AppError(409, "CONFLICT", "That source record is already linked to another series.");
  const link = await prisma.seriesSourceLink.upsert({
    where: { seriesId_provider: { seriesId, provider: body.provider } },
    update: { externalId: body.externalId, lastCheckedAt: null },
    create: { seriesId, provider: body.provider, externalId: body.externalId },
  });
  await audit(uid(req), "sourceLink.set", "MangaSeries", seriesId, body);
  res.json({ id: link.id, provider: link.provider, externalId: link.externalId });
};
