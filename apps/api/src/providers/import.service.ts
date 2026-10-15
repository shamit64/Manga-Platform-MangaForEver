import { AppError, badRequest, notFound, unavailable } from "../lib/errors.js";
import { prisma } from "../lib/prisma.js";
import { audit } from "../services/audit.service.js";
import { writeSeries } from "../services/catalog-writer.js";
import { getProvider } from "./registry.js";
import { ProviderError, type ProviderSeries } from "./types.js";

function providerOrThrow(name: string) {
  const p = getProvider(name);
  if (!p) throw new AppError(400, "PROVIDER_DISABLED", `The ${name} provider is not enabled (set METADATA_PROVIDER).`);
  return p;
}

async function guard<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    if (err instanceof ProviderError) throw unavailable(`${err.message} The local catalog still works.`);
    throw err;
  }
}

/**
 * Upsert one provider record. External IDs are unique per provider, so re-importing refreshes the
 * existing row instead of creating a duplicate. Community statistics are never touched by imports.
 */
async function upsertFromProvider(item: ProviderSeries) {
  const existing = await prisma.mangaSeries.findUnique({
    where: { externalProvider_externalId: { externalProvider: item.externalProvider, externalId: item.externalId } },
    select: { id: true },
  });
  const row = await writeSeries(item, { id: existing?.id });
  return { id: row.id, slug: row.slug, title: row.title, created: !existing };
}

export async function previewSearch(provider: string, query: string, limit: number) {
  const p = providerOrThrow(provider);
  const res = await guard(() => p.search(query, 1, limit));
  const ids = res.items.map((i) => i.externalId);
  const known = await prisma.mangaSeries.findMany({
    where: { externalProvider: provider, externalId: { in: ids } },
    select: { externalId: true, id: true, slug: true },
  });
  const knownBy = new Map(known.map((k) => [k.externalId, k]));
  return res.items.map((i) => ({
    externalId: i.externalId,
    title: i.title,
    type: i.type,
    status: i.status,
    releaseYear: i.releaseYear,
    coverUrl: i.coverUrl,
    externalPopularity: i.externalPopularity,
    alreadyImported: knownBy.get(i.externalId) ?? null,
  }));
}

const COUNTRY_FOR_TYPE = { MANGA: "JP", MANHWA: "KR", MANHUA: "CN" } as const;

export async function importSeries(
  actorId: string | null,
  input: {
    provider: string;
    externalId?: string;
    search?: string;
    limit: number;
    page?: number;
    contentType?: keyof typeof COUNTRY_FOR_TYPE;
    /** Bulk imports keep existing rows (e.g. curated sample entries) instead of overwriting them. */
    skipExisting?: boolean;
  },
) {
  const p = providerOrThrow(input.provider);
  let items: ProviderSeries[];
  if (input.externalId) {
    const one = await guard(() => p.getById(input.externalId!));
    if (!one) throw notFound(`${p.attribution.label} entry`);
    items = [one];
  } else if (input.search) {
    items = (await guard(() => p.search(input.search!, 1, input.limit))).items;
  } else {
    const country = input.contentType ? COUNTRY_FOR_TYPE[input.contentType] : undefined;
    items = (await guard(() => p.popular(input.page ?? 1, input.limit, country))).items;
  }
  const results = [];
  for (const item of items) {
    if (input.skipExisting) {
      const exists = await prisma.mangaSeries.findUnique({
        where: { externalProvider_externalId: { externalProvider: item.externalProvider, externalId: item.externalId } },
        select: { id: true, slug: true, title: true },
      });
      if (exists) {
        results.push({ ...exists, created: false, skipped: true });
        continue;
      }
    }
    results.push(await upsertFromProvider(item));
  }
  await audit(actorId, "catalog.import", "MangaSeries", null, {
    provider: input.provider,
    externalId: input.externalId,
    search: input.search,
    contentType: input.contentType,
    page: input.page,
    count: results.length,
  });
  return {
    imported: results.filter((r) => r.created).length,
    refreshed: results.filter((r) => !r.created && !("skipped" in r)).length,
    skipped: results.filter((r) => "skipped" in r).length,
    items: results,
  };
}

export async function refreshSeries(actorId: string, seriesId: string) {
  const s = await prisma.mangaSeries.findUnique({ where: { id: seriesId } });
  if (!s) throw notFound("Series");
  if (!s.externalProvider || !s.externalId) throw badRequest("This series wasn't imported from a provider, so there's nothing to refresh.");
  const p = providerOrThrow(s.externalProvider);
  const fresh = await guard(() => p.getById(s.externalId!));
  if (!fresh) throw notFound(`${p.attribution.label} entry`);
  const row = await writeSeries(fresh, { id: s.id });
  await audit(actorId, "catalog.refresh", "MangaSeries", s.id, { provider: s.externalProvider });
  return { id: row.id, lastSyncedAt: fresh.lastSyncedAt };
}
