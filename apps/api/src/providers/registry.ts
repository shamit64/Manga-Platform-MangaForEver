import { env } from "../config/env.js";
import { AniListProvider } from "./anilist.js";
import type { MetadataProvider } from "./types.js";

let providers: Map<string, MetadataProvider> | null = null;

export function getProviders() {
  if (!providers) {
    providers = new Map();
    if (env.METADATA_PROVIDER === "anilist") providers.set("anilist", new AniListProvider(env.ANILIST_API_URL));
  }
  return providers;
}

export function getProvider(name: string) {
  return getProviders().get(name) ?? null;
}

/** Test hook: swap in a fake provider. */
export function setProvider(name: string, provider: MetadataProvider | null) {
  const map = getProviders();
  if (provider) map.set(name, provider);
  else map.delete(name);
}
