import bcrypt from "bcryptjs";
import type { LoginInput, Me, Preferences, RegisterInput } from "@mangaforever/shared";
import { env } from "../config/env.js";
import { AppError, badRequest, conflict, unauthorized } from "../lib/errors.js";
import { logger } from "../lib/logger.js";
import { prisma } from "../lib/prisma.js";
import { randomToken, sha256 } from "../lib/util.js";
import { brandedHtml, sendMail } from "./mailer.js";

const BCRYPT_COST = env.isTest ? 4 : 12;
const RESET_TTL_MS = 60 * 60_000;
const VERIFY_TTL_MS = 24 * 60 * 60_000;
const appUrl = () => env.APP_URL.replace(/\/$/, "");

/** ADMIN_EMAILS always get the Admin role, so the site owner never has to edit the database. */
export function configuredRole(email: string) {
  return env.adminEmails.includes(email.toLowerCase()) ? ("ADMIN" as const) : null;
}

async function applyConfiguredRole<T extends { id: string; email: string; role: string }>(user: T): Promise<T> {
  if (configuredRole(user.email) && user.role !== "ADMIN") {
    await prisma.user.update({ where: { id: user.id }, data: { role: "ADMIN" } });
    logger.info({ userId: user.id }, "Promoted to Admin from ADMIN_EMAILS");
    return { ...user, role: "ADMIN" };
  }
  return user;
}

/** Start-up sync: promote any existing accounts listed in ADMIN_EMAILS. */
export async function syncConfiguredAdmins() {
  if (!env.adminEmails.length) return 0;
  const r = await prisma.user.updateMany({ where: { email: { in: env.adminEmails }, role: { not: "ADMIN" } }, data: { role: "ADMIN" } });
  return r.count;
}
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
  const user = await prisma.user.create({
    data: {
      email: input.email,
      username: input.username,
      passwordHash: await hashPassword(input.password),
      role: configuredRole(input.email) ?? "USER",
      emailVerifiedAt: env.requireEmailVerification ? null : new Date(),
      preference: { create: {} },
    },
  });
  if (env.requireEmailVerification) await sendVerificationEmail(user);
  return user;
}

/** Issue a fresh single-use confirmation link (older unused links stop working). */
export async function sendVerificationEmail(user: { id: string; email: string; username: string }) {
  const token = randomToken(32);
  await prisma.emailVerificationToken.deleteMany({ where: { userId: user.id, usedAt: null } });
  await prisma.emailVerificationToken.create({
    data: { tokenHash: sha256(token), userId: user.id, expiresAt: new Date(Date.now() + VERIFY_TTL_MS) },
  });
  const link = `${appUrl()}/verify-email?token=${encodeURIComponent(token)}`;
  const text = `Welcome to MangaForEver, ${user.username}!\n\nConfirm your email address to finish creating your account. This link works for 24 hours:\n\n${link}\n\nIf you didn't sign up, you can ignore this email.`;
  await sendMail({ to: user.email, subject: "Confirm your MangaForEver account", text, html: brandedHtml(text, { label: "Confirm my email", url: link }) });
  return { token }; // returned for tests only; controllers never expose it
}

/** Resend a confirmation link. Silent when the account is missing or already confirmed (no enumeration). */
export async function resendVerification(email: string) {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || user.emailVerifiedAt) return;
  return sendVerificationEmail(user);
}

/** Consume a confirmation link: marks the email verified and returns the user so the caller can sign them in. */
export async function verifyEmail(token: string) {
  const row = await prisma.emailVerificationToken.findUnique({ where: { tokenHash: sha256(token) }, include: { user: true } });
  if (!row || row.usedAt || row.expiresAt < new Date()) {
    throw badRequest("This confirmation link is invalid or has expired. Request a new one.");
  }
  if (row.user.isSuspended) throw new AppError(403, "SUSPENDED", "This account is suspended. Contact support.");
  await prisma.$transaction([
    prisma.user.update({ where: { id: row.userId }, data: { emailVerifiedAt: row.user.emailVerifiedAt ?? new Date() } }),
    prisma.emailVerificationToken.update({ where: { id: row.id }, data: { usedAt: new Date() } }),
  ]);
  return applyConfiguredRole(row.user);
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
  if (env.requireEmailVerification && !user.emailVerifiedAt) {
    throw new AppError(403, "EMAIL_NOT_VERIFIED", "Confirm your email first. We can send you a new link.", { email: user.email });
  }
  return applyConfiguredRole(user);
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
  const link = `${appUrl()}/reset-password?token=${encodeURIComponent(token)}`;
  const text = `Someone asked to reset the password for ${user.username}. Use this link within an hour:\n\n${link}\n\nIf you didn't ask for this, you can ignore this email.`;
  await sendMail({ to: user.email, subject: "Reset your MangaForEver password", text, html: brandedHtml(text, { label: "Choose a new password", url: link }) });
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
    emailVerified: !!user.emailVerifiedAt,
    createdAt: user.createdAt.toISOString(),
    preferences: {
      theme: pref.theme as Preferences["theme"],
      favoriteGenres: pref.favoriteGenres,
      favoriteTypes: pref.favoriteTypes,
      readerMode: (pref.readerMode as Preferences["readerMode"]) ?? null,
      emailDigest: pref.emailDigest,
      libraryVisibility: pref.libraryVisibility,
      favoritesVisibility: pref.favoritesVisibility,
      showStats: pref.showStats,
      showRecentlyCompleted: pref.showRecentlyCompleted,
      trackBrowsingHistory: pref.trackBrowsingHistory,
      trackSearchHistory: pref.trackSearchHistory,
    },
  };
}
