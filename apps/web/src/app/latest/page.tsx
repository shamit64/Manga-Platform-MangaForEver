import { CONTENT_TYPES, CONTENT_TYPE_LABELS, DATA_SOURCE_LABELS, type DataSource, type SeriesCard } from "@mangaforever/shared";
import type { Metadata } from "next";
import Link from "next/link";
import { EmptyState, ErrorNotice, PageHeader, Section } from "@/components/layout/section";
import { TypeBadge } from "@/components/manga/badges";
import { Cover } from "@/components/manga/cover";
import { tryServerApi } from "@/lib/server-api";
import { cn, formatDate, timeAgo } from "@/lib/utils";

export const metadata: Metadata = { title: "Latest updates" };

type Latest = {
  catalogUpdates: { series: SeriesCard; updatedAt: string; source: DataSource; lastSyncedAt: string | null }[];
  chapterReleases: { series: SeriesCard; chapter: number; title: string | null; releasedAt: string; source: string; externalUrl: string | null }[];
};

export default async function LatestPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const type = CONTENT_TYPES.find((t) => t === sp.type);
  const data = await tryServerApi<Latest>("/latest", { limit: 50, type });
  return (
    <div>
      <PageHeader title="Latest updates" description="What changed in the catalog recently. Chapter releases only appear when a metadata provider supplies real dates." />
      <nav className="flex flex-wrap gap-1.5" aria-label="Content type">
        {[undefined, ...CONTENT_TYPES].map((t) => (
          <Link key={t ?? "all"} href={t ? `/latest?type=${t}` : "/latest"} className={cn("rounded-full border px-3.5 py-1.5 text-sm", t === type ? "border-violet bg-violet/15" : "border-line text-muted hover:text-text")}>
            {t ? CONTENT_TYPE_LABELS[t] : "All"}
          </Link>
        ))}
      </nav>
      {!data ? (
        <div className="mt-6"><ErrorNotice title="Updates couldn't load" /></div>
      ) : (
        <>
          <Section title="Chapter releases" description="From providers that publish chapter dates.">
            {data.chapterReleases.length ? (
              <ul className="divide-y divide-line rounded-2xl border border-line bg-surface">
                {data.chapterReleases.map((c) => (
                  <li key={`${c.series.id}-${c.chapter}`} className="flex items-center gap-3 px-4 py-3">
                    <Cover title={c.series.title} coverUrl={c.series.coverUrl} genres={c.series.genres.map((g) => g.slug)} compact className="w-10 rounded-md" sizes="40px" />
                    <div className="min-w-0 flex-1">
                      <Link href={`/manga/${c.series.slug}`} className="font-medium hover:text-lilac">{c.series.title}</Link>
                      <p className="text-xs text-muted">Chapter {c.chapter}{c.title ? ` — ${c.title}` : ""} · {formatDate(c.releasedAt)} · {c.source}</p>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState title="No chapter release data" description="None of the configured metadata sources publish chapter release dates, so MangaForEver doesn't show any rather than guess." />
            )}
          </Section>
          <Section title="Catalog updates" description="Entries whose metadata (titles, synopsis, status, creators…) changed most recently — not the series' publication dates.">
            {data.catalogUpdates.length ? (
              <ul className="divide-y divide-line rounded-2xl border border-line bg-surface">
                {data.catalogUpdates.map((u) => (
                  <li key={u.series.id}>
                    <Link href={`/manga/${u.series.slug}`} className="flex items-center gap-3 px-4 py-3 hover:bg-raised/40">
                      <Cover title={u.series.title} coverUrl={u.series.coverUrl} genres={u.series.genres.map((g) => g.slug)} compact className="w-10 shrink-0 rounded-md" sizes="40px" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-medium">{u.series.title}</p>
                        <p className="text-xs text-muted">
                          Updated {timeAgo(u.updatedAt)} · Source: {DATA_SOURCE_LABELS[u.source]}
                          {u.lastSyncedAt ? ` · last synced ${formatDate(u.lastSyncedAt)}` : ""}
                        </p>
                      </div>
                      <TypeBadge type={u.series.type} />
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState title="No catalog updates yet" />
            )}
          </Section>
        </>
      )}
    </div>
  );
}
