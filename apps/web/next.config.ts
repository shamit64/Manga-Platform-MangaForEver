import path from "node:path";
import type { NextConfig } from "next";

// Monorepo root (next is always run from apps/web: npm workspaces, Vercel root directory, scripts/local.mjs).
const MONOREPO_ROOT = path.resolve(process.cwd(), "../..");

const API_URL = (process.env.API_URL ?? "http://localhost:4000").replace(/\/$/, "");

const nextConfig: NextConfig = {
  reactStrictMode: true,
  turbopack: { root: MONOREPO_ROOT },
  outputFileTracingRoot: MONOREPO_ROOT,
  poweredByHeader: false,
  transpilePackages: ["@mangaforever/shared"],
  images: {
    // Set NEXT_IMAGE_UNOPTIMIZED=1 to let browsers load provider covers directly (e.g. behind a proxy).
    unoptimized: process.env.NEXT_IMAGE_UNOPTIMIZED === "1",
    // Provider cover art (AniList CDN) is optimised and lazy-loaded through next/image.
    remotePatterns: [
      { protocol: "https", hostname: "s4.anilist.co" },
      { protocol: "https", hostname: "img.anili.st" },
      { protocol: "https", hostname: "res.cloudinary.com" },
      // MangaDex cover CDN (used only for covers of series linked to MangaDex).
      { protocol: "https", hostname: "uploads.mangadex.org" },
    ],
  },
  // The browser talks to /api/v1 on the web origin; Next proxies to the API so the session
  // cookie stays first-party (SameSite=Lax works on Vercel ↔ Render/Railway deployments).
  async redirects() {
    return [
      { source: "/explore", destination: "/browse", permanent: true },
      { source: "/library", destination: "/my-list", permanent: true },
    ];
  },
  async rewrites() {
    return [{ source: "/api/v1/:path*", destination: `${API_URL}/api/v1/:path*` }];
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        ],
      },
    ];
  },
};

export default nextConfig;
