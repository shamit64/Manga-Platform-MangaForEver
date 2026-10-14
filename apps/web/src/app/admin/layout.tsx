import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AdminNav } from "@/components/admin/admin-nav";
import { requireUser } from "@/lib/require-user";

export const metadata: Metadata = { title: "Admin", robots: { index: false } };

/** The UI guard only hides pages; every admin API route re-checks the role on the server. */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const me = await requireUser("/admin");
  if (me.role !== "ADMIN" && me.role !== "MODERATOR") notFound();
  return (
    <div className="pt-8">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-extrabold">{me.role === "ADMIN" ? "Admin" : "Moderation"}</h1>
          <p className="text-sm text-muted">Signed in as @{me.username} · {me.role.toLowerCase()}</p>
        </div>
      </div>
      <AdminNav role={me.role} />
      <div className="pt-6">{children}</div>
    </div>
  );
}
