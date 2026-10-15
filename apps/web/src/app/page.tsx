import {
  SEASON_LABELS,
  type LatestUpdate,
  type LibraryEntryDTO,
  type Paginated,
  type RankingResponse,
  type RecommendationShelf,
  type SeasonalCollectionDTO,
  type SeriesCard as Card,
  type SeriesDetail,
} from "@mangaforever/shared";
import Link from "next/link";
import { Hero, type HeroItem } from "@/components/home/hero";
import { TopTen } from "@/components/home/top-ten";
import { LatestUpdatesGrid } from "@/components/live/latest-updates";
import { EmptyState, ErrorNotice, Section } from "@/components/layout/section";
import { CommunityScore, TypeBadge } from "@/components/manga/badges";
import { Cover } from "@/components/manga/cover";
import { SeriesCard, Shelf } from "@/components/manga/series-card";
import { getMe, tryServerApi } from "@/lib/server-api";
import { chapterLabel, timeAgo } from "@/lib/utils";

export const dynamic = "force-dynamic";


export default async function HomePage() {
  const me = await getMe();
  const types = ["ALL", "MANGA", "MANHWA", "MANHUA"] as const;
  const [featured, latest, newest, added, seasonal, trending, topRated, mostReviewed, mostFavorited, recs, cont, recent, genres, ...tops] = await Promise.all([
    tryServerApi<{ items: HeroItem[] }>("/featured"),
    tryServerApi<Paginated<LatestUpdate>>("/latest-updates", { pageSize: 12 }),
    tryServerApi<{ items: Card[] }>("/new-releases", { by: "published", limit: 12 }),
    tryServerApi<{ items: Card[] }>("/new-releases", { by: "added", limit: 12 }),
    tryServerApi<{ season: string; year: number; collections: SeasonalCollectionDTO[] }>("/seasonal"),
    tryServerApi<RankingResponse>("/rankings", { kind: "trending", limit: 12 }),
    tryServerApi<RankingResponse>("/rankings", { kind: "top-rated", limit: 6 }),
    tryServerApi<RankingResponse>("/rankings", { kind: "most-reviewed", limit: 6 }),
    tryServerApi<RankingResponse>("/rankings", { kind: "most-favorited", limit: 6 }),
    tryServerApi<{ personalised: boolean; shelves: RecommendationShelf[] }>("/recommendations", { limit: 12 }),
    me ? tryServerApi<{ items: LibraryEntryDTO[] }>("/library/continue") : null,
    me ? tryServerApi<{ items: { series: Card; lastViewedAt: string }[] }>("/history/recent") : null,
    tryServerApi<{ items: { name: string; slug: string; count: number }[] }>("/genres"),
    ...types.map((t) => tryServerApi<RankingResponse>("/rankings", { kind: "popular", limit: 10, type: t === "ALL" ? undefined : t })),
  ]);

  // Viewer state for hero buttons (signed-in only).
  let heroItems = featured?.items ?? [];
  if (me && heroItems.length) {
    const details = await Promise.all(heroItems.map((h) => tryServerApi<SeriesDetail>(`/manga/${h.series.id}`)));
    heroItems = heroItems.map((h, i) => ({ ...h, series: details[i] ?? h.series }));
  }

  const apiDown = !featured && !latest && !newest;

  return (
    <div>
      {apiDown ? (
        <div className="pt-10">
          <ErrorNotice
            title="MangaForEver can't reach its API right now"
            description="The catalog server didn't respond. If you're running locally, start the API with `npm run dev` and refresh."
          />
        </div>
      ) : heroItems.length ? (
        <Hero items={heroItems} />
      ) : null}

      {me && cont?.items.length ? (
        <Section title="Continue reading" description="Pick up where you left off." href="/my-list?status=READING" hrefLabel="My List">
          <div className="-mx-4 flex gap-4 overflow-x-auto px-4 pb-2 scrollbar-none sm:-mx-6 sm:px-6">
            {cont.items.map((e) => (
              <Link key={e.id} href={`/manga/${e.series!.slug}`} className="group flex w-72 shrink-0 gap-3 rounded-lg border border-line bg-surface p-3 hover:border-text/40">
                <Cover title={e.series!.title} coverUrl={e.series!.coverUrl} genres={e.series!.genres.map((g) => g.slug)} compact className="w-14 shrink-0 rounded-md" sizes="56px" />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold group-hover:text-lilac">{e.series!.title}</p>
                  <p className="mt-0.5 text-sm text-muted">
                    Chapter {e.progressChapter}
                    {e.series!.chapterCount ? ` of ${e.series!.chapterCount}` : e.series!.latestChapter ? ` · latest ${chapterLabel(e.series!.latestChapter)}` : ""}
                  </p>
                  {e.series!.chapterCount ? (
                    <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-line" role="progressbar" aria-valuenow={e.progressChapter} aria-valuemax={e.series!.chapterCount} aria-label="Reading progress">
                      <div className="h-full bg-violet" style={{ width: `${Math.min(100, (e.progressChapter / e.series!.chapterCount) * 100)}%` }} />
                    </div>
                  ) : null}
                  <p className="mt-1.5 text-xs text-muted">Updated {timeAgo(e.updatedAt)}</p>
                </div>
              </Link>
            ))}
          </div>
        </Section>
      ) : null}

      <Section title="Latest updates" description="New chapters, refreshed live as they release." href="/latest" hrefLabel="All updates">
        <LatestUpdatesGrid initial={latest} pageSize={12} />
      </Section>

      {genres?.items.length ? (
        <nav aria-label="Genres" className="-mx-4 flex gap-2 overflow-x-auto px-4 py-2 scrollbar-none sm:-mx-6 sm:px-6">
          {genres.items.filter((g) => g.count > 0).map((g) => (
            <Link key={g.slug} href={`/genre/${g.slug}`} className="shrink-0 rounded-full border border-line px-3.5 py-1.5 text-sm text-muted hover:border-text hover:text-text">
              {g.name}
            </Link>
          ))}
        </nav>
      ) : null}

      <Section title="Top 10 on MangaForEver" description="Ranked by member activity — not sales or external charts." href="/rankings" hrefLabel="All rankings">
        <TopTen data={Object.fromEntries(types.map((t, i) => [t, tops[i] as RankingResponse | null]))} />
      </Section>

      {recs?.shelves.slice(0, me && recs.personalised ? 4 : 1).map((shelf) => (
        <Section
          key={shelf.key}
          title={recs.personalised ? shelf.title : me ? "Recommended to start with" : shelf.title}
          description={recs.personalised ? shelf.explanation : "Add a few series to your list and we’ll tailor this to you."}
          href="/recommendations"
        >
          <Shelf items={shelf.items.map((i) => i.series)} reasons={Object.fromEntries(shelf.items.map((i) => [i.series.id, i.reasons]))} />
        </Section>
      ))}

      {featured?.items.length ? (
        <Section title="Featured" description="Picked automatically every day from new chapters, new readers and ratings, with the reason.">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {featured.items.slice(0, 3).map(({ series: s, reason }) => (
              <Link key={s.id} href={`/manga/${s.slug}`} className="group flex gap-4 rounded-lg border border-line bg-surface p-4 hover:border-text/40">
                <Cover title={s.title} coverUrl={s.coverUrl} genres={s.genres.map((g) => g.slug)} type={s.type} className="w-24 shrink-0" sizes="96px" />
                <div className="min-w-0">
                  <TypeBadge type={s.type} />
                  <p className="mt-1.5 font-display text-lg leading-tight font-bold group-hover:text-lilac">{s.title}</p>
                  <p className="mt-2 line-clamp-4 text-sm text-muted">{reason}</p>
                </div>
              </Link>
            ))}
          </div>
        </Section>
      ) : null}

      <Section title="Newest series" description="By original publication year." href="/new">
        <Shelf items={newest?.items ?? []} />
        {added?.items.length ? (
          <p className="mt-4 text-sm text-muted">
            Newly added to the catalog:{" "}
            {added.items.slice(0, 3).map((s, i) => (
              <span key={s.id}>
                {i > 0 && ", "}
                <Link className="text-lilac hover:underline" href={`/manga/${s.slug}`}>
                  {s.title}
                </Link>
              </span>
            ))}{" "}
            · <Link href="/new?by=added" className="text-lilac hover:underline">see additions</Link>
          </p>
        ) : null}
      </Section>

      {seasonal?.collections.length ? (
        <Section
          title={`${SEASON_LABELS[seasonal.season as keyof typeof SEASON_LABELS]} ${seasonal.year}: ${seasonal.collections[0].title}`}
          description={`${seasonal.collections[0].description ?? ""} Editor-curated — not an official release season.`}
          href="/seasonal"
          hrefLabel="All seasons"
        >
          <Shelf items={seasonal.collections[0].items.map((i) => i.series)} reasons={Object.fromEntries(seasonal.collections[0].items.map((i) => [i.series.id, i.note ? [i.note] : []]))} />
        </Section>
      ) : null}

      {trending?.items.length ? (
        <Section title="Trending this month" description={trending.explanation} href="/rankings?kind=trending">
          <Shelf items={trending.items} />
        </Section>
      ) : null}

      <div className="grid grid-cols-[minmax(0,1fr)] gap-x-8 md:grid-cols-[repeat(3,minmax(0,1fr))]">
        {[
          ["Highest rated", topRated, "top-rated"],
          ["Most reviewed", mostReviewed, "most-reviewed"],
          ["Most favorited", mostFavorited, "most-favorited"],
        ].map(([title, r, kind]) => {
          const ranking = r as RankingResponse | null;
          return (
            <Section key={kind as string} title={title as string} description={ranking?.explanation} href={`/rankings?kind=${kind}`} className="py-6">
              <ol className="space-y-2">
                {ranking?.items.map((s) => (
                  <li key={s.id}>
                    <Link href={`/manga/${s.slug}`} className="flex items-center gap-3 rounded-xl p-1.5 hover:bg-surface">
                      <span className="w-5 text-right font-display font-bold text-muted tabular-nums">{s.rank}</span>
                      <Cover title={s.title} coverUrl={s.coverUrl} genres={s.genres.map((g) => g.slug)} compact className="w-9 shrink-0 rounded-md" sizes="36px" />
                      <span className="min-w-0 flex-1 truncate text-sm font-medium">{s.title}</span>
                      {kind === "top-rated" ? (
                        <CommunityScore avg={s.ratingAvg} count={s.ratingCount} className="text-xs" />
                      ) : (
                        <span className="text-xs text-muted tabular-nums">{s.metric}</span>
                      )}
                    </Link>
                  </li>
                )) ?? null}
              </ol>
              {!ranking?.items.length && <p className="text-sm text-muted">Not enough member activity yet.</p>}
            </Section>
          );
        })}
      </div>

      {(["MANGA", "MANHWA", "MANHUA"] as const).map((t, idx) => {
        const r = tops[idx + 1] as RankingResponse | null;
        const label = { MANGA: "Manga", MANHWA: "Manhwa", MANHUA: "Manhua" }[t];
        return r?.items.length ? (
          <Section key={t} title={`Popular ${label.toLowerCase()}`} description={{ MANGA: "From Japan.", MANHWA: "From Korea, mostly full-colour long strips.", MANHUA: "From China." }[t]} href={`/${label.toLowerCase()}`} hrefLabel={`All ${label.toLowerCase()}`}>
            <Shelf items={r.items} />
          </Section>
        ) : null;
      })}

      {me && recent?.items.length ? (
        <Section title="Recently viewed" href="/history" hrefLabel="Your history">
          <Shelf items={recent.items.map((r) => r.series)} />
        </Section>
      ) : null}
    </div>
  );
}
