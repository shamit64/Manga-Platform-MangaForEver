"use client";

import type { ChapterDTO, Paginated } from "@mangaforever/shared";
import { ArrowDownUp, BookOpen, ExternalLink } from "lucide-react";
import Link from "next/link";
import * as React from "react";
import { Button } from "@/components/ui/button";
import { chapterLabel, cn, formatDate, isNew, timeAgo } from "@/lib/utils";

type Page = Paginated<ChapterDTO> & { first: number | null; latest: number | null };

/** Full chapter list with newest/oldest order and "show more". Each row says where it opens. */
export function ChapterList({ slug, initial, progress }: { slug: string; initial: Page | null; progress?: number | null }) {
  const [order, setOrder] = React.useState<"desc" | "asc">("desc");
  const [items, setItems] = React.useState(initial?.items ?? []);
  const [page, setPage] = React.useState(1);
  const [total, setTotal] = React.useState(initial?.total ?? 0);
  const [loading, setLoading] = React.useState(false);

  async function load(nextOrder: "desc" | "asc", nextPage: number) {
    setLoading(true);
    try {
      const r: Page = await fetch(`/api/v1/manga/${slug}/chapters?order=${nextOrder}&page=${nextPage}&pageSize=50`).then((x) => x.json());
      setItems((prev) => (nextPage === 1 ? r.items : [...prev, ...r.items]));
      setTotal(r.total);
      setPage(nextPage);
    } finally {
      setLoading(false);
    }
  }

  if (!total) return null;
  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <p className="text-sm text-muted">{total.toLocaleString()} chapters</p>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            const o = order === "desc" ? "asc" : "desc";
            setOrder(o);
            load(o, 1);
          }}
        >
          <ArrowDownUp /> {order === "desc" ? "Newest first" : "Oldest first"}
        </Button>
      </div>
      <ul className="divide-y divide-line overflow-hidden rounded-lg border border-line bg-surface">
        {items.map((c) => {
          const read = progress != null && c.number <= progress;
          return (
            <li key={c.id}>
              <Link href={`/manga/${slug}/chapter/${c.number}`} className={cn("flex items-center gap-3 px-4 py-3 text-sm hover:bg-raised", read && "text-muted")}>
                <span className="tabular w-20 shrink-0">{chapterLabel(c.number)}</span>
                <span className="min-w-0 flex-1 truncate">
                  {c.title ?? ""}
                  {isNew(c.releasedAt) && <span className="ml-2 rounded-sm bg-violet px-1.5 py-px text-[0.65rem] font-semibold tracking-wider text-on-accent">NEW</span>}
                </span>
                <span className="hidden items-center gap-1 text-xs text-muted sm:inline-flex">
                  {c.readable ? (
                    <><BookOpen className="size-3.5" /> Read here</>
                  ) : c.externalUrl ? (
                    <><ExternalLink className="size-3.5" /> {c.publisher ?? "Official"}</>
                  ) : (
                    "Official sources"
                  )}
                </span>
                <span className="w-24 shrink-0 text-right text-xs text-muted" title={formatDate(c.releasedAt)}>
                  {c.releasedAt ? timeAgo(c.releasedAt) : ""}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
      {items.length < total && (
        <Button variant="outline" className="mt-3 w-full" disabled={loading} onClick={() => load(order, page + 1)}>
          {loading ? "Loading…" : "Show more chapters"}
        </Button>
      )}
    </div>
  );
}
