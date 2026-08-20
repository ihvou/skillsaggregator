import type { Metadata } from "next";
import { notFound } from "next/navigation";
import {
  makeCanonical,
  makeSkillMetaDescription,
} from "@skillsaggregator/shared";
import { JsonLd } from "@/components/JsonLd";
import { SkillResourceBrowser } from "@/components/SkillResourceBrowser";
import { SkillTechniqueSummary } from "@/components/SkillTechniqueSummary";
import { getAllCatalogs, getSkillPage, isPublishedSkill } from "@/lib/data";
import { getBaseUrl } from "@/lib/env";

// One hour, not the 24h this used to be. The old value was chosen on the premise
// that /api/revalidate would refresh a page as soon as its content changed — but
// nothing has ever called that endpoint (not the collector, not any edge function),
// so 24h was the ONLY refresh path. Technique summaries generate roughly two an
// hour and were invisible for most of a day: on 2026-08-20, summaries written at
// 22:59 and 04:07 were absent from their pages while ones written at 20:12 and
// earlier rendered. Cloudflare adds up to 4h on top of whatever this value is.
export const revalidate = 3600;

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
  const title = `${data.skill.name} — ${data.category.name}`;
  const socialTitle = `${title} | Subskills`;

  return {
    title,
    description,
    robots: isPublishedSkill(data.skill) ? undefined : { index: false, follow: false },
    alternates: { canonical },
    openGraph: {
      title: socialTitle,
      description,
      url: canonical,
      images: image ? [{ url: image, alt: data.skill.name }] : undefined,
    },
    twitter: {
      card: image ? "summary_large_image" : "summary",
      title: socialTitle,
      description,
      images: image ? [image] : undefined,
    },
  };
}

function resourceItemListJsonLd(
  resources: Awaited<ReturnType<typeof getSkillPage>>["resources"],
  pageUrl: string,
  skillName: string,
  categoryName: string,
) {
  return {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: `${skillName} ${categoryName} tutorials`,
    url: pageUrl,
    itemListElement: resources.map((resource, index) => {
      const url = resource.link.canonical_url || resource.link.url;
      return {
        "@type": "ListItem",
        position: index + 1,
        name: resource.link.title ?? `${skillName} tutorial`,
        url,
        ...(resource.public_note ?? resource.link.description
          ? { description: resource.public_note ?? resource.link.description }
          : {}),
      };
    }),
  };
}

export default async function SkillPage({
  params,
}: {
  params: Promise<{ category: string; skill: string }>;
}) {
  const { category: categorySlug, skill: skillSlug } = await params;
  const { category, skill, resources, summary } = await getSkillPage(categorySlug, skillSlug);
  if (!category || !skill) notFound();

  const pageUrl = makeCanonical(getBaseUrl(), category.slug, skill.slug);

  return (
    <>
      <JsonLd data={resourceItemListJsonLd(resources, pageUrl, skill.name, category.name)} />
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
      <SkillResourceBrowser
        category={category}
        skill={skill}
        resources={resources}
        summarySlot={summary ? <SkillTechniqueSummary summary={summary} skillName={skill.name} /> : null}
      />
    </>
  );
}
