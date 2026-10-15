"use client";

import {
  genreColor,
  CONTENT_TYPES,
  CONTENT_TYPE_LABELS,
  READING_STATUSES,
  READING_STATUS_LABELS,
  type LibraryEntryDTO,
  type Paginated,
  type ReadingStatus,
} from "@mangaverse/shared";
import { BookMarked, BookOpen, CheckCircle2, Heart, Lock, Pencil, Plus, Star } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import * as React from "react";
import { toast } from "sonner";
import { EmptyState } from "@/components/layout/section";
import { TypeBadge } from "@/components/manga/badges";
import { Cover } from "@/components/manga/cover";
import { LibraryEditor } from "@/components/manga/library-editor";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/form";
import { api } from "@/lib/api";
import { cn, timeAgo } from "@/lib/utils";

export interface LibraryStats {
  byStatus: Record<ReadingStatus, number>;
  total: number;
  completed: number;
  favorites: number;
  chaptersTracked: number;
  volumesTracked: number;
  genreDistribution: { name: string; slug: string; count: number }[];
  recentActivity: { id: string; type: string; data: Record<string, unknown> | null; createdAt: string; series: { slug: string; title: string } }[];
}

function activityText(a: LibraryStats["recentActivity"][number]) {
  const d = a.data ?? {};
  switch (a.type) {
    case "ADDED_TO_LIBRARY":
      return <>added <b>{a.series.title}</b>{d.status ? ` as ${READING_STATUS_LABELS[d.status as ReadingStatus]?.toLowerCase()}` : ""}</>;
    case "STATUS_CHANGED":
      return <>moved <b>{a.series.title}</b> to {READING_STATUS_LABELS[d.to as ReadingStatus]?.toLowerCase()}</>;
    case "PROGRESS_UPDATED":
      return <>read up to chapter {String(d.chapter)} of <b>{a.series.title}</b></>;
    case "RATED":
      return <>rated <b>{a.series.title}</b> {String(d.score)}/10</>;
    case "REVIEWED":
      return <>reviewed <b>{a.series.title}</b></>;
    case "FAVORITED":
      return <>favorited <b>{a.series.title}</b></>;
    default:
      return <>{a.series.title}</>;
  }
}

