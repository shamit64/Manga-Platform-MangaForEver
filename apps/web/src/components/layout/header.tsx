"use client";

import {
  BookMarked,
  Clock,
  Compass,
  Heart,
  History,
  LayoutDashboard,
  LogOut,
  Menu,
  MessageSquareText,
  Moon,
  Settings,
  Sparkles,
  Sun,
  Trophy,
  User,
} from "lucide-react";
import { useTheme } from "next-themes";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import * as React from "react";
import { toast } from "sonner";
import { useAuth } from "@/components/providers";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { Dropdown, DropdownContent, DropdownItem, DropdownLabel, DropdownSeparator, DropdownTrigger } from "@/components/ui/dropdown";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import { GlobalSearch } from "./global-search";
import { Logo } from "./logo";

const DISCOVER = [
  { href: "/explore", label: "Explore" },
  { href: "/rankings", label: "Rankings" },
  { href: "/seasonal", label: "Seasonal" },
  { href: "/latest", label: "Latest updates" },
  { href: "/new", label: "New releases" },
  { href: "/recommendations", label: "For you" },
  { href: "/reviews", label: "Reviews" },
];

const MINE = [
  { href: "/library", label: "My library", icon: BookMarked },
  { href: "/favorites", label: "Favorites", icon: Heart },
  { href: "/history", label: "Reading history", icon: History },
];

function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const { user } = useAuth();
  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => setMounted(true), []);
  const next = resolvedTheme === "dark" ? "light" : "dark";
  return (
    <Button
      variant="ghost"
      size="icon"
      aria-label={mounted ? `Switch to ${next} theme` : "Toggle theme"}
      onClick={() => {
        setTheme(next);
        // Persist to the account too, so the choice follows the user across devices.
        if (user) api("/users/me", { method: "PATCH", body: { preferences: { theme: next } } }).catch(() => {});
      }}
    >
      {mounted && resolvedTheme === "light" ? <Moon /> : <Sun />}
    </Button>
  );
}

function UserMenu() {
  const { user, setUser } = useAuth();
  const router = useRouter();
  if (!user) return null;
  const isStaff = user.role === "ADMIN" || user.role === "MODERATOR";

  async function logout() {
    try {
      await api("/auth/logout", { method: "POST" });
    } finally {
      setUser(null);
      toast.success("Signed out");
      router.push("/");
      router.refresh();
    }
  }

  return (
    <Dropdown>
      <DropdownTrigger asChild>
        <button className="flex cursor-pointer items-center gap-2 rounded-xl p-1 pr-2 hover:bg-raised" aria-label="Account menu">
          <Avatar name={user.displayName ?? user.username} url={user.avatarUrl} />
          <span className="hidden max-w-28 truncate text-sm font-medium lg:inline">{user.displayName ?? user.username}</span>
        </button>
      </DropdownTrigger>
      <DropdownContent>
        <DropdownLabel>Signed in as @{user.username}</DropdownLabel>
        <DropdownItem asChild>
          <Link href={`/u/${user.username}`}>
            <User /> Profile
          </Link>
        </DropdownItem>
        {MINE.map((m) => (
          <DropdownItem key={m.href} asChild>
            <Link href={m.href}>
              <m.icon /> {m.label}
            </Link>
          </DropdownItem>
        ))}
        <DropdownItem asChild>
          <Link href="/settings">
            <Settings /> Settings & privacy
          </Link>
        </DropdownItem>
        {isStaff && (
          <>
            <DropdownSeparator />
            <DropdownItem asChild>
              <Link href={user.role === "ADMIN" ? "/admin" : "/admin/moderation"}>
                <LayoutDashboard /> {user.role === "ADMIN" ? "Admin dashboard" : "Moderation"}
              </Link>
            </DropdownItem>
          </>
        )}
        <DropdownSeparator />
        <DropdownItem onSelect={logout}>
          <LogOut /> Sign out
        </DropdownItem>
      </DropdownContent>
    </Dropdown>
  );
}

export function Avatar({ name, url, size = 32 }: { name: string; url: string | null; size?: number }) {
  if (url) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={url} alt="" width={size} height={size} className="rounded-full object-cover" style={{ width: size, height: size }} />;
  }
  return (
    <span
      aria-hidden
      className="grid place-items-center rounded-full bg-gradient-to-br from-violet to-indigo font-display font-bold text-white"
      style={{ width: size, height: size, fontSize: size * 0.42 }}
    >
      {name.slice(0, 1).toUpperCase()}
    </span>
  );
}

