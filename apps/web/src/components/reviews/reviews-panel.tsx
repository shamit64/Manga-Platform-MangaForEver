"use client";

import { reviewCreateSchema, type Paginated, type ReviewDTO } from "@mangaforever/shared";
import { zodResolver } from "@hookform/resolvers/zod";
import { MessageSquarePlus } from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import type { z } from "zod";
import { EmptyState } from "@/components/layout/section";
import { useAuth } from "@/components/providers";
import { Button } from "@/components/ui/button";
import { FieldError, Input, Label, Select, Textarea } from "@/components/ui/form";
import { ApiError, api } from "@/lib/api";
import { cn } from "@/lib/utils";
import { ReviewCard } from "./review-card";

type FormValues = z.input<typeof reviewCreateSchema>;

/** 1–10 rating control. Saves immediately and reports the new community average. */
export function RatingControl({ seriesId, initial }: { seriesId: string; initial: number | null }) {
  const { requireUser } = useAuth();
  const router = useRouter();
  const [score, setScore] = React.useState(initial);
  const [hover, setHover] = React.useState<number | null>(null);
  React.useEffect(() => setScore(initial), [initial]);

  async function rate(n: number) {
    if (!requireUser()) return;
    const prev = score;
    setScore(n);
    try {
      const r = await api<{ community: { ratingAvg: number; ratingCount: number } }>(`/manga/${seriesId}/rating`, { method: "PUT", body: { score: n } });
      toast.success(`Rated ${n}/10 · community average now ${r.community.ratingAvg.toFixed(1)}`);
      router.refresh();
    } catch (e) {
      setScore(prev);
      toast.error(e instanceof Error ? e.message : "Couldn't save rating");
    }
  }
  async function clear() {
    try {
      await api(`/manga/${seriesId}/rating`, { method: "DELETE" });
      setScore(null);
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't remove rating");
    }
  }

  const shown = hover ?? score ?? 0;
  return (
    <div>
      <div className="flex items-center gap-1" role="radiogroup" aria-label="Your rating from 1 to 10" onMouseLeave={() => setHover(null)}>
        {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
          <button
            key={n}
            role="radio"
            aria-checked={score === n}
            aria-label={`${n} out of 10`}
            onMouseEnter={() => setHover(n)}
            onFocus={() => setHover(n)}
            onBlur={() => setHover(null)}
            onClick={() => rate(n)}
            className={cn(
              "grid size-9 cursor-pointer place-items-center rounded-lg border text-sm font-semibold tabular-nums transition-colors",
              n <= shown ? "border-gold/60 bg-gold/15 text-gold" : "border-line text-muted hover:text-text",
            )}
          >
            {n}
          </button>
        ))}
      </div>
      <p className="mt-2 text-sm text-muted">
        {score ? (
          <>
            You rated this {score}/10.{" "}
            <button onClick={clear} className="cursor-pointer text-lilac hover:underline">
              Remove rating
            </button>
          </>
        ) : (
          "You haven't rated this yet."
        )}
      </p>
    </div>
  );
}

