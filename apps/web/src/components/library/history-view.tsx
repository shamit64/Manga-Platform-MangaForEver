"use client";

import { READING_STATUS_LABELS, type Paginated, type Preferences, type ReadingStatus, type SeriesCard } from "@mangaforever/shared";
import { History, Trash2, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import * as React from "react";
import { toast } from "sonner";
import { EmptyState } from "@/components/layout/section";
import { TypeBadge } from "@/components/manga/badges";
import { Cover } from "@/components/manga/cover";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/form";
import { api } from "@/lib/api";
import { timeAgo } from "@/lib/utils";

type Entry = {
  id: string;
  lastViewedAt: string;
  viewCount: number;
  series: SeriesCard;
  progress: { status: ReadingStatus; progressChapter: number } | null;
};

export function HistoryView({ initial, prefs }: { initial: Paginated<Entry>; prefs: Preferences }) {
  const router = useRouter();
  const [items, setItems] = React.useState(initial.items);
  const [tracking, setTracking] = React.useState({ browse: prefs.trackBrowsingHistory, search: prefs.trackSearchHistory });
  React.useEffect(() => setItems(initial.items), [initial]);

  async function remove(id: string) {
    const prev = items;
    setItems((x) => x.filter((e) => e.id !== id));
    try {
      await api(`/history/${id}`, { method: "DELETE" });
    } catch (e) {
      setItems(prev);
      toast.error(e instanceof Error ? e.message : "Couldn't remove");
    }
  }

  async function clear(scope: "browsing" | "activity" | "all") {
    const label = scope === "browsing" ? "browsing history" : scope === "activity" ? "reading activity log" : "all history";
    if (!confirm(`Clear your ${label}? This can't be undone.`)) return;
    try {
      await api(`/history?scope=${scope}`, { method: "DELETE" });
      if (scope !== "activity") setItems([]);
      toast.success(`Cleared ${label}`);
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't clear history");
    }
  }

  async function setPref(key: "trackBrowsingHistory" | "trackSearchHistory", value: boolean) {
    setTracking((t) => ({ ...t, [key === "trackBrowsingHistory" ? "browse" : "search"]: value }));
    try {
      await api("/users/me", { method: "PATCH", body: { preferences: { [key]: value } } });
      toast.success(value ? "Tracking turned on" : "Tracking turned off");
    } catch {
      toast.error("Couldn't save preference");
    }
  }

  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_320px]">
      <div>
        {items.length === 0 ? (
          <EmptyState
            icon={<History />}
            title="No browsing history"
            description={tracking.browse ? "Series you open will appear here so you can find them again." : "Browsing history is turned off."}
          />
        ) : (
          <ul className="divide-y divide-line rounded-lg border border-line bg-surface">
            {items.map((h) => (
              <li key={h.id} className="flex items-center gap-4 p-3 sm:p-4">
                <Link href={`/manga/${h.series.slug}`} className="shrink-0">
                  <Cover title={h.series.title} coverUrl={h.series.coverUrl} genres={h.series.genres.map((g) => g.slug)} compact className="w-11 rounded-md" sizes="44px" />
                </Link>
                <div className="min-w-0 flex-1">
                  <Link href={`/manga/${h.series.slug}`} className="block truncate font-semibold hover:text-lilac">
                    {h.series.title}
                  </Link>
                  <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-muted">
                    <TypeBadge type={h.series.type} />
                    Viewed {timeAgo(h.lastViewedAt)}
                    {h.viewCount > 1 && ` · ${h.viewCount} visits`}
                    {h.progress && ` · ${READING_STATUS_LABELS[h.progress.status]}, ch. ${h.progress.progressChapter}`}
                  </p>
                </div>
                <Button variant="ghost" size="icon-sm" onClick={() => remove(h.id)} aria-label={`Remove ${h.series.title} from history`}>
                  <X />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>
      <aside className="space-y-4">
        <div className="rounded-lg border border-line bg-surface p-5">
          <h2 className="font-display font-semibold">What MangaForEver records</h2>
          <p className="mt-1 text-sm text-muted">
            Only activity on MangaForEver: series pages you open, searches you run, and changes you make to your list. Nothing from other
            websites or reading apps. History is private and never shown on your profile.
          </p>
          <div className="mt-3 divide-y divide-line">
            <Switch checked={tracking.browse} onCheckedChange={(v) => setPref("trackBrowsingHistory", v)} label="Record series I view" description="Used for this page and recommendations." />
            <Switch checked={tracking.search} onCheckedChange={(v) => setPref("trackSearchHistory", v)} label="Record my searches" description="Shown as recent searches in the search box." />
          </div>
        </div>
        <div className="rounded-lg border border-line bg-surface p-5">
          <h2 className="mb-3 font-display font-semibold">Clear history</h2>
          <div className="flex flex-col gap-2">
            <Button variant="outline" onClick={() => clear("browsing")}>
              <Trash2 /> Clear browsing history
            </Button>
            <Button variant="outline" onClick={() => clear("activity")}>
              <Trash2 /> Clear reading activity log
            </Button>
            <Button variant="danger" onClick={() => clear("all")}>
              <Trash2 /> Clear everything
            </Button>
          </div>
          <p className="mt-3 text-xs text-muted">Clearing history doesn’t change your list, ratings or reviews. Search history can be cleared from the search box.</p>
        </div>
      </aside>
    </div>
  );
}
