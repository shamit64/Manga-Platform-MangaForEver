"use client";

import {
  CATALOG_SORT_LABELS,
  CONTENT_TYPES,
  CONTENT_TYPE_LABELS,
  DEMOGRAPHICS,
  DEMOGRAPHIC_LABELS,
  PUBLICATION_STATUSES,
  PUBLICATION_STATUS_LABELS,
  type CatalogSort,
} from "@mangaverse/shared";
import { SlidersHorizontal, X } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import * as React from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { Input, Label, Select } from "@/components/ui/form";
import { cn } from "@/lib/utils";

type Genre = { name: string; slug: string; count: number };

function useParamState() {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const list = (k: string) => (sp.get(k) ?? "").split(",").filter(Boolean);
  const set = React.useCallback(
    (updates: Record<string, string | string[] | null>) => {
      const next = new URLSearchParams(sp.toString());
      for (const [k, v] of Object.entries(updates)) {
        const val = Array.isArray(v) ? v.join(",") : v;
        if (!val) next.delete(k);
        else next.set(k, val);
      }
      next.delete("page");
      router.push(`${pathname}?${next.toString()}`, { scroll: false });
    },
    [sp, router, pathname],
  );
  return { sp, list, set };
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "cursor-pointer rounded-full border px-2.5 py-1 text-xs transition-colors",
        active ? "border-violet bg-violet/15 text-text" : "border-line text-muted hover:text-text",
      )}
    >
      {children}
    </button>
  );
}

