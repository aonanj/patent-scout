import type { MetadataRoute } from "next";

const baseUrl = "https://patent-scout.com";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/api", "/billing", "/glitchtip-example-page"],
      },
    ],
    sitemap: `${baseUrl}/sitemap.xml`,
  };
}

