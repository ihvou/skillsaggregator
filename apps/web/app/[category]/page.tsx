import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CategoryResourceBrowser } from "@/components/CategoryResourceBrowser";
import {
  getAllCatalogs,
  getCategoryBrowserData,
  getCatalog,
} from "@/lib/data";
import { getBaseUrl } from "@/lib/env";

// Content publishes once daily (nightly collection), so revalidate every 24h
// instead of hourly — the base pages serve from edge cache the rest of the
// time (near-zero compute). On-demand revalidation refreshes sooner when the
// nightly actually adds content (see tasks.md MI23).
export const revalidate = 86400;

export async function generateStaticParams() {
  const catalogs = await getAllCatalogs({ publicOnly: true });
  return catalogs.map(({ category }) => ({ category: category.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ category: string }>;
}): Promise<Metadata> {
  const { category: slug } = await params;
  const { category } = await getCatalog(slug, { publicOnly: true });
  if (!category) return {};
  return {
    title: `${category.name} resources | Subskills`,
    description: category.description ?? `Curated resources for ${category.name}.`,
    alternates: { canonical: `${getBaseUrl()}/${category.slug}` },
  };
}

export default async function CategoryPage({
  params,
}: {
  params: Promise<{ category: string }>;
}) {
  const { category: slug } = await params;
  const { category, skills, resources } = await getCategoryBrowserData(slug);
  if (!category) notFound();

  return (
    <CategoryResourceBrowser
      category={category}
      skills={skills}
      resources={resources}
    />
  );
}
