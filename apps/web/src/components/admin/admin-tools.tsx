"use client";

import {
  CONTENT_TYPE_LABELS,
  PUBLICATION_STATUS_LABELS,
  REPORT_REASON_LABELS,
  SEASONS,
  SEASON_LABELS,
  type ContentType,
  type PublicationStatus,
  type ReviewDTO,
  type Season,
  type SeriesCard,
} from "@mangaforever/shared";
import { Check, Download, EyeOff, RotateCcw, Trash2, X } from "lucide-react";
import Link from "next/link";
import * as React from "react";
import { toast } from "sonner";
import { EmptyState, ErrorNotice } from "@/components/layout/section";
import { Cover } from "@/components/manga/cover";
import { Button } from "@/components/ui/button";
import { Input, Label, Select, Switch, Textarea } from "@/components/ui/form";
import { Badge, Card, Skeleton } from "@/components/ui/misc";
import { ApiError, api } from "@/lib/api";
import { formatCount, formatDate, timeAgo } from "@/lib/utils";
import { SeriesPicker } from "./series-picker";

function useLoad<T>(path: string, query?: Record<string, string | number | undefined>) {
  const [data, setData] = React.useState<T | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const key = JSON.stringify(query ?? {});
  const load = React.useCallback(async () => {
    try {
      setData(await api<T>(path, { query: JSON.parse(key) }));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't load");
    }
  }, [path, key]);
  React.useEffect(() => {
    load();
  }, [load]);
  return { data, error, reload: load };
}

// ───────── Import ─────────
type Preview = { externalId: string; title: string; type: ContentType; status: PublicationStatus; releaseYear: number | null; coverUrl: string | null; externalPopularity: number | null; alreadyImported: { id: string; slug: string } | null };

