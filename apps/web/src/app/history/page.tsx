import type { Paginated } from "@mangaverse/shared";
import type { Metadata } from "next";
import { HistoryView } from "@/components/library/history-view";
import { ErrorNotice, PageHeader } from "@/components/layout/section";
import { Pagination } from "@/components/manga/pagination";
import { requireUser } from "@/lib/require-user";
import { tryServerApi } from "@/lib/server-api";

export const metadata: Metadata = { title: "Reading history" };

export default async function HistoryPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const me = await requireUser("/history");
  const sp = await searchParams;
  const data = await tryServerApi<Paginated<Parameters<typeof HistoryView>[0]["initial"]["items"][number]>>("/history", { page: sp.page, pageSize: 40 });
  return (
    <div>
      <PageHeader title="Reading history" description="Series you’ve opened on MangaVerse, most recent first." />
      {data ? (
        <>
          <HistoryView initial={data} prefs={me.preferences} />
          <Pagination page={data.page} totalPages={data.totalPages} basePath="/history" params={sp} />
        </>
      ) : (
        <ErrorNotice title="History couldn't load" />
      )}
    </div>
  );
}
