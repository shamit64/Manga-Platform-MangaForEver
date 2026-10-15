import { coverArt, coverBackground } from "@mangaforever/shared";
import { cn } from "@/lib/utils";
import { RemoteCover } from "./remote-cover";

const CJK_STACK = '"Hiragino Sans", "Yu Gothic", "Noto Sans CJK JP", "Noto Sans CJK KR", "Noto Sans CJK SC", "Malgun Gothic", sans-serif';

/**
 * Series cover. Provider covers render through next/image (optimised, lazy). Sample titles have no
 * licensed artwork, so they get generated cover art coloured by their primary genre.
 */
export function Cover({
  title,
  nativeTitle,
  coverUrl,
  type,
  year,
  genres = [],
  className,
  sizes = "(max-width: 640px) 45vw, 200px",
  priority,
  compact,
}: {
  title: string;
  nativeTitle?: string | null;
  coverUrl: string | null;
  type?: string;
  year?: number | null;
  /** Genre slugs; the first known one picks the palette. */
  genres?: string[];
  className?: string;
  sizes?: string;
  priority?: boolean;
  compact?: boolean;
}) {
  const art = coverArt(title, genres);
  if (coverUrl) {
    return (
      <div className={cn("relative aspect-[2/3] overflow-hidden rounded-xl bg-raised", className)} style={{ ["--glow" as string]: art.accent }}>
        <RemoteCover
          src={coverUrl}
          alt={`Cover of ${title}`}
          sizes={sizes}
          priority={priority}
          fallback={<GeneratedArt title={title} nativeTitle={nativeTitle} type={type} year={year} genres={genres} compact={compact} />}
        />
      </div>
    );
  }
  return (
    <div className={cn("relative isolate aspect-[2/3] overflow-hidden rounded-xl", className)} style={{ ["--glow" as string]: art.accent }}>
      <GeneratedArt title={title} nativeTitle={nativeTitle} type={type} year={year} genres={genres} compact={compact} />
    </div>
  );
}

function GeneratedArt({
  title,
  nativeTitle,
  type,
  year,
  genres,
  compact,
}: {
  title: string;
  nativeTitle?: string | null;
  type?: string;
  year?: number | null;
  genres: string[];
  compact?: boolean;
}) {
  const art = coverArt(title, genres);
  const native = nativeTitle && nativeTitle !== title && /[^\x00-\x7F]/.test(nativeTitle) ? nativeTitle : null;

  return (
    <div role="img" aria-label={`Generated cover for ${title}`} className="absolute inset-0" style={{ background: coverBackground(art) }}>
      <div
        className="absolute inset-0 opacity-60"
        style={{
          backgroundImage: "radial-gradient(rgba(255,255,255,.25) 1px, transparent 1.4px)",
          backgroundSize: "5px 5px",
          maskImage: "linear-gradient(to top, black 5%, transparent 60%)",
        }}
      />
      {native && !compact && (
        <span
          className="absolute top-3 right-2.5 max-h-[70%] overflow-hidden text-sm font-bold tracking-[0.12em] text-white/85"
          style={{ writingMode: "vertical-rl", fontFamily: CJK_STACK }}
        >
          {native}
        </span>
      )}
      {compact ? null : (
        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent p-3 pt-12">
          {type && (
            <span className="mb-1 block text-[10.5px] font-bold tracking-wide text-white/70">
              {type.toLowerCase()}
              {year ? ` · ${year}` : ""}
            </span>
          )}
          <p
            className="font-display text-lg leading-[0.98] font-extrabold text-white"
            style={{ fontVariationSettings: '"wdth" 78', textShadow: "0 2px 12px rgba(0,0,0,.45)" }}
          >
            {title}
          </p>
        </div>
      )}
    </div>
  );
}
