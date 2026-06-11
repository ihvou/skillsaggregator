import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/PageHeader";
import { ResourceCard } from "@/components/ResourceCard";
import { ResourceTile } from "@/components/ResourceTile";
import { SectionHeader } from "@/components/SectionHeader";
import { SortFilterMenu } from "@/components/SortFilterMenu";
import { SuggestLinkButton } from "@/components/SuggestLinkButton";
import {
  getAllCatalogs,
  getCategoryResourceListing,
  getCategoryWithSkillResources,
} from "@/lib/data";
import { getBaseUrl } from "@/lib/env";
import {
  type PageSearchParams,
  parseLevel,
  parseSkillSlugs,
  parseSort,
} from "@/lib/listing-params";

export const revalidate = 3600;

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
  const { category } = await getCategoryWithSkillResources(slug);
  if (!category) return {};
  return {
    title: `${category.name} resources | Subskills`,
    description: category.description ?? `Curated resources for ${category.name}.`,
    alternates: { canonical: `${getBaseUrl()}/${category.slug}` },
  };
}

function searchParamsToUrlSearchParams(searchParams: PageSearchParams) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(searchParams)) {
    if (Array.isArray(value)) {
      for (const item of value) {
        if (item) params.append(key, item);
      }
    } else if (value) {
      params.set(key, value);
    }
  }
  return params;
}

function skillFilterHref(
  categorySlug: string,
  searchParams: PageSearchParams,
  skillSlug: string | null,
) {
  const next = searchParamsToUrlSearchParams(searchParams);
  next.delete("page");

  if (!skillSlug) {
    next.delete("skills");
  } else {
    const selected = new Set(parseSkillSlugs(searchParams));
    if (selected.has(skillSlug)) selected.delete(skillSlug);
    else selected.add(skillSlug);
    if (selected.size) next.set("skills", [...selected].join(","));
    else next.delete("skills");
  }

  const query = next.toString();
  return `/${categorySlug}${query ? `?${query}` : ""}`;
}

export default async function CategoryPage({
  params,
  searchParams,
}: {
  params: Promise<{ category: string }>;
  searchParams?: Promise<PageSearchParams>;
}) {
  const { category: slug } = await params;
  const resolvedSearchParams = (await searchParams) ?? {};
  const selectedSkillSlugs = parseSkillSlugs(resolvedSearchParams);
  const level = parseLevel(resolvedSearchParams);
  const sort = parseSort(resolvedSearchParams);
  const listingMode = selectedSkillSlugs.length > 0 || Boolean(level);

  const listing = listingMode
    ? await getCategoryResourceListing(slug, { skillSlugs: selectedSkillSlugs, level, sort })
    : null;
  const sectionData = listingMode ? null : await getCategoryWithSkillResources(slug);
  const category = listing?.category ?? sectionData?.category ?? null;
  const sections = sectionData?.sections ?? [];
  const skills = listing?.skills ?? sections.map((section) => section.skill);
  if (!category) notFound();
  const selectedSkillSet = new Set(selectedSkillSlugs);
  const pathname = `/${category.slug}`;

  return (
    <div className="pb-20">
      <PageHeader
        title={category.name}
        subtitle={category.description ?? undefined}
        backHref="/"
        rightAccessory={
          <>
            <SuggestLinkButton categorySlug={category.slug} />
            {listingMode ? (
              <SortFilterMenu pathname={pathname} currentLevel={level} currentSort={sort} />
            ) : null}
          </>
        }
      />

      <section className="mx-auto mt-8 max-w-5xl px-4">
        {/* One scrollable row on phones (the full pill cloud pushed resources
            below the fold); wraps into a cloud from `sm` up. */}
        <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 no-scrollbar sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0 sm:pb-0">
          <Link
            href={`/${category.slug}`}
            aria-pressed={!listingMode}
            className={`focus-ring shrink-0 whitespace-nowrap rounded-full px-3 py-2 text-sm font-bold transition ${
              !listingMode
                ? "bg-ink text-surface"
                : "bg-surface text-muted ring-1 ring-divider hover:text-ink"
            }`}
          >
            All skills
          </Link>
          {skills.map((skill) => {
            const selected = selectedSkillSet.has(skill.slug);
            return (
              <Link
                key={skill.id}
                href={skillFilterHref(category.slug, resolvedSearchParams, skill.slug)}
                aria-pressed={selected}
                className={`focus-ring shrink-0 whitespace-nowrap rounded-full px-3 py-2 text-sm font-bold transition ${
                  selected
                    ? "bg-ink text-surface"
                    : "bg-surface text-muted ring-1 ring-divider hover:text-ink"
                }`}
              >
                {skill.name}
              </Link>
            );
          })}
        </div>
      </section>

      <div className="mt-12 space-y-14">
        {listingMode ? (
          <section className="mx-auto max-w-5xl px-4">
            {listing?.resources.length ? (
              <div className="divide-y divide-divider">
                {listing.resources.map((resource) => (
                  <div key={resource.id} className="py-5">
                    <ResourceCard resource={resource} />
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted">
                No resources match these filters yet. Toggle another skill or open the menu to
                change level.
              </p>
            )}
          </section>
        ) : (
          sections.map((section) => (
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
          ))
        )}
        {!listingMode && sections.length === 0 ? (
          <div className="mx-auto max-w-5xl px-4 text-sm text-muted">
            No approved resources for this category yet. Check back soon — the agent pulls new
            resources every night.
          </div>
        ) : null}
      </div>
    </div>
  );
}
