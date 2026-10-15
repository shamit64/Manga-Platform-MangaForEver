"use client";

import { READING_STATUSES, READING_STATUS_LABELS, type LibraryEntryDTO, type Paginated, type ReadingStatus } from "@mangaverse/shared";
import { Lock, UserMinus, UserPlus } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import * as React from "react";
import { toast } from "sonner";
import { EmptyState } from "@/components/layout/section";
import { Cover } from "@/components/manga/cover";
import { useAuth } from "@/components/providers";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";

export function FollowButton({ username, initial, followers }: { username: string; initial: boolean; followers: number }) {
  const { requireUser } = useAuth();
  const router = useRouter();
  const [following, setFollowing] = React.useState(initial);
  const [count, setCount] = React.useState(followers);
  async function toggle() {
    if (!requireUser()) return;
    const next = !following;
    setFollowing(next);
    setCount((c) => c + (next ? 1 : -1));
    try {
      await api(`/users/${username}/follow`, { method: next ? "POST" : "DELETE" });
      router.refresh();
    } catch (e) {
      setFollowing(!next);
      setCount((c) => c + (next ? -1 : 1));
      toast.error(e instanceof Error ? e.message : "Couldn't update");
    }
  }
  return (
    <Button variant={following ? "secondary" : "primary"} onClick={toggle} aria-pressed={following}>
      {following ? <UserMinus /> : <UserPlus />} {following ? "Following" : "Follow"}
      <span className="text-xs opacity-75 tabular-nums">{count}</span>
    </Button>
  );
}

/** Public library browser — the API filters out private entries and strips notes. */
export function PublicLibrary({ username, initial }: { username: string; initial: (Paginated<LibraryEntryDTO> & { private: boolean }) | null }) {
  const [status, setStatus] = React.useState<ReadingStatus | null>(null);
  const [data, setData] = React.useState(initial);
  const [loading, setLoading] = React.useState(false);

  async function load(s: ReadingStatus | null) {
    setStatus(s);
    setLoading(true);
    try {
      setData(await api(`/users/${username}/library`, { query: { status: s ?? undefined, pageSize: 60, sort: "updated" } }));
    } finally {
      setLoading(false);
    }
  }

  if (!data || data.private) {
    return <EmptyState icon={<Lock />} title="This library is private" description={`${username} has chosen not to share their library.`} />;
  }
  return (
    <div>
      <div className="mb-4 flex flex-wrap gap-1.5">
        {[null, ...READING_STATUSES].map((s) => (
          <button key={s ?? "all"} onClick={() => load(s)} aria-pressed={status === s}
            className={cn("cursor-pointer rounded-full border px-3 py-1.5 text-sm", status === s ? "border-violet bg-violet/15" : "border-line text-muted hover:text-text")}>
            {s ? READING_STATUS_LABELS[s] : "All"}
          </button>
        ))}
      </div>
      {data.items.length === 0 ? (
        <EmptyState title="Nothing here" />
      ) : (
        <ul className={cn("grid gap-3 sm:grid-cols-2 lg:grid-cols-3", loading && "opacity-60")}>
          {data.items.map((e) => (
            <li key={e.id}>
              <Link href={`/manga/${e.series!.slug}`} className="flex items-center gap-3 rounded-xl border border-line bg-surface p-2.5 hover:border-violet/60">
                <Cover title={e.series!.title} coverUrl={e.series!.coverUrl} genres={e.series!.genres.map((g) => g.slug)} compact className="w-10 shrink-0 rounded-md" sizes="40px" />
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{e.series!.title}</p>
                  <p className="text-xs text-muted">
                    {READING_STATUS_LABELS[e.status]} · ch. {e.progressChapter}
                    {e.score ? ` · ★ ${e.score}` : ""}
                  </p>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
