import type {
  LinkResource,
  ResourceSort,
  ResourceSource,
  ResourceSourceFilter,
  SkillLevel,
  SkillResource,
  SkillSummary,
} from "./types";

type SourceLink = Pick<
  LinkResource,
  "domain" | "url" | "canonical_url" | "thumbnail_storage_path"
>;

export type ResourceLevelFilter = "all" | SkillLevel | "unlabeled";

export interface SkillResourceSection {
  skill: SkillSummary;
  resources: SkillResource[];
}

export interface LearningPathEntry {
  skill: SkillSummary;
  total: number;
  resources: SkillResource[];
}

export interface LearningPathStage {
  value: SkillLevel | "unlabeled";
  level: SkillLevel | null;
  label: string;
  entries: LearningPathEntry[];
}

export const LEARNING_PATH_LEVELS: Array<{
  value: SkillLevel | "unlabeled";
  level: SkillLevel | null;
  label: string;
}> = [
  { value: "beginner", level: "beginner", label: "Beginner" },
  { value: "intermediate", level: "intermediate", label: "Intermediate" },
  { value: "advanced", level: "advanced", label: "Advanced" },
  { value: "unlabeled", level: null, label: "Unlabeled" },
];

function includesAny(value: string, needles: string[]) {
  return needles.some((needle) => value.includes(needle));
}

function clamp01(value: number) {
  return Math.max(0, Math.min(1, value));
}

function sortTime(value: string | null | undefined) {
  const parsed = Date.parse(value ?? "");
  return Number.isNaN(parsed) ? 0 : parsed;
}

export function matchesText(value: string | null | undefined, query: string) {
  return value?.toLowerCase().includes(query) ?? false;
}

export function skillMatchesQuery(skill: SkillSummary, query: string) {
  return !query || matchesText(skill.name, query) || matchesText(skill.description, query);
}

