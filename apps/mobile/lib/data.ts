import {
  badmintonCategory,
  fallbackCategories,
  fallbackResources,
  fallbackSkills,
  type CategorySummary,
  type ResourceSort,
  type SkillResource,
  type SkillSummary,
} from "@skillsaggregator/shared";
import { getSupabase } from "./supabase";
import { normalizeThumbnailUrl } from "./thumbnails";

export type SkillSection = {
  skill: SkillSummary;
  resources: SkillResource[];
};

export type DiscoverSkillTile = {
  skill: SkillSummary;
  latest_thumbnail: string | null;
};

export type DiscoverCategorySection = {
  category: CategorySummary;
  skills: DiscoverSkillTile[];
};

const RESOURCE_LINK_SELECT =
  "id, url, canonical_url, domain, title, description, thumbnail_url, content_type, created_at, contributor_profile:contributor_profiles(id, slug, display_name, avatar_url, accepted_count)";
const RELATION_VOTE_SELECT = "upvote_count, downvote_count, vote_score";

function shapeLinkWithContributor<
  TLink extends {
    contributor_profile?: unknown;
    thumbnail_url?: string | null;
    canonical_url?: string | null;
    url?: string | null;
  },
>(link: TLink) {
  const contributor = Array.isArray(link.contributor_profile)
    ? link.contributor_profile[0]
    : link.contributor_profile;
  return {
    ...link,
    thumbnail_url: normalizeThumbnailUrl(
      link.thumbnail_url,
      link.canonical_url ?? link.url ?? null,
    ),
    contributor_profile: contributor ?? null,
  };
}

function relationVotes(relation: {
  upvote_count?: number | null;
  downvote_count?: number | null;
  vote_score?: number | null;
}) {
  const upvoteCount = relation.upvote_count ?? 0;
  const downvoteCount = relation.downvote_count ?? 0;
  return {
    upvote_count: upvoteCount,
    downvote_count: downvoteCount,
    vote_score: relation.vote_score ?? Math.max(0, upvoteCount - downvoteCount),
  };
}

function fallbackSkillsForCategory(categorySlug: string) {
  return fallbackSkills.filter((skill) => skill.category_slug === categorySlug);
}

function fallbackCategoryBySlug(categorySlug: string) {
  return fallbackCategories.find((category) => category.slug === categorySlug) ?? null;
}

function withResourceSummaries(skills: SkillSummary[]) {
  return skills.map((skill) => {
    const resources = fallbackResources[skill.slug] ?? [];
    return {
      ...skill,
      resource_count: resources.length,
      preview_thumbnails: resources
        .flatMap((resource) => resource.link.thumbnail_url ? [resource.link.thumbnail_url] : [])
        .slice(0, 3),
    };
  });
}

function normalizeSort(sort: ResourceSort | undefined): ResourceSort {
  return sort === "newest" ? "newest" : "popular";
}

function toSortTime(value: string | null | undefined) {
  const parsed = Date.parse(value ?? "");
  return Number.isNaN(parsed) ? 0 : parsed;
}

function resourceSorter(sort: ResourceSort) {
  return (a: SkillResource, b: SkillResource) => {
    if (sort === "popular") return (b.vote_score ?? b.upvote_count) - (a.vote_score ?? a.upvote_count);
    return toSortTime(b.created_at) - toSortTime(a.created_at);
  };
}

function fallbackResourceRows() {
  const skillBySlug = new Map(fallbackSkills.map((skill) => [skill.slug, skill]));
  const categoryBySlug = new Map(fallbackCategories.map((category) => [category.slug, category]));

  return Object.entries(fallbackResources).flatMap(([skillSlug, resources]) => {
    const skill = skillBySlug.get(skillSlug);
    if (!skill) return resources;
    const category = categoryBySlug.get(skill.category_slug) ?? null;
    return resources.map((resource) => ({
      ...resource,
      skill: {
        id: skill.id,
        slug: skill.slug,
        name: skill.name,
        category_slug: skill.category_slug,
        category_name: category?.name ?? null,
      },
    }));
  });
}

export async function getCategories(): Promise<CategorySummary[]> {
  const supabase = getSupabase();
  if (!supabase) return fallbackCategories;

  const { data } = await supabase
    .from("categories")
    .select("id, slug, name, description, updated_at")
    .eq("is_active", true)
    .order("name");

  return data?.length ? data : fallbackCategories;
}

export async function getCategory(categorySlug = badmintonCategory.slug): Promise<CategorySummary | null> {
  const supabase = getSupabase();
  if (!supabase) return fallbackCategoryBySlug(categorySlug);

  const { data } = await supabase
    .from("categories")
    .select("id, slug, name, description, updated_at")
    .eq("slug", categorySlug)
    .eq("is_active", true)
    .maybeSingle();

  return data ?? fallbackCategoryBySlug(categorySlug);
}

