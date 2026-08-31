import type { CategorySummary, SkillResource, SkillSummary } from "@skillsaggregator/shared";
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
