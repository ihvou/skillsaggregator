import type { Metadata } from "next";
import { notFound } from "next/navigation";
import {
  makeCanonical,
  makeSkillMetaDescription,
  type SkillResource,
} from "@skillsaggregator/shared";
import { JsonLd } from "@/components/JsonLd";
import { PageHeader } from "@/components/PageHeader";
import { ResourceCard } from "@/components/ResourceCard";
import { SortFilterMenu } from "@/components/SortFilterMenu";
import { getAllCatalogs, getSkillPage } from "@/lib/data";
import { getBaseUrl } from "@/lib/env";
import {
  type PageSearchParams,
  parseLevel,
  parseSort,
} from "@/lib/listing-params";

export const revalidate = 3600;

export async function generateStaticParams() {
  const catalogs = await getAllCatalogs();
  return catalogs.flatMap(({ category, skills }) =>
    skills.map((skill) => ({ category: category.slug, skill: skill.slug })),
  );
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ category: string; skill: string }>;
}): Promise<Metadata> {
  const { category: categorySlug, skill: skillSlug } = await params;
  const data = await getSkillPage(categorySlug, skillSlug);
  if (!data.skill || !data.category) return {};
  const description = makeSkillMetaDescription(data.skill);
  const image = data.resources.find((resource) => resource.link.thumbnail_url)?.link.thumbnail_url;
  const canonical = makeCanonical(getBaseUrl(), data.category.slug, data.skill.slug);
  const title = `${data.skill.name} — ${data.category.name} | Skills Aggregator`;

  return {
    title,
    description,
    alternates: { canonical },
    openGraph: {
      title,
      description,
      url: canonical,
      images: image ? [{ url: image, alt: data.skill.name }] : undefined,
    },
    twitter: {
      card: image ? "summary_large_image" : "summary",
      title,
      description,
      images: image ? [image] : undefined,
    },
  };
}

function schemaEducationalLevel(level: SkillResource["skill_level"]) {
  if (!level) return undefined;
  const label = {
    beginner: "Beginner",
    intermediate: "Intermediate",
    advanced: "Advanced",
  }[level];
  return `https://schema.org/${label}`;
}

function learningResourceJsonLd(resources: SkillResource[], pageUrl: string) {
  return {
    "@context": "https://schema.org",
    "@graph": resources.map((resource) => ({
      "@type": "LearningResource",
      name: resource.link.title ?? resource.link.url,
      url: resource.link.url,
      description: resource.public_note ?? resource.link.description,
      learningResourceType: resource.link.content_type ?? "resource",
      educationalLevel: schemaEducationalLevel(resource.skill_level),
      isPartOf: pageUrl,
    })),
  };
}

const LEVEL_LABELS = {
  all: "All levels",
  beginner: "Beginner",
  intermediate: "Intermediate",
  advanced: "Advanced",
} as const;
const SORT_LABELS = { popular: "Popular", newest: "Newest" } as const;

export default async function SkillPage({
  params,
  searchParams,
}: {
  params: Promise<{ category: string; skill: string }>;
  searchParams?: Promise<PageSearchParams>;
}) {
  const { category: categorySlug, skill: skillSlug } = await params;
  const resolvedSearchParams = (await searchParams) ?? {};
  const level = parseLevel(resolvedSearchParams);
  const sort = parseSort(resolvedSearchParams);
  const { category, skill, resources } = await getSkillPage(categorySlug, skillSlug);
  if (!category || !skill) notFound();

  // Re-sort + filter client-side because getSkillPage doesn't accept them yet
  // (avoids touching the broader data layer for this redesign).
  const sortedResources = [...resources].sort((a, b) =>
    sort === "popular"
      ? b.upvote_count - a.upvote_count
      : Date.parse(b.created_at ?? "") - Date.parse(a.created_at ?? ""),
  );
  const filteredResources = level
    ? sortedResources.filter((resource) => resource.skill_level === level)
    : sortedResources;

  const pageUrl = makeCanonical(getBaseUrl(), category.slug, skill.slug);
  const pathname = `/${category.slug}/${skill.slug}`;
  const subtitleParts: string[] = [`${category.name}`, SORT_LABELS[sort]];
  if (level) subtitleParts.push(LEVEL_LABELS[level]);

  return (
    <div className="pb-20">
      <JsonLd data={learningResourceJsonLd(filteredResources, pageUrl)} />
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "BreadcrumbList",
          itemListElement: [
            { "@type": "ListItem", position: 1, name: "Home", item: getBaseUrl() },
            {
              "@type": "ListItem",
              position: 2,
              name: category.name,
              item: `${getBaseUrl()}/${category.slug}`,
            },
            { "@type": "ListItem", position: 3, name: skill.name, item: pageUrl },
          ],
        }}
      />
      <PageHeader
        title={skill.name}
        subtitle={subtitleParts.join(" · ")}
        backHref={`/${category.slug}`}
        rightAccessory={
          <SortFilterMenu pathname={pathname} currentLevel={level} currentSort={sort} />
        }
      />

      {skill.description ? (
        <section className="mx-auto mt-6 max-w-5xl px-4">
          <p className="max-w-3xl text-base leading-7 text-muted md:text-lg">
            {skill.description}
          </p>
        </section>
      ) : null}

      <section className="mx-auto mt-10 max-w-5xl px-4">
        {filteredResources.length === 0 ? (
          <p className="text-sm text-muted">
            No matches for this filter. Open the menu (…) to change sort or level.
          </p>
        ) : (
          <div className="divide-y divide-divider">
            {filteredResources.map((resource) => (
              <div key={resource.id} className="py-5">
                <ResourceCard resource={resource} />
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
