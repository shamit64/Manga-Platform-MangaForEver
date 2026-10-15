import type { Metadata } from "next";
import { CatalogLanding } from "@/components/catalog/landing";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Read and track Manhua online",
  description: "Chinese comics: cultivation, wuxia, xianxia, historical romance and modern fantasy, often in full colour.",
  alternates: { canonical: "/manhua" },
};

export default function ManhuaPage() {
  return (
    <CatalogLanding
      title="Manhua"
      description="Chinese comics: cultivation, wuxia, xianxia, historical romance and modern fantasy, often in full colour."
      type="MANHUA"
      browseHref="/browse?type=MANHUA"
    />
  );
}
