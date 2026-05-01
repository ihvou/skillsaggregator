import Link from "next/link";
import type { CategorySummary, SkillSummary } from "@skillsaggregator/shared";

interface SkillGridProps {
  category: CategorySummary;
  skills: SkillSummary[];
}

export function SkillGrid({ category, skills }: SkillGridProps) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {skills.map((skill) => (
        <Link
          key={skill.id}
          href={`/${category.slug}/${skill.slug}`}
          className="focus-ring group rounded-lg border border-ink/10 bg-white/80 p-4 shadow-sm transition hover:-translate-y-0.5 hover:border-court/40 hover:shadow-panel"
        >
          <div className="flex items-start justify-between gap-3">
            <h2 className="text-base font-semibold text-ink">{skill.name}</h2>
            <span className="rounded-full bg-court/10 px-2 py-1 text-xs font-medium text-court">
              {skill.resource_count}
            </span>
          </div>
          <p className="mt-2 line-clamp-3 text-sm leading-6 text-graphite">{skill.description}</p>
        </Link>
      ))}
    </div>
  );
}
