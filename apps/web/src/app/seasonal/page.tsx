import { SEASONS, SEASON_LABELS, type Season, type SeasonalCollectionDTO, type SeriesCard } from "@mangaforever/shared";
import type { Metadata } from "next";
import Link from "next/link";
import { EmptyState, ErrorNotice, PageHeader, Section } from "@/components/layout/section";
import { SeriesCard as Card, SeriesGrid } from "@/components/manga/series-card";
import { tryServerApi } from "@/lib/server-api";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Seasonal" };

type SeasonalResponse = {
  season: Season;
  year: number;
  collections: SeasonalCollectionDTO[];
  publishedThisSeason: SeriesCard[];
  availableSeasons: { season: Season; year: number }[];
};

export default async function SeasonalPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const [data, genres] = await Promise.all([
    tryServerApi<SeasonalResponse>("/seasonal", { season: sp.season, year: sp.year, genre: sp.genre }),
    tryServerApi<{ items: { name: string; slug: string }[] }>("/genres"),
  ]);
  if (!data) return <div className="pt-10"><ErrorNotice title="Seasonal collections couldn't load" /></div>;

  const thisYear = new Date().getFullYear();
  const years = [...new Set([thisYear + 1, thisYear, thisYear - 1, thisYear - 2, ...data.availableSeasons.map((a) => a.year)])].sort((a, b) => b - a);
  const href = (o: { season?: string; year?: number; genre?: string | null }) => {
    const p = new URLSearchParams({ season: o.season ?? data.season, year: String(o.year ?? data.year) });
    const g = o.genre === undefined ? sp.genre : o.genre;
    if (g) p.set("genre", g);
    return `/seasonal?${p}`;
  };
  const hasCollection = (s: Season, y: number) => data.availableSeasons.some((a) => a.season === s && a.year === y);

  return (
    <div>
      <PageHeader
        title={`${SEASON_LABELS[data.season]} ${data.year}`}
        description="Editor-curated reading lists for each season, plus any series whose known start date falls in it. Curated lists are recommendations, not official release seasons."
      />
      <div className="flex flex-wrap items-center gap-4">
        <nav className="flex gap-1.5" aria-label="Season">
          {SEASONS.map((s) => (
            <Link key={s} href={href({ season: s })} aria-current={s === data.season ? "page" : undefined}
              className={cn("relative rounded-full border px-3.5 py-1.5 text-sm", s === data.season ? "border-violet bg-violet/15" : "border-line text-muted hover:text-text")}>
              {SEASON_LABELS[s]}
              {hasCollection(s, data.year) && <span className="absolute -top-0.5 -right-0.5 size-2 rounded-full bg-violet" aria-label="has a curated list" />}
            </Link>
          ))}
        </nav>
        <nav className="flex gap-1.5" aria-label="Year">
          {years.map((y) => (
            <Link key={y} href={href({ year: y })} aria-current={y === data.year ? "page" : undefined}
              className={cn("rounded-full border px-3 py-1.5 text-sm tabular-nums", y === data.year ? "border-violet bg-violet/15" : "border-line text-muted hover:text-text")}>
              {y}
            </Link>
          ))}
        </nav>
      </div>
      <nav className="mt-3 flex flex-wrap gap-1.5" aria-label="Genre">
        <Link href={href({ genre: null })} className={cn("rounded-full px-2.5 py-1 text-xs", !sp.genre ? "bg-raised text-text" : "text-muted hover:text-text")}>All genres</Link>
        {genres?.items.map((g) => (
          <Link key={g.slug} href={href({ genre: g.slug })} className={cn("rounded-full px-2.5 py-1 text-xs", sp.genre === g.slug ? "bg-raised text-text" : "text-muted hover:text-text")}>
            {g.name}
          </Link>
        ))}
      </nav>

      {data.collections.length === 0 ? (
        <div className="mt-8">
          <EmptyState title={`No curated list for ${SEASON_LABELS[data.season]} ${data.year}`} description="Editors haven't published a collection for this season yet. Seasons with a dot have one." />
        </div>
      ) : (
        data.collections.map((c) => (
          <Section key={c.id} title={c.title} description={<>{c.description} <span className="text-lilac">Editor-curated.</span></>}>
            {c.items.length ? (
              <div className="grid grid-cols-2 gap-x-4 gap-y-7 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
                {c.items.map((i) => (
                  <Card key={i.series.id} series={i.series} reasons={i.note ? [i.note] : undefined} />
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted">No titles in this collection match the selected genre.</p>
            )}
          </Section>
        ))
      )}

      <Section
        title="Started this season"
        description="Series whose provider-supplied start date falls in this season. Sample catalog titles have no exact start dates, so they never appear here."
      >
        {data.publishedThisSeason.length ? (
          <SeriesGrid items={data.publishedThisSeason} />
        ) : (
          <EmptyState title="No dated releases for this season" description="Import titles from AniList to fill this with real start dates." />
        )}
      </Section>
    </div>
  );
}
