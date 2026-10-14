import { type LibraryEntryDTO, type Paginated, type ReadingStatus, type ReviewDTO, type SeriesCard as Card } from "@mangaverse/shared";
import { CalendarDays, Lock, Settings } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Avatar } from "@/components/layout/header";
import { EmptyState, Section } from "@/components/layout/section";
import { Shelf } from "@/components/manga/series-card";
import { FollowButton, PublicLibrary } from "@/components/profile/profile-parts";
import { ReviewCard } from "@/components/reviews/review-card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/misc";
import { ServerApiError, serverApi, tryServerApi } from "@/lib/server-api";
import { formatDate } from "@/lib/utils";

type Profile = {
  user: { id: string; username: string; displayName: string | null; avatarUrl: string | null; bio: string | null; role: string; isDemo: boolean; joinedAt: string };
  favoriteGenres: string[];
  visibility: { library: boolean; favorites: boolean; stats: boolean };
  stats: { byStatus: Record<ReadingStatus, number>; total: number; completed: number; chaptersTracked: number; favorites: number; genreDistribution: { name: string; slug: string; count: number }[] } | null;
  favorites: Card[] | null;
  recentlyCompleted: { completedAt: string | null; series: Card }[] | null;
  reviews: ReviewDTO[];
  social: { followers: number; following: number; viewerFollows: boolean; isOwner: boolean };
};

type Params = { params: Promise<{ username: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { username } = await params;
  return { title: `@${username}` };
}

export default async function ProfilePage({ params }: Params) {
  const { username } = await params;
  let p: Profile;
  try {
    p = await serverApi<Profile>(`/users/${encodeURIComponent(username)}`);
  } catch (e) {
    if (e instanceof ServerApiError && e.status === 404) notFound();
    throw e;
  }
  const library = await tryServerApi<Paginated<LibraryEntryDTO> & { private: boolean }>(`/users/${encodeURIComponent(username)}/library`, { pageSize: 60, sort: "updated" });
  const genres = (await tryServerApi<{ items: { name: string; slug: string }[] }>("/genres"))?.items ?? [];
  const genreName = (slug: string) => genres.find((g) => g.slug === slug)?.name ?? slug;
  const u = p.user;

  return (
    <div>
      <header className="relative pt-12 pb-8">
        <div className="tone tone-fade pointer-events-none absolute inset-x-0 top-0 -z-10 h-48" aria-hidden />
        <div className="flex flex-wrap items-end gap-5">
          <div className="rounded-full ring-4 ring-ink">
            <Avatar name={u.displayName ?? u.username} url={u.avatarUrl} size={96} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-3xl font-extrabold sm:text-4xl">{u.displayName ?? u.username}</h1>
              {u.role !== "USER" && <Badge tone="violet">{u.role === "ADMIN" ? "Admin" : "Moderator"}</Badge>}
              {u.isDemo && <Badge tone="outline" title="Seeded demo account">Demo account</Badge>}
            </div>
            <p className="mt-1 flex flex-wrap items-center gap-x-3 text-sm text-muted">
              <span>@{u.username}</span>
              <span className="flex items-center gap-1"><CalendarDays className="size-3.5" /> Joined {formatDate(u.joinedAt)}</span>
              <span>{p.social.followers} followers · {p.social.following} following</span>
            </p>
            {u.bio && <p className="mt-3 max-w-2xl text-text/90">{u.bio}</p>}
            {p.favoriteGenres.length > 0 && (
              <ul className="mt-3 flex flex-wrap gap-1.5" aria-label="Favorite genres">
                {p.favoriteGenres.map((g) => (
                  <li key={g}><Link href={`/explore?genres=${g}`} className="rounded-full bg-violet/15 px-2.5 py-1 text-xs text-lilac">{genreName(g)}</Link></li>
                ))}
              </ul>
            )}
          </div>
          {p.social.isOwner ? (
            <Button asChild variant="outline"><Link href="/settings"><Settings /> Edit profile & privacy</Link></Button>
          ) : (
            <FollowButton username={u.username} initial={p.social.viewerFollows} followers={p.social.followers} />
          )}
        </div>
      </header>

      {p.stats ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {[["Tracked", p.stats.total], ["Reading", p.stats.byStatus.READING], ["Completed", p.stats.completed], ["Plan to read", p.stats.byStatus.PLAN_TO_READ], ["Chapters", p.stats.chaptersTracked], ["Favorites", p.stats.favorites]].map(([l, n]) => (
            <div key={l as string} className="rounded-2xl border border-line bg-surface p-4">
              <p className="font-display text-2xl font-extrabold tabular-nums">{Number(n).toLocaleString()}</p>
              <p className="text-xs text-muted">{l}</p>
            </div>
          ))}
        </div>
      ) : (
        <p className="flex items-center gap-2 text-sm text-muted"><Lock className="size-4" /> Reading statistics are private.</p>
      )}

      {p.favorites ? (
        <Section title="Favorites">
          {p.favorites.length ? <Shelf items={p.favorites} /> : <p className="text-sm text-muted">No favorites yet.</p>}
        </Section>
      ) : (
        <Section title="Favorites"><p className="flex items-center gap-2 text-sm text-muted"><Lock className="size-4" /> Favorites are private.</p></Section>
      )}

      {p.recentlyCompleted && p.recentlyCompleted.length > 0 && (
        <Section title="Recently completed">
          <Shelf items={p.recentlyCompleted.map((c) => c.series)} />
        </Section>
      )}

      <Section title="Library">
        <PublicLibrary username={u.username} initial={library} />
      </Section>

      <Section title={`Reviews (${p.reviews.length})`}>
        {p.reviews.length ? (
          <div className="grid gap-4 lg:grid-cols-2">{p.reviews.map((r) => <ReviewCard key={r.id} review={r} showSeries />)}</div>
        ) : (
          <EmptyState title="No reviews yet" />
        )}
      </Section>
    </div>
  );
}
