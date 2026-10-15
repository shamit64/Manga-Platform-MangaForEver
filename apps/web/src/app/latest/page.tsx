import type { LatestUpdate, Paginated } from "@mangaforever/shared";
import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/layout/section";
import { LatestUpdatesGrid } from "@/components/live/latest-updates";
import { Pagination } from "@/components/manga/pagination";
import { tryServerApi } from "@/lib/server-api";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Latest chapter updates",
  description: "Every new manga, manhwa and manhua chapter in release order, updated live.",
};

const TYPES = [
  ["", "All"],
  ["MANGA", "Manga"],
  ["MANHWA", "Manhwa"],
  ["MANHUA", "Manhua"],
] as const;

export default async function LatestPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const type = TYPES.some(([t]) => t && t === sp.type) ? sp.type : undefined;
  const page = Math.max(1, Number(sp.page) || 1);
  const data = await tryServerApi<Paginated<LatestUpdate>>("/latest-updates", { page, pageSize: 30, type });
  return (
    <div>
      <PageHeader title="Latest updates" description="New chapters in release order. This page refreshes itself the moment a chapter comes out." />
      <nav aria-label="Filter by type" className="mt-6 mb-5 flex gap-1.5">
        {TYPES.map(([t, label]) => (
          <Link
            key={label}
            href={t ? `/latest?type=${t}` : "/latest"}
            aria-current={(type ?? "") === t ? "page" : undefined}
            className={cn("rounded-full border px-3.5 py-1.5 text-sm", (type ?? "") === t ? "border-text text-text" : "border-line text-muted hover:text-text")}
          >
            {label}
          </Link>
        ))}
      </nav>
      <LatestUpdatesGrid key={`${type}-${page}`} initial={data} pageSize={30} type={type} />
      {data && <Pagination page={data.page} totalPages={data.totalPages} basePath="/latest" params={sp} />}
      <p className="mt-6 text-xs text-muted">
        Chapter data from MangaDex and official publishers. Chapters open on MangaForEver when we have the right to host them, and on the publisher’s site otherwise.
      </p>
    </div>
  );
}
