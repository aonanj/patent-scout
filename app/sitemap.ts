import type { MetadataRoute } from "next";

const baseUrl = "https://patent-scout.vercel.app";

const marketingRoutes: Array<{
  path: string;
  changeFrequency: MetadataRoute.Sitemap[number]["changeFrequency"];
  priority: MetadataRoute.Sitemap[number]["priority"];
}> = [
  { path: "/", changeFrequency: "daily", priority: 1 },
  { path: "/help", changeFrequency: "monthly", priority: 0.6 },
  { path: "/docs", changeFrequency: "monthly", priority: 0.6 },
  { path: "/docs/tos", changeFrequency: "yearly", priority: 0.5 },
  { path: "/docs/privacy", changeFrequency: "yearly", priority: 0.5 },
  { path: "/docs/dpa", changeFrequency: "yearly", priority: 0.5 },
  { path: "/whitespace", changeFrequency: "monthly", priority: 0.5 },
];

export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date();
  return marketingRoutes.map(({ path, changeFrequency, priority }) => ({
    url: `${baseUrl}${path}`,
    lastModified,
    changeFrequency,
    priority,
  }));
}

