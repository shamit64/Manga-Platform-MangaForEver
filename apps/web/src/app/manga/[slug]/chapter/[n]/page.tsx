import type { ReaderChapter } from "@mangaforever/shared";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Reader } from "@/components/reader/reader";
import { ServerApiError, serverApi, tryServerApi } from "@/lib/server-api";

type Params = { params: Promise<{ slug: string; n: string }> };

const path = (slug: string, n: string) => `/manga/${encodeURIComponent(slug)}/chapters/${encodeURIComponent(n)}`;

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { slug, n } = await params;
  const d = await tryServerApi<ReaderChapter>(path(slug, n));
  if (!d) return { title: "Chapter not found" };
  const title = `${d.series.title} Chapter ${d.chapter.number}${d.chapter.title ? `: ${d.chapter.title}` : ""}`;
  return {
    title,
    description: d.pages.length ? `Read ${title} on MangaForEver.` : `Where to read ${title} officially, with reactions and discussion.`,
    alternates: { canonical: `/manga/${d.series.slug}/chapter/${d.chapter.number}` },
    openGraph: { title, images: d.series.coverUrl ? [d.series.coverUrl] : undefined },
  };
}

export default async function ChapterPage({ params }: Params) {
  const { slug, n } = await params;
  if (!/^\d+(\.\d+)?$/.test(n)) notFound();
  let data: ReaderChapter;
  try {
    data = await serverApi<ReaderChapter>(path(slug, n));
  } catch (e) {
    if (e instanceof ServerApiError && e.status === 404) notFound();
    throw e;
  }
  return <Reader key={data.chapter.id} data={data} />;
}
