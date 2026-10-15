"use client";

import type { SeriesCard } from "@mangaforever/shared";
import { EyeOff, Play, RotateCcw } from "lucide-react";
import Link from "next/link";
import * as React from "react";
import { toast } from "sonner";
import { EmptyState, ErrorNotice } from "@/components/layout/section";
import { Button } from "@/components/ui/button";
import { Input, Label, Textarea } from "@/components/ui/form";
import { Badge, Card, Skeleton } from "@/components/ui/misc";
import { ApiError, api } from "@/lib/api";
import { timeAgo } from "@/lib/utils";
import { SeriesPicker } from "./series-picker";

function useLoad<T>(path: string) {
  const [data, setData] = React.useState<T | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const load = React.useCallback(async () => {
    try {
      setData(await api<T>(path));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't load");
    }
  }, [path]);
  React.useEffect(() => {
    load();
  }, [load]);
  return { data, error, reload: load };
}

// ───────── Scheduled jobs ─────────
type Job = {
  name: string;
  schedule: string;
  description: string;
  failStreak: number;
  lastRun: { startedAt: string; finishedAt: string | null; ok: boolean | null; stats: Record<string, unknown> | null; error: string | null } | null;
};

export function JobsPanel() {
  const { data, error, reload } = useLoad<{ items: Job[] }>("/admin/jobs");
  const [running, setRunning] = React.useState<string | null>(null);

  async function run(name: string) {
    setRunning(name);
    try {
      const r = await api<{ durationMs: number }>(`/admin/jobs/${name}/run`, { method: "POST" });
      toast.success(`${name} finished in ${(r.durationMs / 1000).toFixed(1)}s`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't run the job");
    } finally {
      setRunning(null);
      reload();
    }
  }

  if (error) return <ErrorNotice description={error} />;
  if (!data) return <Skeleton className="h-64" />;
  return (
    <div className="space-y-4">
      <Card className="p-4 text-sm text-muted">
        These jobs run automatically from GitHub Actions on the schedule shown. <i>Run now</i> starts one immediately from here; runs never overlap.
      </Card>
      <ul className="divide-y divide-line overflow-hidden rounded-lg border border-line bg-surface">
        {data.items.map((j) => {
          const last = j.lastRun;
          return (
            <li key={j.name} className="flex flex-wrap items-center gap-4 p-4">
              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-center gap-2 font-medium">
                  <code className="font-mono text-sm">{j.name}</code>
                  <span className="text-xs text-muted">{j.schedule}</span>
                  {j.failStreak >= 3 && <Badge tone="warn">Failed {j.failStreak} times in a row</Badge>}
                </p>
                <p className="mt-0.5 text-sm text-muted">{j.description}</p>
                {last && (
                  <p className="mt-1 text-xs text-muted">
                    Last run {timeAgo(last.startedAt)} ·{" "}
                    {last.ok === null ? "running" : last.ok ? <span className="text-text">ok</span> : <span className="text-lilac">failed: {last.error}</span>}
                    {last.stats ? ` · ${Object.entries(last.stats).map(([k, v]) => `${k} ${v}`).join(", ")}` : ""}
                  </p>
                )}
                {!last && <p className="mt-1 text-xs text-muted">Hasn&apos;t run yet.</p>}
              </div>
              <Button size="sm" variant="outline" disabled={running !== null} onClick={() => run(j.name)}>
                <Play /> {running === j.name ? "Running…" : "Run now"}
              </Button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

// ───────── Held chapter comments ─────────
type Held = { id: string; body: string; hiddenReason: string | null; createdAt: string; author: { username: string }; chapter: { number: number; series: { slug: string; title: string } } };

export function HeldComments() {
  const { data, error, reload } = useLoad<{ items: Held[] }>("/admin/chapter-comments/held");
  async function set(c: Held, hidden: boolean) {
    try {
      await api(`/admin/chapter-comments/${c.id}/visibility`, { method: "PATCH", body: { hidden, reason: hidden ? "Removed by a moderator" : undefined } });
      toast.success(hidden ? "Comment removed" : "Comment approved");
      reload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't update");
    }
  }
  return (
    <section className="space-y-3">
      <h2 className="font-display text-xl font-medium">Held chapter comments</h2>
      <p className="text-sm text-muted">Comments the spam filter held back (too many links, spam phrases, or repeated characters). Approve to publish them.</p>
      {error ? <ErrorNotice description={error} /> : !data ? <Skeleton className="h-24" /> : data.items.length === 0 ? (
        <EmptyState title="Nothing held" />
      ) : (
        <ul className="space-y-3">
          {data.items.map((c) => (
            <li key={c.id} className="rounded-lg border border-line bg-surface p-4">
              <p className="text-xs text-muted">
                @{c.author.username} on{" "}
                <Link className="text-lilac hover:underline" href={`/manga/${c.chapter.series.slug}/chapter/${c.chapter.number}`}>
                  {c.chapter.series.title} ch. {c.chapter.number}
                </Link>{" "}
                · {timeAgo(c.createdAt)} {c.hiddenReason ? `· ${c.hiddenReason}` : ""}
              </p>
              <p className="mt-2 text-sm whitespace-pre-line">{c.body}</p>
              <div className="mt-3 flex gap-2">
                <Button size="sm" variant="outline" onClick={() => set(c, false)}><RotateCcw /> Approve</Button>
                <Button size="sm" variant="ghost" onClick={() => set(c, true)}><EyeOff /> Keep hidden</Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

// ───────── Chapter sources ─────────
type Unlinked = { id: string; slug: string; title: string; type: string; status: string; sourceLinkCheckedAt: string | null };

export function SourceLinks() {
  const { data, error, reload } = useLoad<{ linked: number; items: Unlinked[] }>("/admin/source-links/unmatched");
  const [ids, setIds] = React.useState<Record<string, string>>({});
  async function save(s: Unlinked) {
    try {
      await api(`/admin/manga/${s.id}/source-link`, { method: "PUT", body: { provider: "mangadex", externalId: (ids[s.id] ?? "").trim() } });
      toast.success(`Linked ${s.title}; chapters arrive on the next sync`);
      reload();
    } catch (e) {
      toast.error(e instanceof ApiError && e.details?.[0] ? e.details[0].message : e instanceof Error ? e.message : "Couldn't link");
    }
  }
  return (
    <section className="space-y-3">
      <h2 className="font-display text-xl font-medium">Series without a chapter source</h2>
      <p className="text-sm text-muted">
        {data ? `${data.linked} series are linked to MangaDex for chapter updates. ` : ""}These ones couldn&apos;t be matched automatically. Paste the MangaDex
        ID (the UUID in a mangadex.org/title/… address) to link one by hand.
      </p>
      {error ? <ErrorNotice description={error} /> : !data ? <Skeleton className="h-24" /> : data.items.length === 0 ? (
        <EmptyState title="Every checked series is linked" />
      ) : (
        <ul className="divide-y divide-line overflow-hidden rounded-lg border border-line bg-surface">
          {data.items.map((s) => (
            <li key={s.id} className="flex flex-wrap items-center gap-3 p-3">
              <Link href={`/manga/${s.slug}`} className="min-w-0 flex-1 truncate font-medium hover:underline">{s.title}</Link>
              <Input
                aria-label={`MangaDex ID for ${s.title}`}
                className="h-9 w-80 max-w-full font-mono text-xs"
                placeholder="00000000-0000-0000-0000-000000000000"
                value={ids[s.id] ?? ""}
                onChange={(e) => setIds({ ...ids, [s.id]: e.target.value })}
              />
              <Button size="sm" variant="outline" disabled={!ids[s.id]} onClick={() => save(s)}>Link</Button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

// ───────── Hosted chapters ─────────
export function HostChapterForm() {
  const [series, setSeries] = React.useState<SeriesCard | null>(null);
  const [number, setNumber] = React.useState("");
  const [title, setTitle] = React.useState("");
  const [pages, setPages] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!series) return toast.error("Pick a series first");
    const urls = pages.split(/\s+/).map((u) => u.trim()).filter(Boolean);
    setBusy(true);
    try {
      await api(`/admin/manga/${series.id}/chapters`, { method: "POST", body: { number: Number(number), title: title.trim() || null, pages: urls.map((url) => ({ url })) } });
      toast.success(`Chapter ${number} published; followers were notified`);
      setNumber("");
      setTitle("");
      setPages("");
    } catch (err) {
      toast.error(err instanceof ApiError && err.details?.[0] ? `${err.details[0].path}: ${err.details[0].message}` : err instanceof Error ? err.message : "Couldn't publish");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="space-y-3">
      <h2 className="font-display text-xl font-medium">Publish a hosted chapter</h2>
      <Card className="p-4 text-sm text-muted">
        Only for chapters MangaForEver has the right to host: your own works, works submitted by their creators, public-domain or Creative Commons works.
        Everything else should link to its official publisher.
      </Card>
      <form onSubmit={submit} className="space-y-4 rounded-lg border border-line bg-surface p-5">
        <div>
          <Label htmlFor="hc-series">Series</Label>
          {series ? (
            <p className="flex items-center gap-2 text-sm">
              <b>{series.title}</b> <Button type="button" size="sm" variant="ghost" onClick={() => setSeries(null)}>Change</Button>
            </p>
          ) : (
            <SeriesPicker id="hc-series" onPick={setSeries} />
          )}
        </div>
        <div className="grid gap-4 sm:grid-cols-[140px_1fr]">
          <div>
            <Label htmlFor="hc-num">Chapter number</Label>
            <Input id="hc-num" inputMode="decimal" required value={number} onChange={(e) => setNumber(e.target.value)} placeholder="12" />
          </div>
          <div>
            <Label htmlFor="hc-title">Title (optional)</Label>
            <Input id="hc-title" value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
        </div>
        <div>
          <Label htmlFor="hc-pages">Page image URLs, in order</Label>
          <Textarea id="hc-pages" required className="min-h-32 font-mono text-xs" value={pages} onChange={(e) => setPages(e.target.value)} placeholder={"https://…/page-01.webp\nhttps://…/page-02.webp"} />
          <p className="mt-1 text-xs text-muted">One per line. https links (for example Cloudinary or Cloudflare R2) or paths on this site.</p>
        </div>
        <Button type="submit" disabled={busy}>{busy ? "Publishing…" : "Publish chapter"}</Button>
      </form>
    </section>
  );
}
