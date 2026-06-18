"use client";

import { useMemo, useState } from "react";
import {
  resourcePassesFilters,
  sortResources,
  type CategorySummary,
  type ResourceSourceFilter,
  type SkillLevel,
  type SkillResource,
  type SkillSummary,
} from "@skillsaggregator/shared";
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
const SOURCE_LABELS = { all: "All sources", youtube: "YouTube", tiktok: "TikTok" } as const;

export function SkillResourceBrowser({ category, skill, resources }: SkillResourceBrowserProps) {
  const [level, setLevel] = useState<SkillLevel | null>(null);
  const [sort, setSort] = useState<ResourceSort>("popular");
  const [source, setSource] = useState<ResourceSourceFilter>("all");
  const filteredResources = useMemo(() => {
    const next = resources.filter((resource) =>
      resourcePassesFilters(resource, { level: level ?? "all", source }),
    );
    return sortResources(next, sort);
  }, [level, resources, sort, source]);
  const subtitleParts: string[] = [`${category.name}`, SORT_LABELS[sort]];
  if (level) subtitleParts.push(LEVEL_LABELS[level]);
  if (source !== "all") subtitleParts.push(SOURCE_LABELS[source]);

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
              currentSource={source}
              onLevelChange={setLevel}
              onSortChange={setSort}
              onSourceChange={setSource}
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
