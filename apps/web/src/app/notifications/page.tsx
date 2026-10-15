import type { NotificationDTO, Paginated } from "@mangaforever/shared";
import type { Metadata } from "next";
import { ErrorNotice, PageHeader } from "@/components/layout/section";
import { NotificationsView } from "@/components/live/notifications-view";
import { Pagination } from "@/components/manga/pagination";
import { requireUser } from "@/lib/require-user";
import { tryServerApi } from "@/lib/server-api";

export const metadata: Metadata = { title: "Notifications", robots: { index: false } };

export default async function NotificationsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  await requireUser("/notifications");
  const sp = await searchParams;
  const data = await tryServerApi<Paginated<NotificationDTO>>("/notifications", { page: sp.page, pageSize: 30 });
  return (
    <div>
      <PageHeader title="Notifications" description="New chapters for the series you follow. Follow a series from its page, or add it to your list as Reading." />
      {data ? (
        <>
          <NotificationsView initial={data} />
          <Pagination page={data.page} totalPages={data.totalPages} basePath="/notifications" params={sp} />
        </>
      ) : (
        <ErrorNotice title="Notifications couldn't load" description="Refresh to try again." />
      )}
    </div>
  );
}
