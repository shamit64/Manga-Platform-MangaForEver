import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: "*", allow: "/", disallow: ["/admin", "/settings", "/dashboard", "/my-list", "/notifications", "/history", "/api/"] }],
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
