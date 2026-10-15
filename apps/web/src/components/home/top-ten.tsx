"use client";

import { CONTENT_TYPE_LABELS, PUBLICATION_STATUS_LABELS, type RankingResponse } from "@mangaforever/shared";
import { Info, TrendingUp } from "lucide-react";
import Link from "next/link";
import * as React from "react";
import { CommunityScore } from "@/components/manga/badges";
import { Cover } from "@/components/manga/cover";
import { cn, formatCount } from "@/lib/utils";

const TABS = [
  ["ALL", "All"],
  ["MANGA", "Manga"],
  ["MANHWA", "Manhwa"],
  ["MANHUA", "Manhua"],
] as const;

export function TopTen({ data }: { data: Record<string, RankingResponse | null> }) {
  const [tab, setTab] = React.useState<(typeof TABS)[number][0]>("ALL");
  const r = data[tab];
  const max = Math.max(1, ...(r?.items.map((i) => i.metric ?? 0) ?? [1]));

  return (
    <div>
      <div role="tablist" aria-label="Filter by type" className="mb-5 flex gap-1.5">
        {TABS.map(([k, label]) => (
          <button
            key={k}
            role="tab"
            aria-selected={tab === k}
            onClick={() => setTab(k)}
            className={cn(
              "cursor-pointer rounded-full border px-3.5 py-1.5 text-sm transition-colors",
              tab === k ? "bg-brand border-transparent text-white" : "border-line text-muted hover:text-text",
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {!r || r.items.length === 0 ? (
        <p className="rounded-xl border border-dashed border-line px-4 py-8 text-center text-sm text-muted">
          Not enough member activity to rank {tab === "ALL" ? "series" : CONTENT_TYPE_LABELS[tab].toLowerCase()} yet.
        </p>
      ) : (
        <ol className="grid gap-x-8 gap-y-1 md:grid-cols-2" role="tabpanel">
          {r.items.map((s) => (
            <li key={s.id} className="min-w-0">
              <Link
                href={`/manga/${s.slug}`}
                className={cn(
                  "group flex items-center gap-4 rounded-lg px-2 py-2.5 hover:bg-surface",
                  s.rank <= 3 && "bg-[linear-gradient(90deg,color-mix(in_oklab,var(--violet)_14%,transparent),transparent)]",
                )}
              >
                <span className="rank-numeral w-14 shrink-0 text-right text-5xl" aria-label={`Rank ${s.rank}`}>
                  {s.rank}
                </span>
                <Cover title={s.title} coverUrl={s.coverUrl} genres={s.genres.map((g) => g.slug)} compact className="w-12 shrink-0 rounded-md" sizes="48px" />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold group-hover:text-lilac">{s.title}</p>
                  <p className="truncate text-xs text-muted">
                    {CONTENT_TYPE_LABELS[s.type]} · {s.genres[0]?.name ?? "Genre unknown"} · {PUBLICATION_STATUS_LABELS[s.status]}
                  </p>
                  <div className="mt-1.5 flex items-center gap-3">
                    <CommunityScore avg={s.ratingAvg} count={s.ratingCount} className="text-xs" />
                    <span className="flex flex-1 items-center gap-1.5 text-xs text-muted" title={`Popularity score ${s.metric}`}>
                      <TrendingUp className="size-3.5" aria-hidden />
                      <span className="h-1 max-w-24 flex-1 overflow-hidden rounded-full bg-line">
                        <span className="bg-brand block h-full rounded-full" style={{ width: `${((s.metric ?? 0) / max) * 100}%` }} />
                      </span>
                      <span className="tabular-nums">{formatCount(s.metric)}</span>
                    </span>
                  </div>
                </div>
              </Link>
            </li>
          ))}
        </ol>
      )}
      {r && (
        <p className="mt-4 flex items-start gap-2 text-xs text-muted">
          <Info className="mt-px size-3.5 shrink-0" aria-hidden />
          <span>
            MangaForEver community ranking. {r.explanation}
            {r.includesDemoActivity && " Includes activity from the seeded demo accounts in this installation."}
          </span>
        </p>
      )}
    </div>
  );
}
