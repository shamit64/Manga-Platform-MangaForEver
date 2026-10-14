import { CONTENT_TYPE_LABELS, DATA_SOURCE_LABELS, type ContentType, type DataSource, type SeriesCard } from "@mangaverse/shared";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ErrorNotice } from "@/components/layout/section";
import { CommunityScore } from "@/components/manga/badges";
import { Card } from "@/components/ui/misc";
import { getMe, tryServerApi } from "@/lib/server-api";
import { timeAgo } from "@/lib/utils";

type Stats = {
  users: { total: number; demo: number; newLast30Days: number; activeLast30Days: number };
  catalog: { total: number; archived: number; byType: { type: ContentType; source: DataSource; count: number }[] };
  engagement: { reviews: number; ratings: number; libraryEntries: number; favorites: number; openReports: number };
  mostPopular: SeriesCard[];
  highestRated: SeriesCard[];
  mostActiveGenres: { name: string; slug: string; libraryEntries: number }[];
  recentReports: { id: string; reason: string; createdAt: string; reporter: string; review: { title: string; series: { title: string; slug: string } } }[];
};

export default async function AdminDashboard() {
  const me = await getMe();
  if (me?.role !== "ADMIN") redirect("/admin/moderation");
  const s = await tryServerApi<Stats>("/admin/statistics");
  if (!s) return <ErrorNotice title="Statistics couldn't load" />;
  const maxGenre = Math.max(1, ...s.mostActiveGenres.map((g) => g.libraryEntries));

  const tiles: [string, number, string?][] = [
    ["Registered users", s.users.total, `${s.users.demo} demo · ${s.users.newLast30Days} new in 30 days`],
    ["Active in 30 days", s.users.activeLast30Days, "Members with any tracking activity"],
    ["Catalog entries", s.catalog.total, `${s.catalog.archived} archived`],
    ["Library entries", s.engagement.libraryEntries],
    ["Ratings", s.engagement.ratings],
    ["Reviews", s.engagement.reviews],
    ["Favorites", s.engagement.favorites],
    ["Open reports", s.engagement.openReports, "Awaiting moderation"],
  ];

  return (
    <div className="space-y-6">
      <p className="text-sm text-muted">Every number below is a live count of stored rows{s.users.demo ? `, including ${s.users.demo} seeded demo accounts` : ""}.</p>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {tiles.map(([label, n, hint]) => (
          <Card key={label} className="p-4">
            <p className="font-display text-3xl font-extrabold tabular-nums">{n.toLocaleString()}</p>
            <p className="text-sm">{label}</p>
            {hint && <p className="mt-0.5 text-xs text-muted">{hint}</p>}
          </Card>
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="p-5">
          <h2 className="mb-3 font-display font-semibold">Catalog by type & source</h2>
          <ul className="space-y-1.5 text-sm">
            {s.catalog.byType.map((r) => (
              <li key={`${r.type}-${r.source}`} className="flex justify-between">
                <span>{CONTENT_TYPE_LABELS[r.type]} <span className="text-muted">· {DATA_SOURCE_LABELS[r.source]}</span></span>
                <span className="tabular-nums">{r.count}</span>
              </li>
            ))}
          </ul>
        </Card>
        <Card className="p-5">
          <h2 className="mb-3 font-display font-semibold">Most active genres</h2>
          <ul className="space-y-2">
            {s.mostActiveGenres.map((g) => (
              <li key={g.slug} className="grid grid-cols-[6rem_1fr_2.5rem] items-center gap-2 text-sm">
                <span className="truncate">{g.name}</span>
                <span className="h-2 overflow-hidden rounded-full bg-line"><span className="block h-full bg-violet" style={{ width: `${(g.libraryEntries / maxGenre) * 100}%` }} /></span>
                <span className="text-right text-muted tabular-nums">{g.libraryEntries}</span>
              </li>
            ))}
          </ul>
        </Card>
        <Card className="p-5">
          <h2 className="mb-3 font-display font-semibold">Recent reports</h2>
          {s.recentReports.length ? (
            <ul className="space-y-2 text-sm">
              {s.recentReports.map((r) => (
                <li key={r.id}>
                  <span className="font-medium">{r.review.title}</span> <span className="text-muted">on {r.review.series.title} · {r.reason} · {timeAgo(r.createdAt)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted">No open reports.</p>
          )}
          <Link href="/admin/moderation" className="mt-3 inline-block text-sm text-lilac hover:underline">Open moderation queue</Link>
        </Card>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        {[["Most popular", s.mostPopular], ["Highest rated (3+ ratings)", s.highestRated]].map(([title, list]) => (
          <Card key={title as string} className="p-5">
            <h2 className="mb-3 font-display font-semibold">{title as string}</h2>
            <ol className="space-y-2 text-sm">
              {(list as SeriesCard[]).map((x, i) => (
                <li key={x.id} className="flex items-center gap-3">
                  <span className="w-4 text-muted tabular-nums">{i + 1}</span>
                  <Link href={`/manga/${x.slug}`} className="flex-1 truncate hover:text-lilac">{x.title}</Link>
                  <CommunityScore avg={x.ratingAvg} count={x.ratingCount} className="text-xs" />
                  <span className="w-10 text-right text-muted tabular-nums">{x.popularityScore}</span>
                </li>
              ))}
            </ol>
          </Card>
        ))}
      </div>
    </div>
  );
}
