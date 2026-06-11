import type { Metadata } from "next";
import { notFound } from "next/navigation";
import {
  makeCanonical,
  makeSkillMetaDescription,
  type SkillResource,
} from "@skillsaggregator/shared";
import { JsonLd } from "@/components/JsonLd";
import { SkillResourceBrowser } from "@/components/SkillResourceBrowser";
import { getAllCatalogs, getSkillPage, isPublishedSkill } from "@/lib/data";
import { getBaseUrl } from "@/lib/env";

// Daily content cadence — revalidate every 24h (see tasks.md MI23).
export const revalidate = 86400;

export async function generateStaticParams() {
  const catalogs = await getAllCatalogs({ publicOnly: true });
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
  const title = `${data.skill.name} — ${data.category.name} | Subskills`;

  return {
    title,
    description,
    robots: isPublishedSkill(data.skill) ? undefined : { index: false, follow: false },
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

export default async function SkillPage({
  params,
}: {
  params: Promise<{ category: string; skill: string }>;
}) {
  const { category: categorySlug, skill: skillSlug } = await params;
  const { category, skill, resources } = await getSkillPage(categorySlug, skillSlug);
  if (!category || !skill) notFound();

  const pageUrl = makeCanonical(getBaseUrl(), category.slug, skill.slug);

  return (
    <>
      <JsonLd data={learningResourceJsonLd(resources, pageUrl)} />
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
      <SkillResourceBrowser category={category} skill={skill} resources={resources} />
    </>
  );
}
