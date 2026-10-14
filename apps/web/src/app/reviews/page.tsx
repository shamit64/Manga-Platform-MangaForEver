import type { ReviewDTO } from "@mangaverse/shared";
import type { Metadata } from "next";
import { EmptyState, ErrorNotice, PageHeader } from "@/components/layout/section";
import { ReviewCard } from "@/components/reviews/review-card";
import { getMe, tryServerApi } from "@/lib/server-api";
import { FeedList, type FeedItem } from "@/components/recs/feed-list";

export const metadata: Metadata = { title: "Reviews" };

export default async function ReviewsPage() {
  const me = await getMe();
  const [recent, feed] = await Promise.all([
    tryServerApi<{ items: ReviewDTO[] }>("/reviews/recent", { limit: 30 }),
    me ? tryServerApi<{ items: FeedItem[] }>("/feed") : null,
  ]);
  return (
    <div>
      <PageHeader title="Community reviews" description="The latest reviews from MangaVerse members. Spoilers stay hidden until you choose to read them." />
      <div className="grid gap-10 lg:grid-cols-[1fr_320px]">
        <div className="space-y-4">
          {!recent ? (
            <ErrorNotice title="Reviews couldn't load" />
          ) : recent.items.length ? (
            recent.items.map((r) => <ReviewCard key={r.id} review={r} showSeries />)
          ) : (
            <EmptyState title="No reviews yet" description="Open any series and write the first one." />
          )}
        </div>
        <aside>
          <h2 className="mb-3 font-display text-lg font-semibold">From people you follow</h2>
          {me ? <FeedList items={feed?.items ?? []} /> : <p className="text-sm text-muted">Sign in and follow members from their profiles to see their activity here.</p>}
        </aside>
      </div>
    </div>
  );
}
