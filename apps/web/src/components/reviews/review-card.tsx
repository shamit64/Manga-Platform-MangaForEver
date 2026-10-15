"use client";

import { REPORT_REASONS, REPORT_REASON_LABELS, type ReviewDTO } from "@mangaverse/shared";
import { EyeOff, Flag, Pencil, Star, ThumbsUp, Trash2 } from "lucide-react";
import Link from "next/link";
import * as React from "react";
import { toast } from "sonner";
import { Avatar } from "@/components/layout/header";
import { useAuth } from "@/components/providers";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Label, Select, Textarea } from "@/components/ui/form";
import { Badge } from "@/components/ui/misc";
import { api } from "@/lib/api";
import { cn, timeAgo } from "@/lib/utils";

export function ReviewCard({
  review,
  showSeries,
  onEdit,
  onDeleted,
}: {
  review: ReviewDTO;
  showSeries?: boolean;
  onEdit?: () => void;
  onDeleted?: () => void;
}) {
  const { user, requireUser } = useAuth();
  const [revealed, setRevealed] = React.useState(!review.containsSpoilers);
  const [expanded, setExpanded] = React.useState(false);
  const [helpful, setHelpful] = React.useState({ voted: !!review.viewerVotedHelpful, count: review.helpfulCount });
  const [reportOpen, setReportOpen] = React.useState(false);
  const isOwn = user?.id === review.author.id;
  const isStaff = user?.role === "ADMIN" || user?.role === "MODERATOR";
  const long = review.body.length > 600;

  async function toggleHelpful() {
    if (!requireUser()) return;
    try {
      const r = await api<{ voted: boolean; helpfulCount: number }>(`/reviews/${review.id}/helpful`, { method: "POST" });
      setHelpful({ voted: r.voted, count: r.helpfulCount });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't save your vote");
    }
  }

  async function remove() {
    if (!confirm(isOwn ? "Delete your review? This can't be undone." : "Delete this review as a moderator?")) return;
    try {
      await api(`/reviews/${review.id}`, { method: "DELETE" });
      toast.success("Review deleted");
      onDeleted?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't delete");
    }
  }

  return (
    <article className="rounded-2xl border border-line bg-surface p-5">
      <header className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <Link href={`/u/${review.author.username}`} className="flex items-center gap-2.5 hover:text-lilac">
          <Avatar name={review.author.displayName ?? review.author.username} url={review.author.avatarUrl} size={34} />
          <span className="text-sm">
            <span className="font-semibold">{review.author.displayName ?? review.author.username}</span>
            <span className="text-muted"> @{review.author.username}</span>
          </span>
        </Link>
        {review.author.isDemo && <Badge tone="outline" title="Seeded demo account">Demo member</Badge>}
        {review.score !== null && (
          <span className="flex items-center gap-1 rounded-md bg-gold/12 px-2 py-0.5 text-sm font-semibold text-gold tabular-nums">
            <Star className="size-3.5 fill-current" aria-hidden /> {review.score}/10
          </span>
        )}
        <time className="ml-auto text-xs text-muted" dateTime={review.createdAt}>
          {timeAgo(review.createdAt)}
          {review.updatedAt !== review.createdAt && " · edited"}
        </time>
      </header>

      {showSeries && review.series && (
        <p className="mt-3 text-sm text-muted">
          on{" "}
          <Link href={`/manga/${review.series.slug}`} className="font-medium text-lilac hover:underline">
            {review.series.title}
          </Link>
        </p>
      )}

      {/* User content is rendered as plain text — React escapes it, no HTML is interpreted. */}
      <h3 className="mt-3 font-display text-lg font-semibold">{review.title}</h3>
      <div className="relative mt-2">
        <p className={cn("text-sm leading-relaxed whitespace-pre-line text-text/90", !revealed && "blur-md select-none", long && !expanded && "line-clamp-6")}>{review.body}</p>
        {!revealed && (
          <div className="absolute inset-0 grid place-items-center">
            <Button variant="secondary" size="sm" onClick={() => setRevealed(true)}>
              <EyeOff /> Contains spoilers — show review
            </Button>
          </div>
        )}
      </div>
      {revealed && long && (
        <button onClick={() => setExpanded((x) => !x)} className="mt-1 cursor-pointer text-sm text-lilac hover:underline">
          {expanded ? "Show less" : "Read more"}
        </button>
      )}

      <footer className="mt-4 flex flex-wrap items-center gap-2">
        {review.containsSpoilers && <Badge tone="warn">Spoilers</Badge>}
        <Button
          variant={helpful.voted ? "secondary" : "ghost"}
          size="sm"
          onClick={toggleHelpful}
          disabled={isOwn}
          aria-pressed={helpful.voted}
          title={isOwn ? "You can't vote on your own review" : undefined}
        >
          <ThumbsUp className={cn(helpful.voted && "fill-current")} /> Helpful · {helpful.count}
        </Button>
        <div className="ml-auto flex gap-1">
          {isOwn && onEdit && (
            <Button variant="ghost" size="sm" onClick={onEdit}>
              <Pencil /> Edit
            </Button>
          )}
          {(isOwn || isStaff) && (
            <Button variant="ghost" size="sm" onClick={remove}>
              <Trash2 /> Delete
            </Button>
          )}
          {!isOwn && (
            <Button variant="ghost" size="sm" onClick={() => requireUser() && setReportOpen(true)}>
              <Flag /> Report
            </Button>
          )}
        </div>
      </footer>
      <ReportDialog reviewId={review.id} open={reportOpen} onOpenChange={setReportOpen} />
    </article>
  );
}

function ReportDialog({ reviewId, open, onOpenChange }: { reviewId: string; open: boolean; onOpenChange: (o: boolean) => void }) {
  const [reason, setReason] = React.useState<(typeof REPORT_REASONS)[number]>("SPAM");
  const [details, setDetails] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await api(`/reviews/${reviewId}/report`, { method: "POST", body: { reason, details: details.trim() || undefined } });
      toast.success("Report sent to moderators");
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't send report");
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title="Report review" description="Moderators review every report. The author isn't told who reported them.">
        <form onSubmit={submit} className="space-y-4">
          <div>
            <Label htmlFor="rep-reason">Reason</Label>
            <Select id="rep-reason" value={reason} onChange={(e) => setReason(e.target.value as typeof reason)}>
              {REPORT_REASONS.map((r) => (
                <option key={r} value={r}>
                  {REPORT_REASON_LABELS[r]}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label htmlFor="rep-details">Details (optional)</Label>
            <Textarea id="rep-details" maxLength={1000} value={details} onChange={(e) => setDetails(e.target.value)} className="min-h-20" />
          </div>
          <Button type="submit" disabled={busy} className="w-full">
            {busy ? "Sending…" : "Send report"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
