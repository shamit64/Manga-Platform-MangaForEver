"use strict";
const { useState, useEffect, useMemo, useRef, useCallback, useContext, createContext } = React;
const html = htm.bind(React.createElement);

/* ───────── Catalog ───────── */
const DATA = JSON.parse(document.getElementById("catalog").textContent);
const SERIES = DATA.series;
const BY_ID = new Map(SERIES.map((s) => [s.id, s]));
const SYNCED = DATA.syncedAt;

const TYPES = {
  MANGA: { label: "Manga", origin: "Japan", native: "漫画", lang: "ja", blurb: "Japanese comics, read right to left." },
  MANHWA: { label: "Manhwa", origin: "South Korea", native: "만화", lang: "ko", blurb: "Korean comics and full-colour webtoons." },
  MANHUA: { label: "Manhua", origin: "China", native: "漫画", lang: "zh", blurb: "Chinese comics, from wuxia epics to cultivation." },
};
const TYPE_KEYS = Object.keys(TYPES);
const STATUS = { ONGOING: "Ongoing", COMPLETED: "Completed", HIATUS: "On hiatus", CANCELLED: "Cancelled", UPCOMING: "Upcoming", UNKNOWN: "Unknown" };
const DEMO = { SHOUNEN: "Shounen", SHOUJO: "Shoujo", SEINEN: "Seinen", JOSEI: "Josei", KODOMO: "Kids" };
const SHELF = [
  ["READING", "Reading"],
  ["PLAN_TO_READ", "Plan to read"],
  ["COMPLETED", "Completed"],
  ["ON_HOLD", "On hold"],
  ["DROPPED", "Dropped"],
];
const SHELF_LABEL = Object.fromEntries(SHELF);

/* Same colour system as the MangaForEver app (packages/shared/src/design.ts). */
const GENRE_COLORS = {
  action: "#f43f5e", adventure: "#f59e0b", comedy: "#eab308", drama: "#a855f7", fantasy: "#8b5cf6",
  historical: "#d97706", horror: "#dc2626", mystery: "#3b82f6", psychological: "#d946ef", romance: "#ec4899",
  "sci-fi": "#06b6d4", "slice-of-life": "#10b981", sports: "#f97316", supernatural: "#6366f1", thriller: "#64748b",
  ecchi: "#fb7185", mecha: "#94a3b8", music: "#14b8a6",
};
const COVER_PALETTES = {
  action: ["#3b0a1f", "#ff4d6d"], adventure: ["#0e2a3b", "#ffb020"], comedy: ["#3a1550", "#ffd23f"],
  drama: ["#2a1142", "#c084fc"], fantasy: ["#191447", "#a78bfa"], historical: ["#33200c", "#f4a259"],
  horror: ["#170707", "#ef233c"], mystery: ["#0a1631", "#fbbf24"], psychological: ["#1f1236", "#f472b6"],
  romance: ["#3d0f2c", "#fb7185"], "sci-fi": ["#06202f", "#22d3ee"], "slice-of-life": ["#0c2e2a", "#6ee7b7"],
  sports: ["#0c1f47", "#fb923c"], supernatural: ["#141339", "#818cf8"], thriller: ["#111318", "#f43f5e"],
};
const PALETTE_KEYS = Object.keys(COVER_PALETTES);
const slugOf = (g) => g.toLowerCase().replace(/\s+/g, "-");
const genreColor = (g) => GENRE_COLORS[slugOf(g)] || "#8b5cf6";

