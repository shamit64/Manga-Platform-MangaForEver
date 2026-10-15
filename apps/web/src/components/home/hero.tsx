"use client";

import { PUBLICATION_STATUS_LABELS, type SeriesDetail } from "@mangaforever/shared";
import { BookOpen, ChevronLeft, ChevronRight, Pause, Play, Star } from "lucide-react";
import Link from "next/link";
import * as React from "react";
import { SampleBadge, TypeBadge } from "@/components/manga/badges";
import { Cover } from "@/components/manga/cover";
import { LibraryButton } from "@/components/manga/series-actions";
import { Button } from "@/components/ui/button";
import { chapterLabel, cn, formatScore } from "@/lib/utils";

export interface HeroItem {
  reason: string;
  series: SeriesDetail;
}

const INTERVAL = 7000;

/**
 * Curated hero carousel: the cover art blurred into a full-width backdrop, the title set large in
 * the serif, a short synopsis, and Read / Add to List. Auto-advances, pauses on hover or focus,
 * and stops entirely for people who prefer reduced motion.
 */
export function Hero({ items }: { items: HeroItem[] }) {
  const [i, setI] = React.useState(0);
  const [paused, setPaused] = React.useState(false);
  const [userPaused, setUserPaused] = React.useState(false);
  const go = React.useCallback((d: number) => setI((x) => (x + d + items.length) % items.length), [items.length]);

  React.useEffect(() => {
    if (items.length < 2 || paused || userPaused || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const t = setTimeout(() => go(1), INTERVAL);
    return () => clearTimeout(t);
  }, [i, paused, userPaused, go, items.length]);

  const item = items[i];
  if (!item) return null;
  const s = item.series;
  const native = s.altTitles.find((t) => /[^\x00-\x7F]/.test(t));
  const first = s.chapters.length ? Math.min(...s.chapters.map((c) => c.number)) : null;

  return (
    <section
      aria-roledescription="carousel"
      aria-label="Featured series"
      className="relative -mx-4 overflow-hidden border-b border-line sm:-mx-6"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocusCapture={() => setPaused(true)}
      onBlurCapture={() => setPaused(false)}
    >
      {/* Backdrop: the cover, blurred into the page */}
      <div key={`bg-${s.id}`} className="absolute inset-0 -z-10 [animation:fade-in_.6s_ease-out_both]" aria-hidden>
        {s.coverUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={s.bannerUrl ?? s.coverUrl} alt="" className="h-full w-full scale-110 object-cover opacity-35 blur-2xl" />
        ) : (
          <div className="aurora h-full w-full opacity-80" />
        )}
        <div className="absolute inset-0 bg-gradient-to-r from-ink via-ink/85 to-ink/40" />
        <div className="absolute inset-0 bg-gradient-to-t from-ink via-transparent to-ink/30" />
      </div>

      <div className="mx-auto grid max-w-7xl items-center gap-8 px-4 py-10 sm:px-6 sm:py-14 md:grid-cols-[1fr_260px] lg:grid-cols-[1fr_300px] lg:gap-16">
        <div key={s.id} className="[animation:fade-in_.45s_ease-out_both]" aria-live={paused || userPaused ? "polite" : "off"}>
          <p className="eyebrow flex items-center gap-2">
            <span className="text-lilac">Featured</span>
            <span aria-hidden>·</span>
            <span className="tabular">{String(i + 1).padStart(2, "0")} / {String(items.length).padStart(2, "0")}</span>
          </p>
          <h1 className="mt-4 max-w-3xl font-display text-4xl leading-[1.02] font-medium sm:text-6xl">{s.title}</h1>
          {native && <p className="mt-2 text-muted">{native}</p>}
          <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-2 text-sm text-muted">
            <TypeBadge type={s.type} />
            <span>{PUBLICATION_STATUS_LABELS[s.status]}</span>
            {s.genres.length > 0 && <span>{s.genres.slice(0, 3).map((g) => g.name).join(", ")}</span>}
            {(s.ratingAvg ?? s.externalRating) !== null && (
              <span className="inline-flex items-center gap-1 text-gold">
                <Star className="size-3.5 fill-current" aria-hidden /> <span className="tabular">{formatScore(s.ratingAvg ?? s.externalRating)}</span>
              </span>
            )}
            {s.latestChapter !== null && <span className="tabular">{chapterLabel(s.latestChapter)}</span>}
            <SampleBadge source={s.source} />
          </div>
          <p className="mt-5 line-clamp-3 max-w-2xl leading-relaxed text-text/85">{s.synopsis ?? "No synopsis available yet."}</p>
          <p className="mt-3 max-w-2xl text-sm text-muted italic">{item.reason}</p>
          <div className="mt-7 flex flex-wrap gap-2">
            <Button asChild size="lg">
              <Link href={first !== null ? `/manga/${s.slug}/chapter/${first}` : `/manga/${s.slug}`}>
                <BookOpen /> {first !== null ? "Start reading" : "View series"}
              </Link>
            </Button>
            <LibraryButton series={s} initial={s.viewer?.libraryEntry ?? null} size="lg" quiet />
          </div>
          {items.length > 1 && (
            <div className="mt-9 flex items-center gap-2">
              <Button variant="ghost" size="icon-sm" onClick={() => go(-1)} aria-label="Previous">
                <ChevronLeft />
              </Button>
              <div className="flex gap-1.5" role="tablist" aria-label="Choose a featured series">
                {items.map((it, idx) => (
                  <button
                    key={it.series.id}
                    role="tab"
                    aria-selected={idx === i}
                    aria-label={it.series.title}
                    onClick={() => setI(idx)}
                    className="grid h-6 w-7 cursor-pointer place-items-center"
                  >
                    <span className={cn("block h-0.5 w-full transition-colors", idx === i ? "bg-text" : "bg-line hover:bg-muted")} />
                  </button>
                ))}
              </div>
              <Button variant="ghost" size="icon-sm" onClick={() => go(1)} aria-label="Next">
                <ChevronRight />
              </Button>
              <Button variant="ghost" size="icon-sm" onClick={() => setUserPaused((p) => !p)} aria-label={userPaused ? "Resume auto-advance" : "Pause auto-advance"}>
                {userPaused ? <Play /> : <Pause />}
              </Button>
            </div>
          )}
        </div>

        <Link href={`/manga/${s.slug}`} tabIndex={-1} aria-hidden key={`c-${s.id}`} className="mx-auto hidden w-56 [animation:fade-in_.5s_ease-out_both] sm:block md:w-full">
          <Cover title={s.title} nativeTitle={native} coverUrl={s.coverUrl} type={s.type} year={s.releaseYear} genres={s.genres.map((g) => g.slug)} priority className="shadow-[0_40px_80px_-30px_rgba(0,0,0,.8)]" sizes="300px" />
        </Link>
      </div>
    </section>
  );
}
