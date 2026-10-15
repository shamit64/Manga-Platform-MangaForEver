import { READING_STATUS_LABELS, type ReadingStatus } from "@mangaforever/shared";
import Link from "next/link";
import { timeAgo } from "@/lib/utils";

export type FeedItem = {
  id: string;
  type: string;
  data: Record<string, unknown> | null;
  createdAt: string;
  user: { username: string; displayName: string | null };
  series: { slug: string; title: string };
};

function verb(i: FeedItem) {
  const d = i.data ?? {};
  if (i.type === "ADDED_TO_LIBRARY") return `added to ${READING_STATUS_LABELS[(d.status as ReadingStatus) ?? "PLAN_TO_READ"]?.toLowerCase()}`;
  if (i.type === "STATUS_CHANGED") return `moved to ${READING_STATUS_LABELS[d.to as ReadingStatus]?.toLowerCase()}`;
  if (i.type === "RATED") return `rated ${String(d.score)}/10`;
  if (i.type === "REVIEWED") return "reviewed";
  return "updated";
}

export function FeedList({ items }: { items: FeedItem[] }) {
  if (!items.length) return <p className="text-sm text-muted">No activity yet. Follow members from their profile pages.</p>;
  return (
    <ul className="space-y-3 text-sm">
      {items.map((i) => (
        <li key={i.id} className="rounded-xl border border-line bg-surface px-3.5 py-2.5">
          <Link href={`/u/${i.user.username}`} className="font-semibold hover:text-lilac">
            {i.user.displayName ?? i.user.username}
          </Link>{" "}
          <span className="text-muted">{verb(i)}</span>{" "}
          <Link href={`/manga/${i.series.slug}`} className="font-medium hover:text-lilac">
            {i.series.title}
          </Link>
          <span className="block text-xs text-muted">{timeAgo(i.createdAt)}</span>
        </li>
      ))}
    </ul>
  );
}
