import type { Metadata } from "next";
import { CatalogLanding } from "@/components/catalog/landing";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Read and track Manga online",
  description: "Japanese comics, read right to left. Shounen battles, slow-burn romance, seinen dramas and more, with new chapters as they release.",
  alternates: { canonical: "/manga" },
};

export default function MangaPage() {
  return (
    <CatalogLanding
      title="Manga"
      description="Japanese comics, read right to left. Shounen battles, slow-burn romance, seinen dramas and more, with new chapters as they release."
      type="MANGA"
      browseHref="/browse?type=MANGA"
    />
  );
}
