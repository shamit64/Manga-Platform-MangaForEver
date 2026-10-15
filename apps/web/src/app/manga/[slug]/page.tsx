import {
  CONTENT_TYPE_LABELS,
  DATA_SOURCE_LABELS,
  DEMOGRAPHIC_LABELS,
  PUBLICATION_STATUS_LABELS,
  type Paginated,
  type Recommendation,
  type ReviewDTO,
  type SeriesDetail,
} from "@mangaforever/shared";
import { ExternalLink, Info, Star } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { EmptyState } from "@/components/layout/section";
import { GenreChip, SampleBadge, StatusBadge, TypeBadge } from "@/components/manga/badges";
import { Cover } from "@/components/manga/cover";
import { DetailTabs, ViewTracker } from "@/components/manga/detail-tabs";
import { SeriesActions } from "@/components/manga/series-actions";
import { SeriesCard } from "@/components/manga/series-card";
import { ReviewsPanel } from "@/components/reviews/reviews-panel";
import { ServerApiError, getMe, serverApi, tryServerApi } from "@/lib/server-api";
import { formatCount, formatDate, formatScore } from "@/lib/utils";

type Params = { params: Promise<{ slug: string }> };

async function load(slug: string) {
  try {
    return await serverApi<SeriesDetail>(`/manga/${encodeURIComponent(slug)}`);
  } catch (e) {
    if (e instanceof ServerApiError && e.status === 404) notFound();
    throw e;
  }
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { slug } = await params;
  const s = await tryServerApi<SeriesDetail>(`/manga/${encodeURIComponent(slug)}`);
  if (!s) return { title: "Series not found" };
  return {
    title: s.title,
    description: s.synopsis ?? undefined,
    openGraph: { title: s.title, description: s.synopsis ?? undefined, images: s.coverUrl ? [s.coverUrl] : undefined },
  };
}

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="py-2.5">
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="mt-0.5 text-sm">{children}</dd>
    </div>
  );
}

const Unknown = () => <span className="text-muted">Unknown</span>;

