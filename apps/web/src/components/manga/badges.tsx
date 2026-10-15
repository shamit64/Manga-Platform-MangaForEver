import {
  TYPE_COLORS,
  genreColor,
  CONTENT_TYPE_LABELS,
  PUBLICATION_STATUS_LABELS,
  type ContentType,
  type PublicationStatus,
} from "@mangaverse/shared";
import { Star } from "lucide-react";
import { Badge } from "@/components/ui/misc";
import { cn, formatScore } from "@/lib/utils";

export function TypeBadge({ type, className }: { type: ContentType; className?: string }) {
  return (
    <span
      className={cn("chip-tint inline-flex items-center rounded-md px-2 py-0.5 text-xs font-semibold", className)}
      style={{ ["--chip" as string]: TYPE_COLORS[type].solid }}
    >
      {CONTENT_TYPE_LABELS[type]}
    </span>
  );
}

/** Genre / tag chip in the genre's own hue. */
export function GenreChip({ slug, name, href, size = "sm" }: { slug: string; name: string; href?: string; size?: "sm" | "md" }) {
  const cls = cn("chip-tint inline-flex items-center rounded-full transition-[filter] hover:brightness-125", size === "md" ? "px-3 py-1 text-sm" : "px-2.5 py-0.5 text-xs");
  const style = { ["--chip" as string]: genreColor(slug) };
  return href ? (
    <a href={href} className={cls} style={style}>
      {name}
    </a>
  ) : (
    <span className={cls} style={style}>
      {name}
    </span>
  );
}

export function StatusBadge({ status }: { status: PublicationStatus }) {
  const tone = status === "ONGOING" ? "ok" : status === "HIATUS" ? "warn" : "neutral";
  return <Badge tone={tone}>{PUBLICATION_STATUS_LABELS[status]}</Badge>;
}

export function SampleBadge({ source }: { source: string }) {
  if (source !== "SEED_SAMPLE") return null;
  return (
    <Badge tone="outline" title="Part of the bundled sample catalog — metadata is a static snapshot, not live provider data.">
      Sample data
    </Badge>
  );
}

/** Community score (MangaVerse members). External scores are shown separately with their source. */
export function CommunityScore({ avg, count, className }: { avg: number | null; count: number; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1 text-sm tabular-nums", className)} title={count ? `${count} MangaVerse ratings` : "No member ratings yet"}>
      <Star className="size-3.5 fill-gold text-gold" aria-hidden />
      <span className="font-semibold">{avg !== null ? formatScore(avg) : "—"}</span>
      <span className="sr-only">out of 10 from {count} ratings</span>
    </span>
  );
}
