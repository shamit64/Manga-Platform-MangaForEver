/**
 * MangaVerse colour system shared by the web app and the website edition.
 * Content gets colour from what it is: each content type and genre owns a hue,
 * and generated covers take their palette from the series' primary genre.
 */
import type { ContentType } from "./constants.js";

/** Hue per content type: manga violet, manhwa cyan, manhua coral. */
export const TYPE_COLORS: Record<ContentType, { solid: string; soft: string }> = {
  MANGA: { solid: "#8b5cf6", soft: "#c4b5fd" },
  MANHWA: { solid: "#06b6d4", soft: "#67e8f9" },
  MANHUA: { solid: "#f43f5e", soft: "#fda4af" },
};

/** Hue per genre slug (used for chips, cover accents and charts). */
export const GENRE_COLORS: Record<string, string> = {
  action: "#f43f5e",
  adventure: "#f59e0b",
  comedy: "#eab308",
  drama: "#a855f7",
  fantasy: "#8b5cf6",
  historical: "#d97706",
  horror: "#dc2626",
  mystery: "#3b82f6",
  psychological: "#d946ef",
  romance: "#ec4899",
  "sci-fi": "#06b6d4",
  "slice-of-life": "#10b981",
  sports: "#f97316",
  supernatural: "#6366f1",
  thriller: "#64748b",
};

export function genreColor(slug: string) {
  if (GENRE_COLORS[slug]) return GENRE_COLORS[slug];
  // Stable fallback hue for genres imported from providers.
  let h = 0;
  for (let i = 0; i < slug.length; i++) h = (h * 31 + slug.charCodeAt(i)) | 0;
  return `hsl(${Math.abs(h) % 360} 70% 58%)`;
}

/** Deep background + bright accent per genre, for generated covers. */
const COVER_PALETTES: Record<string, [string, string]> = {
  action: ["#3b0a1f", "#ff4d6d"],
  adventure: ["#0e2a3b", "#ffb020"],
  comedy: ["#3a1550", "#ffd23f"],
  drama: ["#2a1142", "#c084fc"],
  fantasy: ["#191447", "#a78bfa"],
  historical: ["#33200c", "#f4a259"],
  horror: ["#170707", "#ef233c"],
  mystery: ["#0a1631", "#fbbf24"],
  psychological: ["#1f1236", "#f472b6"],
  romance: ["#3d0f2c", "#fb7185"],
  "sci-fi": ["#06202f", "#22d3ee"],
  "slice-of-life": ["#0c2e2a", "#6ee7b7"],
  sports: ["#0c1f47", "#fb923c"],
  supernatural: ["#141339", "#818cf8"],
  thriller: ["#111318", "#f43f5e"],
};

export interface CoverArt {
  bg: string;
  accent: string;
  accent2: string;
  motif: "sun" | "slash" | "burst" | "rings" | "bars";
  seed: number;
}

export function hashString(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Deterministic cover art for a series without licensed artwork. */
export function coverArt(title: string, genreSlugs: string[]): CoverArt {
  const seed = hashString(title);
  // Pick among the series' own genres (deterministically) so shelves don't all share one palette.
  const known = genreSlugs.filter((g) => COVER_PALETTES[g]);
  const primary = known.length ? known[seed % known.length] : Object.keys(COVER_PALETTES)[seed % 15];
  const secondary = genreSlugs.find((g) => g !== primary && GENRE_COLORS[g]);
  const [bg, accent] = COVER_PALETTES[primary];
  const motifs: CoverArt["motif"][] = ["sun", "slash", "burst", "rings", "bars"];
  return { bg, accent, accent2: secondary ? GENRE_COLORS[secondary] : "#ffffff", motif: motifs[seed % motifs.length], seed };
}

/** CSS background layers for a cover. */
export function coverBackground(a: CoverArt) {
  const x = 22 + (a.seed % 50);
  const y = 18 + ((a.seed >> 4) % 34);
  const ang = 100 + ((a.seed >> 8) % 60);
  const glow = `radial-gradient(120% 80% at ${100 - x}% 0%, ${a.accent}55, transparent 60%)`;
  const base = `linear-gradient(165deg, ${a.bg} 30%, color-mix(in oklab, ${a.bg} 70%, ${a.accent2}) 100%)`;
  let motif: string;
  switch (a.motif) {
    case "sun":
      motif = `radial-gradient(circle at ${x}% ${y}%, ${a.accent} 0 17%, transparent 17.6%), radial-gradient(circle at ${x}% ${y}%, ${a.accent}33 0 26%, transparent 26.6%)`;
      break;
    case "slash":
      motif = `linear-gradient(${ang}deg, transparent 0 36%, ${a.accent} 36% 49%, transparent 49% 53%, ${a.accent2}aa 53% 56%, transparent 56%)`;
      break;
    case "burst":
      motif = `repeating-conic-gradient(from ${a.seed % 90}deg at ${x}% ${y + 10}%, ${a.accent}66 0 3deg, transparent 3deg 10deg)`;
      break;
    case "rings":
      motif = `repeating-radial-gradient(circle at ${x}% ${y + 8}%, ${a.accent}aa 0 3px, transparent 3px 16px)`;
      break;
    default:
      motif = `repeating-linear-gradient(${ang}deg, ${a.accent}88 0 10px, transparent 10px 26px)`;
  }
  return `${motif}, ${glow}, ${base}`;
}
