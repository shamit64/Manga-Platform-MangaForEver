"use client";

import type { RecommendationShelf } from "@mangaverse/shared";
import { EyeOff, RefreshCw, RotateCcw } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import * as React from "react";
import { toast } from "sonner";
import { Section } from "@/components/layout/section";
import { SeriesCard } from "@/components/manga/series-card";
import { useAuth } from "@/components/providers";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";

export function RecommendationsView({ shelves, personalised }: { shelves: RecommendationShelf[]; personalised: boolean }) {
  const { user } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const [hidden, setHidden] = React.useState<Set<string>>(new Set());

  async function dismiss(id: string, title: string) {
    setHidden((h) => new Set(h).add(id));
    try {
      await api("/recommendations/dismiss", { method: "POST", body: { seriesId: id } });
      toast.success(`We won't recommend ${title} again`, {
        action: { label: "Undo", onClick: () => restoreAll() },
      });
    } catch {
      toast.error("Couldn't dismiss");
    }
  }
  async function restoreAll() {
    const r = await api<{ restored: number }>("/recommendations/dismissed", { method: "DELETE" });
    setHidden(new Set());
    toast.success(r.restored ? `Restored ${r.restored} dismissed series` : "Nothing to restore");
    router.refresh();
  }

  return (
    <div>
      {user && (
        <div className="mt-2 flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => router.push(`${pathname}?refresh=${Date.now().toString(36)}`, { scroll: false })}>
            <RefreshCw /> Refresh suggestions
          </Button>
          <Button variant="ghost" onClick={restoreAll}>
            <RotateCcw /> Restore dismissed
          </Button>
          {sp.get("refresh") && <span className="self-center text-sm text-muted">Reshuffled near-ties for variety.</span>}
        </div>
      )}
      {!personalised && (
        <p className="mt-6 max-w-2xl rounded-xl border border-line bg-surface px-4 py-3 text-sm text-muted">
          {user
            ? "We don't know your taste yet. Add a few series to your library, rate something, or pick favorite genres in Settings and this page becomes personal."
            : "Sign in to get recommendations based on your library, ratings and favorite genres. Until then, here's what members like."}
        </p>
      )}
      {shelves.map((shelf) => {
        const items = shelf.items.filter((i) => !hidden.has(i.series.id));
        if (!items.length) return null;
        return (
          <Section key={shelf.key} title={shelf.title} description={shelf.explanation}>
            <div className="grid grid-cols-2 gap-x-4 gap-y-8 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
              {items.map((r) => (
                <SeriesCard
                  key={r.series.id}
                  series={r.series}
                  reasons={r.reasons}
                  footer={
                    user && personalised ? (
                      <button
                        onClick={() => dismiss(r.series.id, r.series.title)}
                        className="mt-1.5 flex cursor-pointer items-center gap-1 text-xs text-muted hover:text-text"
                      >
                        <EyeOff className="size-3" /> Not interested
                      </button>
                    ) : null
                  }
                />
              ))}
            </div>
          </Section>
        );
      })}
    </div>
  );
}
