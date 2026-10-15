import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CatalogLanding } from "@/components/catalog/landing";
import { tryServerApi } from "@/lib/server-api";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ slug: string }> };

async function genre(slug: string) {
  const list = await tryServerApi<{ items: { name: string; slug: string; count: number }[] }>("/genres");
  return list?.items.find((g) => g.slug === slug) ?? null;
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const g = await genre((await params).slug);
  if (!g) return { title: "Genre not found" };
  return {
    title: `Best ${g.name} manga, manhwa and manhua`,
    description: `${g.count} ${g.name.toLowerCase()} series ranked by readers: ongoing and completed manga, manhwa and manhua with new chapters as they release.`,
    alternates: { canonical: `/genre/${g.slug}` },
  };
}

export default async function GenrePage({ params }: Params) {
  const g = await genre((await params).slug);
  if (!g) notFound();
  return (
    <CatalogLanding
      title={g.name}
      description={`${g.count.toLocaleString()} ${g.name.toLowerCase()} series across manga, manhwa and manhua.`}
      genre={g.slug}
      browseHref={`/browse?genres=${g.slug}`}
    />
  );
}
