"use client";

import {
  Bell,
  BookMarked,
  Clock,
  Compass,
  Gauge,
  Heart,
  History,
  Home,
  LayoutDashboard,
  LogOut,
  Menu,
  MessageSquareText,
  Moon,
  Search,
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
import { useAuth, useLive } from "@/components/providers";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { Dropdown, DropdownContent, DropdownItem, DropdownLabel, DropdownSeparator, DropdownTrigger } from "@/components/ui/dropdown";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import { GlobalSearch } from "./global-search";
import { Logo } from "./logo";

const DISCOVER = [
  { href: "/browse", label: "Browse" },
  { href: "/latest", label: "Latest" },
  { href: "/rankings", label: "Rankings" },
  { href: "/manga", label: "Manga" },
  { href: "/manhwa", label: "Manhwa" },
  { href: "/manhua", label: "Manhua" },
  { href: "/seasonal", label: "Seasonal" },
  { href: "/new", label: "New releases" },
  { href: "/recommendations", label: "For you" },
  { href: "/reviews", label: "Reviews" },
];

const MINE = [
  { href: "/dashboard", label: "Dashboard", icon: Gauge },
  { href: "/my-list", label: "My List", icon: BookMarked },
  { href: "/favorites", label: "Favorites", icon: Heart },
  { href: "/notifications", label: "Notifications", icon: Bell },
  { href: "/history", label: "Reading history", icon: History },
];

const isActive = (pathname: string, href: string) => pathname === href || pathname.startsWith(`${href}/`) || (href === "/manga" && pathname === "/manga");

/** Bell with the live unread count. */
function NotificationBell() {
  const { unread } = useLive();
  return (
    <Link
      href="/notifications"
      className="relative grid size-11 place-items-center rounded-md text-text hover:bg-raised"
      aria-label={unread ? `Notifications, ${unread} unread` : "Notifications"}
    >
      <Bell className="size-[18px]" />
      {unread > 0 && (
        <span className="tabular absolute top-1.5 right-1.5 grid min-w-4 place-items-center rounded-full bg-violet px-1 text-[0.62rem] leading-4 font-semibold text-on-accent">
          {unread > 99 ? "99+" : unread}
        </span>
      )}
    </Link>
  );
}

/** Phones: a bottom tab bar replaces the header navigation. */
export function BottomTabs() {
  const pathname = usePathname();
  const { user } = useAuth();
  if (/^\/manga\/[^/]+\/chapter\//.test(pathname)) return null; // the reader has its own controls
  const tabs = [
    { href: "/", label: "Home", icon: Home },
    { href: "/browse", label: "Browse", icon: Compass },
    { href: "/search", label: "Search", icon: Search },
    { href: "/my-list", label: "My List", icon: BookMarked },
    { href: user ? `/u/${user.username}` : "/login", label: user ? "Profile" : "Sign in", icon: User },
  ];
  return (
    <nav aria-label="Tabs" className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-ink/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl md:hidden">
      <ul className="grid grid-cols-5">
        {tabs.map((t) => {
          const active = t.href === "/" ? pathname === "/" : pathname.startsWith(t.href);
          return (
            <li key={t.label}>
              <Link href={t.href} aria-current={active ? "page" : undefined} className={cn("flex h-14 flex-col items-center justify-center gap-0.5 text-[0.68rem]", active ? "text-text" : "text-muted")}>
                <t.icon className={cn("size-5", active && "text-lilac")} />
                {t.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

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
        {MINE.slice(0, 3).map((m) => (
          <DropdownItem key={m.href} asChild>
            <Link href={m.href}>
              <m.icon /> {m.label}
            </Link>
          </DropdownItem>
        ))}
        <DropdownItem asChild>
          <Link href={`/u/${user.username}`}>
            <User /> Profile
          </Link>
        </DropdownItem>
        {MINE.slice(3).map((m) => (
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
      className="grid place-items-center rounded-full bg-raised font-display font-medium text-text ring-1 ring-line"
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
    "/browse": Compass, "/rankings": Trophy, "/seasonal": Sparkles, "/latest": Clock, "/new": Sparkles, "/recommendations": Sparkles, "/reviews": MessageSquareText,
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
    <header data-site-chrome className="sticky top-0 z-40 border-b border-line bg-ink/90 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-7xl items-center gap-3 px-4 sm:px-6">
        <Logo />
        <nav aria-label="Primary" className="ml-4 hidden items-center gap-0.5 xl:flex">
          {[{ href: "/", label: "Home" }, ...DISCOVER.slice(0, 6)].map((d) => {
            const active = d.href === "/" ? pathname === "/" : isActive(pathname, d.href) && !(d.href === "/manga" && pathname !== "/manga");
            return (
              <Link
                key={d.href}
                href={d.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "relative px-2.5 py-1.5 text-sm whitespace-nowrap text-muted transition-colors hover:text-text",
                  active && "text-text after:absolute after:inset-x-2.5 after:-bottom-[17px] after:h-0.5 after:bg-violet",
                )}
              >
                {d.label}
              </Link>
            );
          })}
        </nav>
        <nav aria-label="Primary" className="ml-2 hidden items-center gap-0.5 md:flex xl:hidden">
          {DISCOVER.slice(0, 3).map((d) => (
            <Link key={d.href} href={d.href} className={cn("px-2.5 py-1.5 text-sm text-muted hover:text-text", isActive(pathname, d.href) && "text-text")}>
              {d.label}
            </Link>
          ))}
        </nav>
        <GlobalSearch className="ml-auto hidden w-full max-w-xs md:block xl:max-w-[16rem] 2xl:max-w-sm" />
        <div className="ml-auto flex items-center gap-1 md:ml-2">
          <ThemeToggle />
          {user ? (
            <>
              <NotificationBell />
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
