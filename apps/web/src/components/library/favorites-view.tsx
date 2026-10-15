"use client";

import { CONTENT_TYPES, CONTENT_TYPE_LABELS, PUBLICATION_STATUS_LABELS, type Paginated, type SeriesCard as Card } from "@mangaforever/shared";
import { Heart } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import * as React from "react";
import { EmptyState } from "@/components/layout/section";
import { FavoriteButton } from "@/components/manga/series-actions";
import { SeriesCard } from "@/components/manga/series-card";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/form";
import { timeAgo } from "@/lib/utils";

type Fav = { id: string; favoritedAt: string; series: Card };

export function FavoritesView({ initial, genres }: { initial: Paginated<Fav>; genres: { name: string; slug: string }[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const [removed, setRemoved] = React.useState<Set<string>>(new Set());
  const setParam = (k: string, v: string | null) => {
    const next = new URLSearchParams(sp.toString());
    if (v) next.set(k, v);
    else next.delete(k);
    next.delete("page");
    router.push(`${pathname}?${next}`, { scroll: false });
  };
  const items = initial.items.filter((f) => !removed.has(f.series.id));

  return (
    <div>
      <div className="mb-6 flex flex-wrap gap-2">
        <Select className="w-40" value={sp.get("type") ?? ""} onChange={(e) => setParam("type", e.target.value || null)} aria-label="Content type">
          <option value="">All types</option>
          {CONTENT_TYPES.map((t) => (
            <option key={t} value={t}>
              {CONTENT_TYPE_LABELS[t]}
            </option>
          ))}
        </Select>
        <Select className="w-44" value={sp.get("genre") ?? ""} onChange={(e) => setParam("genre", e.target.value || null)} aria-label="Genre">
          <option value="">All genres</option>
          {genres.map((g) => (
            <option key={g.slug} value={g.slug}>
              {g.name}
            </option>
          ))}
        </Select>
        <Select className="w-52" value={sp.get("sort") ?? "recent"} onChange={(e) => setParam("sort", e.target.value)} aria-label="Sort">
          <option value="recent">Recently favorited</option>
          <option value="title">Title A–Z</option>
          <option value="rating">Member rating</option>
          <option value="popularity">Popularity</option>
        </Select>
      </div>
      {items.length === 0 ? (
        <EmptyState
          icon={<Heart />}
          title={initial.total ? "No favorites match these filters" : "No favorites yet"}
          description="Tap the heart on any series to keep it here."
          action={
            <Button asChild>
              <Link href="/browse">Explore the catalog</Link>
            </Button>
          }
        />
      ) : (
        <div className="grid grid-cols-2 gap-x-4 gap-y-8 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
          {items.map((f) => (
            <SeriesCard
              key={f.id}
              series={f.series}
              footer={
                <div className="mt-2 flex items-center justify-between gap-2">
                  <span className="text-xs text-muted">
                    {PUBLICATION_STATUS_LABELS[f.series.status]} · {timeAgo(f.favoritedAt)}
                  </span>
                  <FavoriteButton
                    seriesId={f.series.id}
                    initial
                    compact
                    onChange={(v) => {
                      if (!v) setRemoved((s) => new Set(s).add(f.series.id));
                    }}
                  />
                </div>
              }
            />
          ))}
        </div>
      )}
    </div>
  );
}
