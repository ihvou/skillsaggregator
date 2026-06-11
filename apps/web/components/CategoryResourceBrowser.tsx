"use client";

import { useMemo, useState } from "react";
import type { CategorySummary, SkillLevel, SkillResource, SkillSummary } from "@skillsaggregator/shared";
import { PageHeader } from "@/components/PageHeader";
import { ResourceCard } from "@/components/ResourceCard";
import { ResourceTile } from "@/components/ResourceTile";
import { SectionHeader } from "@/components/SectionHeader";
import { SortFilterMenu } from "@/components/SortFilterMenu";
import { SuggestLinkButton } from "@/components/SuggestLinkButton";
import type { ResourceSort, SkillSection } from "@/lib/data";

interface CategoryResourceBrowserProps {
  category: CategorySummary;
  skills: SkillSummary[];
  sections: SkillSection[];
  resources: SkillResource[];
}

function sortTime(value: string | null | undefined) {
  const parsed = Date.parse(value ?? "");
  return Number.isNaN(parsed) ? 0 : parsed;
}

function sortResources(resources: SkillResource[], sort: ResourceSort) {
  return [...resources].sort((a, b) =>
    sort === "popular"
      ? (b.vote_score ?? b.upvote_count) - (a.vote_score ?? a.upvote_count)
      : sortTime(b.created_at) - sortTime(a.created_at),
  );
}

function dedupeByLink(resources: SkillResource[]) {
  const byLink = new Map<string, SkillResource>();
  for (const resource of resources) {
    const existing = byLink.get(resource.link.id);
    if (!existing || (resource.vote_score ?? resource.upvote_count) > (existing.vote_score ?? existing.upvote_count)) {
      byLink.set(resource.link.id, resource);
    }
  }
  return [...byLink.values()];
}

export function CategoryResourceBrowser({
  category,
  skills,
  sections,
  resources,
}: CategoryResourceBrowserProps) {
  const [selectedSkillSlugs, setSelectedSkillSlugs] = useState<string[]>([]);
  const [level, setLevel] = useState<SkillLevel | null>(null);
  const [sort, setSort] = useState<ResourceSort>("newest");

  const selectedSkillSet = useMemo(() => new Set(selectedSkillSlugs), [selectedSkillSlugs]);
  const listingMode = selectedSkillSlugs.length > 0 || Boolean(level);
  const listingResources = useMemo(() => {
    if (!listingMode) return [];
    const filtered = resources.filter((resource) => {
      const skillSlug = resource.skill?.slug;
      const skillMatched = selectedSkillSet.size === 0 || (skillSlug ? selectedSkillSet.has(skillSlug) : false);
      const levelMatched = !level || resource.skill_level === level;
      return skillMatched && levelMatched;
    });
    return sortResources(dedupeByLink(filtered), sort);
  }, [level, listingMode, resources, selectedSkillSet, sort]);

  function toggleSkill(skillSlug: string) {
    setSelectedSkillSlugs((current) =>
      current.includes(skillSlug)
        ? current.filter((value) => value !== skillSlug)
        : [...current, skillSlug],
    );
  }

  function clearFilters() {
    setSelectedSkillSlugs([]);
    setLevel(null);
  }

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
              <SortFilterMenu
                currentLevel={level}
                currentSort={sort}
                onLevelChange={setLevel}
                onSortChange={setSort}
              />
            ) : null}
          </>
        }
      />

      <section className="mx-auto mt-8 max-w-5xl px-4">
        <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 no-scrollbar sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0 sm:pb-0">
          <button
            type="button"
            onClick={clearFilters}
            aria-pressed={!listingMode}
            className={`focus-ring shrink-0 whitespace-nowrap rounded-full px-3 py-2 text-sm font-bold transition ${
              !listingMode
                ? "bg-ink text-surface"
                : "bg-surface text-muted ring-1 ring-divider hover:text-ink"
            }`}
          >
            All skills
          </button>
          {skills.map((skill) => {
            const selected = selectedSkillSet.has(skill.slug);
            return (
              <button
                key={skill.id}
                type="button"
                onClick={() => toggleSkill(skill.slug)}
                aria-pressed={selected}
                className={`focus-ring shrink-0 whitespace-nowrap rounded-full px-3 py-2 text-sm font-bold transition ${
                  selected
                    ? "bg-ink text-surface"
                    : "bg-surface text-muted ring-1 ring-divider hover:text-ink"
                }`}
              >
                {skill.name}
              </button>
            );
          })}
        </div>
      </section>

      <div className="mt-12 space-y-14">
        {listingMode ? (
          <section className="mx-auto max-w-5xl px-4">
            {listingResources.length ? (
              <div className="divide-y divide-divider">
                {listingResources.map((resource) => (
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
            No approved resources for this category yet. Check back soon - the agent pulls new
            resources every night.
          </div>
        ) : null}
      </div>
    </div>
  );
}
