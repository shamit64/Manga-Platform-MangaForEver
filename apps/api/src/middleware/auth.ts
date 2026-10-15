import type { NextFunction, Request, Response } from "express";
import type { Role } from "@mangaverse/shared";
import { env } from "../config/env.js";
import { forbidden, unauthorized } from "../lib/errors.js";
import { prisma } from "../lib/prisma.js";
import { sha256 } from "../lib/util.js";

export const SESSION_COOKIE = "mv_session";

export interface AuthUser {
  id: string;
  username: string;
  email: string;
  role: Role;
  sessionId: string;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

/** Resolve the session cookie (if any) into req.user. Never rejects the request. */
export async function loadSession(req: Request, _res: Response, next: NextFunction) {
  const token = req.cookies?.[SESSION_COOKIE];
  if (typeof token !== "string" || token.length < 20 || token.length > 200) return next();
  try {
    const session = await prisma.session.findUnique({
      where: { tokenHash: sha256(token) },
      include: { user: { select: { id: true, username: true, email: true, role: true, isSuspended: true } } },
    });
    if (!session || session.expiresAt < new Date() || session.user.isSuspended) return next();
    req.user = { ...session.user, sessionId: session.id };
    // Sliding refresh at most once an hour to avoid a write per request.
    if (Date.now() - session.lastUsedAt.getTime() > 3_600_000) {
      const expiresAt = new Date(Date.now() + env.SESSION_TTL_DAYS * 86_400_000);
      prisma.session.update({ where: { id: session.id }, data: { lastUsedAt: new Date(), expiresAt } }).catch(() => {});
    }
  } catch {
    // Treat lookup failures as signed out rather than failing public pages.
  }
  next();
}

export function requireAuth(req: Request, _res: Response, next: NextFunction) {
  if (!req.user) return next(unauthorized());
  next();
}

const RANK: Record<Role, number> = { USER: 0, MODERATOR: 1, ADMIN: 2 };

/** Require at least the given role (ADMIN ⊃ MODERATOR ⊃ USER). Enforced server-side for every admin route. */
export function requireRole(min: Role) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) return next(unauthorized());
    if (RANK[req.user.role] < RANK[min]) return next(forbidden());
    next();
  };
}

export function cookieOptions(maxAgeMs?: number) {
  return {
    httpOnly: true,
    secure: env.cookieSecure,
    sameSite: "lax" as const,
    path: "/",
    domain: env.COOKIE_DOMAIN || undefined,
    ...(maxAgeMs !== undefined ? { maxAge: maxAgeMs } : {}),
  };
}
