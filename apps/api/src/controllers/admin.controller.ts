import type { Request, Response } from "express";
import {
  adminSeriesSchema,
  adminSeriesUpdateSchema,
  collectionSchema,
  featuredSchema,
  importSchema,
  mergeSchema,
  paginationSchema,
  reportResolveSchema,
} from "@mangaforever/shared";
import { z } from "zod";
import { parse } from "../middleware/validate.js";
import * as admin from "../services/admin.service.js";
import { listAudit } from "../services/audit.service.js";
import * as reviews from "../services/reviews.service.js";
import * as importer from "../providers/import.service.js";

const actor = (req: Request) => req.user!.id;
const param = (req: Request, k: string) => String(req.params[k]);

export const statistics = async (_req: Request, res: Response) => res.json(await admin.statistics());

export async function seriesList(req: Request, res: Response) {
  const q = parse(
    paginationSchema.extend({ q: z.string().max(120).optional(), archived: z.enum(["true", "false"]).optional() }),
    req.query,
  );
  res.json(await admin.listAdminSeries({ ...q, archived: q.archived === undefined ? undefined : q.archived === "true" }));
}
export const seriesCreate = async (req: Request, res: Response) => res.status(201).json(await admin.createSeries(actor(req), parse(adminSeriesSchema, req.body)));
export const seriesUpdate = async (req: Request, res: Response) =>
  res.json(await admin.updateSeries(actor(req), param(req, "id"), parse(adminSeriesUpdateSchema.extend({ isArchived: z.boolean().optional() }), req.body)));
export async function seriesDelete(req: Request, res: Response) {
  const { hard } = parse(z.object({ hard: z.enum(["true", "false"]).default("false") }), req.query);
  await admin.deleteSeries(actor(req), param(req, "id"), hard === "true");
  res.status(204).end();
}
export const seriesMerge = async (req: Request, res: Response) => {
  const b = parse(mergeSchema, req.body);
  res.json(await admin.mergeSeries(actor(req), b.keepId, b.mergeId));
};
export const duplicates = async (_req: Request, res: Response) => res.json({ items: await admin.findDuplicates() });
export const seriesRefresh = async (req: Request, res: Response) => res.json(await importer.refreshSeries(actor(req), param(req, "id")));

export const importRun = async (req: Request, res: Response) => res.json(await importer.importSeries(actor(req), parse(importSchema, req.body)));
export async function importSearch(req: Request, res: Response) {
  const q = parse(z.object({ q: z.string().trim().min(1).max(100), provider: z.enum(["anilist"]).default("anilist") }), req.query);
  res.json({ items: await importer.previewSearch(q.provider, q.q, 10) });
}

export async function reports(req: Request, res: Response) {
  const q = parse(paginationSchema.extend({ status: z.enum(["OPEN", "RESOLVED", "DISMISSED"]).optional() }), req.query);
  res.json(await reviews.listReports(q.status, q.page, q.pageSize));
}
export async function resolveReport(req: Request, res: Response) {
  const b = parse(reportResolveSchema, req.body);
  await reviews.resolveReport(actor(req), param(req, "id"), b.action, b.note);
  res.status(204).end();
}
export async function reviewVisibility(req: Request, res: Response) {
  const b = parse(z.object({ hidden: z.boolean(), reason: z.string().max(300).optional() }), req.body);
  await reviews.setReviewHidden(actor(req), param(req, "id"), b.hidden, b.reason);
  res.status(204).end();
}

export const featuredList = async (_req: Request, res: Response) => res.json({ items: await admin.listFeaturedAdmin() });
export const featuredSet = async (req: Request, res: Response) => res.json(await admin.upsertFeatured(actor(req), parse(featuredSchema, req.body)));
export async function featuredRemove(req: Request, res: Response) {
  await admin.removeFeatured(actor(req), param(req, "seriesId"));
  res.status(204).end();
}

export const collectionsList = async (_req: Request, res: Response) => res.json({ items: await admin.listCollectionsAdmin() });
export const collectionCreate = async (req: Request, res: Response) => res.status(201).json(await admin.saveCollection(actor(req), parse(collectionSchema, req.body)));
export const collectionUpdate = async (req: Request, res: Response) => res.json(await admin.saveCollection(actor(req), parse(collectionSchema, req.body), param(req, "id")));
export async function collectionDelete(req: Request, res: Response) {
  await admin.deleteCollection(actor(req), param(req, "id"));
  res.status(204).end();
}

export async function usersList(req: Request, res: Response) {
  res.json(await admin.listUsers(parse(paginationSchema.extend({ q: z.string().max(120).optional() }), req.query)));
}
export const userUpdate = async (req: Request, res: Response) =>
  res.json(await admin.updateUser(actor(req), param(req, "id"), parse(z.object({ role: z.enum(["USER", "MODERATOR", "ADMIN"]).optional(), isSuspended: z.boolean().optional() }), req.body)));

export async function auditLog(req: Request, res: Response) {
  const q = parse(paginationSchema, req.query);
  res.json(await listAudit(q.page, q.pageSize));
}
