"use client";

import { CONTENT_TYPE_LABELS, type SeriesCard } from "@mangaforever/shared";
import * as React from "react";
import { Input } from "@/components/ui/form";
import { api } from "@/lib/api";

/** Minimal search-as-you-type picker over the catalog suggest endpoint. */
export function SeriesPicker({ onPick, placeholder = "Search the catalog…", id }: { onPick: (s: SeriesCard) => void; placeholder?: string; id?: string }) {
  const [q, setQ] = React.useState("");
  const [items, setItems] = React.useState<SeriesCard[]>([]);
  React.useEffect(() => {
    if (q.trim().length < 2) return setItems([]);
    const ctrl = new AbortController();
    const t = setTimeout(() => {
      api<{ items: SeriesCard[] }>("/manga/suggest", { query: { q, limit: 8 }, signal: ctrl.signal }).then((r) => setItems(r.items)).catch(() => {});
    }, 200);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [q]);
  return (
    <div className="relative">
      <Input id={id} value={q} onChange={(e) => setQ(e.target.value)} placeholder={placeholder} autoComplete="off" />
      {items.length > 0 && (
        <ul className="absolute inset-x-0 top-11 z-20 max-h-72 overflow-y-auto rounded-xl border border-line bg-surface p-1 shadow-xl">
          {items.map((s) => (
            <li key={s.id}>
              <button
                type="button"
                onClick={() => {
                  onPick(s);
                  setQ("");
                  setItems([]);
                }}
                className="flex w-full cursor-pointer justify-between gap-3 rounded-lg px-3 py-2 text-left text-sm hover:bg-raised"
              >
                <span className="truncate">{s.title}</span>
                <span className="shrink-0 text-xs text-muted">{CONTENT_TYPE_LABELS[s.type]}{s.releaseYear ? ` · ${s.releaseYear}` : ""}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
