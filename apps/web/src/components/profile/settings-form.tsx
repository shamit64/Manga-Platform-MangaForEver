"use client";

import { changePasswordSchema, type Me, type Preferences } from "@mangaforever/shared";
import { useTheme } from "next-themes";
import { useRouter } from "next/navigation";
import * as React from "react";
import { toast } from "sonner";
import { useAuth } from "@/components/providers";
import { Button } from "@/components/ui/button";
import { FieldError, Input, Label, Select, Switch, Textarea } from "@/components/ui/form";
import { Card } from "@/components/ui/misc";
import { ApiError, api } from "@/lib/api";
import { cn } from "@/lib/utils";

export function SettingsForm({ me, genres, welcome }: { me: Me; genres: { name: string; slug: string }[]; welcome: boolean }) {
  const router = useRouter();
  const { setUser } = useAuth();
  const { setTheme } = useTheme();
  const [displayName, setDisplayName] = React.useState(me.displayName ?? "");
  const [bio, setBio] = React.useState(me.bio ?? "");
  const [avatarUrl, setAvatarUrl] = React.useState(me.avatarUrl ?? "");
  const [prefs, setPrefs] = React.useState<Preferences>(me.preferences);
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [saving, setSaving] = React.useState(false);

  const toggleGenre = (slug: string) =>
    setPrefs((p) => ({
      ...p,
      favoriteGenres: p.favoriteGenres.includes(slug) ? p.favoriteGenres.filter((g) => g !== slug) : [...p.favoriteGenres, slug].slice(0, 15),
    }));

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setErrors({});
    try {
      const { user } = await api<{ user: Me }>("/users/me", {
        method: "PATCH",
        body: { displayName: displayName.trim() || null, bio: bio.trim() || null, avatarUrl: avatarUrl.trim() || null, preferences: prefs },
      });
      setUser(user);
      setTheme(user.preferences.theme);
      toast.success("Settings saved");
      router.refresh();
    } catch (err) {
      if (err instanceof ApiError && err.details) setErrors(Object.fromEntries(err.details.map((d) => [d.path.replace(/^preferences\./, ""), d.message])));
      else toast.error(err instanceof Error ? err.message : "Couldn't save");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={save} className="space-y-6">
      {welcome && (
        <p className="rounded-xl border border-violet/40 bg-violet/10 px-4 py-3 text-sm">
          Welcome! Pick a few favorite genres below so your recommendations start personalised from day one.
        </p>
      )}
      <Card className="p-6">
        <h2 className="mb-4 font-display text-xl font-semibold">Profile</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="s-name">Display name</Label>
            <Input id="s-name" maxLength={40} value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder={me.username} />
            <FieldError>{errors.displayName}</FieldError>
          </div>
          <div>
            <Label htmlFor="s-avatar">Avatar image URL</Label>
            <Input id="s-avatar" type="url" value={avatarUrl} onChange={(e) => setAvatarUrl(e.target.value)} placeholder="https://…" aria-describedby="s-avatar-hint" />
            <p id="s-avatar-hint" className="mt-1 text-xs text-muted">An https link to an image you have the right to use.</p>
            <FieldError>{errors.avatarUrl}</FieldError>
          </div>
          <div className="sm:col-span-2">
            <Label htmlFor="s-bio">Bio</Label>
            <Textarea id="s-bio" maxLength={500} value={bio} onChange={(e) => setBio(e.target.value)} className="min-h-20" placeholder="What do you like to read?" />
            <FieldError>{errors.bio}</FieldError>
          </div>
        </div>
      </Card>

      <Card className="p-6">
        <h2 className="font-display text-xl font-semibold">Favorite genres</h2>
        <p className="mt-1 text-sm text-muted">Shown on your profile and used as a starting signal for recommendations.</p>
        <div className="mt-4 flex flex-wrap gap-1.5">
          {genres.map((g) => {
            const on = prefs.favoriteGenres.includes(g.slug);
            return (
              <button key={g.slug} type="button" aria-pressed={on} onClick={() => toggleGenre(g.slug)}
                className={cn("cursor-pointer rounded-full border px-3 py-1.5 text-sm", on ? "border-violet bg-violet/15" : "border-line text-muted hover:text-text")}>
                {g.name}
              </button>
            );
          })}
        </div>
      </Card>

      <Card className="p-6">
        <h2 className="font-display text-xl font-semibold">Privacy</h2>
        <p className="mt-1 text-sm text-muted">Private notes and history are never public, whatever you choose here.</p>
        <div className="mt-2 divide-y divide-line">
          <Switch checked={prefs.libraryVisibility === "PUBLIC"} onCheckedChange={(v) => setPrefs({ ...prefs, libraryVisibility: v ? "PUBLIC" : "PRIVATE" })} label="Public library" description="Others can browse your reading lists. Individual entries can still be hidden." />
          <Switch checked={prefs.favoritesVisibility === "PUBLIC"} onCheckedChange={(v) => setPrefs({ ...prefs, favoritesVisibility: v ? "PUBLIC" : "PRIVATE" })} label="Public favorites" />
          <Switch checked={prefs.showStats} onCheckedChange={(v) => setPrefs({ ...prefs, showStats: v })} label="Show reading statistics" description="Counts per status and chapters tracked." />
          <Switch checked={prefs.showRecentlyCompleted} onCheckedChange={(v) => setPrefs({ ...prefs, showRecentlyCompleted: v })} label="Show recently completed" />
          <Switch checked={prefs.trackBrowsingHistory} onCheckedChange={(v) => setPrefs({ ...prefs, trackBrowsingHistory: v })} label="Record series I view" description="Powers Reading history and Recently viewed." />
          <Switch checked={prefs.trackSearchHistory} onCheckedChange={(v) => setPrefs({ ...prefs, trackSearchHistory: v })} label="Record my searches" />
        </div>
      </Card>

      <Card className="p-6">
        <h2 className="mb-4 font-display text-xl font-semibold">Appearance</h2>
        <div className="max-w-xs">
          <Label htmlFor="s-theme">Theme</Label>
          <Select id="s-theme" value={prefs.theme} onChange={(e) => setPrefs({ ...prefs, theme: e.target.value as Preferences["theme"] })}>
            <option value="dark">Dark</option>
            <option value="light">Light</option>
            <option value="system">Match my device</option>
          </Select>
        </div>
      </Card>

      <div className="sticky bottom-4 z-10 flex justify-end">
        <Button type="submit" size="lg" disabled={saving} className="shadow-xl">
          {saving ? "Saving…" : "Save settings"}
        </Button>
      </div>
    </form>
  );
}

export function ChangePasswordForm() {
  const [cur, setCur] = React.useState("");
  const [next, setNext] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const parsed = changePasswordSchema.safeParse({ currentPassword: cur, newPassword: next });
    if (!parsed.success) return setError(parsed.error.issues[0].message);
    setBusy(true);
    setError(null);
    try {
      await api("/auth/change-password", { method: "POST", body: parsed.data });
      toast.success("Password changed. Other devices were signed out.");
      setCur("");
      setNext("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't change password");
    } finally {
      setBusy(false);
    }
  }
  return (
    <Card className="p-6">
      <h2 className="mb-4 font-display text-xl font-semibold">Password</h2>
      <form onSubmit={submit} className="grid gap-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
        <div>
          <Label htmlFor="pw-cur">Current password</Label>
          <Input id="pw-cur" type="password" autoComplete="current-password" value={cur} onChange={(e) => setCur(e.target.value)} />
        </div>
        <div>
          <Label htmlFor="pw-new">New password</Label>
          <Input id="pw-new" type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} />
        </div>
        <Button type="submit" variant="outline" disabled={busy}>Change password</Button>
      </form>
      <FieldError>{error}</FieldError>
    </Card>
  );
}
