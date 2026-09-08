import type { CategorySummary, SkillResource, SkillSummary } from "@skillsaggregator/shared";
// SkillTechniqueSummary is declared in lib/data.ts, not the shared package.
import type { SkillTechniqueSummary } from "./data";
import { getStoredString, setStoredString } from "./localState";

export type CachedCategoryResources = {
  category: CategorySummary | null;
  skills: SkillSummary[];
  resources: SkillResource[];
};

const CATEGORY_CACHE_PREFIX = "category_resources_cache:";
const CATEGORY_CACHE_MAX_AGE_MS = 24 * 60 * 60 * 1000;

type CacheEnvelope = {
  updatedAt: number;
  data: CachedCategoryResources;
};

function cacheKey(categorySlug: string) {
  return `${CATEGORY_CACHE_PREFIX}${categorySlug}`;
}

export function readCachedCategoryResources(categorySlug: string): CacheEnvelope | null {
  const raw = getStoredString(cacheKey(categorySlug));
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<CacheEnvelope>;
    if (
      typeof parsed.updatedAt !== "number" ||
      !parsed.data ||
      !Array.isArray(parsed.data.skills) ||
      !Array.isArray(parsed.data.resources)
    ) {
      return null;
    }
    if (Date.now() - parsed.updatedAt > CATEGORY_CACHE_MAX_AGE_MS) return null;
    return parsed as CacheEnvelope;
  } catch (error) {
    console.warn("[category-cache] Failed to read cached category payload", {
      categorySlug,
      error,
    });
    return null;
  }
}

export function writeCachedCategoryResources(
  categorySlug: string,
  data: CachedCategoryResources,
) {
  try {
    setStoredString(cacheKey(categorySlug), JSON.stringify({ updatedAt: Date.now(), data }));
  } catch (error) {
    console.warn("[category-cache] Failed to write cached category payload", {
      categorySlug,
      error,
    });
  }
}

// ---------------------------------------------------------------------------
// Skill-level cache.
//
// The category screen has had a disk cache since early on; the skill screen
// never did, so every cold open paid the full network cost. That matters more
// than it looks: measured against production, the SAME query costs 20-35ms on a
// warm connection and 480-1180ms on a cold one, so the expense is establishing
// the connection, not the query. Serving the last payload from disk as
// `initialData` means the screen paints immediately and the refetch happens
// behind already-visible content.
// ---------------------------------------------------------------------------

export type CachedSkillResources = {
  category: CategorySummary | null;
  skill: SkillSummary | null;
  resources: SkillResource[];
  summary: SkillTechniqueSummary | null;
};

const SKILL_CACHE_PREFIX = "skill_resources_cache:";
// Shorter than the category cache: a skill page is a short list whose ordering
// moves with votes, so a day-old copy would show a visibly stale order.
const SKILL_CACHE_MAX_AGE_MS = 6 * 60 * 60 * 1000;

type SkillCacheEnvelope = {
  updatedAt: number;
  data: CachedSkillResources;
};

function skillCacheKey(categorySlug: string, skillSlug: string) {
  return `${SKILL_CACHE_PREFIX}${categorySlug}/${skillSlug}`;
}

export function readCachedSkillResources(
  categorySlug: string,
  skillSlug: string,
): SkillCacheEnvelope | null {
  const raw = getStoredString(skillCacheKey(categorySlug, skillSlug));
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<SkillCacheEnvelope>;
    if (
      typeof parsed.updatedAt !== "number" ||
      !parsed.data ||
      !Array.isArray(parsed.data.resources)
    ) {
      return null;
    }
    if (Date.now() - parsed.updatedAt > SKILL_CACHE_MAX_AGE_MS) return null;
    return parsed as SkillCacheEnvelope;
  } catch (error) {
    console.warn("[skill-cache] Failed to read cached skill payload", {
      categorySlug,
      skillSlug,
      error,
    });
    return null;
  }
}

export function writeCachedSkillResources(
  categorySlug: string,
  skillSlug: string,
  data: CachedSkillResources,
) {
  try {
    setStoredString(
      skillCacheKey(categorySlug, skillSlug),
      JSON.stringify({ updatedAt: Date.now(), data }),
    );
  } catch (error) {
    console.warn("[skill-cache] Failed to write cached skill payload", {
      categorySlug,
      skillSlug,
      error,
    });
  }
}
