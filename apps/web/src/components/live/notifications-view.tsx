"use client";

import type { NotificationDTO, Paginated } from "@mangaforever/shared";
import { BellOff, CheckCheck } from "lucide-react";
import Link from "next/link";
import * as React from "react";
import { EmptyState } from "@/components/layout/section";
import { Cover } from "@/components/manga/cover";
import { useLive } from "@/components/providers";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import { chapterLabel, cn, timeAgo } from "@/lib/utils";

export function NotificationsView({ initial }: { initial: Paginated<NotificationDTO> }) {
  const { setUnread, chapterTick } = useLive();
  const [items, setItems] = React.useState(initial.items);
  const first = React.useRef(true);

  // New chapters arriving while the page is open appear at the top.
  React.useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    if (initial.page !== 1) return;
    fetch("/api/v1/notifications?pageSize=30", { credentials: "same-origin" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: Paginated<NotificationDTO> | null) => d && setItems(d.items))
      .catch(() => {});
  }, [chapterTick, initial.page]);

  async function readAll() {
    await api("/notifications/read-all", { method: "POST" });
    setItems((l) => l.map((n) => ({ ...n, readAt: n.readAt ?? new Date().toISOString() })));
    setUnread(0);
  }
  function open(n: NotificationDTO) {
    if (n.readAt) return;
    api(`/notifications/${n.id}/read`, { method: "POST" }).catch(() => {});
    setUnread((c) => Math.max(0, c - 1));
  }

  if (!items.length) {
    return <EmptyState icon={<BellOff />} title="No notifications yet" description="Follow a series and you'll be told here the moment a new chapter comes out." action={<Button asChild><Link href="/latest">See latest updates</Link></Button>} />;
  }
  return (
    <div>
      <div className="mb-3 flex justify-end">
        <Button variant="ghost" size="sm" onClick={readAll} disabled={!items.some((n) => !n.readAt)}>
          <CheckCheck /> Mark all as read
        </Button>
      </div>
      <ul className="divide-y divide-line overflow-hidden rounded-lg border border-line bg-surface">
        {items.map((n) => {
          const target = n.series && n.chapter ? `/manga/${n.series.slug}/chapter/${n.chapter.number}` : n.series ? `/manga/${n.series.slug}` : "#";
          return (
            <li key={n.id}>
              <Link href={target} onClick={() => open(n)} className={cn("flex items-center gap-4 px-4 py-3 hover:bg-raised", !n.readAt && "bg-[color-mix(in_oklab,var(--violet)_7%,var(--surface))]")}>
                {n.series && <Cover title={n.series.title} coverUrl={n.series.coverUrl} compact className="w-11 shrink-0 rounded" sizes="44px" />}
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{n.series?.title ?? "MangaForEver"}</p>
                  <p className="text-sm text-muted">
                    {n.type === "NEW_CHAPTER" && n.chapter ? `${chapterLabel(n.chapter.number)} is out${n.chapter.title ? `: ${n.chapter.title}` : ""}` : String((n.data as { message?: string } | null)?.message ?? "")}
                  </p>
                </div>
                <span className="shrink-0 text-xs text-muted">{timeAgo(n.createdAt)}</span>
                {!n.readAt && <span className="size-2 shrink-0 rounded-full bg-violet" aria-label="Unread" />}
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
