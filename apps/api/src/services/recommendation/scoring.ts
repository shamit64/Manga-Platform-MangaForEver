/**
 * MangaForEver content-based recommendation scoring.
 *
 * This is a transparent, rules-based weighted scoring model — not machine learning.
 * Every number that contributes to a recommendation can be traced back to the user's own
 * stored activity, and the strongest contributions become the human-readable "reasons".
 *
 *  1. Build a taste profile: weights per genre, tag, content type and creator, accumulated from
 *     signals (see SIGNAL_WEIGHTS).
 *  2. Score every candidate series the user hasn't added or dismissed:
 *        score = Wg·genreAffinity + Wt·tagAffinity + Wy·typeAffinity + Wc·creatorAffinity
 *              + Wq·quality + Wp·popularity + jitter
 *     Affinities are normalised to roughly 0–1 so the weights in RECOMMENDER_WEIGHTS are comparable.
 *  3. Re-rank greedily for diversity: each time a genre is already represented in the picks,
 *     later candidates whose primary genre matches it are penalised (DIVERSITY_PENALTY).
 */

export const RECOMMENDER_WEIGHTS = {
  genre: 3.0,
  tag: 1.5,
  type: 0.8,
  creator: 1.2,
  quality: 0.9,
  popularity: 0.4,
  jitter: 0.15,
} as const;

export const SIGNAL_WEIGHTS = {
  preferredGenre: 3,
  favorite: 2.5,
  status: { READING: 1.2, COMPLETED: 1.5, PLAN_TO_READ: 0.6, ON_HOLD: 0.4, DROPPED: -1.0 } as Record<string, number>,
  /** Added per rating point away from neutral (6): a 10 adds +2, a 3 adds −1.5. */
  ratingPerPoint: 0.5,
  view: 0.3,
  searchMatch: 0.6,
} as const;

export const DIVERSITY_PENALTY = 0.35;

export interface SeriesFeatures {
  id: string;
  title: string;
  type: string;
  genres: { slug: string; name: string }[];
  tags: { slug: string; name: string }[];
  creators: { slug: string; name: string }[];
  ratingAvg: number | null;
  ratingCount: number;
  popularityScore: number;
}

export interface UserSignals {
  preferredGenres: string[];
  library: { series: SeriesFeatures; status: string }[];
  ratings: { series: SeriesFeatures; score: number }[];
  favorites: SeriesFeatures[];
  views: SeriesFeatures[];
  searches: string[];
}

export interface TasteProfile {
  genres: Map<string, number>;
  tags: Map<string, number>;
  types: Map<string, number>;
  creators: Map<string, { weight: number; via: string }>;
  names: Map<string, string>;
  /** Total absolute signal mass — low values mean a new user. */
  strength: number;
}

function bump(map: Map<string, number>, key: string, by: number) {
  map.set(key, (map.get(key) ?? 0) + by);
}

export function buildProfile(s: UserSignals): TasteProfile {
  const p: TasteProfile = { genres: new Map(), tags: new Map(), types: new Map(), creators: new Map(), names: new Map(), strength: 0 };
  const absorb = (series: SeriesFeatures, w: number) => {
    if (!w) return;
    p.strength += Math.abs(w);
    for (const g of series.genres) {
      bump(p.genres, g.slug, w);
      p.names.set(g.slug, g.name);
    }
    for (const t of series.tags) {
      bump(p.tags, t.slug, w * 0.8);
      p.names.set(`tag:${t.slug}`, t.name);
    }
    bump(p.types, series.type, w);
    if (w > 1.5) {
      for (const c of series.creators) {
        const cur = p.creators.get(c.slug);
        p.names.set(`creator:${c.slug}`, c.name);
        if (!cur || cur.weight < w) p.creators.set(c.slug, { weight: (cur?.weight ?? 0) + w, via: series.title });
      }
    }
  };

  for (const g of s.preferredGenres) {
    bump(p.genres, g, SIGNAL_WEIGHTS.preferredGenre);
    p.strength += SIGNAL_WEIGHTS.preferredGenre;
  }
  for (const e of s.library) absorb(e.series, SIGNAL_WEIGHTS.status[e.status] ?? 0);
  for (const r of s.ratings) absorb(r.series, (r.score - 6) * SIGNAL_WEIGHTS.ratingPerPoint);
  for (const f of s.favorites) absorb(f, SIGNAL_WEIGHTS.favorite);
  for (const v of s.views) absorb(v, SIGNAL_WEIGHTS.view);
  // Search queries that name a genre count as a light preference for it.
  for (const q of s.searches) {
    const term = q.toLowerCase();
    for (const [slug, name] of p.names) {
      if (!slug.includes(":") && term.includes(name.toLowerCase())) bump(p.genres, slug, SIGNAL_WEIGHTS.searchMatch);
    }
  }
  return p;
}

function normalisedAffinity(weights: Map<string, number>, keys: string[]) {
  if (!keys.length || !weights.size) return { value: 0, top: null as string | null };
  const max = Math.max(...[...weights.values()].map((v) => Math.abs(v)), 1);
  let sum = 0;
  let top: string | null = null;
  let topW = 0;
  for (const k of keys) {
    const w = weights.get(k) ?? 0;
    sum += w;
    if (w > topW) {
      topW = w;
      top = k;
    }
  }
  // Divide by sqrt(n) so series with many genres don't win just by listing more.
  return { value: sum / max / Math.sqrt(keys.length), top };
}

