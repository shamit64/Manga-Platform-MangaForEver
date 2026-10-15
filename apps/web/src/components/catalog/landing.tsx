import type { LatestUpdate, Paginated, RankingResponse, SeriesCard as Card } from "@mangaforever/shared";
import Link from "next/link";
import { PageHeader, Section } from "@/components/layout/section";
import { LatestUpdatesGrid } from "@/components/live/latest-updates";
import { SeriesGrid, Shelf } from "@/components/manga/series-card";
import { Button } from "@/components/ui/button";
import { tryServerApi } from "@/lib/server-api";

/**
 * Landing page for a content type (/manga, /manhwa, /manhua) or a genre (/genre/[slug]):
 * live latest chapters, top lists and a grid, each with a unique title for search engines.
 */
export async function CatalogLanding({
  title,
  description,
  type,
  genre,
  browseHref,
}: {
  title: string;
  description: string;
  type?: "MANGA" | "MANHWA" | "MANHUA";
  genre?: string;
  browseHref: string;
}) {
  const filter = { ...(type ? { type } : {}), ...(genre ? { genres: genre } : {}) };
  const [latest, popular, topRated, ongoing, completed] = await Promise.all([
    type ? tryServerApi<Paginated<LatestUpdate>>("/latest-updates", { pageSize: 9, type }) : null,
    tryServerApi<Paginated<Card>>("/manga", { ...filter, sort: "popularity", pageSize: 24 }),
    type ? tryServerApi<RankingResponse>("/rankings", { kind: "top-rated", type, limit: 12 }) : tryServerApi<Paginated<Card>>("/manga", { ...filter, sort: "rating", pageSize: 12 }),
    tryServerApi<Paginated<Card>>("/manga", { ...filter, status: "ONGOING", sort: "updated", pageSize: 12 }),
    tryServerApi<Paginated<Card>>("/manga", { ...filter, status: "COMPLETED", sort: "popularity", pageSize: 12 }),
  ]);
  const top = topRated ? ("items" in topRated ? topRated.items : []) : [];
  return (
    <div>
      <PageHeader title={title} description={description}>
        <Button asChild variant="outline">
          <Link href={browseHref}>Filter and sort</Link>
        </Button>
      </PageHeader>
      {latest?.items.length ? (
        <Section title="Latest chapters" href={type ? `/latest?type=${type}` : "/latest"} hrefLabel="All updates">
          <LatestUpdatesGrid initial={latest} pageSize={9} type={type} />
        </Section>
      ) : null}
      {top.length ? (
        <Section title="Top rated" href={type ? `/rankings?kind=top-rated&type=${type}` : `${browseHref}&sort=rating`}>
          <Shelf items={top} />
        </Section>
      ) : null}
      {ongoing?.items.length ? (
        <Section title="Ongoing" description="Still releasing new chapters." href={`${browseHref}&status=ONGOING`}>
          <Shelf items={ongoing.items} />
        </Section>
      ) : null}
      {completed?.items.length ? (
        <Section title="Completed" description="Finished series you can read start to end." href={`${browseHref}&status=COMPLETED`}>
          <Shelf items={completed.items} />
        </Section>
      ) : null}
      <Section title="Most popular" href={browseHref} hrefLabel={`Browse all ${popular?.total.toLocaleString() ?? ""}`}>
        {popular?.items.length ? <SeriesGrid items={popular.items} /> : <p className="text-sm text-muted">Nothing here yet.</p>}
      </Section>
    </div>
  );
}
