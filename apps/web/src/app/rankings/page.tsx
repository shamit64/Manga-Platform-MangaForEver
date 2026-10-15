import {
  CONTENT_TYPES,
  CONTENT_TYPE_LABELS,
  PUBLICATION_STATUS_LABELS,
  RANKING_EXPLANATIONS,
  type RankingKind,
  type RankingResponse,
} from "@mangaverse/shared";
import type { Metadata } from "next";
import Link from "next/link";
import { EmptyState, ErrorNotice, PageHeader } from "@/components/layout/section";
import { CommunityScore, TypeBadge } from "@/components/manga/badges";
import { Cover } from "@/components/manga/cover";
import { tryServerApi } from "@/lib/server-api";
import { cn, formatCount } from "@/lib/utils";

export const metadata: Metadata = { title: "Rankings" };

const KINDS: [RankingKind, string, string][] = [
  ["popular", "Most popular", "Popularity score"],
  ["top-rated", "Top rated", "Weighted score"],
  ["trending", "Trending", "30-day activity"],
  ["most-reviewed", "Most reviewed", "Reviews"],
  ["most-favorited", "Most favorited", "Favorites"],
  ["external", "AniList popularity", "AniList users"],
];

export default async function RankingsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const kind = (KINDS.find((k) => k[0] === sp.kind)?.[0] ?? "popular") as RankingKind;
  const type = CONTENT_TYPES.find((t) => t === sp.type);
  const data = await tryServerApi<RankingResponse>("/rankings", { kind, type, limit: 50 });
  const metricLabel = KINDS.find((k) => k[0] === kind)![2];
  const link = (k: string, t?: string) => `/rankings?kind=${k}${t ? `&type=${t}` : ""}`;

  return (
    <div>
      <PageHeader title="Rankings" description="Every list says exactly how it’s calculated. Community lists use stored MangaVerse activity; the AniList list uses provider data." />
      <nav aria-label="Ranking type" className="flex gap-1 overflow-x-auto border-b border-line scrollbar-none">
        {KINDS.map(([k, label]) => (
          <Link key={k} href={link(k, type)} aria-current={k === kind ? "page" : undefined}
            className={cn("-mb-px border-b-2 px-3.5 py-2.5 text-sm font-medium whitespace-nowrap", k === kind ? "border-violet text-text" : "border-transparent text-muted hover:text-text")}>
            {label}
          </Link>
        ))}
      </nav>
      <div className="mt-4 flex flex-wrap gap-1.5" aria-label="Content type">
        {[undefined, ...CONTENT_TYPES].map((t) => (
          <Link key={t ?? "all"} href={link(kind, t)} aria-current={t === type ? "page" : undefined}
            className={cn("rounded-full border px-3.5 py-1.5 text-sm", t === type ? "border-violet bg-violet/15" : "border-line text-muted hover:text-text")}>
            {t ? CONTENT_TYPE_LABELS[t] : "All"}
          </Link>
        ))}
      </div>

      {data && (
        <p className="mt-5 max-w-3xl rounded-xl border border-line bg-surface px-4 py-3 text-sm text-muted">
          <span className="font-semibold text-text">{data.source === "external" ? "External data · " : "MangaVerse community · "}</span>
          {data.explanation}
          {data.includesDemoActivity && " This installation's numbers include seeded demo accounts."}
        </p>
      )}

      <div className="mt-6">
        {!data ? (
          <ErrorNotice title="Rankings couldn't load" />
        ) : data.items.length === 0 ? (
          <EmptyState
            title={kind === "external" ? "No provider popularity data yet" : "Not enough activity to rank yet"}
            description={kind === "external" ? "Import titles from AniList (Admin → Import) to see AniList's own popularity figures here." : "Rankings appear once members add, rate or review series."}
          />
        ) : (
          <ol className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface">
            {data.items.map((s) => (
              <li key={s.id}>
                <Link href={`/manga/${s.slug}`} className="group flex items-center gap-4 px-3 py-3 hover:bg-raised/40 sm:px-5">
                  <span className={cn("w-12 shrink-0 text-right", s.rank <= 3 ? "rank-numeral text-4xl" : "font-display text-xl font-bold text-muted tabular-nums")}>{s.rank}</span>
                  <Cover title={s.title} coverUrl={s.coverUrl} genres={s.genres.map((g) => g.slug)} compact className="w-12 shrink-0 rounded-md" sizes="48px" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold group-hover:text-lilac">{s.title}</p>
                    <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
                      <TypeBadge type={s.type} />
                      {s.genres.slice(0, 3).map((g) => g.name).join(", ")} · {PUBLICATION_STATUS_LABELS[s.status]}
                      {s.releaseYear ? ` · ${s.releaseYear}` : ""}
                    </p>
                  </div>
                  <div className="hidden text-right sm:block">
                    <CommunityScore avg={s.ratingAvg} count={s.ratingCount} />
                    <p className="text-xs text-muted">{s.ratingCount} ratings</p>
                  </div>
                  <div className="w-24 text-right">
                    <p className="font-display text-lg font-bold tabular-nums">{kind === "top-rated" ? s.metric?.toFixed(2) : formatCount(s.metric)}</p>
                    <p className="text-xs text-muted">{metricLabel}</p>
                  </div>
                </Link>
              </li>
            ))}
          </ol>
        )}
      </div>

      <section id="how" className="mt-14 scroll-mt-24">
        <h2 className="text-2xl font-bold">How rankings work</h2>
        <dl className="mt-4 grid gap-4 md:grid-cols-2">
          {KINDS.map(([k, label]) => (
            <div key={k} className="rounded-2xl border border-line bg-surface p-5">
              <dt className="font-display font-semibold">{label}</dt>
              <dd className="mt-1 text-sm text-muted">{RANKING_EXPLANATIONS[k]}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-4 max-w-3xl text-sm text-muted">
          MangaVerse never mixes provider numbers into community rankings. External ratings and popularity are shown separately on each series page with their source.
        </p>
      </section>
    </div>
  );
}
