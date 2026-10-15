import type { SeriesCard as Card } from "@mangaverse/shared";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { CommunityScore, TypeBadge } from "./badges";
import { Cover } from "./cover";

export function SeriesCard({
  series,
  reasons,
  className,
  priority,
  footer,
}: {
  series: Card;
  reasons?: string[];
  className?: string;
  priority?: boolean;
  footer?: React.ReactNode;
}) {
  const native = series.altTitles.find((t) => /[^\x00-\x7F]/.test(t));
  return (
    <article className={cn("group relative", className)}>
      <Link href={`/manga/${series.slug}`} className="block rounded-xl focus-visible:outline-offset-4">
        <Cover
          title={series.title}
          nativeTitle={native}
          coverUrl={series.coverUrl}
          type={series.type}
          year={series.releaseYear}
          genres={series.genres.map((g) => g.slug)}
          priority={priority}
          className="shadow-[0_16px_34px_-24px_var(--glow)] ring-1 ring-white/5 transition duration-300 group-hover:-translate-y-1 group-hover:shadow-[0_22px_44px_-18px_var(--glow)] group-hover:ring-white/20"
        />
        <h3 className="mt-2.5 line-clamp-2 font-sans text-sm leading-snug font-semibold tracking-normal group-hover:text-lilac">
          {series.title}
        </h3>
      </Link>
      <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
        <TypeBadge type={series.type} />
        <CommunityScore avg={series.ratingAvg} count={series.ratingCount} className="text-xs" />
        {series.genres[0] && <span className="truncate">{series.genres.slice(0, 2).map((g) => g.name).join(", ")}</span>}
      </div>
      {reasons?.length ? <p className="mt-1.5 line-clamp-2 text-xs text-lilac">{reasons[0]}</p> : null}
      {footer}
    </article>
  );
}

export function SeriesGrid({ items, className }: { items: Card[]; className?: string }) {
  return (
    <div className={cn("grid grid-cols-2 gap-x-4 gap-y-7 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6", className)}>
      {items.map((s, i) => (
        <SeriesCard key={s.id} series={s} priority={i < 6} />
      ))}
    </div>
  );
}

/** Horizontally scrolling shelf for home-page sections. */
export function Shelf({ items, reasons }: { items: Card[]; reasons?: Record<string, string[]> }) {
  return (
    <div className="-mx-4 flex snap-x gap-4 overflow-x-auto px-4 pb-2 scrollbar-none sm:-mx-6 sm:px-6">
      {items.map((s) => (
        <SeriesCard key={s.id} series={s} reasons={reasons?.[s.id]} className="w-36 shrink-0 snap-start sm:w-40" />
      ))}
    </div>
  );
}
