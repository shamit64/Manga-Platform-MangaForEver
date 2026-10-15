import { CONTENT_TYPES, CONTENT_TYPE_LABELS, type SeriesCard } from "@mangaforever/shared";
import type { Metadata } from "next";
import Link from "next/link";
import { EmptyState, ErrorNotice, PageHeader } from "@/components/layout/section";
import { SeriesGrid } from "@/components/manga/series-card";
import { tryServerApi } from "@/lib/server-api";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "New releases" };

export default async function NewPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const by = sp.by === "added" ? "added" : "published";
  const type = CONTENT_TYPES.find((t) => t === sp.type);
  const year = sp.year && /^\d{4}$/.test(sp.year) ? sp.year : undefined;
  const data = await tryServerApi<{ items: SeriesCard[] }>("/new-releases", { by, type, year, limit: 60 });
  const href = (o: Record<string, string | undefined>) => {
    const p = new URLSearchParams(Object.entries({ by, type, year, ...o }).filter((e): e is [string, string] => !!e[1]));
    return `/new?${p}`;
  };
  const thisYear = new Date().getFullYear();

  return (
    <div>
      <PageHeader
        title={by === "published" ? "New releases" : "Recently added"}
        description={
          by === "published"
            ? "Series ordered by their original publication year, newest first."
            : "Series most recently added to the MangaForEver catalog — an import date, not a publication date."
        }
      />
      <div className="flex flex-wrap items-center gap-4">
        <nav className="flex rounded-xl border border-line p-1" aria-label="Order by">
          {[["published", "Newly published"], ["added", "Newly added to MangaForEver"]].map(([k, label]) => (
            <Link key={k} href={href({ by: k, year: k === "added" ? undefined : year })} aria-current={by === k ? "page" : undefined}
              className={cn("rounded-lg px-3 py-1.5 text-sm", by === k ? "bg-violet text-white" : "text-muted hover:text-text")}>
              {label}
            </Link>
          ))}
        </nav>
        <nav className="flex flex-wrap gap-1.5" aria-label="Content type">
          {[undefined, ...CONTENT_TYPES].map((t) => (
            <Link key={t ?? "all"} href={href({ type: t })} className={cn("rounded-full border px-3 py-1.5 text-sm", t === type ? "border-violet bg-violet/15" : "border-line text-muted hover:text-text")}>
              {t ? CONTENT_TYPE_LABELS[t] : "All types"}
            </Link>
          ))}
        </nav>
        {by === "published" && (
          <nav className="flex flex-wrap gap-1.5" aria-label="Year">
            {[undefined, ...Array.from({ length: 6 }, (_, i) => String(thisYear - i))].map((y) => (
              <Link key={y ?? "any"} href={href({ year: y })} className={cn("rounded-full border px-3 py-1.5 text-sm tabular-nums", y === year ? "border-violet bg-violet/15" : "border-line text-muted hover:text-text")}>
                {y ?? "Any year"}
              </Link>
            ))}
          </nav>
        )}
      </div>
      <div className="mt-8">
        {!data ? <ErrorNotice title="New releases couldn't load" /> : data.items.length ? <SeriesGrid items={data.items} /> : <EmptyState title="Nothing here yet" description="No series match this year and type." />}
      </div>
    </div>
  );
}
