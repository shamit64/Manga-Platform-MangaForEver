"use client";

import { Bell, BellRing } from "lucide-react";
import * as React from "react";
import { toast } from "sonner";
import { useAuth } from "@/components/providers";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";

/** Follow a series to be told about new chapters (bell, push and the optional email digest). */
export function FollowButton({ seriesId, initial, followers, size = "md" }: { seriesId: string; initial: boolean; followers?: number; size?: "md" | "lg" }) {
  const { requireUser } = useAuth();
  const [on, setOn] = React.useState(initial);
  const [count, setCount] = React.useState(followers);
  const [busy, setBusy] = React.useState(false);
  React.useEffect(() => setOn(initial), [initial]);

  async function toggle() {
    if (!requireUser()) return;
    setBusy(true);
    const next = !on;
    setOn(next);
    try {
      const r = await api<{ following: boolean; followers: number }>(`/manga/${seriesId}/follow`, { method: next ? "PUT" : "DELETE", body: next ? {} : undefined });
      setCount(r.followers);
      toast.success(next ? "Following: you'll be told about new chapters" : "Unfollowed");
    } catch (e) {
      setOn(!next);
      toast.error(e instanceof Error ? e.message : "Couldn't update follow");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Button variant={on ? "secondary" : "outline"} size={size} onClick={toggle} disabled={busy} aria-pressed={on}>
      {on ? <BellRing className="text-lilac" /> : <Bell />}
      {on ? "Following" : "Follow"}
      {count ? <span className="tabular text-xs text-muted">{count}</span> : null}
    </Button>
  );
}
