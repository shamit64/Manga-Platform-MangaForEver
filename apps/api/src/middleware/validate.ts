import type { NextFunction, Request, Response } from "express";
import type { z } from "zod";
import { AppError } from "../lib/errors.js";

function fail(error: z.ZodError) {
  return new AppError(
    422,
    "VALIDATION_ERROR",
    "Some fields need attention.",
    error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
  );
}

/** Parse and replace req.body with the schema output. */
export const validateBody =
  <T extends z.ZodTypeAny>(schema: T) =>
  (req: Request, _res: Response, next: NextFunction) => {
    const r = schema.safeParse(req.body ?? {});
    if (!r.success) return next(fail(r.error));
    req.body = r.data;
    next();
  };

/** Parse req.query into res.locals.query (Express 5 makes req.query read-only). */
export const validateQuery =
  <T extends z.ZodTypeAny>(schema: T) =>
  (req: Request, res: Response, next: NextFunction) => {
    const r = schema.safeParse(req.query);
    if (!r.success) return next(fail(r.error));
    res.locals.query = r.data;
    next();
  };

export function parse<T extends z.ZodTypeAny>(schema: T, data: unknown): z.infer<T> {
  const r = schema.safeParse(data);
  if (!r.success) throw fail(r.error);
  return r.data;
}