/** Deterministic pseudo-random number in [0,1) from a string — used for refreshable variety. */
export function hashUnit(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 10_000) / 10_000;
}

export interface Scored {
  series: SeriesFeatures;
  score: number;
  reasons: string[];
  primaryGenre: string | null;
}

export function scoreCandidate(
  c: SeriesFeatures,
  p: TasteProfile,
  ctx: { globalMean: number; maxPopularity: number; seed: string },
): Scored {
  const W = RECOMMENDER_WEIGHTS;
  const genre = normalisedAffinity(p.genres, c.genres.map((g) => g.slug));
  const tag = normalisedAffinity(p.tags, c.tags.map((t) => t.slug));
  const typeMax = Math.max(...[...p.types.values()], 1);
  const type = (p.types.get(c.type) ?? 0) / typeMax;
  let creatorScore = 0;
  let creatorReason: string | null = null;
  for (const cr of c.creators) {
    const hit = p.creators.get(cr.slug);
    if (hit && hit.via !== c.title) {
      creatorScore = 1;
      creatorReason = `From ${cr.name}, who also made ${hit.via}`;
    }
  }
  // Bayesian-shrunk community rating, scaled to 0–1.
  const m = 5;
  const bayes = c.ratingCount ? (c.ratingCount / (c.ratingCount + m)) * (c.ratingAvg ?? 0) + (m / (c.ratingCount + m)) * ctx.globalMean : ctx.globalMean;
  const quality = Math.max(0, (bayes - 5) / 5);
  const popularity = ctx.maxPopularity ? Math.log1p(c.popularityScore) / Math.log1p(ctx.maxPopularity) : 0;
  const jitter = hashUnit(`${ctx.seed}:${c.id}`);

  const score =
    W.genre * genre.value +
    W.tag * tag.value +
    W.type * type +
    W.creator * creatorScore +
    W.quality * quality +
    W.popularity * popularity +
    W.jitter * jitter;

  const reasons: string[] = [];
  if (creatorReason) reasons.push(creatorReason);
  if (genre.top && genre.value > 0.15) reasons.push(`Because you like ${p.names.get(genre.top) ?? genre.top}`);
  if (tag.top && tag.value > 0.25) reasons.push(`Features ${p.names.get(`tag:${tag.top}`) ?? tag.top}, which shows up in what you read`);
  if (type > 0.6 && c.type !== "MANGA") reasons.push(`You read a lot of ${c.type.toLowerCase()}`);
  if (quality > 0.6 && c.ratingCount >= 3) reasons.push("Highly rated by MangaForEver members");
  if (!reasons.length) reasons.push("Popular with MangaForEver members");

  return { series: c, score, reasons: reasons.slice(0, 2), primaryGenre: genre.top };
}

/** Greedy diversity re-rank: discourages a shelf made entirely of one genre. */
export function diversify(scored: Scored[], limit: number): Scored[] {
  const pool = [...scored].sort((a, b) => b.score - a.score);
  const picked: Scored[] = [];
  const genreUse = new Map<string, number>();
  while (picked.length < limit && pool.length) {
    let bestIdx = 0;
    let best = -Infinity;
    for (let i = 0; i < Math.min(pool.length, 60); i++) {
      const s = pool[i];
      const used = s.primaryGenre ? genreUse.get(s.primaryGenre) ?? 0 : 0;
      const adj = s.score - used * DIVERSITY_PENALTY;
      if (adj > best) {
        best = adj;
        bestIdx = i;
      }
    }
    const [chosen] = pool.splice(bestIdx, 1);
    picked.push(chosen);
    if (chosen.primaryGenre) genreUse.set(chosen.primaryGenre, (genreUse.get(chosen.primaryGenre) ?? 0) + 1);
  }
  return picked;
}

/** Series-to-series similarity for "Related series" and "Because you read…". */
export function similarity(a: SeriesFeatures, b: SeriesFeatures) {
  const jac = (x: string[], y: string[]) => {
    if (!x.length || !y.length) return 0;
    const sx = new Set(x);
    const inter = y.filter((v) => sx.has(v)).length;
    return inter / (sx.size + y.length - inter);
  };
  const genres = jac(a.genres.map((g) => g.slug), b.genres.map((g) => g.slug));
  const tags = jac(a.tags.map((t) => t.slug), b.tags.map((t) => t.slug));
  const sharedCreators = b.creators.filter((c) => a.creators.some((x) => x.slug === c.slug));
  const sameType = a.type === b.type ? 1 : 0;
  const score = genres * 0.5 + tags * 0.3 + (sharedCreators.length ? 0.25 : 0) + sameType * 0.1;
  const sharedGenres = b.genres.filter((g) => a.genres.some((x) => x.slug === g.slug)).map((g) => g.name);
  const reasons: string[] = [];
  if (sharedCreators.length) reasons.push(`Same creator: ${sharedCreators[0].name}`);
  if (sharedGenres.length) reasons.push(`Shares ${sharedGenres.slice(0, 3).join(", ")}`);
  return { score, reasons };
}

export const NEW_USER_STRENGTH_THRESHOLD = 4;