function ReviewForm({
  seriesId,
  existing,
  onDone,
  onCancel,
}: {
  seriesId: string;
  existing: ReviewDTO | null;
  onDone: (r: ReviewDTO) => void;
  onCancel: () => void;
}) {
  const form = useForm<FormValues>({
    resolver: zodResolver(reviewCreateSchema),
    defaultValues: { title: existing?.title ?? "", body: existing?.body ?? "", containsSpoilers: existing?.containsSpoilers ?? false, score: existing?.score ?? undefined },
  });
  const { register, handleSubmit, formState, setError, watch } = form;
  const body = watch("body") ?? "";

  async function submit(values: FormValues) {
    try {
      const payload = { ...values, score: values.score ? Number(values.score) : undefined };
      const r = existing
        ? await api<ReviewDTO>(`/reviews/${existing.id}`, { method: "PATCH", body: payload })
        : await api<ReviewDTO>(`/manga/${seriesId}/reviews`, { method: "POST", body: payload });
      toast.success(existing ? "Review updated" : "Review published");
      onDone(r);
    } catch (e) {
      if (e instanceof ApiError && e.details) e.details.forEach((d) => setError(d.path as keyof FormValues, { message: d.message }));
      else toast.error(e instanceof Error ? e.message : "Couldn't save review");
    }
  }

  return (
    <form onSubmit={handleSubmit(submit)} className="space-y-4 rounded-2xl border border-violet/40 bg-surface p-5" noValidate>
      <h3 className="font-display text-lg font-semibold">{existing ? "Edit your review" : "Write a review"}</h3>
      <div>
        <Label htmlFor="rv-title">Title</Label>
        <Input id="rv-title" aria-invalid={!!formState.errors.title} {...register("title")} placeholder="Sum it up in a line" />
        <FieldError>{formState.errors.title?.message}</FieldError>
      </div>
      <div>
        <Label htmlFor="rv-body">Review</Label>
        <Textarea id="rv-body" rows={7} aria-invalid={!!formState.errors.body} {...register("body")} placeholder="What worked, what didn't, and who you'd recommend it to." />
        <div className="mt-1 flex justify-between text-xs text-muted">
          <FieldError>{formState.errors.body?.message}</FieldError>
          <span className="ml-auto tabular-nums">{body.length.toLocaleString()} / 10,000</span>
        </div>
      </div>
      <div className="flex flex-wrap items-end gap-4">
        <div className="w-40">
          <Label htmlFor="rv-score">Score</Label>
          <Select id="rv-score" {...register("score", { setValueAs: (v) => (v === "" || v === undefined ? undefined : Number(v)) })}>
            <option value="">Keep current</option>
            {[10, 9, 8, 7, 6, 5, 4, 3, 2, 1].map((n) => (
              <option key={n} value={n}>
                {n} / 10
              </option>
            ))}
          </Select>
        </div>
        <label className="flex cursor-pointer items-center gap-2 pb-2.5 text-sm">
          <input type="checkbox" className="size-4 accent-[var(--violet)]" {...register("containsSpoilers")} />
          Contains spoilers
        </label>
      </div>
      <div className="flex gap-2">
        <Button type="submit" disabled={formState.isSubmitting}>
          {formState.isSubmitting ? "Saving…" : existing ? "Save review" : "Publish review"}
        </Button>
        <Button type="button" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

export function ReviewsPanel({
  seriesId,
  initial,
  viewerRating,
  viewerReviewId,
}: {
  seriesId: string;
  initial: Paginated<ReviewDTO>;
  viewerRating: number | null;
  viewerReviewId: string | null;
}) {
  const { user, requireUser } = useAuth();
  const router = useRouter();
  const [sort, setSort] = React.useState("helpful");
  const [data, setData] = React.useState(initial);
  const [loading, setLoading] = React.useState(false);
  const [editing, setEditing] = React.useState<null | ReviewDTO | "new">(null);
  const own = data.items.find((r) => r.id === viewerReviewId) ?? null;

  const load = React.useCallback(
    async (s: string, page = 1) => {
      setLoading(true);
      try {
        const r = await api<Paginated<ReviewDTO>>(`/manga/${seriesId}/reviews`, { query: { sort: s, page, pageSize: 10 } });
        setData((prev) => (page === 1 ? r : { ...r, items: [...prev.items, ...r.items] }));
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Couldn't load reviews");
      } finally {
        setLoading(false);
      }
    },
    [seriesId],
  );

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-line bg-surface p-5">
        <h3 className="mb-3 font-display text-lg font-semibold">Your rating</h3>
        <RatingControl seriesId={seriesId} initial={viewerRating} />
      </div>

      {editing ? (
        <ReviewForm
          seriesId={seriesId}
          existing={editing === "new" ? null : editing}
          onCancel={() => setEditing(null)}
          onDone={() => {
            setEditing(null);
            load(sort);
            router.refresh();
          }}
        />
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-3">
          {!viewerReviewId ? (
            <Button onClick={() => requireUser() && setEditing("new")}>
              <MessageSquarePlus /> Write a review
            </Button>
          ) : (
            <p className="text-sm text-muted">You’ve reviewed this series.</p>
          )}
          <div className="flex items-center gap-2">
            <Label htmlFor="rv-sort" className="mb-0 text-sm text-muted">
              Sort
            </Label>
            <Select
              id="rv-sort"
              className="w-40"
              value={sort}
              onChange={(e) => {
                setSort(e.target.value);
                load(e.target.value);
              }}
            >
              <option value="helpful">Most helpful</option>
              <option value="newest">Newest</option>
              <option value="rating">Highest rated</option>
            </Select>
          </div>
        </div>
      )}

      {data.items.length === 0 ? (
        <EmptyState title="No reviews yet" description="Be the first MangaForEver member to review this series." />
      ) : (
        <div className={cn("space-y-4", loading && "opacity-60")}>
          {data.items.map((r) => (
            <ReviewCard
              key={r.id}
              review={r}
              onEdit={user?.id === r.author.id ? () => setEditing(r) : undefined}
              onDeleted={() => {
                load(sort);
                router.refresh();
              }}
            />
          ))}
          {data.page < data.totalPages && (
            <Button variant="outline" className="w-full" disabled={loading} onClick={() => load(sort, data.page + 1)}>
              {loading ? "Loading…" : "Load more reviews"}
            </Button>
          )}
        </div>
      )}
      {own === null && viewerReviewId && !editing && (
        <p className="text-xs text-muted">Your review may be hidden by a moderator or on a later page.</p>
      )}
    </div>
  );
}
