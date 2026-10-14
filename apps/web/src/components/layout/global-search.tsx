"use client";

import { CONTENT_TYPE_LABELS, type SeriesCard } from "@mangaverse/shared";
import { Clock, Loader2, Search, X } from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";
import { Cover } from "@/components/manga/cover";
import { useAuth } from "@/components/providers";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";

interface Recent {
  id: string;
  query: string;
}

export function GlobalSearch({ className, onNavigate }: { className?: string; onNavigate?: () => void }) {
  const router = useRouter();
  const { user } = useAuth();
  const [q, setQ] = React.useState("");
  const [open, setOpen] = React.useState(false);
  const [items, setItems] = React.useState<SeriesCard[]>([]);
  const [recent, setRecent] = React.useState<Recent[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState(false);
  const [active, setActive] = React.useState(-1);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const boxRef = React.useRef<HTMLDivElement>(null);
  const listId = React.useId();

  // Debounced autocomplete against the real catalog.
  React.useEffect(() => {
    const term = q.trim();
    if (term.length < 2) {
      setItems([]);
      setLoading(false);
      return;
    }
    const ctrl = new AbortController();
    setLoading(true);
    const t = setTimeout(() => {
      api<{ items: SeriesCard[] }>("/manga/suggest", { query: { q: term, limit: 7 }, signal: ctrl.signal })
        .then((r) => {
          setItems(r.items);
          setError(false);
          setActive(-1);
        })
        .catch((e) => {
          if (e.name !== "AbortError") setError(true);
        })
        .finally(() => setLoading(false));
    }, 220);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [q]);

  // Recent searches for signed-in users.
  React.useEffect(() => {
    if (!open || !user || q) return;
    api<{ items: Recent[] }>("/search-history").then((r) => setRecent(r.items)).catch(() => {});
  }, [open, user, q]);

  // "/" focuses search from anywhere.
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (e.key === "/" && !["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName) && !el.isContentEditable) {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  React.useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (!boxRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  const showRecent = !q && !!user && recent.length > 0;
  const options: ({ kind: "series"; s: SeriesCard } | { kind: "recent"; r: Recent } | { kind: "all" })[] = showRecent
    ? recent.slice(0, 6).map((r) => ({ kind: "recent" as const, r }))
    : [...items.map((s) => ({ kind: "series" as const, s })), ...(q.trim().length >= 2 ? [{ kind: "all" as const }] : [])];

  function go(href: string) {
    setOpen(false);
    setQ("");
    inputRef.current?.blur();
    onNavigate?.();
    router.push(href);
  }

  function submit(term = q) {
    const t = term.trim();
    if (!t) return;
    go(`/explore?q=${encodeURIComponent(t)}`);
  }

  function choose(i: number) {
    const o = options[i];
    if (!o) return submit();
    if (o.kind === "series") go(`/manga/${o.s.slug}`);
    else if (o.kind === "recent") submit(o.r.query);
    else submit();
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setOpen(true);
      setActive((a) => Math.min(a + 1, options.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, -1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (active >= 0) choose(active);
      else submit();
    } else if (e.key === "Escape") {
      setOpen(false);
      inputRef.current?.blur();
    }
  }

  async function removeRecent(id: string) {
    setRecent((r) => r.filter((x) => x.id !== id));
    await api(`/search-history/${id}`, { method: "DELETE" }).catch(() => {});
  }
  async function clearRecent() {
    setRecent([]);
    await api("/search-history", { method: "DELETE" }).catch(() => {});
  }

  const expanded = open && (options.length > 0 || (q.trim().length >= 2 && !loading));

  return (
    <div ref={boxRef} className={cn("relative", className)}>
      <form
        role="search"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <label htmlFor={`${listId}-input`} className="sr-only">
          Search manga, manhwa and manhua
        </label>
        <Search className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted" aria-hidden />
        <input
          ref={inputRef}
          id={`${listId}-input`}
          type="search"
          role="combobox"
          aria-expanded={expanded}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={active >= 0 ? `${listId}-${active}` : undefined}
          autoComplete="off"
          placeholder="Search titles, creators, genres…"
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          className="h-10 w-full rounded-xl border border-line bg-raised pr-16 pl-10 text-sm placeholder:text-muted focus:border-violet focus:ring-2 focus:ring-violet/30 focus:outline-none [&::-webkit-search-cancel-button]:hidden"
        />
        <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-muted">
          {loading ? <Loader2 className="size-4 animate-spin" aria-label="Searching" /> : <kbd className="hidden rounded border border-line px-1.5 text-[11px] sm:inline">/</kbd>}
        </span>
      </form>

      {expanded && (
        <div className="absolute inset-x-0 top-12 z-50 overflow-hidden rounded-2xl border border-line bg-surface shadow-2xl">
          {showRecent && (
            <div className="flex items-center justify-between px-4 pt-3 pb-1 text-xs text-muted">
              <span>Recent searches</span>
              <button type="button" onClick={clearRecent} className="cursor-pointer text-lilac hover:underline">
                Clear all
              </button>
            </div>
          )}
          <ul id={listId} role="listbox" aria-label="Search suggestions" className="max-h-[70vh] overflow-y-auto p-1.5">
            {options.map((o, i) => (
              <li
                key={o.kind === "series" ? o.s.id : o.kind === "recent" ? o.r.id : "all"}
                id={`${listId}-${i}`}
                role="option"
                aria-selected={active === i}
                onMouseEnter={() => setActive(i)}
                onMouseDown={(e) => {
                  e.preventDefault();
                  choose(i);
                }}
                className={cn("flex cursor-pointer items-center gap-3 rounded-xl px-2.5 py-2", active === i && "bg-raised")}
              >
                {o.kind === "series" && (
                  <>
                    <Cover title={o.s.title} coverUrl={o.s.coverUrl} compact className="w-9 shrink-0 rounded-md" sizes="36px" />
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{o.s.title}</p>
                      <p className="truncate text-xs text-muted">
                        {CONTENT_TYPE_LABELS[o.s.type]}
                        {o.s.releaseYear ? ` · ${o.s.releaseYear}` : ""}
                        {o.s.genres.length ? ` · ${o.s.genres.slice(0, 2).map((g) => g.name).join(", ")}` : ""}
                      </p>
                    </div>
                  </>
                )}
                {o.kind === "recent" && (
                  <>
                    <Clock className="size-4 shrink-0 text-muted" aria-hidden />
                    <span className="flex-1 truncate text-sm">{o.r.query}</span>
                    <button
                      type="button"
                      aria-label={`Remove “${o.r.query}” from recent searches`}
                      onMouseDown={(e) => {
                        e.stopPropagation();
                        e.preventDefault();
                        removeRecent(o.r.id);
                      }}
                      className="cursor-pointer rounded-md p-1 text-muted hover:bg-line hover:text-text"
                    >
                      <X className="size-3.5" />
                    </button>
                  </>
                )}
                {o.kind === "all" && (
                  <span className="px-1 text-sm text-lilac">
                    See all results for “{q.trim()}”
                  </span>
                )}
              </li>
            ))}
          </ul>
          {!loading && q.trim().length >= 2 && items.length === 0 && !error && (
            <p className="px-4 pb-3 text-sm text-muted">No titles match “{q.trim()}”. Try a creator name or another spelling.</p>
          )}
          {error && <p className="px-4 pb-3 text-sm text-danger">Search is unavailable right now. Try again in a moment.</p>}
        </div>
      )}
    </div>
  );
}