export async function getSkillsForCategory(categorySlug: string): Promise<{
  category: CategorySummary | null;
  skills: SkillSummary[];
}> {
  const supabase = getSupabase();
  if (!supabase) {
    const category = fallbackCategoryBySlug(categorySlug);
    return { category, skills: category ? withResourceSummaries(fallbackSkillsForCategory(category.slug)) : [] };
  }

  const category = await getCategory(categorySlug);
  if (!category) return { category: null, skills: [] };

  const { data } = await supabase
    .from("skills")
    .select("id, category_id, slug, name, description, updated_at")
    .eq("category_id", category.id)
    .eq("is_active", true)
    .order("name");

  const skillIds = (data ?? []).map((skill) => skill.id);
  const { data: relations } = skillIds.length
    ? await supabase
        .from("link_skill_relations")
        .select("skill_id, vote_score, links!inner(thumbnail_url)")
        .in("skill_id", skillIds)
        .eq("is_active", true)
        .eq("links.is_active", true)
        .order("vote_score", { ascending: false })
    : { data: [] };

  const counts = new Map<string, number>();
  const previews = new Map<string, string[]>();
  for (const relation of relations ?? []) {
    counts.set(relation.skill_id, (counts.get(relation.skill_id) ?? 0) + 1);
    const link = Array.isArray(relation.links) ? relation.links[0] : relation.links;
    const thumbnail = normalizeThumbnailUrl(link?.thumbnail_url, null);
    if (!thumbnail) continue;
    const current = previews.get(relation.skill_id) ?? [];
    if (current.length >= 3) continue;
    current.push(thumbnail);
    previews.set(relation.skill_id, current);
  }

  return {
    category,
    skills: (data ?? []).map((skill) => ({
      ...skill,
      category_slug: category.slug,
      resource_count: counts.get(skill.id) ?? 0,
      preview_thumbnails: previews.get(skill.id) ?? [],
    })),
  };
}

export async function getSkillResources(categorySlug: string, skillSlug: string, sortInput?: ResourceSort): Promise<{
  category: CategorySummary | null;
  skill: SkillSummary | null;
  resources: SkillResource[];
}> {
  const sort = normalizeSort(sortInput);
  const supabase = getSupabase();
  if (!supabase) {
    const category = fallbackCategoryBySlug(categorySlug);
    const skill = fallbackSkillsForCategory(categorySlug).find((item) => item.slug === skillSlug) ?? null;
    const resources = skill
      ? (fallbackResources[skillSlug] ?? []).map((resource) => ({
          ...resource,
          skill: {
            id: skill.id,
            slug: skill.slug,
            name: skill.name,
            category_slug: skill.category_slug,
            category_name: category?.name ?? null,
          },
        }))
        .sort(resourceSorter(sort))
      : [];
    return { category, skill, resources };
  }

  const { data: skill } = await supabase
    .from("skills")
    .select("id, category_id, slug, name, description, updated_at, categories!inner(id, slug, name, description, updated_at)")
    .eq("slug", skillSlug)
    .eq("categories.slug", categorySlug)
    .eq("is_active", true)
    .maybeSingle();

  if (!skill) return { category: null, skill: null, resources: [] };
  const category = Array.isArray(skill.categories) ? skill.categories[0] : skill.categories;
  if (!category) return { category: null, skill: null, resources: [] };

  const { data: relations } = await supabase
    .from("link_skill_relations")
    .select(`id, public_note, skill_level, ${RELATION_VOTE_SELECT}, created_at, links(${RESOURCE_LINK_SELECT})`)
    .eq("skill_id", skill.id)
    .eq("is_active", true)
    .order(sort === "newest" ? "created_at" : "vote_score", { ascending: false });

  return {
    category,
    skill: {
      id: skill.id,
      category_id: skill.category_id,
      category_slug: category.slug,
      slug: skill.slug,
      name: skill.name,
      description: skill.description,
      resource_count: relations?.length ?? 0,
      updated_at: skill.updated_at,
    },
    resources: (relations ?? []).flatMap((relation) => {
      const link = Array.isArray(relation.links) ? relation.links[0] : relation.links;
      if (!link) return [];
      return [
        {
          id: relation.id,
          public_note: relation.public_note,
          skill_level: relation.skill_level,
          ...relationVotes(relation),
          created_at: relation.created_at,
          link: shapeLinkWithContributor(link),
          skill: {
            id: skill.id,
            slug: skill.slug,
            name: skill.name,
            category_slug: category.slug,
            category_name: category.name,
          },
        },
      ];
    }),
  };
}

