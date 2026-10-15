"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const ITEMS = [
  ["/admin", "Dashboard", "ADMIN"],
  ["/admin/catalog", "Catalog", "ADMIN"],
  ["/admin/import", "Import", "ADMIN"],
  ["/admin/chapters", "Chapters", "ADMIN"],
  ["/admin/jobs", "Jobs", "ADMIN"],
  ["/admin/featured", "Featured", "ADMIN"],
  ["/admin/collections", "Collections", "ADMIN"],
  ["/admin/moderation", "Moderation", "MODERATOR"],
  ["/admin/users", "Users", "ADMIN"],
  ["/admin/audit", "Audit log", "ADMIN"],
] as const;

export function AdminNav({ role }: { role: string }) {
  const pathname = usePathname();
  const items = ITEMS.filter(([, , min]) => role === "ADMIN" || min === "MODERATOR");
  return (
    <nav aria-label="Admin" className="flex gap-1 overflow-x-auto border-b border-line scrollbar-none">
      {items.map(([href, label]) => {
        const active = href === "/admin" ? pathname === "/admin" : pathname.startsWith(href);
        return (
          <Link key={href} href={href} aria-current={active ? "page" : undefined}
            className={cn("-mb-px border-b-2 px-3.5 py-2.5 text-sm font-medium whitespace-nowrap", active ? "border-violet text-text" : "border-transparent text-muted hover:text-text")}>
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
