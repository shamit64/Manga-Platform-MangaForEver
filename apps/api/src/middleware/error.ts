import type { NextFunction, Request, Response } from "express";
import { AppError } from "../lib/errors.js";
import { logger } from "../lib/logger.js";

export function notFoundHandler(req: Request, _res: Response, next: NextFunction) {
  next(new AppError(404, "NOT_FOUND", `No route for ${req.method} ${req.path}`));
}

// Express recognises error handlers by arity, so all four params are required.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction) {
  if (err instanceof AppError) {
    return res.status(err.status).json({ error: { code: err.code, message: err.message, details: err.details } });
  }
  const e = err as { code?: string; type?: string; status?: number; meta?: unknown };
  // Prisma known errors
  if (e?.code === "P2002") {
    return res.status(409).json({ error: { code: "CONFLICT", message: "That already exists." } });
  }
  if (e?.code === "P2025") {
    return res.status(404).json({ error: { code: "NOT_FOUND", message: "Resource not found." } });
  }
  if (e?.code === "P2003") {
    return res.status(400).json({ error: { code: "BAD_REFERENCE", message: "A referenced record does not exist." } });
  }
  if (e?.type === "entity.parse.failed") {
    return res.status(400).json({ error: { code: "BAD_JSON", message: "Request body is not valid JSON." } });
  }
  if (e?.type === "entity.too.large") {
    return res.status(413).json({ error: { code: "TOO_LARGE", message: "Request body is too large." } });
  }
  logger.error({ err, path: req.path }, "Unhandled error");
  // Never leak stack traces or internal messages.
  res.status(500).json({ error: { code: "INTERNAL", message: "Something went wrong on our side. Try again shortly." } });
}
