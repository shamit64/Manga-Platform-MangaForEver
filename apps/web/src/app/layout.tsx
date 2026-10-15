import type { Metadata, Viewport } from "next";
import { Footer } from "@/components/layout/footer";
import { BottomTabs, Header } from "@/components/layout/header";
import { ServiceWorker } from "@/components/layout/service-worker";
import { Providers } from "@/components/providers";
import { getMe } from "@/lib/server-api";
import { SITE_URL } from "@/lib/site";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: "MangaForEver — Read, track and review manga, manhwa and manhua", template: "%s · MangaForEver" },
  description:
    "A live manga, manhwa and manhua database with new chapters as they release, reading lists, favorites, reviews and a clean reader. Free, no pop-ups.",
  applicationName: "MangaForEver",
  appleWebApp: { capable: true, title: "MangaForEver", statusBarStyle: "black-translucent" },
  openGraph: { type: "website", siteName: "MangaForEver" },
  twitter: { card: "summary_large_image" },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#0b0b0c" },
    { media: "(prefers-color-scheme: light)", color: "#faf8f5" },
  ],
  viewportFit: "cover",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const me = await getMe();
  return (
    <html lang="en" suppressHydrationWarning className="dark">
      <body className="min-h-dvh antialiased">
        <Providers initialUser={me}>
          <a href="#main" className="sr-only z-50 rounded-md bg-violet px-3 py-2 text-on-accent focus:not-sr-only focus:fixed focus:top-3 focus:left-3">
            Skip to content
          </a>
          <Header />
          <main id="main" className="mx-auto min-h-[70vh] max-w-7xl px-4 sm:px-6">
            {children}
          </main>
          <Footer />
          <BottomTabs />
          <ServiceWorker />
        </Providers>
      </body>
    </html>
  );
}
