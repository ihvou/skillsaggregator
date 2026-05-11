import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  makeCanonical,
  makeSkillMetaDescription,
  type SkillResource,
} from "@skillsaggregator/shared";
import { JsonLd } from "@/components/JsonLd";
import { ResourceGroups } from "@/components/ResourceGroups";
import { getAllCatalogs, getSkillPage } from "@/lib/data";
import { getBaseUrl } from "@/lib/env";

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

export default async function SkillPage({
  params,
}: {
  params: Promise<{ category: string; skill: string }>;
}) {
  const { category: categorySlug, skill: skillSlug } = await params;
  const { category, skill, resources, relatedSkills } = await getSkillPage(categorySlug, skillSlug);
  if (!category || !skill) notFound();

  const pageUrl = makeCanonical(getBaseUrl(), category.slug, skill.slug);

  return (
    <div className="mx-auto max-w-6xl px-4 py-12">
      <JsonLd data={learningResourceJsonLd(resources, pageUrl)} />
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "BreadcrumbList",
          itemListElement: [
            { "@type": "ListItem", position: 1, name: "Home", item: getBaseUrl() },
            { "@type": "ListItem", position: 2, name: category.name, item: `${getBaseUrl()}/${category.slug}` },
            { "@type": "ListItem", position: 3, name: skill.name, item: pageUrl },
          ],
        }}
      />
      <nav className="text-sm text-graphite">
        <Link className="focus-ring hover:text-court" href="/">
          Home
        </Link>
        <span className="px-2">/</span>
        <Link className="focus-ring hover:text-court" href={`/${category.slug}`}>
          {category.name}
        </Link>
        <span className="px-2">/</span>
        <span>{skill.name}</span>
      </nav>

      <header className="mt-8 max-w-3xl">
        <p className="text-sm font-semibold uppercase tracking-wide text-court">
          {category.name} skill
        </p>
        <h1 className="mt-3 text-4xl font-bold text-ink">{skill.name}</h1>
        <p className="mt-4 text-lg leading-8 text-graphite">{skill.description}</p>
      </header>

      <div className="mt-10 grid gap-10 lg:grid-cols-[1fr_280px]">
        <ResourceGroups resources={resources} />
        <aside className="lg:sticky lg:top-6 lg:self-start">
          <h2 className="text-base font-semibold text-ink">Related skills</h2>
          <div className="mt-3 grid gap-2">
            {relatedSkills.map((related) => (
              <Link
                key={related.id}
                href={`/${category.slug}/${related.slug}`}
                className="focus-ring rounded-md border border-ink/10 bg-white px-3 py-2 text-sm font-medium text-ink hover:border-court/40 hover:text-court"
              >
                {related.name}
              </Link>
            ))}
          </div>
        </aside>
      </div>
    </div>
  );
}
