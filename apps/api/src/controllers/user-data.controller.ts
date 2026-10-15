import type { Request, Response } from "express";
import {
  favoriteCreateSchema,
  favoritesQuerySchema,
  libraryCreateSchema,
  libraryQuerySchema,
  libraryUpdateSchema,
  paginationSchema,
  reportCreateSchema,
  reviewUpdateSchema,
  updateProfileSchema,
} from "@mangaforever/shared";
import { z } from "zod";
import { parse } from "../middleware/validate.js";
import * as favorites from "../services/favorites.service.js";
import * as history from "../services/history.service.js";
import * as library from "../services/library.service.js";
import * as profile from "../services/profile.service.js";
import * as recs from "../services/recommendation/recommendation.service.js";
import * as reviews from "../services/reviews.service.js";

const uid = (req: Request) => req.user!.id;
const param = (req: Request, k: string) => String(req.params[k]);

// ───────── Library ─────────
export const libraryList = async (req: Request, res: Response) => res.json(await library.listLibrary(uid(req), parse(libraryQuerySchema, req.query)));
export const libraryStats = async (req: Request, res: Response) => res.json(await library.libraryStats(uid(req)));
export const libraryContinue = async (req: Request, res: Response) => res.json({ items: await library.continueReading(uid(req)) });
export const libraryAdd = async (req: Request, res: Response) => res.status(201).json(await library.addToLibrary(uid(req), parse(libraryCreateSchema, req.body)));
export const libraryUpdate = async (req: Request, res: Response) => res.json(await library.updateEntry(uid(req), param(req, "id"), parse(libraryUpdateSchema, req.body)));
export async function libraryRemove(req: Request, res: Response) {
  await library.removeEntry(uid(req), param(req, "id"));
  res.status(204).end();
}

// ───────── Favorites ─────────
export const favoritesList = async (req: Request, res: Response) => res.json(await favorites.listFavorites(uid(req), parse(favoritesQuerySchema, req.query)));
export const favoritesAdd = async (req: Request, res: Response) => res.status(201).json(await favorites.addFavorite(uid(req), parse(favoriteCreateSchema, req.body).seriesId));
export async function favoritesRemove(req: Request, res: Response) {
  await favorites.removeFavorite(uid(req), param(req, "mangaId"));
  res.status(204).end();
}

// ───────── Reviews (by id) ─────────
export const reviewUpdate = async (req: Request, res: Response) => res.json(await reviews.updateReview(uid(req), param(req, "id"), parse(reviewUpdateSchema, req.body)));
export async function reviewDelete(req: Request, res: Response) {
  await reviews.deleteReview(req.user!, param(req, "id"));
  res.status(204).end();
}
export const reviewHelpful = async (req: Request, res: Response) => res.json(await reviews.toggleHelpful(uid(req), param(req, "id")));
export async function reviewReport(req: Request, res: Response) {
  const body = parse(reportCreateSchema, req.body);
  res.status(201).json(await reviews.reportReview(uid(req), param(req, "id"), body.reason, body.details));
}

// ───────── History ─────────
export const historyList = async (req: Request, res: Response) => {
  const q = parse(paginationSchema, req.query);
  res.json(await history.listHistory(uid(req), q.page, q.pageSize));
};
export const historyRecent = async (req: Request, res: Response) => res.json({ items: await history.recentlyViewed(uid(req)) });
export const historyView = async (req: Request, res: Response) =>
  res.json(await history.recordView(uid(req), parse(z.object({ seriesId: z.string().min(1).max(40) }), req.body).seriesId));
export async function historyRemove(req: Request, res: Response) {
  await history.removeHistoryEntry(uid(req), param(req, "id"));
  res.status(204).end();
}
export async function historyClear(req: Request, res: Response) {
  const { scope } = parse(z.object({ scope: z.enum(["browsing", "activity", "all"]).default("browsing") }), req.query);
  res.json(await history.clearHistory(uid(req), scope));
}
export const searchesList = async (req: Request, res: Response) => res.json({ items: await history.listSearches(uid(req)) });
export async function searchesRemove(req: Request, res: Response) {
  await history.deleteSearch(uid(req), param(req, "id"));
  res.status(204).end();
}
export async function searchesClear(req: Request, res: Response) {
  await history.clearSearches(uid(req));
  res.status(204).end();
}

// ───────── Recommendations ─────────
export async function recommendations(req: Request, res: Response) {
  const q = parse(z.object({ refresh: z.string().max(40).optional(), limit: z.coerce.number().int().min(4).max(30).optional() }), req.query);
  res.json(await recs.getRecommendations(req.user?.id, q));
}
export async function dismissRec(req: Request, res: Response) {
  await recs.dismiss(uid(req), parse(z.object({ seriesId: z.string().min(1).max(40) }), req.body).seriesId);
  res.status(204).end();
}
export const restoreRecs = async (req: Request, res: Response) => res.json(await recs.undismissAll(uid(req)));

// ───────── Profiles ─────────
export const profileGet = async (req: Request, res: Response) => res.json(await profile.getPublicProfile(param(req, "username"), req.user?.id));
export const profileLibrary = async (req: Request, res: Response) =>
  res.json(await profile.getPublicLibrary(param(req, "username"), parse(libraryQuerySchema, req.query), req.user?.id));
export const profileUpdate = async (req: Request, res: Response) => res.json({ user: await profile.updateMe(uid(req), parse(updateProfileSchema, req.body)) });
export const follow = async (req: Request, res: Response) => res.json(await profile.follow(uid(req), param(req, "username")));
export const unfollow = async (req: Request, res: Response) => res.json(await profile.unfollow(uid(req), param(req, "username")));
export const feed = async (req: Request, res: Response) => res.json({ items: await profile.activityFeed(uid(req)) });
