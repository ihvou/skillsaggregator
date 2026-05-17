import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/PageHeader";
import { ResourceTile } from "@/components/ResourceTile";
import { SectionHeader } from "@/components/SectionHeader";
import { getAllCatalogs, getCategoryWithSkillResources } from "@/lib/data";
import { getBaseUrl } from "@/lib/env";

export const revalidate = 3600;

export async function generateStaticParams() {
  const catalogs = await getAllCatalogs();
  return catalogs.map(({ category }) => ({ category: category.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ category: string }>;
}): Promise<Metadata> {
  const { category: slug } = await params;
  const { category } = await getCategoryWithSkillResources(slug);
  if (!category) return {};
  return {
    title: `${category.name} resources | Skills Aggregator`,
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
  const { category, sections } = await getCategoryWithSkillResources(slug);
  if (!category) notFound();

  return (
    <div className="pb-20">
      <PageHeader
        title={category.name}
        subtitle={category.description ?? undefined}
        backHref="/"
      />

      <div className="mt-12 space-y-14">
        {sections.map((section) => (
          <section key={section.skill.id} aria-labelledby={`skill-${section.skill.slug}`}>
            <div className="mx-auto max-w-5xl px-4">
              <SectionHeader
                title={section.skill.name}
                href={`/${category.slug}/${section.skill.slug}`}
                subtitle={
                  section.skill.resource_count
                    ? `${section.skill.resource_count} ${section.skill.resource_count === 1 ? "resource" : "resources"}`
                    : undefined
                }
              />
            </div>
            <div className="mt-5 overflow-x-auto no-scrollbar">
              <div className="mx-auto flex max-w-5xl gap-4 px-4 pb-2">
                {section.resources.map((resource) => (
                  <ResourceTile key={resource.id} resource={resource} />
                ))}
              </div>
            </div>
            <div className="mx-auto mt-6 max-w-5xl px-4">
              <div className="h-px bg-divider" />
            </div>
          </section>
        ))}
        {sections.length === 0 ? (
          <div className="mx-auto max-w-5xl px-4 text-sm text-muted">
            No approved resources for this category yet. Check back soon — the agent pulls new
            resources every night.
          </div>
        ) : null}
      </div>
    </div>
  );
}