export function ImportTool() {
  const [q, setQ] = React.useState("");
  const [results, setResults] = React.useState<Preview[] | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState<string | null>(null);

  async function search(e: React.FormEvent) {
    e.preventDefault();
    if (!q.trim()) return;
    setBusy("search");
    setError(null);
    try {
      setResults((await api<{ items: Preview[] }>("/admin/import/search", { query: { q } })).items);
    } catch (err) {
      setResults(null);
      setError(err instanceof ApiError ? err.message : "Search failed");
    } finally {
      setBusy(null);
    }
  }
  async function importOne(id: string) {
    setBusy(id);
    try {
      const r = await api<{ imported: number; refreshed: number; items: { slug: string }[] }>("/admin/import", { method: "POST", body: { provider: "anilist", externalId: id } });
      toast.success(r.imported ? "Imported" : "Refreshed existing entry");
      setResults((rs) => rs?.map((x) => (x.externalId === id ? { ...x, alreadyImported: { id: "", slug: r.items[0].slug } } : x)) ?? null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Import failed");
    } finally {
      setBusy(null);
    }
  }
  const [pages, setPages] = React.useState<Record<string, number>>({ MANGA: 1, MANHWA: 1, MANHUA: 1 });
  async function importPopular(contentType: "MANGA" | "MANHWA" | "MANHUA") {
    setBusy(`popular-${contentType}`);
    try {
      const page = pages[contentType];
      const r = await api<{ imported: number; refreshed: number; skipped: number }>("/admin/import", {
        method: "POST",
        body: { provider: "anilist", contentType, page, limit: 50, skipExisting: true },
      });
      setPages((p) => ({ ...p, [contentType]: page + 1 }));
      toast.success(`Added ${r.imported} ${CONTENT_TYPE_LABELS[contentType].toLowerCase()} (${r.skipped} already in the catalog)`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Import failed");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-5">
      <Card className="p-5 text-sm text-muted">
        <p>
          Imports pull real metadata (titles, synopsis, cover, genres, tags, status, dates, AniList score and popularity) from the{" "}
          <a href="https://anilist.co" className="text-lilac hover:underline" target="_blank" rel="noopener noreferrer">AniList</a> GraphQL API.
          Re-importing the same title refreshes it instead of duplicating it. Community ratings are never affected. AniList asks for attribution and
          limits requests to about 90 per minute — MangaForEver caches responses and backs off when limited.
        </p>
      </Card>
      <form onSubmit={search} className="flex flex-wrap gap-2">
        <Input className="max-w-md" placeholder="Search AniList, e.g. “Vagabond”" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search AniList" />
        <Button type="submit" disabled={busy === "search"}>{busy === "search" ? "Searching…" : "Search AniList"}</Button>
      </form>
      <div className="flex flex-wrap gap-2">
        {(["MANGA", "MANHWA", "MANHUA"] as const).map((t) => (
          <Button key={t} type="button" variant="outline" onClick={() => importPopular(t)} disabled={busy === `popular-${t}`}>
            <Download /> {busy === `popular-${t}` ? "Importing…" : `Import next 50 popular ${CONTENT_TYPE_LABELS[t].toLowerCase()}`}
          </Button>
        ))}
      </div>
      {error && <ErrorNotice title="AniList is unavailable" description={error} />}
      {results && (results.length === 0 ? <EmptyState title="No AniList results" /> : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {results.map((r) => (
            <li key={r.externalId} className="flex gap-3 rounded-2xl border border-line bg-surface p-3">
              <Cover title={r.title} coverUrl={r.coverUrl} className="w-16 shrink-0 rounded-lg" sizes="64px" />
              <div className="min-w-0 flex-1">
                <p className="font-medium">{r.title}</p>
                <p className="text-xs text-muted">{CONTENT_TYPE_LABELS[r.type]} · {PUBLICATION_STATUS_LABELS[r.status]}{r.releaseYear ? ` · ${r.releaseYear}` : ""} · AniList #{r.externalId}</p>
                {r.externalPopularity !== null && <p className="text-xs text-muted">{formatCount(r.externalPopularity)} AniList users</p>}
                <div className="mt-2">
                  {r.alreadyImported ? (
                    <div className="flex gap-2">
                      <Badge tone="ok"><Check className="size-3" /> In catalog</Badge>
                      <Button size="sm" variant="ghost" onClick={() => importOne(r.externalId)} disabled={busy === r.externalId}>Refresh</Button>
                    </div>
                  ) : (
                    <Button size="sm" onClick={() => importOne(r.externalId)} disabled={busy === r.externalId}>
                      {busy === r.externalId ? "Importing…" : "Import"}
                    </Button>
                  )}
                </div>
              </div>
            </li>
          ))}
        </ul>
      ))}
    </div>
  );
}

// ───────── Featured ─────────
type FeaturedRow = { id: string; reason: string; position: number; isActive: boolean; series: SeriesCard };

export function FeaturedManager() {
  const { data, error, reload } = useLoad<{ items: FeaturedRow[] }>("/admin/featured");
  const [pick, setPick] = React.useState<SeriesCard | null>(null);
  const [reason, setReason] = React.useState("");

  async function save(seriesId: string, body: { reason: string; position: number; isActive: boolean }) {
    try {
      await api("/admin/featured", { method: "PUT", body: { seriesId, ...body } });
      toast.success("Saved");
      reload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't save");
    }
  }
  async function remove(seriesId: string) {
    await api(`/admin/featured/${seriesId}`, { method: "DELETE" });
    reload();
  }

  if (error) return <ErrorNotice description={error} />;
  return (
    <div className="space-y-5">
      <Card className="space-y-3 p-5">
        <h2 className="font-display font-semibold">Feature a series</h2>
        {pick ? <p className="text-sm">Selected: <b>{pick.title}</b> <button className="cursor-pointer text-lilac" onClick={() => setPick(null)}>change</button></p> : <SeriesPicker onPick={setPick} />}
        <Textarea placeholder="Why is it featured? Shown to readers (10–300 characters)." value={reason} onChange={(e) => setReason(e.target.value)} className="min-h-20" maxLength={300} />
        <Button disabled={!pick || reason.trim().length < 10} onClick={() => pick && save(pick.id, { reason, position: data?.items.length ?? 0, isActive: true }).then(() => { setPick(null); setReason(""); })}>
          Add to editor’s picks
        </Button>
      </Card>
      {!data ? <Skeleton className="h-40" /> : (
        <ul className="space-y-3">
          {data.items.map((f) => (
            <FeaturedItem key={f.id} f={f} onSave={(b) => save(f.series.id, b)} onRemove={() => remove(f.series.id)} />
          ))}
        </ul>
      )}
    </div>
  );
}

function FeaturedItem({ f, onSave, onRemove }: { f: FeaturedRow; onSave: (b: { reason: string; position: number; isActive: boolean }) => void; onRemove: () => void }) {
  const [reason, setReason] = React.useState(f.reason);
  const [position, setPosition] = React.useState(f.position);
  const [active, setActive] = React.useState(f.isActive);
  return (
    <li className="flex gap-4 rounded-2xl border border-line bg-surface p-4">
      <Cover title={f.series.title} coverUrl={f.series.coverUrl} genres={f.series.genres.map((g) => g.slug)} compact className="w-14 shrink-0 rounded-md" sizes="56px" />
      <div className="flex-1 space-y-2">
        <p className="font-semibold">{f.series.title}</p>
        <Textarea value={reason} onChange={(e) => setReason(e.target.value)} className="min-h-16" maxLength={300} aria-label="Reason" />
        <div className="flex flex-wrap items-center gap-3">
          <Label className="mb-0 flex items-center gap-2 text-sm">Position <Input type="number" min={0} max={100} className="w-20" value={position} onChange={(e) => setPosition(Number(e.target.value))} /></Label>
          <div className="w-48"><Switch checked={active} onCheckedChange={setActive} label="Active" /></div>
          <Button size="sm" onClick={() => onSave({ reason, position, isActive: active })}>Save</Button>
          <Button size="sm" variant="danger" onClick={onRemove}><Trash2 /> Remove</Button>
        </div>
      </div>
    </li>
  );
}

// ───────── Collections ─────────
type Collection = { id: string; title: string; description: string | null; season: Season; year: number; isPublished: boolean; items: { seriesId: string; note: string | null; series: { id: string; title: string } }[] };

export function CollectionsManager() {
  const { data, error, reload } = useLoad<{ items: Collection[] }>("/admin/collections");
  const [editing, setEditing] = React.useState<Collection | "new" | null>(null);
  if (error) return <ErrorNotice description={error} />;
  return (
    <div className="space-y-5">
      <p className="text-sm text-muted">Curated collections are labelled “Editor-curated” everywhere they appear — they’re recommendations, not claims about official release seasons.</p>
      {editing ? (
        <CollectionForm initial={editing === "new" ? null : editing} onDone={() => { setEditing(null); reload(); }} onCancel={() => setEditing(null)} />
      ) : (
        <Button onClick={() => setEditing("new")}>New collection</Button>
      )}
      {!data ? <Skeleton className="h-40" /> : (
        <ul className="grid gap-3 md:grid-cols-2">
          {data.items.map((c) => (
            <li key={c.id} className="rounded-2xl border border-line bg-surface p-4">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-semibold">{c.title}</p>
                  <p className="text-xs text-muted">{SEASON_LABELS[c.season]} {c.year} · {c.items.length} series {c.isPublished ? "" : "· draft"}</p>
                </div>
                <div className="flex gap-1">
                  <Button size="sm" variant="ghost" onClick={() => setEditing(c)}>Edit</Button>
                  <Button size="sm" variant="ghost" onClick={async () => { if (confirm("Delete this collection?")) { await api(`/admin/collections/${c.id}`, { method: "DELETE" }); reload(); } }}>Delete</Button>
                </div>
              </div>
              <p className="mt-2 line-clamp-2 text-sm text-muted">{c.items.map((i) => i.series.title).join(", ")}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function CollectionForm({ initial, onDone, onCancel }: { initial: Collection | null; onDone: () => void; onCancel: () => void }) {
  const [title, setTitle] = React.useState(initial?.title ?? "");
  const [description, setDescription] = React.useState(initial?.description ?? "");
  const [season, setSeason] = React.useState<Season>(initial?.season ?? "FALL");
  const [year, setYear] = React.useState(initial?.year ?? new Date().getFullYear());
  const [published, setPublished] = React.useState(initial?.isPublished ?? true);
  const [items, setItems] = React.useState<{ seriesId: string; title: string; note: string }[]>(initial?.items.map((i) => ({ seriesId: i.seriesId, title: i.series.title, note: i.note ?? "" })) ?? []);

  async function save() {
    const body = { title, description: description || null, season, year, isPublished: published, items: items.map((i) => ({ seriesId: i.seriesId, note: i.note || undefined })) };
    try {
      if (initial) await api(`/admin/collections/${initial.id}`, { method: "PUT", body });
      else await api("/admin/collections", { method: "POST", body });
      toast.success("Collection saved");
      onDone();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't save");
    }
  }

  return (
    <Card className="space-y-4 p-5">
      <div className="grid gap-3 sm:grid-cols-[1fr_10rem_8rem]">
        <div><Label htmlFor="c-title">Title</Label><Input id="c-title" value={title} onChange={(e) => setTitle(e.target.value)} /></div>
        <div><Label htmlFor="c-season">Season</Label><Select id="c-season" value={season} onChange={(e) => setSeason(e.target.value as Season)}>{SEASONS.map((s) => <option key={s} value={s}>{SEASON_LABELS[s]}</option>)}</Select></div>
        <div><Label htmlFor="c-year">Year</Label><Input id="c-year" type="number" value={year} onChange={(e) => setYear(Number(e.target.value))} /></div>
      </div>
      <div><Label htmlFor="c-desc">Description</Label><Textarea id="c-desc" value={description} onChange={(e) => setDescription(e.target.value)} className="min-h-16" /></div>
      <div>
        <Label>Series</Label>
        <SeriesPicker onPick={(s) => setItems((it) => (it.some((x) => x.seriesId === s.id) ? it : [...it, { seriesId: s.id, title: s.title, note: "" }]))} placeholder="Add a series…" />
        <ul className="mt-3 space-y-2">
          {items.map((it, idx) => (
            <li key={it.seriesId} className="flex items-center gap-2">
              <span className="w-48 truncate text-sm font-medium">{it.title}</span>
              <Input value={it.note} placeholder="Short note (optional)" onChange={(e) => setItems((arr) => arr.map((x, i) => (i === idx ? { ...x, note: e.target.value } : x)))} />
              <Button size="icon-sm" variant="ghost" onClick={() => setItems((arr) => arr.filter((_, i) => i !== idx))} aria-label={`Remove ${it.title}`}><X /></Button>
            </li>
          ))}
        </ul>
      </div>
      <div className="max-w-xs"><Switch checked={published} onCheckedChange={setPublished} label="Published" /></div>
      <div className="flex gap-2"><Button onClick={save} disabled={title.trim().length < 3}>Save collection</Button><Button variant="ghost" onClick={onCancel}>Cancel</Button></div>
    </Card>
  );
}

// ───────── Moderation ─────────
type Report = { id: string; reason: string; details: string | null; status: string; createdAt: string; resolvedAt: string | null; resolutionNote: string | null; reporter: { username: string }; resolvedBy: { username: string } | null; review: ReviewDTO };

export function ModerationQueue() {
  const [status, setStatus] = React.useState("OPEN");
  const { data, error, reload } = useLoad<{ items: Report[]; total: number }>("/admin/reports", { status, pageSize: 50 });

  async function act(r: Report, action: "HIDE_REVIEW" | "RESTORE_REVIEW" | "DISMISS") {
    const note = action === "DISMISS" ? undefined : prompt("Optional note for the audit log:") ?? undefined;
    try {
      await api(`/admin/reports/${r.id}/resolve`, { method: "POST", body: { action, note } });
      toast.success(action === "HIDE_REVIEW" ? "Review hidden" : action === "RESTORE_REVIEW" ? "Review restored" : "Report dismissed");
      reload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't resolve");
    }
  }

  return (
    <div className="space-y-5">
      <Card className="p-4 text-sm text-muted">
        <b className="text-text">Moderation actions.</b> <i>Hide review</i> removes it from public lists (the author can still see and delete it) and closes every open report on it.{" "}
        <i>Restore</i> makes a hidden review visible again. <i>Dismiss</i> closes the report without changes. Every action is written to the audit log.
      </Card>
      <div className="flex gap-1.5">
        {["OPEN", "RESOLVED", "DISMISSED"].map((s) => (
          <Button key={s} size="sm" variant={status === s ? "secondary" : "ghost"} onClick={() => setStatus(s)}>{s.charAt(0) + s.slice(1).toLowerCase()}</Button>
        ))}
      </div>
      {error ? <ErrorNotice description={error} /> : !data ? <Skeleton className="h-40" /> : data.items.length === 0 ? (
        <EmptyState title={status === "OPEN" ? "The queue is empty" : "Nothing here"} />
      ) : (
        <ul className="space-y-4">
          {data.items.map((r) => (
            <li key={r.id} className="rounded-2xl border border-line bg-surface p-5">
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <Badge tone="warn">{REPORT_REASON_LABELS[r.reason as keyof typeof REPORT_REASON_LABELS] ?? r.reason}</Badge>
                <span className="text-muted">reported by @{r.reporter.username} {timeAgo(r.createdAt)}</span>
                {r.review.isHidden && <Badge>Hidden</Badge>}
                {r.resolvedBy && <span className="text-muted">· {r.status.toLowerCase()} by @{r.resolvedBy.username} {r.resolvedAt ? formatDate(r.resolvedAt) : ""}</span>}
              </div>
              {r.details && <p className="mt-2 text-sm">“{r.details}”</p>}
              <div className="mt-3 rounded-xl border border-line bg-ink p-4">
                <p className="text-xs text-muted">
                  Review by @{r.review.author.username} on{" "}
                  {r.review.series ? <Link className="text-lilac hover:underline" href={`/manga/${r.review.series.slug}`}>{r.review.series.title}</Link> : "a series"}
                </p>
                <p className="mt-1 font-semibold">{r.review.title}</p>
                <p className="mt-1 text-sm whitespace-pre-line text-text/85">{r.review.body}</p>
              </div>
              {r.status === "OPEN" && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {r.review.isHidden ? (
                    <Button size="sm" variant="outline" onClick={() => act(r, "RESTORE_REVIEW")}><RotateCcw /> Restore review</Button>
                  ) : (
                    <Button size="sm" variant="danger" onClick={() => act(r, "HIDE_REVIEW")}><EyeOff /> Hide review</Button>
                  )}
                  <Button size="sm" variant="ghost" onClick={() => act(r, "DISMISS")}>Dismiss report</Button>
                </div>
              )}
              {r.status !== "OPEN" && r.review.isHidden && (
                <Button size="sm" variant="outline" className="mt-3" onClick={() => act(r, "RESTORE_REVIEW")}><RotateCcw /> Restore review</Button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ───────── Users ─────────
type UserRow = { id: string; username: string; email: string; role: string; isDemo: boolean; isSuspended: boolean; createdAt: string; lastLoginAt: string | null; _count: { reviews: number; library: number } };

export function UsersManager() {
  const [q, setQ] = React.useState("");
  const [debounced, setDebounced] = React.useState("");
  React.useEffect(() => {
    const t = setTimeout(() => setDebounced(q), 300);
    return () => clearTimeout(t);
  }, [q]);
  const { data, error, reload } = useLoad<{ items: UserRow[]; total: number }>("/admin/users", { q: debounced || undefined, pageSize: 50 });
  async function update(u: UserRow, body: { role?: string; isSuspended?: boolean }) {
    try {
      await api(`/admin/users/${u.id}`, { method: "PATCH", body });
      toast.success("User updated");
      reload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't update");
    }
  }
  return (
    <div className="space-y-4">
      <Input className="max-w-sm" placeholder="Search username or email…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search users" />
      {error ? <ErrorNotice description={error} /> : !data ? <Skeleton className="h-60" /> : (
        <div className="overflow-x-auto rounded-2xl border border-line">
          <table className="w-full text-sm">
            <thead className="bg-surface text-left text-xs text-muted">
              <tr><th className="px-4 py-3 font-medium">User</th><th className="px-4 py-3 font-medium">Role</th><th className="px-4 py-3 font-medium">Activity</th><th className="px-4 py-3 font-medium">Joined</th><th className="px-4 py-3 font-medium">Status</th></tr>
            </thead>
            <tbody className="divide-y divide-line">
              {data.items.map((u) => (
                <tr key={u.id}>
                  <td className="px-4 py-2.5">
                    <Link href={`/u/${u.username}`} className="font-medium hover:text-lilac">@{u.username}</Link>
                    <p className="text-xs text-muted">{u.email}{u.isDemo ? " · demo" : ""}</p>
                  </td>
                  <td className="px-4 py-2.5">
                    <Select className="h-8 w-36" value={u.role} onChange={(e) => update(u, { role: e.target.value })} aria-label={`Role for ${u.username}`}>
                      <option value="USER">User</option><option value="MODERATOR">Moderator</option><option value="ADMIN">Admin</option>
                    </Select>
                  </td>
                  <td className="px-4 py-2.5 text-muted">{u._count.library} tracked · {u._count.reviews} reviews</td>
                  <td className="px-4 py-2.5 text-muted">{formatDate(u.createdAt)}</td>
                  <td className="px-4 py-2.5">
                    <Button size="sm" variant={u.isSuspended ? "outline" : "ghost"} onClick={() => update(u, { isSuspended: !u.isSuspended })}>
                      {u.isSuspended ? "Unsuspend" : "Suspend"}
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ───────── Audit log ─────────
type Audit = { id: string; action: string; entityType: string; entityId: string | null; details: unknown; createdAt: string; actor: { username: string; role: string } | null };

export function AuditLog() {
  const [page, setPage] = React.useState(1);
  const { data, error } = useLoad<{ items: Audit[]; totalPages: number }>("/admin/audit-log", { page, pageSize: 40 });
  if (error) return <ErrorNotice description={error} />;
  if (!data) return <Skeleton className="h-60" />;
  if (!data.items.length) return <EmptyState title="No administrative actions yet" />;
  return (
    <div>
      <ul className="divide-y divide-line rounded-2xl border border-line bg-surface text-sm">
        {data.items.map((a) => (
          <li key={a.id} className="grid gap-1 px-4 py-3 sm:grid-cols-[11rem_9rem_1fr]">
            <span className="text-muted">{new Date(a.createdAt).toLocaleString()}</span>
            <span className="font-medium">@{a.actor?.username ?? "system"}</span>
            <span>
              <code className="rounded bg-raised px-1.5 py-0.5 text-xs">{a.action}</code>{" "}
              <span className="text-muted">{a.entityType}{a.entityId ? ` ${a.entityId.slice(0, 10)}…` : ""}</span>
              {a.details ? <span className="mt-0.5 block truncate text-xs text-muted">{JSON.stringify(a.details)}</span> : null}
            </span>
          </li>
        ))}
      </ul>
      <div className="mt-4 flex justify-center gap-2">
        <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage(page - 1)}>Newer</Button>
        <Button size="sm" variant="outline" disabled={page >= data.totalPages} onClick={() => setPage(page + 1)}>Older</Button>
      </div>
    </div>
  );
}
