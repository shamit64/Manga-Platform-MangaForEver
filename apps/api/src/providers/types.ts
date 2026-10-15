import type { SeriesWriteInput } from "../services/catalog-writer.js";

/** Normalised record produced by a provider, ready for writeSeries(). */
export type ProviderSeries = SeriesWriteInput & { externalProvider: string; externalId: string };

export interface ProviderSearchResult {
  items: ProviderSeries[];
  hasNextPage: boolean;
}

/**
 * A replaceable source of catalog metadata. Implementations must:
 *  - map provider fields into the internal schema, leaving unknown values null
 *  - never invent chapter releases, ratings or dates
 *  - throw ProviderError for timeouts/HTTP failures so callers can degrade gracefully
 */
export interface MetadataProvider {
  readonly name: string;
  readonly attribution: { label: string; url: string };
  search(query: string, page?: number, perPage?: number): Promise<ProviderSearchResult>;
  getById(externalId: string): Promise<ProviderSeries | null>;
  /** Popular titles, for bulk catalog bootstrapping. `country` is an ISO code (JP manga, KR manhwa, CN manhua). */
  popular(page?: number, perPage?: number, country?: string): Promise<ProviderSearchResult>;
}

export class ProviderError extends Error {
  constructor(
    public provider: string,
    message: string,
    public retryable = true,
  ) {
    super(message);
    this.name = "ProviderError";
  }
}
