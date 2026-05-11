import type { MetadataRoute } from "next";
import { getAllCatalogs } from "@/lib/data";
import { getBaseUrl } from "@/lib/env";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const catalogs = await getAllCatalogs();
  const base = getBaseUrl();
  return [
    { url: base, lastModified: new Date(), changeFrequency: "weekly", priority: 1 },
    ...catalogs.flatMap(({ category, skills }) => [
      {
        url: `${base}/${category.slug}`,
        lastModified: new Date(category.updated_at ?? Date.now()),
        changeFrequency: "weekly" as const,
        priority: 0.9,
      },
      ...skills.map((skill) => ({
        url: `${base}/${category.slug}/${skill.slug}`,
        lastModified: new Date(skill.updated_at ?? Date.now()),
        changeFrequency: "weekly" as const,
        priority: 0.8,
      })),
    ]),
  ];
}
