import type { LibraryEntryDTO, NotificationDTO, Paginated, RecommendationShelf } from "@mangaforever/shared";
import { Settings } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Avatar } from "@/components/layout/header";
import { EmptyState, Section } from "@/components/layout/section";
import { LibraryDashboard, type LibraryStats } from "@/components/library/library-view";
import { Cover } from "@/components/manga/cover";
import { Shelf } from "@/components/manga/series-card";
import { Button } from "@/components/ui/button";
import { requireUser } from "@/lib/require-user";
import { tryServerApi } from "@/lib/server-api";
import { chapterLabel, formatDate, timeAgo } from "@/lib/utils";

export const metadata: Metadata = { title: "Dashboard", robots: { index: false } };

type Follow = { series: { id: string; slug: string; title: string; coverUrl: string | null; type: string; latestChapter: number | null; lastChapterAt: string | null } };

export default async function DashboardPage() {
  const me = await requireUser("/dashboard");
  const [stats, cont, unread, follows, recs] = await Promise.all([
    tryServerApi<LibraryStats>("/library/stats"),
    tryServerApi<{ items: LibraryEntryDTO[] }>("/library/continue"),
    tryServerApi<Paginated<NotificationDTO>>("/notifications", { unread: "true", pageSize: 12 }),
    tryServerApi<{ items: Follow[] }>("/follows"),
    tryServerApi<{ personalised: boolean; shelves: RecommendationShelf[] }>("/recommendations", { limit: 12 }),
  ]);
  const name = me.displayName ?? me.username;

  return (
    <div>
      {/* Profile card */}
      <header className="flex flex-wrap items-center gap-5 border-b border-line pt-10 pb-7">
        <Avatar name={name} url={me.avatarUrl} size={72} />
        <div className="min-w-0 flex-1">
          <p className="eyebrow">Dashboard</p>
          <h1 className="mt-1 text-4xl font-medium">Welcome back, {name}</h1>
          <p className="mt-1 text-sm text-muted">
            @{me.username} · member since {formatDate(me.createdAt)}
            {me.preferences.favoriteTypes.length ? ` · loves ${me.preferences.favoriteTypes.map((t) => t.toLowerCase()).join(", ")}` : ""}
          </p>
        </div>
        <div className="flex gap-2">
          <Button asChild variant="outline"><Link href={`/u/${me.username}`}>View profile</Link></Button>
          <Button asChild variant="ghost" size="icon" aria-label="Settings"><Link href="/settings"><Settings /></Link></Button>
        </div>
      </header>

      <Section title="New chapters in your list" description="From series you follow." href="/notifications" hrefLabel="All notifications">
        {unread?.items.length ? (
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {unread.items.map((n) =>
              n.series && n.chapter ? (
                <li key={n.id} className="overflow-hidden rounded-lg border border-line bg-surface">
                  <Link href={`/manga/${n.series.slug}/chapter/${n.chapter.number}`} className="flex items-center gap-3 p-3 hover:bg-raised">
                    <Cover title={n.series.title} coverUrl={n.series.coverUrl} compact className="w-11 shrink-0 rounded" sizes="44px" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">{n.series.title}</p>
                      <p className="tabular text-sm text-muted">{chapterLabel(n.chapter.number)} · {timeAgo(n.createdAt)}</p>
                    </div>
                    <span className="rounded-sm bg-violet px-1.5 py-px text-[0.65rem] font-semibold tracking-wider text-on-accent">NEW</span>
                  </Link>
                </li>
              ) : null,
            )}
          </ul>
        ) : (
          <p className="rounded-lg border border-dashed border-line px-5 py-6 text-sm text-muted">
            You’re all caught up. {follows?.items.length ? `You follow ${follows.items.length} series; new chapters will appear here.` : "Follow a series to see its new chapters here."}
          </p>
        )}
      </Section>

      {cont?.items.length ? (
        <Section title="Continue reading" href="/my-list?status=READING" hrefLabel="My List">
          <Shelf items={cont.items.map((e) => e.series!)} />
        </Section>
      ) : null}

      <Section title="Your reading" href="/my-list" hrefLabel="My List">
        {stats ? <LibraryDashboard stats={stats} /> : <EmptyState title="Stats couldn't load" />}
      </Section>

      {follows?.items.length ? (
        <Section title="Recently updated in your follows" href="/notifications">
          <ul className="divide-y divide-line overflow-hidden rounded-lg border border-line bg-surface">
            {follows.items.slice(0, 8).map((f) => (
              <li key={f.series.id}>
                <Link href={`/manga/${f.series.slug}`} className="flex items-center gap-3 px-4 py-2.5 text-sm hover:bg-raised">
                  <span className="min-w-0 flex-1 truncate font-medium">{f.series.title}</span>
                  <span className="tabular text-muted">{f.series.latestChapter !== null ? chapterLabel(f.series.latestChapter) : "No chapters yet"}</span>
                  <span className="w-28 text-right text-xs text-muted">{f.series.lastChapterAt ? timeAgo(f.series.lastChapterAt) : ""}</span>
                </Link>
              </li>
            ))}
          </ul>
        </Section>
      ) : null}

      {recs?.shelves[0]?.items.length ? (
        <Section title={recs.shelves[0].title} description={recs.shelves[0].explanation} href="/recommendations">
          <Shelf items={recs.shelves[0].items.map((i) => i.series)} />
        </Section>
      ) : null}
    </div>
  );
}
