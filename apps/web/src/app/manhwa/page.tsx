import type { Metadata } from "next";
import { CatalogLanding } from "@/components/catalog/landing";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Read and track Manhwa online",
  description: "Korean comics, mostly full-colour long strips made for phones. Leveling fantasy, romance fantasy, action and webtoon originals.",
  alternates: { canonical: "/manhwa" },
};

export default function ManhwaPage() {
  return (
    <CatalogLanding
      title="Manhwa"
      description="Korean comics, mostly full-colour long strips made for phones. Leveling fantasy, romance fantasy, action and webtoon originals."
      type="MANHWA"
      browseHref="/browse?type=MANHWA"
    />
  );
}
