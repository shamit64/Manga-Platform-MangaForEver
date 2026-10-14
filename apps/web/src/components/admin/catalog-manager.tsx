"use client";

import {
  CONTENT_TYPES,
  CONTENT_TYPE_LABELS,
  DATA_SOURCE_LABELS,
  DEMOGRAPHICS,
  DEMOGRAPHIC_LABELS,
  PUBLICATION_STATUSES,
  PUBLICATION_STATUS_LABELS,
  type SeriesDetail,
  type SeriesCard,
} from "@mangaverse/shared";
import { Archive, ArchiveRestore, GitMerge, Pencil, Plus, RefreshCw } from "lucide-react";
import Link from "next/link";
import * as React from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { FieldError, Input, Label, Select, Textarea } from "@/components/ui/form";
import { Badge, Card, Skeleton } from "@/components/ui/misc";
import { ApiError, api } from "@/lib/api";
import { formatDate } from "@/lib/utils";

type Row = SeriesCard & { isArchived: boolean; isFeatured: boolean; externalProvider: string | null; externalId: string | null; lastSyncedAt: string | null };

const split = (s: string) => s.split(",").map((x) => x.trim()).filter(Boolean);

function SeriesForm({ id, onDone }: { id: string | null; onDone: () => void }) {
  const [loading, setLoading] = React.useState(!!id);
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [f, setF] = React.useState({
    title: "", altTitles: "", synopsis: "", description: "", coverUrl: "", bannerUrl: "", type: "MANGA", status: "ONGOING",
    demographic: "", releaseYear: "", chapterCount: "", volumeCount: "", publisher: "", countryOfOrigin: "",
    genres: "", tags: "", authors: "", artists: "",
  });
  React.useEffect(() => {
    if (!id) return;
    api<SeriesDetail>(`/manga/${id}`).then((s) => {
      setF({
        title: s.title, altTitles: s.altTitles.join(", "), synopsis: s.synopsis ?? "", description: s.description ?? "", coverUrl: s.coverUrl ?? "",
        bannerUrl: s.bannerUrl ?? "", type: s.type, status: s.status, demographic: s.demographic ?? "", releaseYear: s.releaseYear ? String(s.releaseYear) : "",
        chapterCount: s.chapterCount !== null ? String(s.chapterCount) : "", volumeCount: s.volumeCount !== null ? String(s.volumeCount) : "",
        publisher: s.publisher ?? "", countryOfOrigin: s.countryOfOrigin ?? "", genres: s.genres.map((g) => g.name).join(", "), tags: s.tags.map((t) => t.name).join(", "),
        authors: s.creators.filter((c) => c.role !== "ART").map((c) => c.name).join(", "), artists: s.creators.filter((c) => c.role !== "STORY").map((c) => c.name).join(", "),
      });
      setLoading(false);
    });
  }, [id]);
  const num = (v: string) => (v.trim() === "" ? null : Number(v));
  const str = (v: string) => (v.trim() === "" ? null : v.trim());

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErrors({});
    const body = {
      title: f.title.trim(), altTitles: split(f.altTitles), synopsis: str(f.synopsis), description: str(f.description), coverUrl: str(f.coverUrl), bannerUrl: str(f.bannerUrl),
      type: f.type, status: f.status, demographic: str(f.demographic), releaseYear: num(f.releaseYear), chapterCount: num(f.chapterCount), volumeCount: num(f.volumeCount),
      publisher: str(f.publisher), countryOfOrigin: str(f.countryOfOrigin), genres: split(f.genres), tags: split(f.tags), authors: split(f.authors), artists: split(f.artists),
    };
    try {
      if (id) await api(`/admin/manga/${id}`, { method: "PATCH", body });
      else await api("/admin/manga", { method: "POST", body });
      toast.success(id ? "Series updated" : "Series created");
      onDone();
    } catch (err) {
      if (err instanceof ApiError && err.details) setErrors(Object.fromEntries(err.details.map((d) => [d.path.split(".")[0], d.message])));
      else toast.error(err instanceof Error ? err.message : "Couldn't save");
    }
  }

  if (loading) return <Skeleton className="h-96" />;
  const field = (k: keyof typeof f, label: string, opts: { area?: boolean; hint?: string; type?: string } = {}) => (
    <div className={opts.area ? "sm:col-span-2" : undefined}>
      <Label htmlFor={`sf-${k}`}>{label}</Label>
      {opts.area ? (
        <Textarea id={`sf-${k}`} value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} className="min-h-20" />
      ) : (
        <Input id={`sf-${k}`} type={opts.type} value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} />
      )}
      {opts.hint && <p className="mt-1 text-xs text-muted">{opts.hint}</p>}
      <FieldError>{errors[k]}</FieldError>
    </div>
  );
  return (
    <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
      {field("title", "Title")}
      {field("altTitles", "Alternative titles", { hint: "Comma-separated, including native script" })}
      <div>
        <Label htmlFor="sf-type">Type</Label>
        <Select id="sf-type" value={f.type} onChange={(e) => setF({ ...f, type: e.target.value })}>
          {CONTENT_TYPES.map((t) => <option key={t} value={t}>{CONTENT_TYPE_LABELS[t]}</option>)}
        </Select>
      </div>
      <div>
        <Label htmlFor="sf-status">Publication status</Label>
        <Select id="sf-status" value={f.status} onChange={(e) => setF({ ...f, status: e.target.value })}>
          {PUBLICATION_STATUSES.map((t) => <option key={t} value={t}>{PUBLICATION_STATUS_LABELS[t]}</option>)}
        </Select>
      </div>
      <div>
        <Label htmlFor="sf-demo">Demographic</Label>
        <Select id="sf-demo" value={f.demographic} onChange={(e) => setF({ ...f, demographic: e.target.value })}>
          <option value="">Unknown</option>
          {DEMOGRAPHICS.map((t) => <option key={t} value={t}>{DEMOGRAPHIC_LABELS[t]}</option>)}
        </Select>
      </div>
      {field("releaseYear", "Release year", { type: "number" })}
      {field("chapterCount", "Chapters", { type: "number", hint: "Leave blank if unknown" })}
      {field("volumeCount", "Volumes", { type: "number", hint: "Leave blank if unknown" })}
      {field("publisher", "Publisher / platform")}
      {field("countryOfOrigin", "Country of origin")}
      {field("authors", "Authors", { hint: "Comma-separated" })}
      {field("artists", "Artists", { hint: "Comma-separated" })}
      {field("genres", "Genres", { hint: "Comma-separated, e.g. Action, Fantasy" })}
      {field("tags", "Themes & tags", { hint: "Comma-separated" })}
      {field("coverUrl", "Cover image URL", { hint: "Only use images you're licensed to display" })}
      {field("bannerUrl", "Banner image URL")}
      {field("synopsis", "Synopsis", { area: true })}
      {field("description", "Full description", { area: true })}
      <div className="flex justify-end sm:col-span-2">
        <Button type="submit">{id ? "Save changes" : "Create series"}</Button>
      </div>
    </form>
  );
}

