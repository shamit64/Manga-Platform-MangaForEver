import type { Metadata } from "next";
import { EmptyState } from "@/components/layout/section";

export const metadata: Metadata = { title: "You're offline", robots: { index: false } };

export default function OfflinePage() {
  return (
    <div className="py-20">
      <EmptyState title="You're offline" description="MangaForEver needs a connection to load new chapters. Pages you open again will work once you're back online." />
    </div>
  );
}
