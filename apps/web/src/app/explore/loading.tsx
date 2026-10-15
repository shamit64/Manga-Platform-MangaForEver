import { Skeleton } from "@/components/ui/misc";

export default function Loading() {
  return (
    <div className="pt-10" aria-busy="true" aria-label="Loading catalog">
      <Skeleton className="h-10 w-64" />
      <Skeleton className="mt-3 h-4 w-96 max-w-full" />
      <div className="mt-10 flex gap-10">
        <div className="hidden w-72 shrink-0 space-y-3 lg:block">
          {Array.from({ length: 8 }, (_, i) => (
            <Skeleton key={i} className="h-8" />
          ))}
        </div>
        <div className="grid flex-1 grid-cols-2 gap-x-4 gap-y-7 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {Array.from({ length: 15 }, (_, i) => (
            <div key={i}>
              <Skeleton className="aspect-[2/3] rounded-xl" />
              <Skeleton className="mt-2.5 h-4 w-4/5" />
              <Skeleton className="mt-1.5 h-3 w-1/2" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
