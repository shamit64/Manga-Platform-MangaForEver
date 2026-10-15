"use client";

import type { ChapterCommentDTO, Paginated, ReaderChapter } from "@mangaforever/shared";
import {
  ArrowLeft,
  BookOpen,
  Check,
  ChevronLeft,
  ChevronRight,
  Columns2,
  ExternalLink,
  Rows3,
  Settings2,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import * as React from "react";
import { toast } from "sonner";
import { Avatar } from "@/components/layout/header";
import { useAuth } from "@/components/providers";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import { chapterLabel, cn, formatDate, timeAgo } from "@/lib/utils";

type Mode = "strip" | "paged";
type Fit = "width" | "height" | "original";

const REACTIONS = [
  ["LOVED", "❤️", "Loved it"],
  ["HYPE", "🔥", "Hype"],
  ["SAD", "😢", "Sad"],
  ["FUNNY", "😂", "Funny"],
  ["SHOCKED", "😱", "Shocked"],
] as const;

function readPref<T extends string>(key: string, fallback: T, allowed: readonly T[]): T {
  try {
    const v = localStorage.getItem(key) as T | null;
    return v && allowed.includes(v) ? v : fallback;
  } catch {
    return fallback;
  }
}
function writePref(key: string, v: string) {
  try {
    localStorage.setItem(key, v);
  } catch {}
}

/**
 * Chapter reader. Long strip (default for manhwa and manhua) or paged (right-to-left for manga),
 * fit options, a top bar that hides while scrolling, keyboard and touch controls, and automatic
 * progress: finishing the chapter moves the member's list entry forward with no button to press.
 * Chapters MangaForEver can't host show a card that opens the official publisher instead.
 */
export function Reader({ data }: { data: ReaderChapter }) {
  const { series, chapter, pages, prev, next } = data;
  const { user, requireUser } = useAuth();
  const router = useRouter();
  const defaultMode: Mode = user?.preferences.readerMode ?? (series.type === "MANGA" ? "paged" : "strip");
  const [mode, setMode] = React.useState<Mode>(defaultMode);
  const [fit, setFit] = React.useState<Fit>("width");
  const [gap, setGap] = React.useState(false);
  const [page, setPage] = React.useState(0);
  const [barVisible, setBarVisible] = React.useState(true);
  const [settingsOpen, setSettingsOpen] = React.useState(false);
  const [progress, setProgress] = React.useState(0);
  const [done, setDone] = React.useState(false);
  const rtl = series.type === "MANGA";
  const sentinel = React.useRef<HTMLDivElement>(null);
  const href = (n: number) => `/manga/${series.slug}/chapter/${n}`;

  // Remembered per content type on this device.
  React.useEffect(() => {
    setMode(readPref(`mf-reader-mode-${series.type}`, defaultMode, ["strip", "paged"] as const));
    setFit(readPref("mf-reader-fit", "width", ["width", "height", "original"] as const));
    setGap(readPref("mf-reader-gap", "off", ["on", "off"] as const) === "on");
  }, [series.type, defaultMode]);

  // Hide the site chrome while reading.
  React.useEffect(() => {
    document.body.classList.add("reading");
    return () => document.body.classList.remove("reading");
  }, []);

  const markRead = React.useCallback(async () => {
    if (done) return;
    setDone(true);
    if (!user) return;
    try {
      const r = await api<{ status: string; progressChapter: number }>(`/chapters/${chapter.id}/read`, { method: "POST" });
      toast.success(`Saved: chapter ${r.progressChapter} in your list`, { id: "progress" });
    } catch {
      setDone(false);
    }
  }, [chapter.id, done, user]);

  // Strip mode: top bar hides on scroll down; progress bar; finishing = reaching the end sentinel.
  React.useEffect(() => {
    let last = window.scrollY;
    const onScroll = () => {
      const y = window.scrollY;
      if (Math.abs(y - last) > 8) setBarVisible(y < last || y < 80);
      last = y;
      const max = document.documentElement.scrollHeight - window.innerHeight;
      if (mode === "strip") setProgress(max > 0 ? Math.min(1, y / max) : 1);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [mode]);

  React.useEffect(() => {
    if (mode !== "strip" || !pages.length || !sentinel.current) return;
    const io = new IntersectionObserver((e) => e.some((x) => x.isIntersecting) && markRead(), { rootMargin: "0px 0px 200px 0px" });
    io.observe(sentinel.current);
    return () => io.disconnect();
  }, [mode, pages.length, markRead]);

  // Paged mode: progress and finishing follow the page index; preload the next two pages.
  React.useEffect(() => {
    if (mode !== "paged" || !pages.length) return;
    setProgress((page + 1) / pages.length);
    if (page === pages.length - 1) markRead();
    for (const p of pages.slice(page + 1, page + 3)) {
      const img = new Image();
      img.src = p.imageUrl;
    }
  }, [mode, page, pages, markRead]);

  const turn = React.useCallback(
    (dir: 1 | -1) => {
      if (mode !== "paged" || !pages.length) {
        const n = dir === 1 ? next : prev;
        if (n !== null) router.push(href(n));
        return;
      }
      const target = page + dir;
      if (target < 0) {
        if (prev !== null) router.push(href(prev));
      } else if (target >= pages.length) {
        document.getElementById("chapter-end")?.scrollIntoView({ behavior: "smooth" });
      } else {
        setPage(target);
        window.scrollTo({ top: 0 });
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [mode, pages.length, page, next, prev, router],
  );

  // Keyboard: arrows and A/D. Manga pages turn right-to-left.
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLSelectElement) return;
      const k = e.key.toLowerCase();
      if (k === "arrowright" || k === "d") turn(rtl && mode === "paged" ? -1 : 1);
      else if (k === "arrowleft" || k === "a") turn(rtl && mode === "paged" ? 1 : -1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [turn, rtl, mode]);

  // Swipe in paged mode.
  const touch = React.useRef<number | null>(null);
  const onTouchStart = (e: React.TouchEvent) => (touch.current = e.touches[0]!.clientX);
  const onTouchEnd = (e: React.TouchEvent) => {
    if (touch.current === null) return;
    const dx = e.changedTouches[0]!.clientX - touch.current;
    touch.current = null;
    if (Math.abs(dx) < 50) return;
    const forward = dx < 0 ? !rtl : rtl;
    turn(forward ? 1 : -1);
  };

  const imgClass = cn(
    "mx-auto block select-none",
    fit === "width" && "w-full max-w-3xl h-auto",
    fit === "height" && "h-[calc(100dvh-3.5rem)] w-auto max-w-full object-contain",
    fit === "original" && "max-w-none",
  );

  const setModeAndSave = (m: Mode) => {
    setMode(m);
    setPage(0);
    writePref(`mf-reader-mode-${series.type}`, m);
    if (user) api("/users/me", { method: "PATCH", body: { preferences: { readerMode: m } } }).catch(() => {});
  };

  return (
    <div className="-mx-4 min-h-dvh bg-ink sm:-mx-6">
      {/* Top bar */}
      <div
        className={cn(
          "fixed inset-x-0 top-0 z-50 border-b border-line bg-ink/95 backdrop-blur-xl transition-transform duration-200",
          !barVisible && !settingsOpen && "-translate-y-full",
        )}
      >
        <div className="mx-auto flex h-14 max-w-5xl items-center gap-2 px-3">
          <Link href={`/manga/${series.slug}`} className="flex min-w-0 items-center gap-2 rounded-md px-2 py-1.5 hover:bg-raised" aria-label={`Back to ${series.title}`}>
            <ArrowLeft className="size-4 shrink-0" />
            <span className="hidden truncate font-display sm:inline">{series.title}</span>
          </Link>
          <div className="ml-auto flex items-center gap-1">
            <Button variant="ghost" size="icon-sm" disabled={prev === null} onClick={() => prev !== null && router.push(href(prev))} aria-label="Previous chapter">
              <ChevronLeft />
            </Button>
            <label className="sr-only" htmlFor="chapter-select">Chapter</label>
            <select
              id="chapter-select"
              value={chapter.number}
              onChange={(e) => router.push(href(Number(e.target.value)))}
              className="tabular h-9 max-w-36 rounded-md border border-line bg-surface px-2 text-sm"
            >
              {[...data.chapterNumbers].reverse().map((n) => (
                <option key={n} value={n}>
                  {chapterLabel(n)}
                </option>
              ))}
            </select>
            <Button variant="ghost" size="icon-sm" disabled={next === null} onClick={() => next !== null && router.push(href(next))} aria-label="Next chapter">
              <ChevronRight />
            </Button>
            {pages.length > 0 && (
              <>
                <Button variant="ghost" size="icon-sm" onClick={() => setModeAndSave(mode === "strip" ? "paged" : "strip")} aria-label={mode === "strip" ? "Switch to paged mode" : "Switch to long strip"}>
                  {mode === "strip" ? <Columns2 /> : <Rows3 />}
                </Button>
                <Button variant="ghost" size="icon-sm" onClick={() => setSettingsOpen((o) => !o)} aria-expanded={settingsOpen} aria-label="Reader settings">
                  <Settings2 />
                </Button>
              </>
            )}
          </div>
        </div>
        {settingsOpen && (
          <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-x-6 gap-y-3 border-t border-line px-4 py-3 text-sm">
            <fieldset className="flex items-center gap-1.5">
              <legend className="sr-only">Fit</legend>
              <span className="mr-1 text-muted">Fit</span>
              {(["width", "height", "original"] as const).map((f) => (
                <button key={f} onClick={() => (setFit(f), writePref("mf-reader-fit", f))} aria-pressed={fit === f} className={cn("rounded-md border px-2.5 py-1 capitalize", fit === f ? "border-text" : "border-line text-muted")}>
                  {f}
                </button>
              ))}
            </fieldset>
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={gap} onChange={(e) => (setGap(e.target.checked), writePref("mf-reader-gap", e.target.checked ? "on" : "off"))} className="size-4 accent-[var(--violet)]" />
              Space between pages
            </label>
            <span className="text-xs text-muted">Keys: ← → or A / D{mode === "paged" ? (rtl ? " · pages turn right-to-left" : "") : " · switch chapters"}</span>
          </div>
        )}
        <div className="h-0.5 bg-line" aria-hidden>
          <div className="h-full bg-violet transition-[width] duration-150" style={{ width: `${Math.round(progress * 100)}%` }} />
        </div>
      </div>

      <div className="pt-16">
        <header className="mx-auto max-w-3xl px-4 py-6 text-center">
          <p className="eyebrow">{series.title}</p>
          <h1 className="mt-2 font-display text-3xl font-medium">
            {chapterLabel(chapter.number)}
            {chapter.title ? <span className="text-muted">: {chapter.title}</span> : null}
          </h1>
          {chapter.releasedAt && <p className="mt-1 text-sm text-muted">Released {formatDate(chapter.releasedAt)}</p>}
        </header>

        {pages.length ? (
          mode === "strip" ? (
            <div className={cn("flex flex-col items-center", gap && "gap-4")}>
              {pages.map((p, i) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  key={p.index}
                  src={p.imageUrl}
                  alt={`Page ${i + 1} of ${pages.length}`}
                  width={p.width ?? undefined}
                  height={p.height ?? undefined}
                  loading={i < 3 ? "eager" : "lazy"}
                  decoding="async"
                  className={imgClass}
                />
              ))}
              <div ref={sentinel} aria-hidden className="h-1 w-full" />
            </div>
          ) : (
            <div className="relative select-none" onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={pages[page]!.imageUrl} alt={`Page ${page + 1} of ${pages.length}`} className={imgClass} />
              {/* Tap zones: left and right thirds turn the page. */}
              <button className="absolute inset-y-0 left-0 w-1/3 cursor-w-resize" aria-label={rtl ? "Next page" : "Previous page"} onClick={() => turn(rtl ? 1 : -1)} />
              <button className="absolute inset-y-0 right-0 w-1/3 cursor-e-resize" aria-label={rtl ? "Previous page" : "Next page"} onClick={() => turn(rtl ? -1 : 1)} />
              <p className="tabular mt-3 text-center text-sm text-muted" aria-live="polite">
                {page + 1} / {pages.length}
              </p>
            </div>
          )
        ) : (
          <OfficialCard data={data} onRead={markRead} done={done} signedIn={!!user} requireUser={requireUser} />
        )}

        <EndPanel data={data} />
      </div>
    </div>
  );
}

/** For chapters MangaForEver can't host: a large button to the official publisher, plus one-tap "mark read". */
function OfficialCard({ data, onRead, done, signedIn, requireUser }: { data: ReaderChapter; onRead: () => void; done: boolean; signedIn: boolean; requireUser: () => boolean }) {
  const { chapter, series } = data;
  const links = chapter.externalUrl ? [{ label: chapter.publisher ?? "the official publisher", url: chapter.externalUrl }] : series.officialLinks.filter((l) => l.label !== "AniList");
  return (
    <div className="mx-auto max-w-xl px-4">
      <div className="rounded-lg border border-line bg-surface p-6 text-center sm:p-8">
        <BookOpen className="mx-auto size-8 text-lilac" aria-hidden />
        <h2 className="mt-3 font-display text-2xl font-medium">Read this chapter on the official site</h2>
        <p className="mt-2 text-sm text-muted">
          MangaForEver only shows pages it has the right to host. Reading on the publisher supports the creators, and it’s usually free for the newest chapters.
        </p>
        <div className="mt-6 flex flex-col gap-2">
          {links.length ? (
            links.map((l) => (
              <Button key={l.url} asChild size="lg">
                <a href={l.url} target="_blank" rel="noopener noreferrer" onClick={() => signedIn && onRead()}>
                  Read on {l.label} <ExternalLink />
                </a>
              </Button>
            ))
          ) : (
            <p className="rounded-md border border-dashed border-line px-4 py-3 text-sm text-muted">
              No official reading link is known for this chapter yet. Check the series page for publisher links.
            </p>
          )}
          <Button variant="outline" size="lg" onClick={() => requireUser() && onRead()} disabled={done}>
            <Check /> {done ? "Marked as read" : "Mark as read"}
          </Button>
        </div>
      </div>
    </div>
  );
}

/** End of chapter: next chapter, reactions, chapter comments and a prompt to review the series. */
function EndPanel({ data }: { data: ReaderChapter }) {
  const { series, chapter, next } = data;
  const { user, requireUser } = useAuth();
  const [reactions, setReactions] = React.useState(data.reactions);
  const [mine, setMine] = React.useState(data.viewerReaction);

  async function react(kind: (typeof REACTIONS)[number][0]) {
    if (!requireUser()) return;
    const nextKind = mine === kind ? null : kind;
    try {
      const r = await api<{ reactions: ReaderChapter["reactions"]; viewerReaction: ReaderChapter["viewerReaction"] }>(`/chapters/${chapter.id}/reaction`, { method: "PUT", body: { kind: nextKind } });
      setReactions(r.reactions);
      setMine(r.viewerReaction);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't save your reaction");
    }
  }

  return (
    <section id="chapter-end" aria-label="End of chapter" className="mx-auto max-w-3xl scroll-mt-20 px-4 pt-12 pb-24">
      <div className="flex flex-wrap items-center justify-between gap-3 border-y border-line py-5">
        <p className="font-display text-xl">End of {chapterLabel(chapter.number)}</p>
        {next !== null ? (
          <Button asChild size="lg">
            <Link href={`/manga/${series.slug}/chapter/${next}`}>
              Next: {chapterLabel(next)} <ChevronRight />
            </Link>
          </Button>
        ) : (
          <Button asChild variant="outline" size="lg">
            <Link href={`/manga/${series.slug}`}>You’re caught up · back to series</Link>
          </Button>
        )}
      </div>

      <div className="mt-8">
        <p className="eyebrow mb-3">How was it?</p>
        <div className="flex flex-wrap gap-2">
          {REACTIONS.map(([kind, emoji, label]) => (
            <button
              key={kind}
              onClick={() => react(kind)}
              aria-pressed={mine === kind}
              className={cn("flex min-h-11 items-center gap-2 rounded-full border px-3.5 text-sm", mine === kind ? "border-violet bg-violet/10" : "border-line hover:border-text/40")}
            >
              <span aria-hidden>{emoji}</span> {label}
              <span className="tabular text-xs text-muted">{reactions[kind]}</span>
            </button>
          ))}
        </div>
      </div>

      <p className="mt-8 text-sm text-muted">
        Enjoying {series.title}?{" "}
        <Link href={`/manga/${series.slug}#reviews`} className="text-lilac hover:underline">
          Rate or review the series
        </Link>
        .
      </p>

      <Comments chapterId={chapter.id} count={data.commentCount} signedIn={!!user} requireUser={requireUser} />
    </section>
  );
}

function Comments({ chapterId, count, signedIn, requireUser }: { chapterId: string; count: number; signedIn: boolean; requireUser: () => boolean }) {
  const [list, setList] = React.useState<ChapterCommentDTO[] | null>(null);
  const [body, setBody] = React.useState("");
  const [spoiler, setSpoiler] = React.useState(true);
  const [busy, setBusy] = React.useState(false);
  const [revealed, setRevealed] = React.useState<Set<string>>(new Set());

  React.useEffect(() => {
    fetch(`/api/v1/chapters/${chapterId}/comments?pageSize=30`, { credentials: "same-origin" })
      .then((r) => r.json())
      .then((d: Paginated<ChapterCommentDTO>) => setList(d.items))
      .catch(() => setList([]));
  }, [chapterId]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!requireUser()) return;
    setBusy(true);
    try {
      const c = await api<ChapterCommentDTO>(`/chapters/${chapterId}/comments`, { method: "POST", body: { body, containsSpoilers: spoiler } });
      setList((l) => [c, ...(l ?? [])]);
      setBody("");
      if (c.isHidden) toast.message("Your comment is waiting for a moderator", { description: c.hiddenReason ?? undefined });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't post your comment");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-10">
      <h2 className="font-display text-2xl font-medium">Chapter discussion {count ? <span className="text-muted">({count})</span> : null}</h2>
      <form onSubmit={submit} className="mt-4 space-y-2">
        <label htmlFor="comment" className="sr-only">Your comment</label>
        <textarea
          id="comment"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          onFocus={() => !signedIn && requireUser()}
          rows={3}
          maxLength={2000}
          placeholder={signedIn ? "What did you think of this chapter?" : "Sign in to join the discussion"}
          className="w-full rounded-md border border-line bg-surface px-3 py-2.5 text-sm placeholder:text-muted focus:border-text/40"
        />
        <div className="flex items-center justify-between gap-3">
          <label className="flex items-center gap-2 text-sm text-muted">
            <input type="checkbox" checked={spoiler} onChange={(e) => setSpoiler(e.target.checked)} className="size-4 accent-[var(--violet)]" /> Contains spoilers
          </label>
          <Button type="submit" size="sm" disabled={busy || body.trim().length < 2}>
            Post
          </Button>
        </div>
      </form>
      <ul className="mt-6 space-y-4">
        {list === null ? (
          <li className="text-sm text-muted">Loading comments…</li>
        ) : list.length === 0 ? (
          <li className="text-sm text-muted">No comments yet. Be the first.</li>
        ) : (
          list.map((c) => (
            <li key={c.id} className="flex gap-3">
              <Avatar name={c.author.displayName ?? c.author.username} url={c.author.avatarUrl} size={32} />
              <div className="min-w-0 flex-1">
                <p className="text-sm">
                  <Link href={`/u/${c.author.username}`} className="font-medium hover:text-lilac">{c.author.displayName ?? c.author.username}</Link>{" "}
                  <span className="text-xs text-muted">{timeAgo(c.createdAt)}</span>
                  {c.isHidden && <span className="ml-2 text-xs text-gold">Waiting for review</span>}
                </p>
                {c.containsSpoilers && !revealed.has(c.id) ? (
                  <button onClick={() => setRevealed((s) => new Set(s).add(c.id))} className="mt-1 rounded-md bg-raised px-3 py-2 text-left text-sm text-muted hover:text-text">
                    Spoiler hidden · tap to show
                  </button>
                ) : (
                  <p className="mt-1 text-sm whitespace-pre-line">{c.body}</p>
                )}
              </div>
            </li>
          ))
        )}
      </ul>
    </div>
  );
}
