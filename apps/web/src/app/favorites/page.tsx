import type { Paginated, SeriesCard } from "@mangaverse/shared";
import type { Metadata } from "next";
import { Suspense } from "react";
import { FavoritesView } from "@/components/library/favorites-view";
import { ErrorNotice, PageHeader } from "@/components/layout/section";
import { Pagination } from "@/components/manga/pagination";
import { requireUser } from "@/lib/require-user";
import { tryServerApi } from "@/lib/server-api";

export const metadata: Metadata = { title: "Favorites" };

type SP = Record<string, string | undefined>;

export default async function FavoritesPage({ searchParams }: { searchParams: Promise<SP> }) {
  await requireUser("/favorites");
  const sp = await searchParams;
  const [favs, genres] = await Promise.all([
    tryServerApi<Paginated<{ id: string; favoritedAt: string; series: SeriesCard }>>("/favorites", { type: sp.type, genre: sp.genre, sort: sp.sort ?? "recent", page: sp.page, pageSize: 48 }),
    tryServerApi<{ items: { name: string; slug: string }[] }>("/genres"),
  ]);
  return (
    <div>
      <PageHeader title="Favorites" description={favs ? `${favs.total} series you’ve hearted, synced to your account.` : undefined} />
      {favs ? (
        <>
          <Suspense>
            <FavoritesView initial={favs} genres={genres?.items ?? []} />
          </Suspense>
          <Pagination page={favs.page} totalPages={favs.totalPages} basePath="/favorites" params={sp} />
        </>
      ) : (
        <ErrorNotice title="Favorites couldn't load" description="Refresh to try again." />
      )}
    </div>
  );
}
