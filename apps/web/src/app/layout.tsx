import type { Metadata, Viewport } from "next";
import { Footer } from "@/components/layout/footer";
import { Header } from "@/components/layout/header";
import { Providers } from "@/components/providers";
import { getMe } from "@/lib/server-api";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "MangaVerse — Discover. Track. Review. Explore.", template: "%s · MangaVerse" },
  description: "Discover manga, manhwa and manhua, track your reading, and read honest community reviews.",
  applicationName: "MangaVerse",
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#0f0d14" },
    { media: "(prefers-color-scheme: light)", color: "#f6f4fb" },
  ],
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const me = await getMe();
  return (
    <html lang="en" suppressHydrationWarning className="dark">
      <body className="min-h-dvh antialiased">
        <Providers initialUser={me}>
          <a href="#main" className="sr-only z-50 rounded-lg bg-violet px-3 py-2 text-white focus:not-sr-only focus:fixed focus:top-3 focus:left-3">
            Skip to content
          </a>
          <Header />
          <main id="main" className="mx-auto min-h-[70vh] max-w-7xl px-4 sm:px-6">
            {children}
          </main>
          <Footer />
        </Providers>
      </body>
    </html>
  );
}