function Filters({ genres }: { genres: Genre[] }) {
  const { sp, list, set } = useParamState();
  const toggle = (key: string, value: string) => {
    const cur = list(key);
    set({ [key]: cur.includes(value) ? cur.filter((x) => x !== value) : [...cur, value] });
  };
  const [creator, setCreator] = React.useState(sp.get("creator") ?? "");
  React.useEffect(() => setCreator(sp.get("creator") ?? ""), [sp]);
  React.useEffect(() => {
    if ((sp.get("creator") ?? "") === creator) return;
    const t = setTimeout(() => set({ creator: creator.trim() || null }), 450);
    return () => clearTimeout(t);
  }, [creator, sp, set]);

  const thisYear = new Date().getFullYear();
  const years = Array.from({ length: thisYear - 1969 }, (_, i) => thisYear - i);

  return (
    <div className="space-y-6">
      <fieldset>
        <legend className="mb-2 text-sm font-semibold">Type</legend>
        <div className="flex flex-wrap gap-1.5">
          {CONTENT_TYPES.map((t) => (
            <Chip key={t} active={list("type").includes(t)} onClick={() => toggle("type", t)}>
              {CONTENT_TYPE_LABELS[t]}
            </Chip>
          ))}
        </div>
      </fieldset>

      <fieldset>
        <div className="mb-2 flex items-center justify-between">
          <legend className="text-sm font-semibold">Genres</legend>
          <div className="flex text-xs" role="group" aria-label="Genre matching">
            {(["all", "any"] as const).map((m) => (
              <button
                key={m}
                type="button"
                aria-pressed={(sp.get("genreMode") ?? "all") === m}
                onClick={() => set({ genreMode: m === "all" ? null : m })}
                className={cn("cursor-pointer rounded-md px-2 py-0.5", (sp.get("genreMode") ?? "all") === m ? "bg-raised text-text" : "text-muted")}
              >
                Match {m}
              </button>
            ))}
          </div>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {genres.map((g) => (
            <Chip key={g.slug} active={list("genres").includes(g.slug)} onClick={() => toggle("genres", g.slug)}>
              {g.name} <span className="text-muted/70">{g.count}</span>
            </Chip>
          ))}
        </div>
      </fieldset>

      <fieldset>
        <legend className="mb-2 text-sm font-semibold">Publication status</legend>
        <div className="flex flex-wrap gap-1.5">
          {PUBLICATION_STATUSES.filter((s) => s !== "UNKNOWN").map((s) => (
            <Chip key={s} active={list("status").includes(s)} onClick={() => toggle("status", s)}>
              {PUBLICATION_STATUS_LABELS[s]}
            </Chip>
          ))}
        </div>
      </fieldset>

      <fieldset>
        <legend className="mb-2 text-sm font-semibold">Demographic</legend>
        <div className="flex flex-wrap gap-1.5">
          {DEMOGRAPHICS.map((d) => (
            <Chip key={d} active={list("demographic").includes(d)} onClick={() => toggle("demographic", d)}>
              {DEMOGRAPHIC_LABELS[d]}
            </Chip>
          ))}
        </div>
      </fieldset>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label htmlFor="f-from">Year from</Label>
          <Select id="f-from" value={sp.get("yearFrom") ?? ""} onChange={(e) => set({ yearFrom: e.target.value || null })}>
            <option value="">Any</option>
            {years.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <Label htmlFor="f-to">Year to</Label>
          <Select id="f-to" value={sp.get("yearTo") ?? ""} onChange={(e) => set({ yearTo: e.target.value || null })}>
            <option value="">Any</option>
            {years.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </Select>
        </div>
      </div>

      <div>
        <Label htmlFor="f-creator">Author or artist</Label>
        <Input id="f-creator" placeholder="e.g. Urasawa" value={creator} onChange={(e) => setCreator(e.target.value)} />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label htmlFor="f-rating">Min. member rating</Label>
          <Select id="f-rating" value={sp.get("minRating") ?? ""} onChange={(e) => set({ minRating: e.target.value || null })}>
            <option value="">Any</option>
            {[9, 8, 7, 6, 5].map((n) => (
              <option key={n} value={n}>
                {n}+
              </option>
            ))}
          </Select>
        </div>
        <div>
          <Label htmlFor="f-pop">Min. popularity</Label>
          <Select id="f-pop" value={sp.get("minPopularity") ?? ""} onChange={(e) => set({ minPopularity: e.target.value || null })}>
            <option value="">Any</option>
            {[5, 10, 20, 50].map((n) => (
              <option key={n} value={n}>
                {n}+ score
              </option>
            ))}
          </Select>
        </div>
      </div>

      <div>
        <Label htmlFor="f-upd">Catalog entry updated</Label>
        <Select id="f-upd" value={sp.get("updatedWithinDays") ?? ""} onChange={(e) => set({ updatedWithinDays: e.target.value || null })}>
          <option value="">Any time</option>
          <option value="7">In the last week</option>
          <option value="30">In the last month</option>
          <option value="365">In the last year</option>
        </Select>
      </div>
    </div>
  );
}

const FILTER_KEYS = ["type", "genres", "genreMode", "status", "demographic", "yearFrom", "yearTo", "creator", "minRating", "minPopularity", "updatedWithinDays", "tags"];

export function FilterPanel({ genres }: { genres: Genre[] }) {
  const [open, setOpen] = React.useState(false);
  const { sp, set } = useParamState();
  const activeCount = FILTER_KEYS.filter((k) => k !== "genreMode" && sp.get(k)).length;
  const clear = () => set(Object.fromEntries(FILTER_KEYS.map((k) => [k, null])));

  return (
    <>
      <aside className="hidden w-72 shrink-0 lg:block" aria-label="Filters">
        <div className="sticky top-24 max-h-[calc(100dvh-7rem)] overflow-y-auto pr-2 pb-6">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-display text-lg font-bold">Filters</h2>
            {activeCount > 0 && (
              <button onClick={clear} className="cursor-pointer text-sm text-lilac hover:underline">
                Clear all
              </button>
            )}
          </div>
          <Filters genres={genres} />
        </div>
      </aside>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          <Button variant="outline" className="lg:hidden">
            <SlidersHorizontal /> Filters{activeCount ? ` (${activeCount})` : ""}
          </Button>
        </DialogTrigger>
        <DialogContent side="right" title="Filters">
          <Filters genres={genres} />
          <div className="mt-6 flex gap-2">
            {activeCount > 0 && (
              <Button variant="outline" onClick={clear}>
                <X /> Clear
              </Button>
            )}
            <Button className="ml-auto" onClick={() => setOpen(false)}>
              Show results
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

export function SortSelect({ hasQuery }: { hasQuery: boolean }) {
  const { sp, set } = useParamState();
  const sorts = (Object.keys(CATALOG_SORT_LABELS) as CatalogSort[]).filter((s) => hasQuery || s !== "relevance");
  return (
    <div className="flex items-center gap-2">
      <Label htmlFor="sort" className="mb-0 text-sm whitespace-nowrap text-muted">
        Sort by
      </Label>
      <Select id="sort" className="w-44" value={sp.get("sort") ?? (hasQuery ? "relevance" : "popularity")} onChange={(e) => set({ sort: e.target.value })}>
        {sorts.map((s) => (
          <option key={s} value={s}>
            {CATALOG_SORT_LABELS[s]}
          </option>
        ))}
      </Select>
    </div>
  );
}

export function ActiveFilters({ genres }: { genres: Genre[] }) {
  const { sp, list, set } = useParamState();
  const chips: { label: string; remove: () => void }[] = [];
  const q = sp.get("q");
  if (q) chips.push({ label: `“${q}”`, remove: () => set({ q: null }) });
  for (const t of list("type")) chips.push({ label: CONTENT_TYPE_LABELS[t as keyof typeof CONTENT_TYPE_LABELS] ?? t, remove: () => set({ type: list("type").filter((x) => x !== t) }) });
  for (const g of list("genres")) chips.push({ label: genres.find((x) => x.slug === g)?.name ?? g, remove: () => set({ genres: list("genres").filter((x) => x !== g) }) });
  for (const t of list("tags")) chips.push({ label: `#${t}`, remove: () => set({ tags: list("tags").filter((x) => x !== t) }) });
  for (const s of list("status")) chips.push({ label: PUBLICATION_STATUS_LABELS[s as keyof typeof PUBLICATION_STATUS_LABELS] ?? s, remove: () => set({ status: list("status").filter((x) => x !== s) }) });
  if (sp.get("creator")) chips.push({ label: `Creator: ${sp.get("creator")}`, remove: () => set({ creator: null }) });
  if (!chips.length) return null;
  return (
    <ul className="mb-5 flex flex-wrap gap-1.5" aria-label="Active filters">
      {chips.map((c) => (
        <li key={c.label}>
          <button onClick={c.remove} className="flex cursor-pointer items-center gap-1 rounded-full bg-violet/15 py-1 pr-2 pl-3 text-xs text-lilac hover:bg-violet/25" aria-label={`Remove filter ${c.label}`}>
            {c.label} <X className="size-3" />
          </button>
        </li>
      ))}
    </ul>
  );
}
