import type { NextFunction, Request, Response } from "express";
import { rateLimit } from "express-rate-limit";
import { env } from "../config/env.js";
import { AppError } from "../lib/errors.js";

const handler = (_req: Request, _res: Response, next: NextFunction) =>
  next(new AppError(429, "RATE_LIMITED", "Too many requests. Wait a moment and try again."));

function limiter(windowMs: number, limit: number, keyByUser = false) {
  return rateLimit({
    windowMs,
    limit,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    skip: () => env.DISABLE_RATE_LIMIT === true,
    handler,
    ...(keyByUser
      ? { keyGenerator: (req: Request) => req.user?.id ?? req.ip ?? "anon", validate: { keyGeneratorIpFallback: false } }
      : {}),
  });
}

export const loginLimiter = limiter(15 * 60_000, 10);
export const registerLimiter = limiter(60 * 60_000, 10);
export const passwordResetLimiter = limiter(60 * 60_000, 5);
export const searchLimiter = limiter(60_000, 120);
export const reviewLimiter = limiter(60 * 60_000, 20, true);
export const writeLimiter = limiter(60_000, 120, true);
export const globalLimiter = limiter(60_000, 600);

/**
 * CSRF defence for cookie-authenticated writes: state-changing requests must come from an
 * allowed Origin (or same-origin via the web app's proxy) and carry a JSON body or no body.
 * Combined with SameSite=Lax cookies this blocks cross-site form posts.
 */
export function originCheck(req: Request, _res: Response, next: NextFunction) {
  if (["GET", "HEAD", "OPTIONS"].includes(req.method)) return next();
  const origin = req.get("origin");
  if (origin && !env.allowedOrigins.includes(origin)) {
    return next(new AppError(403, "BAD_ORIGIN", "Request origin is not allowed."));
  }
  const len = Number(req.get("content-length") ?? 0);
  if (len > 0 && !req.is("application/json")) {
    return next(new AppError(415, "UNSUPPORTED_MEDIA_TYPE", "Send request bodies as application/json."));
  }
  next();
}
