import type { Metadata } from "next";
import { PageHeader } from "@/components/layout/section";
import { ChangePasswordForm, SettingsForm } from "@/components/profile/settings-form";
import { requireUser } from "@/lib/require-user";
import { tryServerApi } from "@/lib/server-api";

export const metadata: Metadata = { title: "Settings & privacy" };

export default async function SettingsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const me = await requireUser("/settings");
  const sp = await searchParams;
  const genres = (await tryServerApi<{ items: { name: string; slug: string }[] }>("/genres"))?.items ?? [];
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="Settings & privacy" description={`Signed in as ${me.email}`} />
      <div className="space-y-6">
        <SettingsForm me={me} genres={genres} welcome={sp.welcome === "1"} />
        <ChangePasswordForm />
      </div>
    </div>
  );
}