export function getLinkSource(link: SourceLink): ResourceSource {
  const haystack = [
    link.domain,
    link.url,
    link.canonical_url,
    link.thumbnail_storage_path,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  if (includesAny(haystack, ["tiktok.com", "/tiktok/"])) return "tiktok";
  if (includesAny(haystack, ["youtube.com", "youtu.be", "ytimg.com"])) return "youtube";
  return "other";
}

export function resourceMatchesSource(
  resource: Pick<SkillResource, "link">,
  source: ResourceSourceFilter,
) {
  return source === "all" || getLinkSource(resource.link) === source;
}

export function resourceMatchesLevel(
  resource: Pick<SkillResource, "skill_level">,
  level: ResourceLevelFilter,
) {
  if (level === "all") return true;
  if (level === "unlabeled") return resource.skill_level === null;
  return resource.skill_level === level;
}

export function resourceValueScore(
  resource: Pick<SkillResource, "value_score" | "vote_score" | "upvote_count">,
) {
  if (typeof resource.value_score === "number" && Number.isFinite(resource.value_score)) {
    return clamp01(resource.value_score);
  }
  const voteScore =
    typeof resource.vote_score === "number" && Number.isFinite(resource.vote_score)
      ? resource.vote_score
      : Number.isFinite(resource.upvote_count)
        ? resource.upvote_count
        : 0;

  // Keep unscored fallback values on the same 0-1 scale. Comparators below
  // still partition scored rows above unscored rows during partial backfills.
  return Math.min(0.99, Math.log1p(Math.max(0, voteScore)) / 8);
}

export function hasStoredValueScore(resource: Pick<SkillResource, "value_score">) {
  return typeof resource.value_score === "number" && Number.isFinite(resource.value_score);
}

export function compareResourcesByValue(a: SkillResource, b: SkillResource) {
  const scoredDiff = Number(hasStoredValueScore(b)) - Number(hasStoredValueScore(a));
  if (scoredDiff !== 0) return scoredDiff;
  const scoreDiff = resourceValueScore(b) - resourceValueScore(a);
  if (scoreDiff !== 0) return scoreDiff;
  const voteDiff = (b.vote_score ?? b.upvote_count) - (a.vote_score ?? a.upvote_count);
  if (voteDiff !== 0) return voteDiff;
  return sortTime(b.created_at) - sortTime(a.created_at);
}

export function sortResources(resources: SkillResource[], sort: ResourceSort) {
  return [...resources].sort((a, b) =>
    sort === "popular"
      ? compareResourcesByValue(a, b)
      : sortTime(b.created_at) - sortTime(a.created_at),
  );
}

export function resourcePassesFilters(
  resource: SkillResource,
  options: {
    level?: ResourceLevelFilter;
    source?: ResourceSourceFilter;
  },
) {
  return (
    resourceMatchesLevel(resource, options.level ?? "all") &&
    resourceMatchesSource(resource, options.source ?? "all")
  );
}

export function buildSkillResourceSections(
  skills: SkillSummary[],
  resources: SkillResource[],
  options: {
    query?: string;
    level?: ResourceLevelFilter;
    source?: ResourceSourceFilter;
    sort?: ResourceSort;
    perSkill?: number;
  } = {},
): SkillResourceSection[] {
  const query = options.query?.trim().toLowerCase() ?? "";
  const perSkill = options.perSkill ?? 12;
  const resourcesBySkill = new Map<string, SkillResource[]>();

  for (const resource of resources) {
    const skillId = resource.skill?.id;
    if (!skillId || !resourcePassesFilters(resource, options)) continue;
    const bucket = resourcesBySkill.get(skillId) ?? [];
    bucket.push(resource);
    resourcesBySkill.set(skillId, bucket);
  }

  return skills
    .filter((skill) => skillMatchesQuery(skill, query))
    .map((skill) => {
      const sorted = sortResources(resourcesBySkill.get(skill.id) ?? [], options.sort ?? "popular");
      return { skill, resources: sorted.slice(0, perSkill) };
    })
    .filter((section) => section.resources.length > 0);
}

export function buildLearningPathIndex(
  skills: SkillSummary[],
  resources: SkillResource[],
): LearningPathStage[] {
  const skillById = new Map(skills.map((skill) => [skill.id, skill]));

  return LEARNING_PATH_LEVELS.map((stage) => {
    const resourcesBySkill = new Map<string, SkillResource[]>();
    for (const resource of resources) {
      const skillId = resource.skill?.id;
      if (!skillId) continue;
      if (stage.level === null ? resource.skill_level !== null : resource.skill_level !== stage.level) {
        continue;
      }
      if (!skillById.has(skillId)) continue;
      const bucket = resourcesBySkill.get(skillId) ?? [];
      bucket.push(resource);
      resourcesBySkill.set(skillId, bucket);
    }

    const entries = [...resourcesBySkill.entries()]
      .map(([skillId, bucket]) => {
        const skill = skillById.get(skillId);
        if (!skill) return null;
        const ordered = sortResources(bucket, "popular");
        return {
          skill,
          total: ordered.length,
          resources: ordered,
        };
      })
      .filter((entry): entry is LearningPathEntry => Boolean(entry))
      .sort((a, b) => b.total - a.total || a.skill.name.localeCompare(b.skill.name));

    return { ...stage, entries };
  });
}

export function filterLearningPathStages(
  stages: LearningPathStage[],
  options: {
    query?: string;
    level?: ResourceLevelFilter;
    source?: ResourceSourceFilter;
    perSkill?: number;
  } = {},
): LearningPathStage[] {
  const query = options.query?.trim().toLowerCase() ?? "";
  const perSkill = options.perSkill ?? 3;
  const level = options.level ?? "all";

  return stages
    .filter((stage) => level === "all" || stage.value === level)
    .map((stage) => ({
      ...stage,
      entries: stage.entries
        .filter((entry) => skillMatchesQuery(entry.skill, query))
        .map((entry) => {
          const resources = sortResources(
            entry.resources.filter((resource) =>
              resourcePassesFilters(resource, {
                level: stage.value,
                source: options.source ?? "all",
              }),
            ),
            "popular",
          );
          return {
            ...entry,
            total: resources.length,
            resources: resources.slice(0, perSkill),
          };
        })
        .filter((entry) => entry.resources.length > 0),
    }))
    .filter((stage) => stage.entries.length > 0 || stage.value !== "unlabeled");
}
