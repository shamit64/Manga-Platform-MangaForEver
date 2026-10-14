import "server-only";
import { cookies, headers } from "next/headers";
import { cache } from "react";
import type { Me } from "@mangaverse/shared";

const API_URL = (process.env.API_URL ?? "http://localhost:4000").replace(/\/$/, "");

export class ServerApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

type Query = Record<string, string | number | boolean | undefined | null | string[]>;

function qs(query?: Query) {
  if (!query) return "";
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) {
    if (v === undefined || v === null || v === "" || (Array.isArray(v) && !v.length)) continue;
    p.set(k, Array.isArray(v) ? v.join(",") : String(v));
  }
  const s = p.toString();
  return s ? `?${s}` : "";
}

/**
 * Server-side fetch that forwards the visitor's session cookie so personalised data
 * renders on the server. Throws ServerApiError (status 0 when the API is unreachable).
 */
export async function serverApi<T>(path: string, query?: Query): Promise<T> {
  const jar = await cookies();
  const session = jar.get("mv_session")?.value;
  const h = await headers();
  const fwd: Record<string, string> = {};
  if (session) fwd.cookie = `mv_session=${session}`;
  // Pass the visitor's IP along so per-IP limits on the API apply to them, not to this server.
  const clientIp = h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip");
  if (clientIp) fwd["x-forwarded-for"] = clientIp;
  if (process.env.INTERNAL_API_TOKEN) fwd["x-internal-token"] = process.env.INTERNAL_API_TOKEN;
  let res: Response;
  try {
    res = await fetch(`${API_URL}/api/v1${path}${qs(query)}`, { headers: fwd, cache: "no-store" });
  } catch {
    throw new ServerApiError(0, "The MangaVerse API is unreachable.");
  }
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new ServerApiError(res.status, body?.error?.message ?? `API error ${res.status}`);
  }
  return res.json() as Promise<T>;
}

/** Same as serverApi but resolves to null instead of throwing — for optional page sections. */
export async function tryServerApi<T>(path: string, query?: Query): Promise<T | null> {
  try {
    return await serverApi<T>(path, query);
  } catch {
    return null;
  }
}

/** Current user for this request (deduplicated across the render tree). */
export const getMe = cache(async (): Promise<Me | null> => {
  const jar = await cookies();
  if (!jar.get("mv_session")) return null;
  const r = await tryServerApi<{ user: Me }>("/auth/me");
  return r?.user ?? null;
});
