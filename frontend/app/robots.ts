import type { MetadataRoute } from "next";

const BASE = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      // Practice and Account now render public shells; only chat threads,
      // the token flows, and the API stay out of the index.
      disallow: ["/chat", "/verify", "/reset-password", "/admin", "/api/"],
    },
    sitemap: `${BASE}/sitemap.xml`,
  };
}
