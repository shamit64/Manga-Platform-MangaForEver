"use client";

import type { LatestUpdate, Paginated } from "@mangaforever/shared";
import Link from "next/link";
import * as React from "react";
import { TypeBadge } from "@/components/manga/badges";
import { Cover } from "@/components/manga/cover";
import { useLive } from "@/components/providers";
import { chapterLabel, cn, isNew, timeAgo } from "@/lib/utils";

/**
 * The Latest Updates grid: each card shows a cover with the series' three newest chapters,
 * the pattern readers know from the big manga sites. It refetches itself whenever the live
 * stream reports a new chapter, so the grid changes without a page refresh.
 */
export function LatestUpdatesGrid({ initial, pageSize = 12, type, className }: { initial: Paginated<LatestUpdate> | null; pageSize?: number; type?: string; className?: string }) {
  const { chapterTick } = useLive();
  const [data, setData] = React.useState(initial);
  const [fresh, setFresh] = React.useState<Set<string>>(new Set());
  const first = React.useRef(true);

  React.useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    const q = new URLSearchParams({ pageSize: String(pageSize), page: String(initial?.page ?? 1) });
    if (type) q.set("type", type);
    fetch(`/api/v1/latest-updates?${q}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d: Paginated<LatestUpdate> | null) => {
        if (!d) return;
        setData((prev) => {
          const before = new Map(prev?.items.map((i) => [i.series.id, i.chapters[0]?.number]));
          setFresh(new Set(d.items.filter((i) => before.get(i.series.id) !== i.chapters[0]?.number).map((i) => i.series.id)));
          return d;
        });
      })
      .catch(() => {});
  }, [chapterTick, pageSize, type, initial?.page]);

  if (!data?.items.length) {
    return (
      <p className="rounded-lg border border-dashed border-line px-5 py-10 text-center text-sm text-muted">
        New chapters show up here automatically as soon as they are released.
      </p>
    );
  }

  return (
    <ul className={cn("grid gap-3 sm:grid-cols-2 xl:grid-cols-3", className)} aria-live="polite">
      {data.items.map(({ series: s, chapters }) => (
        <li key={s.id} className={cn("flex gap-3.5 rounded-lg border border-line bg-surface p-3.5 transition-colors", fresh.has(s.id) && "bg-[color-mix(in_oklab,var(--violet)_10%,var(--surface))]")}>
          <Link href={`/manga/${s.slug}`} className="shrink-0" tabIndex={-1} aria-hidden>
            <Cover title={s.title} coverUrl={s.coverUrl} genres={s.genres.map((g) => g.slug)} compact className="w-[72px] rounded" sizes="72px" />
          </Link>
          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-2">
              <Link href={`/manga/${s.slug}`} className="line-clamp-2 font-display text-[1.05rem] leading-snug font-medium hover:text-lilac">
                {s.title}
              </Link>
              <TypeBadge type={s.type} />
            </div>
            <ul className="mt-2 space-y-1">
              {chapters.map((c) => (
                <li key={c.number}>
                  <Link
                    href={`/manga/${s.slug}/chapter/${c.number}`}
                    className="flex items-center justify-between gap-2 rounded px-1.5 py-1 text-sm hover:bg-raised"
                  >
                    <span className="flex min-w-0 items-center gap-2">
                      <span className="tabular shrink-0 text-[0.8rem]">{chapterLabel(c.number)}</span>
                      {isNew(c.releasedAt) && <span className="rounded-sm bg-violet px-1.5 py-px text-[0.65rem] font-semibold tracking-wider text-on-accent">NEW</span>}
                    </span>
                    <span className="shrink-0 text-xs text-muted">{c.releasedAt ? timeAgo(c.releasedAt) : ""}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </li>
      ))}
    </ul>
  );
}
