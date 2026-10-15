"use client";

import type { Me } from "@mangaforever/shared";
import { ThemeProvider } from "next-themes";
import { usePathname, useRouter } from "next/navigation";
import * as React from "react";
import { Toaster } from "sonner";

interface AuthCtx {
  user: Me | null;
  setUser: (u: Me | null) => void;
  /** Redirect to sign-in (returning here) if signed out. Returns true when signed in. */
  requireUser: () => boolean;
}

const Ctx = React.createContext<AuthCtx | null>(null);

export function Providers({ initialUser, children }: { initialUser: Me | null; children: React.ReactNode }) {
  const [user, setUser] = React.useState(initialUser);
  const router = useRouter();
  const pathname = usePathname();
  React.useEffect(() => setUser(initialUser), [initialUser]);

  const requireUser = React.useCallback(() => {
    if (user) return true;
    router.push(`/login?next=${encodeURIComponent(pathname)}`);
    return false;
  }, [user, router, pathname]);

  return (
    <ThemeProvider attribute="class" defaultTheme={initialUser?.preferences.theme ?? "dark"} enableSystem storageKey="mf-theme" disableTransitionOnChange>
      <Ctx.Provider value={{ user, setUser, requireUser }}>
        {children}
        <Toaster position="bottom-center" theme="system" toastOptions={{ classNames: { toast: "!bg-surface !border-line !text-text !rounded-xl" } }} />
      </Ctx.Provider>
    </ThemeProvider>
  );
}

export function useAuth() {
  const ctx = React.useContext(Ctx);
  if (!ctx) throw new Error("useAuth must be used inside <Providers>");
  return ctx;
}
