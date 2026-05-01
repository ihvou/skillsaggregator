import type { MetadataRoute } from "next";
import { getCatalog } from "@/lib/data";
import { getBaseUrl } from "@/lib/env";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const { category, skills } = await getCatalog();
  const base = getBaseUrl();
  return [
    { url: base, lastModified: new Date(), changeFrequency: "weekly", priority: 1 },
    {
      url: `${base}/${category.slug}`,
      lastModified: new Date(category.updated_at ?? Date.now()),
      changeFrequency: "weekly",
      priority: 0.9,
    },
    ...skills.map((skill) => ({
      url: `${base}/${category.slug}/${skill.slug}`,
      lastModified: new Date(skill.updated_at ?? Date.now()),
      changeFrequency: "weekly" as const,
      priority: 0.8,
    })),
  ];
}
