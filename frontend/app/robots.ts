import type { MetadataRoute } from "next";

const BASE = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      // The authed app surface has nothing to index.
      disallow: ["/chat", "/account", "/verify", "/api/"],
    },
    sitemap: `${BASE}/sitemap.xml`,
  };
}