export function CatalogManager() {
  const [q, setQ] = React.useState("");
  const [archived, setArchived] = React.useState<"false" | "true">("false");
  const [page, setPage] = React.useState(1);
  const [data, setData] = React.useState<{ items: Row[]; total: number; totalPages: number } | null>(null);
  const [editing, setEditing] = React.useState<string | null | "new">(null);
  const [dupes, setDupes] = React.useState<{ a: { id: string; title: string }; b: { id: string; title: string }; similarity: number }[] | null>(null);

  const load = React.useCallback(async () => {
    try {
      setData(await api("/admin/manga", { query: { q, archived, page, pageSize: 25 } }));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't load catalog");
    }
  }, [q, archived, page]);
  React.useEffect(() => {
    const t = setTimeout(load, 250);
    return () => clearTimeout(t);
  }, [load]);

  async function setArchivedState(r: Row, value: boolean) {
    try {
      if (value) await api(`/admin/manga/${r.id}`, { method: "DELETE" });
      else await api(`/admin/manga/${r.id}`, { method: "PATCH", body: { isArchived: false } });
      toast.success(value ? `Archived ${r.title}` : `Restored ${r.title}`);
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't update");
    }
  }
  async function refresh(r: Row) {
    try {
      await api(`/admin/manga/${r.id}/refresh`, { method: "POST" });
      toast.success(`Re-synced ${r.title}`);
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't refresh");
    }
  }
  async function findDupes() {
    setDupes((await api<{ items: NonNullable<typeof dupes> }>("/admin/manga/duplicates")).items);
  }
  async function merge(keepId: string, mergeId: string, title: string) {
    if (!confirm(`Merge “${title}” into the other entry? Library entries, ratings, reviews and favorites move over and the duplicate is archived.`)) return;
    try {
      await api("/admin/manga/merge", { method: "POST", body: { keepId, mergeId } });
      toast.success("Merged");
      findDupes();
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't merge");
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap gap-2">
        <Input className="max-w-xs" placeholder="Search titles…" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} aria-label="Search catalog" />
        <Select className="w-40" value={archived} onChange={(e) => { setArchived(e.target.value as "true" | "false"); setPage(1); }} aria-label="Archive filter">
          <option value="false">Active</option>
          <option value="true">Archived</option>
        </Select>
        <Button variant="outline" onClick={findDupes}><GitMerge /> Find duplicates</Button>
        <Button className="ml-auto" onClick={() => setEditing("new")}><Plus /> Add series</Button>
      </div>

      {dupes && (
        <Card className="p-4">
          <h2 className="mb-2 font-display font-semibold">Possible duplicates</h2>
          {dupes.length === 0 ? <p className="text-sm text-muted">No similar titles found.</p> : (
            <ul className="space-y-2 text-sm">
              {dupes.map((d) => (
                <li key={`${d.a.id}-${d.b.id}`} className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{d.a.title}</span> ↔ <span className="font-medium">{d.b.title}</span>
                  <Badge>{Math.round(d.similarity * 100)}% similar</Badge>
                  <Button size="sm" variant="ghost" onClick={() => merge(d.a.id, d.b.id, d.b.title)}>Keep first</Button>
                  <Button size="sm" variant="ghost" onClick={() => merge(d.b.id, d.a.id, d.a.title)}>Keep second</Button>
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}

      {!data ? <Skeleton className="h-96" /> : (
        <div className="overflow-x-auto rounded-2xl border border-line">
          <table className="w-full text-sm">
            <thead className="bg-surface text-left text-xs text-muted">
              <tr>
                <th className="px-4 py-3 font-medium">Title</th>
                <th className="px-4 py-3 font-medium">Type</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Source</th>
                <th className="px-4 py-3 font-medium">Updated</th>
                <th className="px-4 py-3"><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {data.items.map((r) => (
                <tr key={r.id} className="hover:bg-surface/60">
                  <td className="px-4 py-2.5">
                    <Link href={`/manga/${r.slug}`} className="font-medium hover:text-lilac">{r.title}</Link>
                    {r.isFeatured && <Badge tone="violet" className="ml-2">Featured</Badge>}
                  </td>
                  <td className="px-4 py-2.5">{CONTENT_TYPE_LABELS[r.type]}</td>
                  <td className="px-4 py-2.5">{PUBLICATION_STATUS_LABELS[r.status]}</td>
                  <td className="px-4 py-2.5 text-muted">{DATA_SOURCE_LABELS[r.source]}{r.externalId ? ` #${r.externalId}` : ""}</td>
                  <td className="px-4 py-2.5 text-muted">{formatDate(r.metadataUpdatedAt)}</td>
                  <td className="px-4 py-2.5">
                    <div className="flex justify-end gap-1">
                      {r.externalProvider && <Button size="icon-sm" variant="ghost" onClick={() => refresh(r)} aria-label={`Re-sync ${r.title}`}><RefreshCw /></Button>}
                      <Button size="icon-sm" variant="ghost" onClick={() => setEditing(r.id)} aria-label={`Edit ${r.title}`}><Pencil /></Button>
                      <Button size="icon-sm" variant="ghost" onClick={() => setArchivedState(r, !r.isArchived)} aria-label={r.isArchived ? `Restore ${r.title}` : `Archive ${r.title}`}>
                        {r.isArchived ? <ArchiveRestore /> : <Archive />}
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="flex items-center justify-between border-t border-line px-4 py-3 text-sm text-muted">
            <span>{data.total} series</span>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</Button>
              <span className="self-center">Page {page} of {data.totalPages}</span>
              <Button size="sm" variant="outline" disabled={page >= data.totalPages} onClick={() => setPage(page + 1)}>Next</Button>
            </div>
          </div>
        </div>
      )}

      <Dialog open={editing !== null} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent title={editing === "new" ? "Add series" : "Edit series"} className="w-[min(96vw,48rem)]">
          {editing !== null && <SeriesForm id={editing === "new" ? null : editing} onDone={() => { setEditing(null); load(); }} />}
        </DialogContent>
      </Dialog>
    </div>
  );
}