export async function getDiscoverSections(perCategorySkills = 12): Promise<DiscoverCategorySection[]> {
  const supabase = getSupabase();
  const categories = await getCategories();

  if (!supabase) {
    return categories.map((category) => {
      const skills = fallbackSkillsForCategory(category.slug);
      return {
        category,
        skills: skills.slice(0, perCategorySkills).map((skill) => {
          const resources = fallbackResources[skill.slug] ?? [];
          const latestResource = resources.find((resource) => resource.link.thumbnail_url);
          const latest = latestResource
            ? normalizeThumbnailUrl(latestResource.link.thumbnail_url, latestResource.link.url ?? null)
            : null;
          return { skill, latest_thumbnail: latest };
        }),
      };
    });
  }

  // For each category we want active skills and their latest resource thumbnail.
  const sections = await Promise.all(
    categories.map(async (category) => {
      const { skills } = await getSkillsForCategory(category.slug);
      const skillsWithResources = skills.filter((skill) => skill.resource_count > 0).slice(0, perCategorySkills);
      if (skillsWithResources.length === 0) {
        return { category, skills: [] as DiscoverSkillTile[] };
      }

      const { data: relations } = await supabase
        .from("link_skill_relations")
        .select("skill_id, created_at, links!inner(thumbnail_url)")
        .in("skill_id", skillsWithResources.map((skill) => skill.id))
        .eq("is_active", true)
        .eq("links.is_active", true)
        .order("created_at", { ascending: false });

      const latestThumbBySkill = new Map<string, string | null>();
      for (const relation of relations ?? []) {
        if (latestThumbBySkill.has(relation.skill_id)) continue;
        const link = Array.isArray(relation.links) ? relation.links[0] : relation.links;
        latestThumbBySkill.set(relation.skill_id, normalizeThumbnailUrl(link?.thumbnail_url, null));
      }

      return {
        category,
        skills: skillsWithResources.map((skill) => ({
          skill,
          latest_thumbnail: latestThumbBySkill.get(skill.id) ?? null,
        })),
      };
    }),
  );

  return sections.filter((section) => section.skills.length > 0);
}

export async function getCategoryWithSkillResources(
  categorySlug: string,
  perSkill = 8,
): Promise<{ category: CategorySummary | null; sections: SkillSection[] }> {
  const { category, skills } = await getSkillsForCategory(categorySlug);
  if (!category) return { category: null, sections: [] };

  const sectionsRaw = await Promise.all(
    skills
      .filter((skill) => skill.resource_count > 0)
      .map(async (skill) => {
        const data = await getSkillResources(categorySlug, skill.slug, "popular");
        return { skill: data.skill ?? skill, resources: data.resources.slice(0, perSkill) };
      }),
  );

  return { category, sections: sectionsRaw.filter((section) => section.resources.length > 0) };
}

/**
 * For the Saved screen — returns full `SkillResource` rows so the same
 * `ResourceCard` component used on the Skill screen renders them. The
 * "primary" relation per link is the highest-upvoted one (matching the
 * sort the user sees on the skill page).
 */
export async function getSavedResources(linkIds: string[]): Promise<SkillResource[]> {
  if (linkIds.length === 0) return [];
  const supabase = getSupabase();

  if (!supabase) {
    return fallbackResourceRows().filter((resource) => linkIds.includes(resource.link.id));
  }

  const { data: relations } = await supabase
    .from("link_skill_relations")
    .select(
      `id, public_note, skill_level, ${RELATION_VOTE_SELECT}, created_at, link_id, links!inner(${RESOURCE_LINK_SELECT}), skills!inner(id, slug, name, categories!inner(slug, name))`,
    )
    .in("link_id", linkIds)
    .eq("is_active", true)
    .eq("links.is_active", true)
    .order("vote_score", { ascending: false });

  const byLink = new Map<string, SkillResource>();
  for (const relation of relations ?? []) {
    if (byLink.has(relation.link_id)) continue;
    const link = Array.isArray(relation.links) ? relation.links[0] : relation.links;
    if (!link) continue;
    const skill = Array.isArray(relation.skills) ? relation.skills[0] : relation.skills;
    const category = skill
      ? Array.isArray(skill.categories)
        ? skill.categories[0]
        : skill.categories
      : null;
    const resource: SkillResource = {
      id: relation.id,
      public_note: relation.public_note,
      skill_level: relation.skill_level,
      ...relationVotes(relation),
      created_at: relation.created_at ?? link.created_at ?? null,
      link: shapeLinkWithContributor(link),
    };
    if (skill) {
      resource.skill = {
        id: skill.id,
        slug: skill.slug,
        name: skill.name,
        category_slug: category?.slug ?? "",
        category_name: category?.name ?? null,
      };
    }
    byLink.set(relation.link_id, resource);
  }

  // Preserve caller order (Saved is "most recently saved first" from local state).
  return linkIds
    .map((id) => byLink.get(id))
    .filter((resource): resource is SkillResource => Boolean(resource));
}
