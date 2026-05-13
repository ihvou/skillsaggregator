import Link from "next/link";
import type { CategorySummary, SkillLevel, SkillSummary } from "@skillsaggregator/shared";
import type { ResourceSort } from "@/lib/data";

type SearchValue = string | string[] | undefined;
type SearchParams = Record<string, SearchValue>;

const levels: Array<{ value: SkillLevel; label: string }> = [
  { value: "beginner", label: "Beginner" },
  { value: "intermediate", label: "Intermediate" },
  { value: "advanced", label: "Advanced" },
];

const sortOptions: Array<{ value: ResourceSort; label: string }> = [
  { value: "newest", label: "Newest" },
  { value: "popular", label: "Popular" },
];

function first(value: SearchValue) {
  return Array.isArray(value) ? value[0] : value;
}

export function hrefWithParams(
  pathname: string,
  searchParams: SearchParams,
  updates: Record<string, string | null>,
) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(searchParams)) {
    const picked = first(value);
    if (picked) params.set(key, picked);
  }
  for (const [key, value] of Object.entries(updates)) {
    if (value === null) params.delete(key);
    else params.set(key, value);
  }
  if (updates.level !== undefined || updates.sort !== undefined) params.delete("page");
  const query = params.toString();
  return query ? `${pathname}?${query}` : pathname;
}

function chipClass(active: boolean) {
  return [
    "focus-ring inline-flex min-h-9 items-center rounded-md border px-3 text-sm font-semibold transition",
    active
      ? "border-court bg-court text-white shadow-sm"
      : "border-ink/10 bg-white text-ink hover:border-court/50 hover:text-court",
  ].join(" ");
}

export function CategoryFilterChips({ categories }: { categories: CategorySummary[] }) {
  return (
    <div className="flex flex-wrap gap-2" aria-label="Categories">
      <Link href="/" className={chipClass(true)}>
        All categories
      </Link>
      {categories.map((category) => (
        <Link key={category.id} href={`/${category.slug}`} className={chipClass(false)}>
          {category.name}
        </Link>
      ))}
    </div>
  );
}

const categoryEmoji: Record<string, string> = {
  badminton: "🏸",
  padel: "🎾",
  "gym-men": "🏋️‍♂️",
  "gym-women": "🏋️‍♀️",
  surfing: "🏄",
};

export function CategoryCards({ categories }: { categories: CategorySummary[] }) {
  return (
    <div
      className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5"
      aria-label="Pick a category"
    >
      {categories.map((category) => {
        const emoji = categoryEmoji[category.slug] ?? "📚";
        return (
          <Link
            key={category.id}
            href={`/${category.slug}`}
            className="focus-ring group flex flex-col items-center justify-center gap-2 rounded-xl border border-ink/10 bg-white p-4 text-center shadow-sm transition hover:-translate-y-0.5 hover:border-court/50 hover:shadow-md"
          >
            <span aria-hidden="true" className="text-5xl leading-none">
              {emoji}
            </span>
            <span className="text-sm font-bold text-ink group-hover:text-court">
              {category.name}
            </span>
          </Link>
        );
      })}
    </div>
  );
}

export function SkillFilterChips({
  categorySlug,
  skills,
}: {
  categorySlug: string;
  skills: SkillSummary[];
}) {
  return (
    <div className="flex flex-wrap gap-2" aria-label="Skills">
      {skills.map((skill) => (
        <Link key={skill.id} href={`/${categorySlug}/${skill.slug}`} className={chipClass(false)}>
          {skill.name}
          {skill.resource_count > 0 ? (
            <span className="ml-2 rounded bg-ink/10 px-1.5 py-0.5 text-xs text-current">
              {skill.resource_count}
            </span>
          ) : null}
        </Link>
      ))}
    </div>
  );
}

export function LevelFilterChips({
  pathname,
  searchParams,
  currentLevel,
}: {
  pathname: string;
  searchParams: SearchParams;
  currentLevel: SkillLevel | null;
}) {
  return (
    <div className="flex flex-wrap gap-2" aria-label="Resource level">
      <Link href={hrefWithParams(pathname, searchParams, { level: null })} className={chipClass(!currentLevel)}>
        All levels
      </Link>
      {levels.map((level) => (
        <Link
          key={level.value}
          href={hrefWithParams(pathname, searchParams, {
            level: currentLevel === level.value ? null : level.value,
          })}
          className={chipClass(currentLevel === level.value)}
        >
          {level.label}
        </Link>
      ))}
    </div>
  );
}

export function SortChips({
  pathname,
  searchParams,
  currentSort,
}: {
  pathname: string;
  searchParams: SearchParams;
  currentSort: ResourceSort;
}) {
  return (
    <div className="flex flex-wrap gap-2" aria-label="Sort resources">
      {sortOptions.map((sort) => (
        <Link
          key={sort.value}
          href={hrefWithParams(pathname, searchParams, { sort: sort.value })}
          className={chipClass(currentSort === sort.value)}
        >
          {sort.label}
        </Link>
      ))}
    </div>
  );
}
