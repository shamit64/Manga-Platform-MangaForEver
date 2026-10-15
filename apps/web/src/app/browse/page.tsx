import type { Paginated, SeriesCard } from "@mangaforever/shared";
import { SearchX } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { EmptyState, ErrorNotice, PageHeader } from "@/components/layout/section";
import { ActiveFilters, FilterPanel, SortSelect } from "@/components/manga/filter-panel";
import { Pagination } from "@/components/manga/pagination";
import { SeriesGrid } from "@/components/manga/series-card";
import { Button } from "@/components/ui/button";
import { ServerApiError, serverApi, tryServerApi } from "@/lib/server-api";

type SP = Record<string, string | string[] | undefined>;

export async function generateMetadata({ searchParams }: { searchParams: Promise<SP> }): Promise<Metadata> {
  const { q } = await searchParams;
  return { title: q ? `Search: ${q}` : "Browse manga, manhwa and manhua", alternates: { canonical: "/browse" } };
}

const PASS = ["q", "type", "genres", "genreMode", "tags", "status", "demographic", "yearFrom", "yearTo", "creator", "minRating", "minPopularity", "updatedWithinDays", "sort", "order", "page"];

export default async function BrowsePage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const query: Record<string, string> = { pageSize: "30" };
  for (const k of PASS) {
    const v = sp[k];
    if (typeof v === "string" && v) query[k] = v;
  }
  const q = query.q;

  let data: Paginated<SeriesCard> | null = null;
  let error: string | null = null;
  try {
    // /manga/search also saves the query to the signed-in user's search history.
    data = await serverApi<Paginated<SeriesCard>>(q ? "/manga/search" : "/manga", query);
  } catch (e) {
    error = e instanceof ServerApiError && e.status === 422 ? "Some filter values aren't valid. Clear filters and try again." : "The catalog couldn't load. Try again in a moment.";
  }
  const genres = (await tryServerApi<{ items: { name: string; slug: string; count: number }[] }>("/genres"))?.items ?? [];

  return (
    <div>
      <PageHeader
        title={q ? `Results for “${q}”` : "Browse"}
        description={
          q
            ? "Matching titles, alternative and native titles, creators, genres and tags."
            : "Browse every manga, manhwa and manhua in the MangaForEver catalog."
        }
      />
      <div className="flex gap-10">
        <Suspense>
          <FilterPanel genres={genres} />
        </Suspense>
        <div className="min-w-0 flex-1">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-muted" aria-live="polite">
              {data ? `${data.total.toLocaleString()} ${data.total === 1 ? "series" : "series"}` : ""}
            </p>
            <div className="flex items-center gap-2">
              <Suspense>
                <SortSelect hasQuery={!!q} />
              </Suspense>
            </div>
          </div>
          <Suspense>
            <ActiveFilters genres={genres} />
          </Suspense>
          {error ? (
            <ErrorNotice title="Couldn't load results" description={error} action={<Button asChild variant="outline" size="sm"><Link href="/browse">Reset</Link></Button>} />
          ) : data && data.items.length === 0 ? (
            <EmptyState
              icon={<SearchX />}
              title={q ? `Nothing matches “${q}”` : "No series match these filters"}
              description="Try fewer filters, a creator's name, or a native-language title."
              action={
                <Button asChild variant="outline">
                  <Link href="/browse">Clear search and filters</Link>
                </Button>
              }
            />
          ) : data ? (
            <>
              <SeriesGrid items={data.items} className="lg:grid-cols-4 xl:grid-cols-5" />
              <Pagination page={data.page} totalPages={data.totalPages} basePath="/browse" params={sp} />
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}
