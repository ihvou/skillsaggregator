import type { MetadataRoute } from "next";
import { getAllCatalogs, getContributorProfiles } from "@/lib/data";
import { getBaseUrl } from "@/lib/env";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [catalogs, contributors] = await Promise.all([
    getAllCatalogs({ publicOnly: true }),
    getContributorProfiles(),
  ]);
  const base = getBaseUrl();
  return [
    { url: base, lastModified: new Date(), changeFrequency: "weekly", priority: 1 },
    {
      url: `${base}/contributors`,
      lastModified: new Date(),
      changeFrequency: "weekly",
      priority: 0.6,
    },
    ...contributors.map((contributor) => ({
      url: `${base}/contributors/${contributor.slug}`,
      lastModified: new Date(),
      changeFrequency: "weekly" as const,
      priority: 0.5,
    })),
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
