import { Skeleton } from "@/components/ui/misc";

export default function Loading() {
  return (
    <div aria-busy="true" aria-label="Loading series">
      <Skeleton className="-mx-4 h-44 rounded-none sm:-mx-6 sm:h-56" />
      <div className="relative -mt-28 grid gap-8 md:grid-cols-[220px_1fr]">
        <Skeleton className="mx-auto aspect-[2/3] w-44 rounded-xl md:w-full" />
        <div className="space-y-3 md:pt-24">
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-12 w-3/4" />
          <Skeleton className="h-4 w-1/2" />
          <div className="flex gap-2 pt-4">
            <Skeleton className="h-12 w-40" />
            <Skeleton className="h-12 w-36" />
            <Skeleton className="h-12 w-28" />
          </div>
        </div>
      </div>
    </div>
  );
}
