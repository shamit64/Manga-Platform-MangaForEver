import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";

// Regenerated at most once a day; new chapters change each series' lastModified.
export const revalidate = 86_400;

const API_URL = (process.env.API_URL ?? "http://localhost:4000").replace(/\/$/, "");

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const fixed = ["", "/browse", "/latest", "/rankings", "/manga", "/manhwa", "/manhua", "/seasonal", "/new", "/reviews", "/about"].map((p) => ({
    url: `${SITE_URL}${p}`,
    changeFrequency: p === "/latest" || p === "" ? ("hourly" as const) : ("daily" as const),
    priority: p === "" ? 1 : 0.8,
  }));
  try {
    const res = await fetch(`${API_URL}/api/v1/sitemap-entries`, { next: { revalidate } });
    if (!res.ok) return fixed;
    const data: { series: { slug: string; updatedAt: string }[]; genres: string[]; users: { username: string; updatedAt: string }[] } = await res.json();
    return [
      ...fixed,
      ...data.series.map((s) => ({ url: `${SITE_URL}/manga/${s.slug}`, lastModified: s.updatedAt, changeFrequency: "daily" as const, priority: 0.7 })),
      ...data.genres.map((g) => ({ url: `${SITE_URL}/genre/${g}`, changeFrequency: "daily" as const, priority: 0.6 })),
      ...data.users.map((u) => ({ url: `${SITE_URL}/u/${u.username}`, lastModified: u.updatedAt, changeFrequency: "weekly" as const, priority: 0.3 })),
    ];
  } catch {
    return fixed;
  }
}
