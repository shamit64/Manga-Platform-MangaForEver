import type { UpdateProfileInput } from "@mangaforever/shared";
import { badRequest, notFound } from "../lib/errors.js";
import { prisma } from "../lib/prisma.js";
import { getMe } from "./auth.service.js";
import { libraryStats, listLibrary } from "./library.service.js";
import { listUserReviews } from "./reviews.service.js";
import { cardInclude, toCard } from "./series-mapper.js";

async function userByUsername(username: string) {
  const user = await prisma.user.findFirst({
    where: { username: { equals: username, mode: "insensitive" }, isSuspended: false },
    include: { preference: true },
  });
  if (!user) throw notFound("User");
  const pref = user.preference ?? (await prisma.userPreference.create({ data: { userId: user.id } }));
  return { user, pref };
}

/**
 * Public profile. Respects every privacy switch: private libraries, private favorites, hidden stats,
 * hidden "recently completed", per-entry private flags. Private notes and history are never included.
 */
export async function getPublicProfile(username: string, viewerId?: string) {
  const { user, pref } = await userByUsername(username);
  const isOwner = viewerId === user.id;
  const libraryPublic = isOwner || pref.libraryVisibility === "PUBLIC";
  const favoritesPublic = isOwner || pref.favoritesVisibility === "PUBLIC";

  const [stats, favorites, completed, reviews, followers, following, viewerFollows] = await Promise.all([
    pref.showStats || isOwner ? libraryStats(user.id, { publicOnly: !isOwner }) : null,
    favoritesPublic
      ? prisma.favorite.findMany({
          where: { userId: user.id, series: { isArchived: false } },
          orderBy: { createdAt: "desc" },
          take: 12,
          include: { series: { include: cardInclude } },
        })
      : null,
    libraryPublic && (pref.showRecentlyCompleted || isOwner)
      ? prisma.libraryEntry.findMany({
          where: { userId: user.id, status: "COMPLETED", ...(isOwner ? {} : { isPrivate: false }) },
          orderBy: [{ completedAt: { sort: "desc", nulls: "last" } }, { updatedAt: "desc" }],
          take: 8,
          include: { series: { include: cardInclude } },
        })
      : null,
    listUserReviews(user.id, viewerId),
    prisma.follow.count({ where: { followingId: user.id } }),
    prisma.follow.count({ where: { followerId: user.id } }),
    viewerId && !isOwner
      ? prisma.follow.findUnique({ where: { followerId_followingId: { followerId: viewerId, followingId: user.id } } })
      : null,
  ]);

  return {
    user: {
      id: user.id,
      username: user.username,
      displayName: user.displayName,
      avatarUrl: user.avatarUrl,
      bio: user.bio,
      role: user.role,
      isDemo: user.isDemo,
      joinedAt: user.createdAt.toISOString(),
    },
    favoriteGenres: pref.favoriteGenres,
    visibility: { library: libraryPublic, favorites: favoritesPublic, stats: !!stats },
    stats: stats ? { ...stats, recentActivity: undefined } : null,
    favorites: favorites ? favorites.map((f) => toCard(f.series)) : null,
    recentlyCompleted: completed ? completed.map((c) => ({ completedAt: c.completedAt?.toISOString().slice(0, 10) ?? null, series: toCard(c.series) })) : null,
    reviews,
    social: { followers, following, viewerFollows: !!viewerFollows, isOwner },
  };
}

export async function getPublicLibrary(
  username: string,
  q: { status?: string; type?: string; q?: string; sort: string; page: number; pageSize: number },
  viewerId?: string,
) {
  const { user, pref } = await userByUsername(username);
  const isOwner = viewerId === user.id;
  if (!isOwner && pref.libraryVisibility !== "PUBLIC") {
    return { private: true as const, items: [], total: 0, page: 1, pageSize: q.pageSize, totalPages: 1 };
  }
  return { private: false as const, ...(await listLibrary(user.id, q, { publicOnly: !isOwner })) };
}

export async function updateMe(userId: string, input: UpdateProfileInput) {
  const { preferences, ...profile } = input;
  if (preferences?.favoriteGenres?.length) {
    const known = await prisma.genre.findMany({ where: { slug: { in: preferences.favoriteGenres } }, select: { slug: true } });
    if (known.length !== new Set(preferences.favoriteGenres).size) throw badRequest("Unknown genre in favorite genres.");
  }
  await prisma.$transaction([
    prisma.user.update({ where: { id: userId }, data: profile }),
    prisma.userPreference.upsert({ where: { userId }, update: preferences ?? {}, create: { userId, ...(preferences ?? {}) } }),
  ]);
  return getMe(userId);
}

export async function follow(followerId: string, username: string) {
  const { user } = await userByUsername(username);
  if (user.id === followerId) throw badRequest("You can't follow yourself.");
  await prisma.follow.upsert({
    where: { followerId_followingId: { followerId, followingId: user.id } },
    update: {},
    create: { followerId, followingId: user.id },
  });
  return { following: true };
}

export async function unfollow(followerId: string, username: string) {
  const { user } = await userByUsername(username);
  await prisma.follow.deleteMany({ where: { followerId, followingId: user.id } });
  return { following: false };
}

/** Recent public activity of people the user follows (library adds, completions, reviews). */
export async function activityFeed(userId: string, limit = 30) {
  const follows = await prisma.follow.findMany({ where: { followerId: userId }, select: { followingId: true } });
  const ids = follows.map((f) => f.followingId);
  if (!ids.length) return [];
  const prefs = await prisma.userPreference.findMany({ where: { userId: { in: ids } } });
  const publicIds = prefs.filter((p) => p.libraryVisibility === "PUBLIC").map((p) => p.userId);
  const rows = await prisma.readingActivity.findMany({
    where: { userId: { in: publicIds }, type: { in: ["ADDED_TO_LIBRARY", "STATUS_CHANGED", "REVIEWED", "RATED"] }, series: { isArchived: false } },
    orderBy: { createdAt: "desc" },
    take: limit * 2,
    include: {
      user: { select: { username: true, displayName: true, avatarUrl: true } },
      series: { select: { id: true, slug: true, title: true, coverUrl: true, type: true } },
    },
  });
  // Hide activity on entries the owner marked private.
  const privateEntries = await prisma.libraryEntry.findMany({
    where: { userId: { in: publicIds }, isPrivate: true },
    select: { userId: true, seriesId: true },
  });
  const hidden = new Set(privateEntries.map((p) => `${p.userId}:${p.seriesId}`));
  return rows
    .filter((r) => !hidden.has(`${r.userId}:${r.seriesId}`))
    .slice(0, limit)
    .map((r) => ({ id: r.id, type: r.type, data: r.data, createdAt: r.createdAt.toISOString(), user: r.user, series: r.series }));
}
