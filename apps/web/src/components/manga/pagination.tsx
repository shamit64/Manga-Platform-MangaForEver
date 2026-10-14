import { ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";

/** Accessible link-based pagination that preserves the current query string. */
export function Pagination({
  page,
  totalPages,
  basePath,
  params,
}: {
  page: number;
  totalPages: number;
  basePath: string;
  params: Record<string, string | string[] | undefined>;
}) {
  if (totalPages <= 1) return null;
  const href = (p: number) => {
    const sp = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) {
      if (k === "page" || v === undefined || v === "") continue;
      sp.set(k, Array.isArray(v) ? v.join(",") : v);
    }
    if (p > 1) sp.set("page", String(p));
    const s = sp.toString();
    return s ? `${basePath}?${s}` : basePath;
  };
  const pages: (number | "…")[] = [];
  for (let p = 1; p <= totalPages; p++) {
    if (p === 1 || p === totalPages || Math.abs(p - page) <= 1) pages.push(p);
    else if (pages.at(-1) !== "…") pages.push("…");
  }
  const item = "grid h-10 min-w-10 place-items-center rounded-xl px-3 text-sm";
  return (
    <nav aria-label="Pagination" className="mt-10 flex items-center justify-center gap-1.5">
      {page > 1 ? (
        <Link href={href(page - 1)} className={cn(item, "border border-line hover:bg-raised")} aria-label="Previous page">
          <ChevronLeft className="size-4" />
        </Link>
      ) : (
        <span className={cn(item, "border border-line opacity-40")} aria-hidden>
          <ChevronLeft className="size-4" />
        </span>
      )}
      {pages.map((p, i) =>
        p === "…" ? (
          <span key={`gap-${i}`} className="px-1 text-muted" aria-hidden>
            …
          </span>
        ) : (
          <Link
            key={p}
            href={href(p)}
            aria-current={p === page ? "page" : undefined}
            className={cn(item, p === page ? "bg-violet text-white" : "hover:bg-raised")}
          >
            {p}
          </Link>
        ),
      )}
      {page < totalPages ? (
        <Link href={href(page + 1)} className={cn(item, "border border-line hover:bg-raised")} aria-label="Next page">
          <ChevronRight className="size-4" />
        </Link>
      ) : (
        <span className={cn(item, "border border-line opacity-40")} aria-hidden>
          <ChevronRight className="size-4" />
        </span>
      )}
    </nav>
  );
}
