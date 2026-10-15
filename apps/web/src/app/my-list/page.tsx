import type { LibraryEntryDTO, Paginated } from "@mangaforever/shared";
import type { Metadata } from "next";
import { Suspense } from "react";
import { ErrorNotice, PageHeader } from "@/components/layout/section";
import { LibraryDashboard, LibraryList, type LibraryStats } from "@/components/library/library-view";
import { Pagination } from "@/components/manga/pagination";
import { requireUser } from "@/lib/require-user";
import { tryServerApi } from "@/lib/server-api";

export const metadata: Metadata = { title: "My List" };

type SP = Record<string, string | undefined>;

export default async function LibraryPage({ searchParams }: { searchParams: Promise<SP> }) {
  await requireUser("/my-list");
  const sp = await searchParams;
  const [list, stats] = await Promise.all([
    tryServerApi<Paginated<LibraryEntryDTO>>("/library", { status: sp.status, type: sp.type, q: sp.q, sort: sp.sort ?? "updated", page: sp.page, pageSize: 40 }),
    tryServerApi<LibraryStats>("/library/stats"),
  ]);
  return (
    <div>
      <PageHeader title="My List" description="Everything you are reading, planning, finished or set aside, saved to your account." />
      {!list || !stats ? (
        <ErrorNotice title="Your list couldn't load" description="Refresh to try again." />
      ) : (
        <div className="space-y-8">
          <LibraryDashboard stats={stats} />
          <Suspense>
            <LibraryList initial={list} stats={stats} />
          </Suspense>
          <Pagination page={list.page} totalPages={list.totalPages} basePath="/my-list" params={sp} />
        </div>
      )}
    </div>
  );
}
