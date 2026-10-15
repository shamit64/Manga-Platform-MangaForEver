"use client";

import { DEMOGRAPHIC_LABELS, PUBLICATION_STATUS_LABELS, type SeriesDetail } from "@mangaverse/shared";
import { ChevronLeft, ChevronRight, Star } from "lucide-react";
import Link from "next/link";
import * as React from "react";
import { GenreChip, SampleBadge, TypeBadge } from "@/components/manga/badges";
import { Cover } from "@/components/manga/cover";
import { FavoriteButton, LibraryButton } from "@/components/manga/series-actions";
import { Button } from "@/components/ui/button";
import { cn, formatScore } from "@/lib/utils";

export interface HeroItem {
  reason: string;
  series: SeriesDetail;
}

/**
 * Editor's-pick carousel laid out like a manga page: one tall cover panel and two smaller panels
 * separated by heavy gutters. The one deliberate motion on the site is the panels settling in.
 */
export function Hero({ items }: { items: HeroItem[] }) {
  const [i, setI] = React.useState(0);
  const item = items[i];
  if (!item) return null;
  const s = item.series;
  const native = s.altTitles.find((t) => /[^\x00-\x7F]/.test(t));
  const alt = s.altTitles.find((t) => t !== native) ?? native;
  const go = (d: number) => setI((x) => (x + d + items.length) % items.length);

  return (
    <section aria-roledescription="carousel" aria-label="Editor's picks" className="relative pt-8 pb-6 sm:pt-12">
      <div className="aurora pointer-events-none absolute inset-x-[-10vw] -top-24 -z-10 h-[560px] opacity-90" aria-hidden />
      <div className="tone tone-fade pointer-events-none absolute inset-x-[-50vw] top-0 -z-10 h-[420px] opacity-60" aria-hidden />
      <div className="grid items-center gap-8 lg:grid-cols-[1fr_minmax(0,560px)] lg:gap-12">
        <div key={s.id} className="order-2 lg:order-1" aria-live="polite">
          <p className="mb-4 inline-flex items-center gap-1.5 rounded-full border border-amber/40 bg-amber/10 px-3 py-1 text-sm text-amber">
            <Star className="size-3.5 fill-current" aria-hidden /> Editor’s pick {i + 1} of {items.length}
          </p>
          <h1
            className="text-4xl leading-[0.95] font-extrabold sm:text-6xl"
            style={{ fontVariationSettings: '"wdth" 80' }}
          >
            {s.title}
          </h1>
          {alt && <p className="mt-2 text-lg text-muted">{alt}</p>}
          <div className="mt-4 flex flex-wrap items-center gap-2 text-sm">
            <TypeBadge type={s.type} />
            <span className="text-muted">{PUBLICATION_STATUS_LABELS[s.status]}</span>
            {s.releaseYear && <span className="text-muted">· {s.releaseYear}</span>}
            {s.demographic && <span className="text-muted">· {DEMOGRAPHIC_LABELS[s.demographic]}</span>}
            <SampleBadge source={s.source} />
          </div>
          <p className="mt-4 max-w-xl leading-relaxed text-text/90">{s.synopsis ?? "No synopsis available yet."}</p>
          <ul className="mt-4 flex flex-wrap gap-1.5" aria-label="Genres">
            {s.genres.map((g) => (
              <li key={g.slug}>
                <GenreChip slug={g.slug} name={g.name} href={`/explore?genres=${g.slug}`} />
              </li>
            ))}
          </ul>
          <div className="mt-6 flex flex-wrap gap-2">
            <Button asChild size="lg" variant="outline">
              <Link href={`/manga/${s.slug}`}>View details</Link>
            </Button>
            <LibraryButton series={s} initial={s.viewer?.libraryEntry ?? null} size="lg" />
            <FavoriteButton seriesId={s.id} initial={s.viewer?.isFavorite ?? false} size="lg" />
          </div>
          {items.length > 1 && (
            <div className="mt-8 flex items-center gap-3">
              <Button variant="outline" size="icon-sm" onClick={() => go(-1)} aria-label="Previous pick">
                <ChevronLeft />
              </Button>
              <div className="flex gap-1.5" role="tablist" aria-label="Choose a pick">
                {items.map((it, idx) => (
                  <button
                    key={it.series.id}
                    role="tab"
                    aria-selected={idx === i}
                    aria-label={it.series.title}
                    onClick={() => setI(idx)}
                    className={cn("h-1.5 cursor-pointer rounded-full transition-all", idx === i ? "w-8 bg-violet" : "w-3 bg-line hover:bg-muted")}
                  />
                ))}
              </div>
              <Button variant="outline" size="icon-sm" onClick={() => go(1)} aria-label="Next pick">
                <ChevronRight />
              </Button>
            </div>
          )}
        </div>

        {/* Panel spread */}
        <div key={`p-${s.id}`} className="order-1 grid grid-cols-[1.25fr_1fr] items-start gap-3 sm:items-stretch lg:order-2" aria-hidden>
          <Link
            href={`/manga/${s.slug}`}
            tabIndex={-1}
            className="row-span-2 block rounded-2xl border-2 border-white/15 bg-white/5 p-1.5 shadow-[10px_10px_0_-2px_var(--violet),0_30px_60px_-30px_var(--pink)] [animation:panel-in_.5s_ease-out_both]"
            style={{ ["--tilt" as string]: "-1.5deg" }}
          >
            <Cover title={s.title} nativeTitle={native} coverUrl={s.coverUrl} type={s.type} year={s.releaseYear} genres={s.genres.map((g) => g.slug)} priority className="rounded-xl" sizes="(max-width: 1024px) 55vw, 320px" />
          </Link>
          <div
            className="relative hidden min-h-36 flex-col justify-between overflow-hidden rounded-2xl border-2 border-white/15 bg-surface p-4 [animation:panel-in_.5s_.08s_ease-out_both] sm:flex"
            style={{ ["--tilt" as string]: "1.2deg" }}
          >
            <div className="tone absolute inset-0 opacity-70" />
            <p className="relative rounded-2xl rounded-bl-sm bg-white px-3.5 py-3 text-sm leading-snug font-medium text-[#16122b] shadow-sm">“{item.reason}”</p>
            <p className="relative mt-2 text-right text-xs text-muted">— MangaVerse editors</p>
          </div>
          <div
            className="bg-brand flex flex-col justify-center gap-3 rounded-2xl border-2 border-white/20 p-4 text-white [animation:panel-in_.5s_.16s_ease-out_both]"
            style={{ ["--tilt" as string]: "-0.8deg" }}
          >
            <div>
              <p className="text-xs text-white/75">Member rating</p>
              <p className="flex items-center gap-1.5 font-display text-3xl font-extrabold tabular-nums">
                <Star className="size-5 fill-white" /> {formatScore(s.ratingAvg)}
              </p>
              <p className="text-xs text-white/75">{s.ratingCount ? `${s.ratingCount} ratings` : "No ratings yet"}</p>
            </div>
            <div className="text-xs text-white/85">
              {s.chapterCount ? `${s.chapterCount} chapters` : "Chapter count unknown"}
              {s.volumeCount ? ` · ${s.volumeCount} vols` : ""}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
