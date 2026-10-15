"use client";

import type { Me } from "@mangaforever/shared";
import { ThemeProvider } from "next-themes";
import { usePathname, useRouter } from "next/navigation";
import * as React from "react";
import { Toaster, toast } from "sonner";

interface AuthCtx {
  user: Me | null;
  setUser: (u: Me | null) => void;
  /** Redirect to sign-in (returning here) if signed out. Returns true when signed in. */
  requireUser: () => boolean;
}

const Ctx = React.createContext<AuthCtx | null>(null);

export interface ChapterEvent {
  series: { slug: string; title: string; coverUrl: string | null; type: string };
  chapter: number;
  title: string | null;
  releasedAt: string | null;
  count: number;
}

interface LiveCtx {
  /** Unread notifications for the signed-in member. */
  unread: number;
  setUnread: React.Dispatch<React.SetStateAction<number>>;
  /** Increments whenever new chapters arrive (live stream or the 60-second fallback check). */
  chapterTick: number;
  lastChapter: ChapterEvent | null;
}

const Live = React.createContext<LiveCtx>({ unread: 0, setUnread: () => {}, chapterTick: 0, lastChapter: null });

/**
 * One server-sent-events connection per tab. New chapters bump `chapterTick` so live lists refetch;
 * notifications bump the bell. Where streaming fails (some proxies), it falls back to a 60-second check.
 */
function LiveProvider({ signedIn, children }: { signedIn: boolean; children: React.ReactNode }) {
  const [unread, setUnread] = React.useState(0);
  const [chapterTick, setTick] = React.useState(0);
  const [lastChapter, setLast] = React.useState<ChapterEvent | null>(null);

  React.useEffect(() => {
    if (!signedIn) {
      setUnread(0);
      return;
    }
    fetch("/api/v1/notifications/unread-count", { credentials: "same-origin" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d && setUnread(d.count))
      .catch(() => {});
  }, [signedIn]);

  React.useEffect(() => {
    let es: EventSource | null = null;
    let poll: ReturnType<typeof setInterval> | null = null;
    const startPolling = () => {
      if (poll) return;
      poll = setInterval(() => {
        setTick((t) => t + 1);
        if (signedIn) {
          fetch("/api/v1/notifications/unread-count", { credentials: "same-origin" })
            .then((r) => (r.ok ? r.json() : null))
            .then((d) => d && setUnread(d.count))
            .catch(() => {});
        }
      }, 60_000);
    };
    if (typeof EventSource === "undefined") startPolling();
    else {
      es = new EventSource("/api/v1/events");
      es.addEventListener("chapter", (e) => {
        try {
          setLast(JSON.parse((e as MessageEvent).data));
        } catch {}
        setTick((t) => t + 1);
      });
      es.addEventListener("notification", (e) => {
        try {
          const d = JSON.parse((e as MessageEvent).data) as ChapterEvent;
          setUnread((n) => n + d.count);
          toast(`${d.series.title}: chapter ${d.chapter} is out`, {
            action: { label: "Read", onClick: () => (window.location.href = `/manga/${d.series.slug}/chapter/${d.chapter}`) },
          });
        } catch {}
      });
      es.onerror = () => {
        if (es?.readyState === EventSource.CLOSED) startPolling();
      };
    }
    return () => {
      es?.close();
      if (poll) clearInterval(poll);
    };
  }, [signedIn]);

  return <Live.Provider value={{ unread, setUnread, chapterTick, lastChapter }}>{children}</Live.Provider>;
}

export const useLive = () => React.useContext(Live);

export function Providers({ initialUser, children }: { initialUser: Me | null; children: React.ReactNode }) {
  const [user, setUser] = React.useState(initialUser);
  const router = useRouter();
  const pathname = usePathname();
  React.useEffect(() => setUser(initialUser), [initialUser]);

  const requireUser = React.useCallback(() => {
    if (user) return true;
    router.push(`/login?next=${encodeURIComponent(pathname)}`);
    return false;
  }, [user, router, pathname]);

  return (
    <ThemeProvider attribute="class" defaultTheme={initialUser?.preferences.theme ?? "dark"} enableSystem storageKey="mf-theme" disableTransitionOnChange>
      <Ctx.Provider value={{ user, setUser, requireUser }}>
        <LiveProvider signedIn={!!user}>{children}</LiveProvider>
        <Toaster position="bottom-center" theme="system" toastOptions={{ classNames: { toast: "!bg-surface !border-line !text-text !rounded-lg" } }} />
      </Ctx.Provider>
    </ThemeProvider>
  );
}

export function useAuth() {
  const ctx = React.useContext(Ctx);
  if (!ctx) throw new Error("useAuth must be used inside <Providers>");
  return ctx;
}
