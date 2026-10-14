import bcrypt from "bcryptjs";
import type { LoginInput, Me, Preferences, RegisterInput } from "@mangaverse/shared";
import { env } from "../config/env.js";
import { AppError, badRequest, conflict, unauthorized } from "../lib/errors.js";
import { logger } from "../lib/logger.js";
import { prisma } from "../lib/prisma.js";
import { randomToken, sha256 } from "../lib/util.js";
import { sendMail } from "./mailer.js";

const BCRYPT_COST = env.isTest ? 4 : 12;
const RESET_TTL_MS = 60 * 60_000;
// A real hash used to equalise timing when the account doesn't exist.
const DUMMY_HASH = bcrypt.hashSync("timing-equaliser-password", BCRYPT_COST);

export async function hashPassword(pw: string) {
  return bcrypt.hash(pw, BCRYPT_COST);
}

export async function register(input: RegisterInput) {
  const [byEmail, byUsername] = await Promise.all([
    prisma.user.findUnique({ where: { email: input.email }, select: { id: true } }),
    prisma.user.findFirst({ where: { username: { equals: input.username, mode: "insensitive" } }, select: { id: true } }),
  ]);
  if (byEmail) throw conflict("An account with that email already exists.");
  if (byUsername) throw conflict("That username is taken.");
  return prisma.user.create({
    data: {
      email: input.email,
      username: input.username,
      passwordHash: await hashPassword(input.password),
      preference: { create: {} },
    },
  });
}

export async function verifyCredentials(input: LoginInput) {
  const id = input.identifier.toLowerCase();
  const user = await prisma.user.findFirst({
    where: id.includes("@") ? { email: id } : { username: { equals: input.identifier, mode: "insensitive" } },
  });
  const ok = await bcrypt.compare(input.password, user?.passwordHash ?? DUMMY_HASH);
  // Same message whether the account exists or not.
  if (!user || !ok) throw unauthorized("Email/username or password is incorrect.");
  if (user.isSuspended) throw new AppError(403, "SUSPENDED", "This account is suspended. Contact support.");
  return user;
}

export async function createSession(userId: string, meta: { userAgent?: string; ip?: string }) {
  const token = randomToken(32);
  const expiresAt = new Date(Date.now() + env.SESSION_TTL_DAYS * 86_400_000);
  await prisma.session.create({
    data: { tokenHash: sha256(token), userId, expiresAt, userAgent: meta.userAgent?.slice(0, 300), ipAddress: meta.ip },
  });
  await prisma.user.update({ where: { id: userId }, data: { lastLoginAt: new Date() } });
  // Opportunistic cleanup of this user's expired sessions.
  await prisma.session.deleteMany({ where: { userId, expiresAt: { lt: new Date() } } });
  return { token, expiresAt };
}

export async function destroySession(sessionId: string) {
  await prisma.session.deleteMany({ where: { id: sessionId } });
}

export async function requestPasswordReset(email: string) {
  const user = await prisma.user.findUnique({ where: { email } });
  // Always succeed from the caller's point of view so accounts can't be enumerated.
  if (!user) return;
  const token = randomToken(32);
  await prisma.passwordResetToken.deleteMany({ where: { userId: user.id, usedAt: null } });
  await prisma.passwordResetToken.create({
    data: { tokenHash: sha256(token), userId: user.id, expiresAt: new Date(Date.now() + RESET_TTL_MS) },
  });
  const link = `${env.APP_URL.replace(/\/$/, "")}/reset-password?token=${encodeURIComponent(token)}`;
  await sendMail({
    to: user.email,
    subject: "Reset your MangaVerse password",
    text: `Someone asked to reset the password for ${user.username}. Use this link within an hour:\n\n${link}\n\nIf you didn't ask for this, you can ignore this email.`,
  });
  return { token }; // returned for tests only; controllers never expose it
}

export async function resetPassword(token: string, password: string) {
  const row = await prisma.passwordResetToken.findUnique({ where: { tokenHash: sha256(token) } });
  if (!row || row.usedAt || row.expiresAt < new Date()) {
    throw badRequest("This reset link is invalid or has expired. Request a new one.");
  }
  await prisma.$transaction([
    prisma.user.update({ where: { id: row.userId }, data: { passwordHash: await hashPassword(password) } }),
    prisma.passwordResetToken.update({ where: { id: row.id }, data: { usedAt: new Date() } }),
    // Sign out everywhere after a reset.
    prisma.session.deleteMany({ where: { userId: row.userId } }),
  ]);
  logger.info({ userId: row.userId }, "Password reset completed");
}

export async function changePassword(userId: string, current: string, next: string, keepSessionId: string) {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  if (!(await bcrypt.compare(current, user.passwordHash))) throw badRequest("Current password is incorrect.");
  await prisma.$transaction([
    prisma.user.update({ where: { id: userId }, data: { passwordHash: await hashPassword(next) } }),
    prisma.session.deleteMany({ where: { userId, id: { not: keepSessionId } } }),
  ]);
}

export async function getMe(userId: string): Promise<Me> {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId }, include: { preference: true } });
  const pref = user.preference ?? (await prisma.userPreference.create({ data: { userId } }));
  return {
    id: user.id,
    username: user.username,
    email: user.email,
    displayName: user.displayName,
    avatarUrl: user.avatarUrl,
    bio: user.bio,
    role: user.role,
    isDemo: user.isDemo,
    createdAt: user.createdAt.toISOString(),
    preferences: {
      theme: pref.theme as Preferences["theme"],
      favoriteGenres: pref.favoriteGenres,
      libraryVisibility: pref.libraryVisibility,
      favoritesVisibility: pref.favoritesVisibility,
      showStats: pref.showStats,
      showRecentlyCompleted: pref.showRecentlyCompleted,
      trackBrowsingHistory: pref.trackBrowsingHistory,
      trackSearchHistory: pref.trackSearchHistory,
    },
  };
}