function hashString(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
function coverArt(title, slugs) {
  const seed = hashString(title);
  const known = slugs.filter((g) => COVER_PALETTES[g]);
  const primary = known.length ? known[seed % known.length] : PALETTE_KEYS[seed % PALETTE_KEYS.length];
  const secondary = slugs.find((g) => g !== primary && GENRE_COLORS[g]);
  const [bg, accent] = COVER_PALETTES[primary];
  const motifs = ["sun", "slash", "burst", "rings", "bars"];
  return { bg, accent, accent2: secondary ? GENRE_COLORS[secondary] : "#ffffff", motif: motifs[seed % motifs.length], seed };
}
function coverBackground(a) {
  const x = 22 + (a.seed % 50), y = 18 + ((a.seed >> 4) % 34), ang = 100 + ((a.seed >> 8) % 60);
  const glow = `radial-gradient(120% 80% at ${100 - x}% 0%, ${a.accent}55, transparent 60%)`;
  const base = `linear-gradient(165deg, ${a.bg} 30%, color-mix(in oklab, ${a.bg} 70%, ${a.accent2}) 100%)`;
  let motif;
  switch (a.motif) {
    case "sun": motif = `radial-gradient(circle at ${x}% ${y}%, ${a.accent} 0 17%, transparent 17.6%), radial-gradient(circle at ${x}% ${y}%, ${a.accent}33 0 26%, transparent 26.6%)`; break;
    case "slash": motif = `linear-gradient(${ang}deg, transparent 0 36%, ${a.accent} 36% 49%, transparent 49% 53%, ${a.accent2}aa 53% 56%, transparent 56%)`; break;
    case "burst": motif = `repeating-conic-gradient(from ${a.seed % 90}deg at ${x}% ${y + 10}%, ${a.accent}66 0 3deg, transparent 3deg 10deg)`; break;
    case "rings": motif = `repeating-radial-gradient(circle at ${x}% ${y + 8}%, ${a.accent}aa 0 3px, transparent 3px 16px)`; break;
    default: motif = `repeating-linear-gradient(${ang}deg, ${a.accent}88 0 10px, transparent 10px 26px)`;
  }
  return `${motif}, ${glow}, ${base}`;
}

const CJK = /[぀-ヿ㐀-鿿가-힯豈-﫿]/;
const norm = (s) => String(s || "").normalize("NFKC").toLowerCase().replace(/[:!?.,'’"“”\-–—~・·×&()\[\]/]/g, " ").replace(/\s+/g, " ").trim();
function trigrams(s) {
  const t = new Set(), p = `  ${s} `;
  for (let i = 0; i < p.length - 2; i++) t.add(p.slice(i, i + 3));
  return t;
}
const popMax = Math.max(...SERIES.map((s) => s.pop || 0));
const ALL_GENRES = [...new Set(SERIES.flatMap((s) => s.genres))].sort();
const YEARS = SERIES.map((s) => s.year).filter(Boolean);
const YEAR_MIN = Math.min(...YEARS), YEAR_MAX = Math.max(...YEARS);

for (const s of SERIES) {
  s.slugs = s.genres.map(slugOf);
  s.art = coverArt(s.title, s.slugs);
  s.bg = coverBackground(s.art);
  s.nativeShown = s.native && CJK.test(s.native) ? s.native : null;
  s.titleN = norm(s.title);
  s.hay = norm([s.title, s.romaji, s.native, ...s.authors, ...s.artists].filter(Boolean).join(" | "));
  s.tri = trigrams(norm([s.title, s.romaji].filter(Boolean).join(" ")));
  s.tagSet = new Set(s.tags);
}

/* Rank positions within the catalog, by AniList popularity. */
const BY_POP = [...SERIES].sort((a, b) => (b.pop || 0) - (a.pop || 0));
BY_POP.forEach((s, i) => (s.catRank = i + 1));

/* ───────── Formatting ───────── */
const fmtK = (n) => (n == null ? "—" : n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e4 ? `${Math.round(n / 1e3)}K` : n >= 1e3 ? `${(n / 1e3).toFixed(1)}K` : String(n));
const fmtDate = (iso) => (iso ? new Date(iso + "T00:00:00Z").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }) : null);
const fmtScore = (n) => (n == null ? "—" : Number(n).toFixed(1));
const plural = (n, w) => `${n} ${w}${n === 1 ? "" : "s"}`;
function ago(ts) {
  const d = (Date.now() - ts) / 1000;
  if (d < 60) return "just now";
  if (d < 3600) return `${Math.floor(d / 60)} min ago`;
  if (d < 86400) return `${Math.floor(d / 3600)} h ago`;
  if (d < 86400 * 30) return plural(Math.floor(d / 86400), "day") + " ago";
  return new Date(ts).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}
function published(s) {
  if (s.start && s.end) return `${fmtDate(s.start)} – ${fmtDate(s.end)}`;
  if (s.start && s.status === "ONGOING") return `Since ${fmtDate(s.start)}`;
  if (s.start) return fmtDate(s.start);
  return s.year ? String(s.year) : "Not listed";
}
function chapterLine(s) {
  if (s.ch != null) return `${s.ch} chapters${s.vol ? ` · ${s.vol} volumes` : ""}`;
  if (s.vol) return `${s.vol} volumes`;
  return s.status === "ONGOING" ? "Still running, no final count yet" : "Not listed on AniList";
}
const anilistUrl = (s) => (s.al ? `https://anilist.co/manga/${s.al}` : null);

/* ───────── Search ───────── */
function searchSeries(q, list = SERIES) {
  const n = norm(q);
  if (!n) return list;
  const toks = n.split(" ");
  const hits = [];
  for (const s of list) {
    if (!toks.every((t) => s.hay.includes(t))) continue;
    let r = s.titleN === n ? 100 : s.titleN.startsWith(n) ? 60 : s.titleN.includes(n) ? 40 : 10;
    hits.push([r + Math.log10((s.pop || 0) + 10), s]);
  }
  return hits.sort((a, b) => b[0] - a[0]).map((h) => h[1]);
}
/** Typo-tolerant fallback (trigram similarity, like the app's pg_trgm search). */
function similarTitles(q, k = 5) {
  const t = trigrams(norm(q));
  if (!t.size) return [];
  return SERIES.map((s) => {
    let inter = 0;
    for (const g of t) if (s.tri.has(g)) inter++;
    return [inter / (t.size + s.tri.size - inter), s];
  })
    .filter((x) => x[0] >= 0.22)
    .sort((a, b) => b[0] - a[0])
    .slice(0, k)
    .map((x) => x[1]);
}

/* ───────── Similar series & recommendations ───────── */
function overlap(a, b) {
  const g = a.genres.filter((x) => b.genres.includes(x));
  const t = a.tags.filter((x) => b.tagSet.has(x));
  return { g, t };
}
function similarTo(s, k = 12) {
  const out = [];
  for (const o of SERIES) {
    if (o === s) continue;
    const { g, t } = overlap(s, o);
    if (!g.length) continue;
    const union = new Set([...s.genres, ...o.genres]).size;
    const score = (2 * g.length) / union + 0.35 * t.length + (o.type === s.type ? 0.25 : 0) + 0.04 * Math.log10((o.pop || 0) + 10);
    out.push({ s: o, score, why: [...g.slice(0, 2), ...t.slice(0, 1)] });
  }
  return out.sort((a, b) => b.score - a.score).slice(0, k);
}
function recommend(entries, ratings, k = 12) {
  const ids = Object.keys(entries);
  if (!ids.length) return [];
  const gw = {}, tw = {};
  const sources = [];
  for (const id of ids) {
    const s = BY_ID.get(id), e = entries[id];
    if (!s) continue;
    const score = ratings[id];
    let w = e.status === "DROPPED" ? -0.6 : 1 + (score ? (score - 6) / 4 : 0) + (e.fav ? 0.6 : 0);
    if (w > 0) sources.push({ s, w });
    for (const g of s.genres) gw[g] = (gw[g] || 0) + w;
    for (const t of s.tags) tw[t] = (tw[t] || 0) + w * 0.5;
  }
  const res = [];
  for (const c of SERIES) {
    if (entries[c.id]) continue;
    let sc = 0;
    for (const g of c.genres) sc += gw[g] || 0;
    sc = sc / Math.sqrt(c.genres.length || 1);
    for (const t of c.tags) sc += (tw[t] || 0) * 0.6;
    sc += 0.12 * Math.log10((c.pop || 0) + 10) + (c.score ? (c.score - 7) * 0.15 : 0);
    if (sc <= 0) continue;
    let best = null;
    for (const src of sources) {
      const o = overlap(src.s, c);
      const v = (o.g.length + o.t.length * 0.7) * src.w;
      if (!best || v > best.v) best = { v, src: src.s, why: [...o.g.slice(0, 2), ...o.t.slice(0, 1)] };
    }
    res.push({ s: c, score: sc, because: best && best.v > 0 ? best.src : null, why: best ? best.why : [] });
  }
  return res.sort((a, b) => b.score - a.score).slice(0, k);
}

/* ───────── Storage helpers ───────── */
const LS_KEY = "mangaforever.shelf.v1";
const emptyShelf = () => ({ entries: {}, history: [], ratings: {} });
function readLocal() {
  try {
    const v = JSON.parse(localStorage.getItem(LS_KEY) || "null");
    return v && typeof v === "object" ? { ...emptyShelf(), ...v } : emptyShelf();
  } catch { return emptyShelf(); }
}
function writeLocal(v) { try { localStorage.setItem(LS_KEY, JSON.stringify(v)); } catch { /* storage blocked */ } }
function readTheme() { try { return localStorage.getItem("mangaforever.theme") || "system"; } catch { return "system"; } }
function applyTheme(t) {
  if (t === "system") document.documentElement.removeAttribute("data-theme");
  else document.documentElement.setAttribute("data-theme", t);
  try { localStorage.setItem("mangaforever.theme", t); } catch { /* ignore */ }
}
/** Drop entries that point at series no longer in the catalog and keep the shape sane. */
function cleanShelf(v) {
  const out = emptyShelf();
  if (!v || typeof v !== "object") return out;
  for (const [id, e] of Object.entries(v.entries || {})) {
    if (BY_ID.has(id) && e && SHELF_LABEL[e.status]) out.entries[id] = { status: e.status, ch: Math.max(0, Number(e.ch) || 0), fav: !!e.fav, at: Number(e.at) || Date.now() };
  }
  out.history = (Array.isArray(v.history) ? v.history : []).filter((x) => BY_ID.has(x.id)).slice(0, 40);
  for (const [id, n] of Object.entries(v.ratings || {})) if (BY_ID.has(id) && n >= 1 && n <= 10) out.ratings[id] = Math.round(n);
  return out;
}

const AppCtx = createContext(null);
const useApp = () => useContext(AppCtx);