export default async function SeriesPage({ params }: Params) {
  const { slug } = await params;
  const [s, me] = await Promise.all([load(slug), getMe()]);
  const [related, reviews] = await Promise.all([
    tryServerApi<{ items: Recommendation[] }>(`/manga/${s.id}/recommendations`, { limit: 12 }),
    tryServerApi<Paginated<ReviewDTO>>(`/manga/${s.id}/reviews`, { sort: "helpful", pageSize: 10 }),
  ]);
  const native = s.altTitles.find((t) => /[^\x00-\x7F]/.test(t));
  const authors = s.creators.filter((c) => c.role !== "ART");
  const artists = s.creators.filter((c) => c.role !== "STORY");

  const overview = (
    <div className="grid gap-10 lg:grid-cols-[1fr_300px]">
      <div className="max-w-[68ch]">
        <h2 className="mb-2 font-display text-xl font-semibold">Synopsis</h2>
        <p className="leading-relaxed text-text/90">{s.synopsis ?? "No synopsis is available for this series yet."}</p>
        {s.description && s.description !== s.synopsis && (
          <>
            <h2 className="mt-8 mb-2 font-display text-xl font-semibold">Description</h2>
            {/* Plain text from the provider (HTML stripped on import) */}
            <p className="leading-relaxed whitespace-pre-line text-text/90">{s.description}</p>
          </>
        )}
        {s.tags.length > 0 && (
          <>
            <h2 className="mt-8 mb-3 font-display text-xl font-semibold">Themes & tags</h2>
            <ul className="flex flex-wrap gap-1.5">
              {s.tags.map((t) => (
                <li key={t.slug}>
                  <Link href={`/explore?tags=${t.slug}`} className="rounded-full border border-line px-2.5 py-1 text-xs text-muted hover:border-violet hover:text-text">
                    {t.name}
                  </Link>
                </li>
              ))}
            </ul>
          </>
        )}
        {s.localizedTitles && Object.keys(s.localizedTitles).length > 0 && (
          <>
            <h2 className="mt-8 mb-2 font-display text-xl font-semibold">Titles</h2>
            <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-1 text-sm">
              {Object.entries(s.localizedTitles).map(([lang, t]) => (
                <div key={lang} className="contents">
                  <dt className="text-muted capitalize">{lang === "en" ? "English" : lang === "native" ? "Native" : lang === "romaji" ? "Romaji" : lang}</dt>
                  <dd>{t}</dd>
                </div>
              ))}
              {s.altTitles
                .filter((t) => !Object.values(s.localizedTitles ?? {}).includes(t))
                .map((t) => (
                  <div key={t} className="contents">
                    <dt className="text-muted">Also known as</dt>
                    <dd>{t}</dd>
                  </div>
                ))}
            </dl>
          </>
        )}
        <div className="mt-8 flex gap-3 rounded-2xl border border-line bg-surface p-4 text-sm text-muted">
          <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
          <p>
            MangaForEver is a catalog and tracker. This page lists metadata only — chapters are not hosted or linked here. Read through the
            series’ official publisher{s.publisher ? ` (${s.publisher})` : ""}.
          </p>
        </div>
      </div>

      <aside className="space-y-5">
        <div className="rounded-2xl border border-line bg-surface p-5">
          <h2 className="font-display font-semibold">Ratings</h2>
          <div className="mt-3 flex items-end gap-2">
            <Star className="mb-1 size-6 fill-gold text-gold" aria-hidden />
            <span className="font-display text-4xl font-extrabold tabular-nums">{formatScore(s.ratingAvg)}</span>
            <span className="mb-1 text-sm text-muted">/ 10</span>
          </div>
          <p className="text-sm text-muted">MangaForEver members · {s.ratingCount ? `${s.ratingCount} ratings` : "no ratings yet"}</p>
          <div className="mt-4 border-t border-line pt-3 text-sm">
            {s.externalRating !== null ? (
              <p>
                <span className="font-semibold tabular-nums">{formatScore(s.externalRating)}</span>
                <span className="text-muted"> / 10 · {s.externalRatingSource}</span>
              </p>
            ) : (
              <p className="text-muted">No external rating — this entry has no provider score.</p>
            )}
          </div>
        </div>
        <div className="grid grid-cols-3 gap-2 text-center">
          {[
            ["Rank", s.communityRank ? `#${s.communityRank}` : "—"],
            ["Favorites", formatCount(s.favoriteCount)],
            ["Reviews", formatCount(s.reviewCount)],
          ].map(([label, value]) => (
            <div key={label} className="rounded-xl border border-line bg-surface p-3">
              <p className="font-display text-xl font-bold tabular-nums">{value}</p>
              <p className="text-xs text-muted">{label}</p>
            </div>
          ))}
        </div>
        {s.externalPopularity !== null && (
          <p className="text-xs text-muted">
            {formatCount(s.externalPopularity)} AniList users track this series{s.externalPopularityRank ? ` (#${s.externalPopularityRank} most popular on AniList)` : ""}.
          </p>
        )}
      </aside>
    </div>
  );

  const chapters = s.chapters.length ? (
    <ul className="divide-y divide-line rounded-2xl border border-line bg-surface">
      {s.chapters.map((c) => (
        <li key={`${c.source}-${c.number}`} className="flex items-center justify-between px-4 py-3 text-sm">
          <span>
            Chapter {c.number}
            {c.title ? ` — ${c.title}` : ""}
          </span>
          <span className="text-muted">
            {formatDate(c.releasedAt)} · {c.source}
          </span>
        </li>
      ))}
    </ul>
  ) : (
    <EmptyState
      title="No chapter list for this series"
      description={
        <>
          Chapter release data comes only from metadata providers that publish it, and none is available for this entry.
          {s.chapterCount ? ` The series has ${s.chapterCount} chapters in total.` : " The total chapter count is unknown."} You can still track progress from your library.
        </>
      }
    />
  );

  const creators = (
    <div className="grid gap-6 sm:grid-cols-2">
      {[
        ["Story", authors],
        ["Art", artists],
      ].map(([label, list]) => (
        <div key={label as string}>
          <h3 className="mb-3 font-display font-semibold">{label as string}</h3>
          {(list as typeof authors).length ? (
            <ul className="space-y-2">
              {(list as typeof authors).map((c) => (
                <li key={c.slug}>
                  <Link href={`/explore?creator=${encodeURIComponent(c.name)}`} className="flex items-center justify-between rounded-xl border border-line bg-surface px-4 py-3 hover:border-violet/60">
                    <span className="font-medium">{c.name}</span>
                    <span className="text-xs text-muted">See their series</span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted">Unknown</p>
          )}
        </div>
      ))}
      <p className="text-sm text-muted sm:col-span-2">Character data isn’t available from the current metadata sources.</p>
    </div>
  );

  const recs = related?.items.length ? (
    <div className="grid grid-cols-2 gap-x-4 gap-y-7 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
      {related.items.map((r) => (
        <SeriesCard key={r.series.id} series={r.series} reasons={r.reasons} />
      ))}
    </div>
  ) : (
    <EmptyState title="No similar series found yet" />
  );

  return (
    <div>
      <ViewTracker seriesId={s.id} enabled={!!me} />
      {/* Banner */}
      <div className="relative -mx-4 h-44 overflow-hidden sm:-mx-6 sm:h-56">
        {s.bannerUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={s.bannerUrl} alt="" className="h-full w-full object-cover opacity-60" />
        ) : (
          <div className="relative h-full w-full overflow-hidden" style={{ background: `linear-gradient(120deg, color-mix(in oklab, ${"var(--violet)"} 30%, transparent), color-mix(in oklab, var(--pink) 18%, transparent) 55%, color-mix(in oklab, var(--cyan) 16%, transparent))` }}>
            <div className="tone absolute inset-0 opacity-70" />
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-ink via-ink/40 to-transparent" />
      </div>

      <div className="relative -mt-28 grid gap-8 sm:-mt-32 md:grid-cols-[220px_1fr]">
        <Cover
          title={s.title}
          nativeTitle={native}
          coverUrl={s.coverUrl}
          type={s.type}
          year={s.releaseYear}
          genres={s.genres.map((g) => g.slug)}
          priority
          sizes="220px"
          className="mx-auto w-44 shadow-[0_30px_60px_-30px_var(--glow)] ring-4 ring-ink md:w-full"
        />
        <div className="md:pt-24">
          <div className="flex flex-wrap items-center gap-2">
            <TypeBadge type={s.type} />
            <StatusBadge status={s.status} />
            <SampleBadge source={s.source} />
          </div>
          <h1 className="mt-3 text-3xl leading-tight font-extrabold sm:text-5xl" style={{ fontVariationSettings: '"wdth" 85' }}>
            {s.title}
          </h1>
          {s.altTitles.length > 0 && <p className="mt-1.5 text-muted">{s.altTitles.slice(0, 3).join(" · ")}</p>}
          <ul className="mt-4 flex flex-wrap gap-1.5">
            {s.genres.map((g) => (
              <li key={g.slug}>
                <GenreChip slug={g.slug} name={g.name} href={`/explore?genres=${g.slug}`} size="md" />
              </li>
            ))}
          </ul>
          <div className="mt-6">
            <SeriesActions series={s} viewer={s.viewer} />
          </div>

          <dl className="mt-6 grid grid-cols-2 gap-x-6 border-t border-line sm:grid-cols-3 lg:grid-cols-4">
            <Fact label="Author">{authors.length ? authors.map((a) => a.name).join(", ") : <Unknown />}</Fact>
            <Fact label="Artist">{artists.length ? artists.map((a) => a.name).join(", ") : <Unknown />}</Fact>
            <Fact label="Type">{CONTENT_TYPE_LABELS[s.type]}{s.countryOfOrigin ? ` · ${s.countryOfOrigin}` : ""}</Fact>
            <Fact label="Published by">{s.publisher ?? <Unknown />}</Fact>
            <Fact label="Status">{PUBLICATION_STATUS_LABELS[s.status]}</Fact>
            <Fact label="Released">
              {s.startDate ? formatDate(s.startDate) : s.releaseYear ?? <Unknown />}
              {s.endDate ? ` – ${formatDate(s.endDate)}` : ""}
            </Fact>
            <Fact label="Chapters / volumes">
              {s.chapterCount ?? <Unknown />} / {s.volumeCount ?? <Unknown />}
            </Fact>
            <Fact label="Demographic">{s.demographic ? DEMOGRAPHIC_LABELS[s.demographic] : <Unknown />}</Fact>
          </dl>
          <p className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
            <span>Metadata source: {DATA_SOURCE_LABELS[s.source]}</span>
            {s.coverUrl && s.externalProvider === "anilist" && <span>Cover art via AniList</span>}
            {s.lastSyncedAt && <span>Last synced {formatDate(s.lastSyncedAt)}</span>}
            {s.externalUrls.map((u) => (
              <a key={u.url} href={u.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-lilac hover:underline">
                {u.label} <ExternalLink className="size-3" />
              </a>
            ))}
          </p>
        </div>
      </div>

      <div className="mt-10">
        <DetailTabs
          tabs={[
            { value: "overview", label: "Overview", content: overview },
            { value: "chapters", label: "Chapters", content: chapters },
            { value: "reviews", label: `Reviews (${s.reviewCount})`, content: reviews ? (
              <ReviewsPanel seriesId={s.id} initial={reviews} viewerRating={s.viewer?.rating ?? null} viewerReviewId={s.viewer?.reviewId ?? null} />
            ) : <EmptyState title="Reviews couldn't load" /> },
            { value: "creators", label: "Creators", content: creators },
            { value: "recommendations", label: "Similar series", content: recs },
          ]}
        />
      </div>
    </div>
  );
}
