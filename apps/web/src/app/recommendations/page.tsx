import type { RecommendationShelf } from "@mangaverse/shared";
import type { Metadata } from "next";
import { Suspense } from "react";
import { ErrorNotice, PageHeader } from "@/components/layout/section";
import { RecommendationsView } from "@/components/recs/recommendations-view";
import { tryServerApi } from "@/lib/server-api";

export const metadata: Metadata = { title: "Recommendations" };

export default async function RecommendationsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const data = await tryServerApi<{ personalised: boolean; shelves: RecommendationShelf[] }>("/recommendations", { refresh: sp.refresh, limit: 18 });
  return (
    <div>
      <PageHeader
        title="Recommended for you"
        description="A transparent, rules-based score built from your genres, tags, content types, creators and ratings — every pick says why it’s here."
      />
      {data ? (
        <Suspense>
          <RecommendationsView shelves={data.shelves} personalised={data.personalised} />
        </Suspense>
      ) : (
        <ErrorNotice title="Recommendations couldn't load" />
      )}
    </div>
  );
}
