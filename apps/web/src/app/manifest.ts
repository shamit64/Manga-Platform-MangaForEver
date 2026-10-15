import type { MetadataRoute } from "next";

/** Makes MangaForEver installable on phones and desktops (Add to Home Screen). */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "MangaForEver",
    short_name: "MangaForEver",
    description: "Read, track and review manga, manhwa and manhua. New chapters as they release.",
    start_url: "/?source=pwa",
    display: "standalone",
    background_color: "#0b0b0c",
    theme_color: "#0b0b0c",
    orientation: "portrait-primary",
    categories: ["books", "entertainment"],
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "Latest updates", url: "/latest" },
      { name: "My List", url: "/my-list" },
      { name: "Notifications", url: "/notifications" },
    ],
  };
}
