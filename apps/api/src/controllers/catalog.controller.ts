import type { Request, Response } from "express";
import {
  CONTENT_TYPES,
  RANKING_EXPLANATIONS,
  catalogQuerySchema,
  rankingQuerySchema,
  reviewCreateSchema,
  reviewQuerySchema,
  seasonalQuerySchema,
  suggestQuerySchema,
} from "@mangaverse/shared";
import { z } from "zod";
import { parse } from "../middleware/validate.js";
import * as catalog from "../services/catalog.service.js";
import * as history from "../services/history.service.js";
import { getRanking, getSeasonal } from "../services/rankings.service.js";
import { getRelated } from "../services/recommendation/recommendation.service.js";
import * as reviews from "../services/reviews.service.js";
import { getProviders } from "../providers/registry.js";

export async function list(req: Request, res: Response) {
  res.json(await catalog.listSeries(parse(catalogQuerySchema, req.query)));
}

/** Same as list, but records the query in the signed-in user's search history (if enabled). */
export async function search(req: Request, res: Response) {
  const q = parse(catalogQuerySchema, req.query);
  const result = await catalog.listSeries(q);
  if (req.user && q.q) await history.recordSearch(req.user.id, q.q).catch(() => {});
  res.json(result);
}

export async function suggest(req: Request, res: Response) {
  const { q, limit } = parse(suggestQuerySchema, req.query);
  res.json({ items: await catalog.suggest(q, limit) });
}

export async function detail(req: Request, res: Response) {
  const series = await catalog.getSeriesDetail(String(req.params.id));
  if (req.user) series.viewer = await catalog.getViewerState(req.user.id, series.id);
  res.json(series);
}

export async function related(req: Request, res: Response) {
  const { id } = await catalog.findSeriesId(String(req.params.id));
  const limit = parse(z.object({ limit: z.coerce.number().int().min(1).max(24).default(12) }), req.query).limit;
  res.json({ items: await getRelated(id, limit, req.user?.id) });
}

export async function seriesReviews(req: Request, res: Response) {
  const { id } = await catalog.findSeriesId(String(req.params.id));
  res.json(await reviews.listSeriesReviews(id, parse(reviewQuerySchema, req.query), req.user?.id));
}

export async function createReview(req: Request, res: Response) {
  const { id } = await catalog.findSeriesId(String(req.params.id));
  const body = parse(reviewCreateSchema, req.body);
  res.status(201).json(await reviews.createReview(req.user!.id, id, body));
}

export async function rate(req: Request, res: Response) {
  const { id } = await catalog.findSeriesId(String(req.params.id));
  const { score } = parse(z.object({ score: z.number().int().min(1).max(10) }), req.body);
  const stats = await reviews.rate(req.user!.id, id, score);
  res.json({ score, community: { ratingAvg: stats.ratingAvg, ratingCount: stats.ratingCount } });
}

export async function unrate(req: Request, res: Response) {
  const { id } = await catalog.findSeriesId(String(req.params.id));
  const stats = await reviews.unrate(req.user!.id, id);
  res.json({ score: null, community: { ratingAvg: stats.ratingAvg, ratingCount: stats.ratingCount } });
}

export async function genres(_req: Request, res: Response) {
  res.json({ items: await catalog.listGenres() });
}

export async function tags(_req: Request, res: Response) {
  res.json({ items: await catalog.listTags() });
}

export async function rankings(req: Request, res: Response) {
  const q = parse(rankingQuerySchema, req.query);
  res.json(await getRanking(q.kind, { type: q.type, limit: q.limit }));
}

export async function rankingExplanations(_req: Request, res: Response) {
  res.json(RANKING_EXPLANATIONS);
}

export async function featured(_req: Request, res: Response) {
  res.json({ items: await catalog.getFeatured() });
}

export async function seasonal(req: Request, res: Response) {
  res.json(await getSeasonal(parse(seasonalQuerySchema, req.query)));
}

const latestSchema = z.object({
  limit: z.coerce.number().int().min(1).max(60).default(20),
  type: z.enum(CONTENT_TYPES).optional(),
});

export async function latest(req: Request, res: Response) {
  const q = parse(latestSchema, req.query);
  res.json(await catalog.getLatest(q.limit, q.type));
}

export async function newReleases(req: Request, res: Response) {
  const q = parse(
    latestSchema.extend({ by: z.enum(["published", "added"]).default("published"), year: z.coerce.number().int().min(1900).max(2100).optional() }),
    req.query,
  );
  res.json({ by: q.by, items: await catalog.getNewReleases(q.by, q.limit, q.type, q.year) });
}

export async function recentReviews(req: Request, res: Response) {
  const { limit } = parse(z.object({ limit: z.coerce.number().int().min(1).max(50).default(10) }), req.query);
  res.json({ items: await reviews.listRecentReviews(limit, req.user?.id) });
}

export async function meta(_req: Request, res: Response) {
  const providers = [...getProviders().values()].map((p) => ({ name: p.name, attribution: p.attribution }));
  res.json({ providers, rankingExplanations: RANKING_EXPLANATIONS });
}
