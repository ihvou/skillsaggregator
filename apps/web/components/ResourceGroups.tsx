import { groupResourcesByLevel, type SkillResource } from "@skillsaggregator/shared";
import { ResourceCard } from "./ResourceCard";

interface ResourceGroupsProps {
  resources: SkillResource[];
}

const groupLabels = {
  beginner: "Beginner",
  intermediate: "Intermediate",
  advanced: "Advanced",
  uncategorized: "Uncategorized",
} as const;

export function ResourceGroups({ resources }: ResourceGroupsProps) {
  const groups = groupResourcesByLevel(resources);
  const entries = Object.entries(groups).filter(([, items]) => items.length > 0);

  if (!entries.length) {
    return (
      <div className="rounded-lg border border-dashed border-ink/20 bg-white/70 p-6 text-sm leading-6 text-graphite">
        No approved resources yet. Run the Link Searcher from the admin dashboard to populate
        this page.
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {entries.map(([level, items]) => (
        <section key={level} aria-labelledby={`${level}-resources`}>
          <h2 id={`${level}-resources`} className="text-xl font-semibold text-ink">
            {groupLabels[level as keyof typeof groupLabels]}
          </h2>
          <div className="mt-3 space-y-3">
            {items.map((resource) => (
              <ResourceCard key={resource.id} resource={resource} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
