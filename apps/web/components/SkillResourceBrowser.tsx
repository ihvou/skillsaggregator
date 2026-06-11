"use client";

import { useMemo, useState } from "react";
import type { CategorySummary, SkillLevel, SkillResource, SkillSummary } from "@skillsaggregator/shared";
import { PageHeader } from "@/components/PageHeader";
import { ResourceCard } from "@/components/ResourceCard";
import { SortFilterMenu } from "@/components/SortFilterMenu";
import { SuggestLinkButton } from "@/components/SuggestLinkButton";
import type { ResourceSort } from "@/lib/data";

interface SkillResourceBrowserProps {
  category: CategorySummary;
  skill: SkillSummary;
  resources: SkillResource[];
}

const LEVEL_LABELS = {
  all: "All levels",
  beginner: "Beginner",
  intermediate: "Intermediate",
  advanced: "Advanced",
} as const;
const SORT_LABELS = { popular: "Popular", newest: "Newest" } as const;

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

export function SkillResourceBrowser({ category, skill, resources }: SkillResourceBrowserProps) {
  const [level, setLevel] = useState<SkillLevel | null>(null);
  const [sort, setSort] = useState<ResourceSort>("newest");
  const filteredResources = useMemo(() => {
    const next = level
      ? resources.filter((resource) => resource.skill_level === level)
      : resources;
    return sortResources(next, sort);
  }, [level, resources, sort]);
  const subtitleParts: string[] = [`${category.name}`, SORT_LABELS[sort]];
  if (level) subtitleParts.push(LEVEL_LABELS[level]);

  return (
    <div className="pb-20">
      <PageHeader
        title={skill.name}
        subtitle={subtitleParts.join(" / ")}
        backHref={`/${category.slug}`}
        rightAccessory={
          <>
            <SuggestLinkButton categorySlug={category.slug} skillSlug={skill.slug} compact />
            <SortFilterMenu
              currentLevel={level}
              currentSort={sort}
              onLevelChange={setLevel}
              onSortChange={setSort}
            />
          </>
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
            No matches for this filter. Open the menu (...) to change sort or level.
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
