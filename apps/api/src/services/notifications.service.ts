import webpush from "web-push";
import { env } from "../config/env.js";
import { badRequest, notFound } from "../lib/errors.js";
import { logger } from "../lib/logger.js";
import { prisma } from "../lib/prisma.js";
import { pageResult } from "../lib/util.js";
import { sendToUsers } from "./realtime.js";

// ───────── Browser push ─────────

const pushEnabled = () => !!(env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY);
let vapidSet = false;

export function pushPublicKey() {
  return pushEnabled() ? env.VAPID_PUBLIC_KEY! : null;
}

export async function savePushSubscription(userId: string, sub: { endpoint: string; keys: { p256dh: string; auth: string } }) {
  if (!pushEnabled()) throw badRequest("Push notifications are not configured on this server.");
  await prisma.pushSubscription.upsert({
    where: { endpoint: sub.endpoint },
    update: { userId, p256dh: sub.keys.p256dh, auth: sub.keys.auth },
    create: { userId, endpoint: sub.endpoint, p256dh: sub.keys.p256dh, auth: sub.keys.auth },
  });
}

export async function removePushSubscription(userId: string, endpoint: string) {
  await prisma.pushSubscription.deleteMany({ where: { userId, endpoint } });
}

/** Best-effort Web Push to every device of the given members. Dead endpoints are removed. */
export async function pushToUsers(userIds: string[], payload: { title: string; body: string; url: string; tag?: string }) {
  if (!pushEnabled() || !userIds.length) return 0;
  if (!vapidSet) {
    webpush.setVapidDetails(env.VAPID_SUBJECT, env.VAPID_PUBLIC_KEY!, env.VAPID_PRIVATE_KEY!);
    vapidSet = true;
  }
  const subs = await prisma.pushSubscription.findMany({ where: { userId: { in: userIds } } });
  let sent = 0;
  await Promise.all(
    subs.map(async (s) => {
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, JSON.stringify(payload), { TTL: 86_400 });
        sent++;
      } catch (err) {
        const status = (err as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) await prisma.pushSubscription.delete({ where: { id: s.id } }).catch(() => {});
        else logger.warn({ status }, "Push delivery failed");
      }
    }),
  );
  return sent;
}

// ───────── New-chapter fan-out ─────────

export interface NewChapter {
  id: string;
  number: number;
  title: string | null;
  releasedAt: Date | null;
  externalUrl: string | null;
  publisher: string | null;
  readable: boolean;
}

/**
 * Tell followers about new chapters of one series: a Notification row each (unique per member and
 * chapter, so re-runs never duplicate), a live event to their open browsers, and a push to their devices.
 */
export async function notifyNewChapters(series: { id: string; slug: string; title: string; coverUrl: string | null }, chapters: NewChapter[]) {
  if (!chapters.length) return 0;
  const followers = await prisma.seriesFollow.findMany({ where: { seriesId: series.id }, select: { userId: true, notifyPush: true } });
  if (!followers.length) return 0;
  const rows = followers.flatMap((f) =>
    chapters.map((c) => ({
      userId: f.userId,
      type: "NEW_CHAPTER" as const,
      seriesId: series.id,
      chapterId: c.id,
      data: { seriesTitle: series.title, chapter: c.number, chapterTitle: c.title },
    })),
  );
  const { count } = await prisma.notification.createMany({ data: rows, skipDuplicates: true });
  const latest = chapters.reduce((a, b) => (b.number > a.number ? b : a));
  const event = { series: { slug: series.slug, title: series.title, coverUrl: series.coverUrl }, chapter: latest.number, count: chapters.length };
  sendToUsers(followers.map((f) => f.userId), "notification", event);
  await pushToUsers(
    followers.filter((f) => f.notifyPush).map((f) => f.userId),
    {
      title: series.title,
      body: chapters.length > 1 ? `${chapters.length} new chapters, up to chapter ${latest.number}` : `Chapter ${latest.number} is out${latest.title ? `: ${latest.title}` : ""}`,
      url: `/manga/${series.slug}/chapter/${latest.number}`,
      tag: `series-${series.id}`,
    },
  );
  return count;
}

// ───────── Inbox ─────────

export async function listNotifications(userId: string, page: number, pageSize: number, unreadOnly = false) {
  const where = { userId, ...(unreadOnly ? { readAt: null } : {}) };
  const [total, rows] = await Promise.all([
    prisma.notification.count({ where }),
    prisma.notification.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: {
        series: { select: { id: true, slug: true, title: true, coverUrl: true, type: true } },
        chapter: { select: { number: true, title: true, externalUrl: true, publisher: true, readable: true } },
      },
    }),
  ]);
  return pageResult(
    rows.map((n) => ({
      id: n.id,
      type: n.type,
      readAt: n.readAt?.toISOString() ?? null,
      createdAt: n.createdAt.toISOString(),
      data: n.data,
      series: n.series,
      chapter: n.chapter,
    })),
    total,
    page,
    pageSize,
  );
}

export const unreadCount = (userId: string) => prisma.notification.count({ where: { userId, readAt: null } });

export async function markRead(userId: string, id: string) {
  const r = await prisma.notification.updateMany({ where: { id, userId, readAt: null }, data: { readAt: new Date() } });
  if (!r.count && !(await prisma.notification.findFirst({ where: { id, userId }, select: { id: true } }))) throw notFound("Notification");
}

export async function markAllRead(userId: string) {
  const r = await prisma.notification.updateMany({ where: { userId, readAt: null }, data: { readAt: new Date() } });
  return r.count;
}
