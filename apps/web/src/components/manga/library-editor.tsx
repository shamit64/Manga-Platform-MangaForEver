"use client";

import { READING_STATUSES, READING_STATUS_LABELS, type LibraryEntryDTO, type ReadingStatus } from "@mangaverse/shared";
import { Minus, Plus, Trash2 } from "lucide-react";
import * as React from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { FieldError, Input, Label, Select, Switch, Textarea } from "@/components/ui/form";
import { ApiError, api } from "@/lib/api";

export function LibraryEditor({
  open,
  onOpenChange,
  seriesId,
  title,
  chapterCount,
  volumeCount,
  entry,
  initialStatus = "PLAN_TO_READ",
  onSaved,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  seriesId: string;
  title: string;
  chapterCount: number | null;
  volumeCount: number | null;
  entry: LibraryEntryDTO | null;
  initialStatus?: ReadingStatus;
  onSaved: (e: LibraryEntryDTO | null) => void;
}) {
  const [status, setStatus] = React.useState<ReadingStatus>(entry?.status ?? initialStatus);
  const [chapter, setChapter] = React.useState(entry?.progressChapter ?? 0);
  const [volume, setVolume] = React.useState(entry?.progressVolume ?? 0);
  const [score, setScore] = React.useState<string>(entry?.score ? String(entry.score) : "");
  const [notes, setNotes] = React.useState(entry?.notes ?? "");
  const [startedAt, setStartedAt] = React.useState(entry?.startedAt ?? "");
  const [completedAt, setCompletedAt] = React.useState(entry?.completedAt ?? "");
  const [isPrivate, setPrivate] = React.useState(entry?.isPrivate ?? false);
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    if (!open) return;
    setStatus(entry?.status ?? initialStatus);
    setChapter(entry?.progressChapter ?? 0);
    setVolume(entry?.progressVolume ?? 0);
    setScore(entry?.score ? String(entry.score) : "");
    setNotes(entry?.notes ?? "");
    setStartedAt(entry?.startedAt ?? "");
    setCompletedAt(entry?.completedAt ?? "");
    setPrivate(entry?.isPrivate ?? false);
    setErrors({});
  }, [open, entry, initialStatus]);

  const chapterMax = chapterCount ?? undefined;
  const chapterInvalid = chapterCount !== null && chapter > chapterCount;

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (chapterInvalid) return setErrors({ progressChapter: `This series has ${chapterCount} chapters.` });
    setSaving(true);
    setErrors({});
    const body = {
      status,
      progressChapter: chapter,
      progressVolume: volume,
      score: score ? Number(score) : null,
      notes: notes.trim() || null,
      startedAt: startedAt || null,
      completedAt: completedAt || null,
      isPrivate,
    };
    try {
      const saved = entry
        ? await api<LibraryEntryDTO>(`/library/${entry.id}`, { method: "PATCH", body })
        : await api<LibraryEntryDTO>("/library", { method: "POST", body: { ...body, seriesId } });
      onSaved(saved);
      toast.success(entry ? "Library updated" : `Added ${title} to your library`);
      onOpenChange(false);
    } catch (err) {
      if (err instanceof ApiError && err.details) {
        setErrors(Object.fromEntries(err.details.map((d) => [d.path, d.message])));
      } else toast.error(err instanceof Error ? err.message : "Couldn't save");
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!entry) return;
    setSaving(true);
    try {
      await api(`/library/${entry.id}`, { method: "DELETE" });
      onSaved(null);
      toast.success(`Removed ${title} from your library`);
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't remove");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title={entry ? "Update progress" : "Add to library"} description={title}>
        <form onSubmit={save} className="space-y-4">
          <div>
            <Label htmlFor="le-status">Status</Label>
            <Select
              id="le-status"
              value={status}
              onChange={(e) => {
                const s = e.target.value as ReadingStatus;
                setStatus(s);
                if (s === "COMPLETED" && chapterCount) setChapter(chapterCount);
              }}
            >
              {READING_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {READING_STATUS_LABELS[s]}
                </option>
              ))}
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="le-ch">Chapter</Label>
              <div className="flex gap-1.5">
                <Button type="button" variant="secondary" size="icon" aria-label="One chapter less" onClick={() => setChapter((c) => Math.max(0, c - 1))}>
                  <Minus />
                </Button>
                <Input
                  id="le-ch"
                  type="number"
                  inputMode="numeric"
                  min={0}
                  max={chapterMax}
                  value={chapter}
                  aria-invalid={chapterInvalid || !!errors.progressChapter}
                  aria-describedby="le-ch-hint"
                  onChange={(e) => setChapter(Math.max(0, Number(e.target.value) || 0))}
                  className="text-center tabular-nums"
                />
                <Button type="button" variant="secondary" size="icon" aria-label="One chapter more" onClick={() => setChapter((c) => (chapterCount ? Math.min(chapterCount, c + 1) : c + 1))}>
                  <Plus />
                </Button>
              </div>
              <p id="le-ch-hint" className="mt-1 text-xs text-muted">
                {chapterCount ? `of ${chapterCount}` : "Total unknown"}
              </p>
              <FieldError>{errors.progressChapter ?? (chapterInvalid ? `This series has ${chapterCount} chapters.` : undefined)}</FieldError>
            </div>
            <div>
              <Label htmlFor="le-vol">Volume</Label>
              <Input id="le-vol" type="number" min={0} max={volumeCount ?? undefined} value={volume} onChange={(e) => setVolume(Math.max(0, Number(e.target.value) || 0))} className="tabular-nums" />
              <p className="mt-1 text-xs text-muted">{volumeCount ? `of ${volumeCount}` : "Total unknown"}</p>
              <FieldError>{errors.progressVolume}</FieldError>
            </div>
          </div>

          <div>
            <Label htmlFor="le-score">Your score</Label>
            <Select id="le-score" value={score} onChange={(e) => setScore(e.target.value)}>
              <option value="">Not rated</option>
              {[10, 9, 8, 7, 6, 5, 4, 3, 2, 1].map((n) => (
                <option key={n} value={n}>
                  {n} / 10
                </option>
              ))}
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="le-start">Started</Label>
              <Input id="le-start" type="date" value={startedAt} onChange={(e) => setStartedAt(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="le-done">Finished</Label>
              <Input id="le-done" type="date" value={completedAt} onChange={(e) => setCompletedAt(e.target.value)} />
              <FieldError>{errors.completedAt}</FieldError>
            </div>
          </div>

          <div>
            <Label htmlFor="le-notes">Private notes</Label>
            <Textarea id="le-notes" maxLength={2000} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Only you can see these." className="min-h-20" />
          </div>

          <Switch checked={isPrivate} onCheckedChange={setPrivate} label="Hide from my public profile" description="This entry won't appear on your profile or in followers' feeds." />

          <div className="flex items-center gap-2 pt-2">
            {entry && (
              <Button type="button" variant="danger" onClick={remove} disabled={saving}>
                <Trash2 /> Remove
              </Button>
            )}
            <Button type="submit" className="ml-auto" disabled={saving}>
              {saving ? "Saving…" : entry ? "Save changes" : "Add to library"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