export function LibraryDashboard({ stats }: { stats: LibraryStats }) {
  const maxGenre = Math.max(1, ...stats.genreDistribution.map((g) => g.count));
  return (
    <div className="grid gap-4 lg:grid-cols-[1.2fr_1fr_1fr]">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-2">
        {(
          [
            ["Series tracked", stats.total, BookMarked, "#8b5cf6"],
            ["Completed", stats.completed, CheckCircle2, "#10b981"],
            ["Chapters tracked", stats.chaptersTracked, BookOpen, "#06b6d4"],
            ["Favorites", stats.favorites, Heart, "#ec4899"],
          ] as const
        ).map(([label, n, Icon, color]) => (
          <div key={label} className="flex items-center gap-3 rounded-2xl border border-line bg-surface p-4">
            <span className="chip-tint grid size-10 shrink-0 place-items-center rounded-xl" style={{ ["--chip" as string]: color }}>
              <Icon className="size-5" aria-hidden />
            </span>
            <div>
              <p className="font-display text-2xl leading-none font-extrabold tabular-nums">{Number(n).toLocaleString()}</p>
              <p className="mt-1 text-sm text-muted">{label}</p>
            </div>
          </div>
        ))}
      </div>
      <div className="rounded-2xl border border-line bg-surface p-4">
        <h2 className="mb-3 font-display font-semibold">Genres you read</h2>
        {stats.genreDistribution.length ? (
          <ul className="space-y-2">
            {stats.genreDistribution.slice(0, 7).map((g) => (
              <li key={g.slug} className="grid grid-cols-[6.5rem_1fr_2rem] items-center gap-2 text-sm">
                <span className="truncate">{g.name}</span>
                <span className="h-2 overflow-hidden rounded-full bg-line">
                  <span className="block h-full rounded-full" style={{ width: `${(g.count / maxGenre) * 100}%`, background: genreColor(g.slug) }} />
                </span>
                <span className="text-right text-muted tabular-nums">{g.count}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted">Add series to see your genre mix.</p>
        )}
      </div>
      <div className="rounded-2xl border border-line bg-surface p-4">
        <h2 className="mb-3 font-display font-semibold">Recent activity</h2>
        {stats.recentActivity.length ? (
          <ul className="space-y-2.5 text-sm">
            {stats.recentActivity.slice(0, 6).map((a) => (
              <li key={a.id} className="flex gap-2">
                <span className="mt-2 size-1.5 shrink-0 rounded-full bg-violet" aria-hidden />
                <span className="min-w-0">
                  <span className="text-text/90 [&_b]:font-semibold">You {activityText(a)}</span>
                  <span className="block text-xs text-muted">{timeAgo(a.createdAt)}</span>
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted">Nothing yet.</p>
        )}
      </div>
    </div>
  );
}

export function LibraryList({ initial, stats }: { initial: Paginated<LibraryEntryDTO>; stats: LibraryStats }) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const status = (sp.get("status") as ReadingStatus | null) ?? null;
  const [data, setData] = React.useState(initial);
  const [editing, setEditing] = React.useState<LibraryEntryDTO | null>(null);
  const [q, setQ] = React.useState(sp.get("q") ?? "");
  React.useEffect(() => setData(initial), [initial]);

  const setParam = (k: string, v: string | null) => {
    const next = new URLSearchParams(sp.toString());
    if (v) next.set(k, v);
    else next.delete(k);
    next.delete("page");
    router.push(`${pathname}?${next}`, { scroll: false });
  };
  React.useEffect(() => {
    if ((sp.get("q") ?? "") === q) return;
    const t = setTimeout(() => setParam("q", q.trim() || null), 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  async function bump(e: LibraryEntryDTO) {
    const total = e.series?.chapterCount;
    if (total && e.progressChapter >= total) return toast.info("You're on the last known chapter.");
    const next = e.progressChapter + 1;
    setData((d) => ({ ...d, items: d.items.map((x) => (x.id === e.id ? { ...x, progressChapter: next } : x)) }));
    try {
      await api(`/library/${e.id}`, { method: "PATCH", body: { progressChapter: next } });
    } catch (err) {
      setData((d) => ({ ...d, items: d.items.map((x) => (x.id === e.id ? { ...x, progressChapter: e.progressChapter } : x)) }));
      toast.error(err instanceof Error ? err.message : "Couldn't update progress");
    }
  }

  const tabs: [ReadingStatus | null, string, number][] = [
    [null, "All", stats.total],
    ...READING_STATUSES.map((s) => [s, READING_STATUS_LABELS[s], stats.byStatus[s] ?? 0] as [ReadingStatus, string, number]),
  ];

  return (
    <div>
      <div className="flex gap-1 overflow-x-auto border-b border-line scrollbar-none" role="tablist" aria-label="Reading status">
        {tabs.map(([s, label, n]) => (
          <button
            key={label}
            role="tab"
            aria-selected={status === s}
            onClick={() => setParam("status", s)}
            className={cn(
              "-mb-px cursor-pointer border-b-2 px-3.5 py-2.5 text-sm font-medium whitespace-nowrap",
              status === s ? "border-violet text-text" : "border-transparent text-muted hover:text-text",
            )}
          >
            {label} <span className="ml-1 text-xs text-muted tabular-nums">{n}</span>
          </button>
        ))}
      </div>

      <div className="my-5 flex flex-wrap gap-2">
        <Input placeholder="Filter your library…" value={q} onChange={(e) => setQ(e.target.value)} className="max-w-xs" aria-label="Filter your library by title" />
        <Select className="w-40" value={sp.get("type") ?? ""} onChange={(e) => setParam("type", e.target.value || null)} aria-label="Content type">
          <option value="">All types</option>
          {CONTENT_TYPES.map((t) => (
            <option key={t} value={t}>
              {CONTENT_TYPE_LABELS[t]}
            </option>
          ))}
        </Select>
        <Select className="w-48" value={sp.get("sort") ?? "updated"} onChange={(e) => setParam("sort", e.target.value)} aria-label="Sort">
          <option value="updated">Recently updated</option>
          <option value="added">Recently added</option>
          <option value="title">Title A–Z</option>
          <option value="score">Your score</option>
          <option value="progress">Chapters read</option>
        </Select>
      </div>

      {data.items.length === 0 ? (
        <EmptyState
          icon={<BookMarked />}
          title={stats.total ? "Nothing matches these filters" : "Your library is empty"}
          description={stats.total ? "Try another status or clear the filter." : "Add series from any page with “Add to library” to start tracking chapters."}
          action={
            <Button asChild>
              <Link href="/explore">
                <Plus /> Find something to read
              </Link>
            </Button>
          }
        />
      ) : (
        <ul className="divide-y divide-line rounded-2xl border border-line bg-surface">
          {data.items.map((e) => {
            const s = e.series!;
            const pct = s.chapterCount ? Math.min(100, (e.progressChapter / s.chapterCount) * 100) : null;
            return (
              <li key={e.id} className="flex items-center gap-4 p-3 sm:p-4">
                <Link href={`/manga/${s.slug}`} className="shrink-0">
                  <Cover title={s.title} coverUrl={s.coverUrl} genres={s.genres.map((g) => g.slug)} compact className="w-12 rounded-md sm:w-14" sizes="56px" />
                </Link>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <Link href={`/manga/${s.slug}`} className="truncate font-semibold hover:text-lilac">
                      {s.title}
                    </Link>
                    {e.isPrivate && <Lock className="size-3.5 shrink-0 text-muted" aria-label="Hidden from your profile" />}
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
                    <TypeBadge type={s.type} />
                    <span>{READING_STATUS_LABELS[e.status]}</span>
                    {e.score && (
                      <span className="flex items-center gap-1 text-gold">
                        <Star className="size-3 fill-current" /> {e.score}
                      </span>
                    )}
                    <span>Updated {timeAgo(e.updatedAt)}</span>
                  </div>
                  <div className="mt-2 flex items-center gap-3">
                    {pct !== null ? (
                      <div className="h-1.5 max-w-56 flex-1 overflow-hidden rounded-full bg-line" role="progressbar" aria-label="Progress" aria-valuenow={e.progressChapter} aria-valuemax={s.chapterCount ?? undefined}>
                        <div className="h-full rounded-full bg-violet" style={{ width: `${pct}%` }} />
                      </div>
                    ) : null}
                    <span className="text-xs text-muted tabular-nums">
                      Ch. {e.progressChapter}
                      {s.chapterCount ? ` / ${s.chapterCount}` : ""}
                    </span>
                  </div>
                </div>
                <div className="flex shrink-0 gap-1">
                  {(e.status === "READING" || e.status === "ON_HOLD") && (
                    <Button variant="secondary" size="sm" onClick={() => bump(e)} aria-label={`Mark chapter ${e.progressChapter + 1} of ${s.title} as read`}>
                      +1 ch
                    </Button>
                  )}
                  <Button variant="ghost" size="icon-sm" onClick={() => setEditing(e)} aria-label={`Edit ${s.title}`}>
                    <Pencil />
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {editing && (
        <LibraryEditor
          open
          onOpenChange={(o) => !o && setEditing(null)}
          seriesId={editing.seriesId}
          title={editing.series!.title}
          chapterCount={editing.series!.chapterCount}
          volumeCount={null}
          entry={editing}
          onSaved={() => {
            setEditing(null);
            router.refresh();
          }}
        />
      )}
    </div>
  );
}