function MobileNav() {
  const [open, setOpen] = React.useState(false);
  const { user } = useAuth();
  const pathname = usePathname();
  React.useEffect(() => setOpen(false), [pathname]);
  const icons: Record<string, React.ComponentType<{ className?: string }>> = {
    "/explore": Compass, "/rankings": Trophy, "/seasonal": Sparkles, "/latest": Clock, "/new": Sparkles, "/recommendations": Sparkles, "/reviews": MessageSquareText,
  };
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon" className="md:hidden" aria-label="Open menu">
          <Menu />
        </Button>
      </DialogTrigger>
      <DialogContent side="right" title="Menu">
        <GlobalSearch className="mb-5" onNavigate={() => setOpen(false)} />
        <nav aria-label="Mobile">
          <p className="mb-1 text-xs text-muted">Discover</p>
          <ul className="mb-5">
            <li>
              <Link href="/" className="flex items-center gap-3 rounded-lg px-2 py-2.5 hover:bg-raised">Home</Link>
            </li>
            {DISCOVER.map((d) => {
              const Icon = icons[d.href];
              return (
                <li key={d.href}>
                  <Link href={d.href} className="flex items-center gap-3 rounded-lg px-2 py-2.5 hover:bg-raised">
                    {Icon && <Icon className="size-4 text-muted" />} {d.label}
                  </Link>
                </li>
              );
            })}
          </ul>
          {user ? (
            <>
              <p className="mb-1 text-xs text-muted">You</p>
              <ul>
                {[...MINE, { href: `/u/${user.username}`, label: "Profile", icon: User }, { href: "/settings", label: "Settings & privacy", icon: Settings }].map((m) => (
                  <li key={m.href}>
                    <Link href={m.href} className="flex items-center gap-3 rounded-lg px-2 py-2.5 hover:bg-raised">
                      <m.icon className="size-4 text-muted" /> {m.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              <Button asChild variant="outline"><Link href="/login">Sign in</Link></Button>
              <Button asChild><Link href="/register">Create account</Link></Button>
            </div>
          )}
        </nav>
      </DialogContent>
    </Dialog>
  );
}

export function Header() {
  const { user } = useAuth();
  const pathname = usePathname();
  return (
    <header className="sticky top-0 z-40 border-b border-line bg-ink/85 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-7xl items-center gap-3 px-4 sm:px-6">
        <Logo />
        <nav aria-label="Primary" className="ml-3 hidden items-center gap-0.5 xl:flex">
          {DISCOVER.slice(0, 6).map((d) => (
            <Link
              key={d.href}
              href={d.href}
              aria-current={pathname.startsWith(d.href) ? "page" : undefined}
              className={cn(
                "rounded-lg px-2.5 py-1.5 text-sm whitespace-nowrap text-muted transition-colors hover:text-text",
                pathname.startsWith(d.href) && "bg-raised text-text",
              )}
            >
              {d.label}
            </Link>
          ))}
        </nav>
        <nav aria-label="Primary" className="ml-2 hidden items-center gap-0.5 md:flex xl:hidden">
          {DISCOVER.slice(0, 3).map((d) => (
            <Link key={d.href} href={d.href} className={cn("rounded-lg px-2.5 py-1.5 text-sm text-muted hover:text-text", pathname.startsWith(d.href) && "bg-raised text-text")}>
              {d.label}
            </Link>
          ))}
        </nav>
        <GlobalSearch className="ml-auto hidden w-full max-w-xs md:block xl:max-w-[16rem] 2xl:max-w-sm" />
        <div className="ml-auto flex items-center gap-1 md:ml-2">
          <ThemeToggle />
          {user ? (
            <>
              <Link href="/library" className="hidden rounded-lg px-2.5 py-1.5 text-sm text-muted hover:text-text lg:block">
                Library
              </Link>
              <UserMenu />
            </>
          ) : (
            <div className="hidden items-center gap-2 md:flex">
              <Button asChild variant="ghost" size="sm"><Link href="/login">Sign in</Link></Button>
              <Button asChild size="sm"><Link href="/register">Sign up</Link></Button>
            </div>
          )}
          <MobileNav />
        </div>
      </div>
    </header>
  );
}
