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
import { youtubeVideoIdFromUrl } from "@/lib/thumbnails";

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

function schemaEducationalLevel(level: SkillResource["skill_level"]) {
  if (!level) return undefined;
  const label = {
    beginner: "Beginner",
    intermediate: "Intermediate",
    advanced: "Advanced",
  }[level];
  return `https://schema.org/${label}`;
}

function isoDuration(totalSeconds: number | null | undefined) {
  if (!Number.isFinite(totalSeconds) || !totalSeconds || totalSeconds <= 0) return undefined;
  const total = Math.floor(totalSeconds);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  const parts = [
    hours ? `${hours}H` : "",
    minutes ? `${minutes}M` : "",
    seconds || (!hours && !minutes) ? `${seconds}S` : "",
  ].join("");
  return `PT${parts}`;
}

function isoDate(value: string | null | undefined) {
  if (!value) return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

function youtubeThumbnailFromVideoId(videoId: string | null) {
  return videoId ? `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg` : null;
}

function videoIdForResource(resource: SkillResource) {
  return (
    youtubeVideoIdFromUrl(resource.link.canonical_url) ??
    youtubeVideoIdFromUrl(resource.link.url) ??
    youtubeVideoIdFromUrl(resource.link.thumbnail_url)
  );
}

function videoItemListJsonLd(
  resources: SkillResource[],
  pageUrl: string,
  skillName: string,
  categoryName: string,
) {
  const items = resources
    .map((resource) => {
      const videoId = videoIdForResource(resource);
      if (!videoId) return null;
      const contentUrl = resource.link.canonical_url || resource.link.url;
      const thumbnailUrl = resource.link.thumbnail_url ?? youtubeThumbnailFromVideoId(videoId);
      const description =
        resource.public_note ??
        resource.link.description ??
        `${resource.skill?.name ?? skillName} tutorial for ${categoryName}.`;
      const uploadDate = isoDate(resource.link.created_at ?? resource.created_at);
      const duration = isoDuration(resource.link.duration_seconds);
      const educationalLevel = schemaEducationalLevel(resource.skill_level);
      return {
        "@type": "ListItem",
        position: 0,
        url: contentUrl,
        item: {
          "@type": "VideoObject",
          name: resource.link.title ?? `${skillName} tutorial`,
          description,
          ...(thumbnailUrl ? { thumbnailUrl: [thumbnailUrl] } : {}),
          ...(uploadDate ? { uploadDate } : {}),
          ...(duration ? { duration } : {}),
          contentUrl,
          embedUrl: `https://www.youtube.com/embed/${videoId}`,
          url: contentUrl,
          ...(educationalLevel ? { educationalLevel } : {}),
          isPartOf: pageUrl,
        },
      };
    })
    .filter((item): item is NonNullable<typeof item> => item !== null)
    .map((item, index) => ({ ...item, position: index + 1 }));

  return {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: `${skillName} ${categoryName} tutorial videos`,
    url: pageUrl,
    itemListElement: items,
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
      <JsonLd data={videoItemListJsonLd(resources, pageUrl, skill.name, category.name)} />
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
