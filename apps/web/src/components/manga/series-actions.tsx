"use client";

import { READING_STATUS_LABELS, type LibraryEntryDTO, type ViewerSeriesState } from "@mangaverse/shared";
import { BookOpen, Check, Heart, Pencil, Plus, Share2, Star } from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";
import { toast } from "sonner";
import { useAuth } from "@/components/providers";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import { LibraryEditor } from "./library-editor";

interface SeriesLite {
  id: string;
  slug: string;
  title: string;
  chapterCount: number | null;
  volumeCount?: number | null;
}

export function FavoriteButton({
  seriesId,
  initial,
  compact,
  onChange,
  size = "md",
}: {
  seriesId: string;
  initial: boolean;
  compact?: boolean;
  size?: "md" | "lg";
  onChange?: (v: boolean) => void;
}) {
  const { requireUser } = useAuth();
  const [fav, setFav] = React.useState(initial);
  const [busy, setBusy] = React.useState(false);
  React.useEffect(() => setFav(initial), [initial]);

  async function toggle() {
    if (!requireUser()) return;
    setBusy(true);
    const next = !fav;
    setFav(next); // optimistic
    try {
      if (next) await api("/favorites", { method: "POST", body: { seriesId } });
      else await api(`/favorites/${seriesId}`, { method: "DELETE" });
      onChange?.(next);
      toast.success(next ? "Added to favorites" : "Removed from favorites");
    } catch (err) {
      setFav(!next);
      toast.error(err instanceof Error ? err.message : "Couldn't update favorites");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Button
      variant={fav ? "secondary" : "outline"}
      size={compact ? "icon" : size}
      onClick={toggle}
      disabled={busy}
      aria-pressed={fav}
      aria-label={compact ? (fav ? "Remove from favorites" : "Add to favorites") : undefined}
    >
      <Heart className={cn(fav && "fill-[#e0558a] text-[#e0558a]")} />
      {!compact && (fav ? "Favorited" : "Favorite")}
    </Button>
  );
}

/** Library button + editor, used on hero and detail pages. */
export function LibraryButton({ series, initial, size = "md" }: { series: SeriesLite; initial: LibraryEntryDTO | null; size?: "md" | "lg" }) {
  const { requireUser } = useAuth();
  const router = useRouter();
  const [entry, setEntry] = React.useState(initial);
  const [open, setOpen] = React.useState(false);
  React.useEffect(() => setEntry(initial), [initial]);

  return (
    <>
      <Button size={size} variant={entry ? "secondary" : "primary"} onClick={() => requireUser() && setOpen(true)}>
        {entry ? <Check /> : <Plus />}
        {entry ? READING_STATUS_LABELS[entry.status] : "Add to library"}
      </Button>
      <LibraryEditor
        open={open}
        onOpenChange={setOpen}
        seriesId={series.id}
        title={series.title}
        chapterCount={series.chapterCount}
        volumeCount={series.volumeCount ?? null}
        entry={entry}
        onSaved={(e) => {
          setEntry(e);
          router.refresh();
        }}
      />
    </>
  );
}

/** Full action row for the details page. */
export function SeriesActions({ series, viewer }: { series: SeriesLite & { volumeCount: number | null }; viewer?: ViewerSeriesState }) {
  const { requireUser } = useAuth();
  const router = useRouter();
  const [entry, setEntry] = React.useState(viewer?.libraryEntry ?? null);
  const [editor, setEditor] = React.useState<null | "edit" | "reading">(null);
  React.useEffect(() => setEntry(viewer?.libraryEntry ?? null), [viewer?.libraryEntry]);

  async function markReading() {
    if (!requireUser()) return;
    try {
      const saved = entry
        ? await api<LibraryEntryDTO>(`/library/${entry.id}`, { method: "PATCH", body: { status: "READING" } })
        : await api<LibraryEntryDTO>("/library", { method: "POST", body: { seriesId: series.id, status: "READING" } });
      setEntry(saved);
      toast.success("Marked as reading");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't update");
    }
  }

  async function share() {
    const url = `${window.location.origin}/manga/${series.slug}`;
    try {
      if (navigator.share) await navigator.share({ title: series.title, url });
      else {
        await navigator.clipboard.writeText(url);
        toast.success("Link copied");
      }
    } catch {
      /* user cancelled */
    }
  }

  return (
    <div className="flex flex-wrap gap-2">
      <Button size="lg" variant={entry ? "secondary" : "primary"} onClick={() => requireUser() && setEditor("edit")}>
        {entry ? <Check /> : <Plus />}
        {entry ? READING_STATUS_LABELS[entry.status] : "Add to library"}
      </Button>
      {entry?.status !== "READING" && (
        <Button size="lg" variant="outline" onClick={markReading}>
          <BookOpen /> Mark as reading
        </Button>
      )}
      {entry && (
        <Button size="lg" variant="outline" onClick={() => setEditor("edit")}>
          <Pencil /> Update progress
        </Button>
      )}
      <FavoriteButton seriesId={series.id} initial={viewer?.isFavorite ?? false} onChange={() => router.refresh()} size="lg" />
      <Button size="lg" variant="outline" asChild>
        <a href="#reviews">
          <Star /> Rate & review
        </a>
      </Button>
      <Button size="icon" variant="ghost" className="size-12" onClick={share} aria-label="Share series">
        <Share2 />
      </Button>
      <LibraryEditor
        open={editor !== null}
        onOpenChange={(o) => !o && setEditor(null)}
        seriesId={series.id}
        title={series.title}
        chapterCount={series.chapterCount}
        volumeCount={series.volumeCount}
        entry={entry}
        onSaved={(e) => {
          setEntry(e);
          router.refresh();
        }}
      />
    </div>
  );
}
