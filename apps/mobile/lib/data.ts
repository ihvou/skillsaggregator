import {
  badmintonCategory,
  fallbackCategories,
  fallbackResources,
  fallbackSkills,
  sortResources,
  type CategorySummary,
  type ContributorProfileSummary,
  type LinkResource,
  type ResourceSort,
  type SkillResource,
  type SkillSummary,
} from "@skillsaggregator/shared";
import { getSupabase } from "./supabase";
import { normalizeThumbnailUrl } from "./thumbnails";

export type DiscoverSkillTile = {
  skill: SkillSummary;
  latest_thumbnail: string | null;
};

export type DiscoverCategorySection = {
  category: CategorySummary;
  skills: DiscoverSkillTile[];
};

const RESOURCE_LINK_SELECT =
  "id, url, canonical_url, domain, title, description, thumbnail_url, thumbnail_storage_path, duration_seconds, like_count, comment_count, share_count, favorite_count, creator_handle, creator_url, scoring_strategy, content_type, created_at, contributor_profile:contributor_profiles(id, slug, display_name, avatar_url, accepted_count)";
const RELATION_VOTE_SELECT = "upvote_count, downvote_count, vote_score, value_score, curator_score, curator_reviews";

function shapeLinkWithContributor<
  TLink extends {
    id: string;
    contributor_profile?: unknown;
    domain?: string | null;
    title?: string | null;
    description?: string | null;
    thumbnail_url?: string | null;
    thumbnail_storage_path?: string | null;
    canonical_url?: string | null;
    url?: string | null;
    scoring_strategy?: string | null;
    content_type?: string | null;
  },
>(link: TLink) {
  const contributor = Array.isArray(link.contributor_profile)
    ? link.contributor_profile[0]
    : link.contributor_profile;
  const normalizedContributor: ContributorProfileSummary | null =
    contributor && typeof contributor === "object" && "id" in contributor
      ? {
          id: String(contributor.id),
          slug:
            "slug" in contributor && typeof contributor.slug === "string"
              ? contributor.slug
              : "",
          display_name:
            "display_name" in contributor && typeof contributor.display_name === "string"
              ? contributor.display_name
              : "Contributor",
          avatar_url:
            "avatar_url" in contributor && typeof contributor.avatar_url === "string"
              ? contributor.avatar_url
              : null,
          accepted_count:
            "accepted_count" in contributor && typeof contributor.accepted_count === "number"
              ? contributor.accepted_count
              : 0,
        }
      : null;
  const url = link.url ?? link.canonical_url ?? "";
  return {
    ...link,
    url,
    canonical_url: link.canonical_url ?? url,
    domain: link.domain ?? "",
    title: link.title ?? null,
    description: link.description ?? null,
    thumbnail_url: normalizeThumbnailUrl(
      link.thumbnail_storage_path ?? link.thumbnail_url ?? null,
      link.canonical_url ?? url,
      link.thumbnail_storage_path ? link.thumbnail_url ?? null : null,
    ),
    ...(link.scoring_strategy === "transcript_llm" || link.scoring_strategy === "engagement_authority"
      ? { scoring_strategy: link.scoring_strategy }
      : {}),
    content_type:
      link.content_type === "video" ||
      link.content_type === "article" ||
      link.content_type === "podcast" ||
      link.content_type === "course"
        ? link.content_type
        : null,
    contributor_profile: normalizedContributor,
  } satisfies LinkResource;
}

function relationVotes(relation: {
  upvote_count?: number | null;
  downvote_count?: number | null;
  vote_score?: number | null;
  value_score?: number | null;
  curator_score?: number | null;
  curator_reviews?: number | null;
}) {
  const upvoteCount = relation.upvote_count ?? 0;
  const downvoteCount = relation.downvote_count ?? 0;
  return {
    upvote_count: upvoteCount,
    downvote_count: downvoteCount,
    vote_score: relation.vote_score ?? Math.max(0, upvoteCount - downvoteCount),
    value_score: relation.value_score ?? null,
    curator_score: relation.curator_score ?? null,
    curator_reviews: relation.curator_reviews ?? null,
  };
}

const RELATION_PAGE_SIZE = 1000;

type SupabaseClient = NonNullable<ReturnType<typeof getSupabase>>;

type LinkRow = {
  id: string;
  url?: string | null;
  canonical_url?: string | null;
  domain?: string | null;
  title?: string | null;
  description?: string | null;
  thumbnail_url?: string | null;
  thumbnail_storage_path?: string | null;
  duration_seconds?: number | null;
  like_count?: number | null;
  comment_count?: number | null;
  share_count?: number | null;
  favorite_count?: number | null;
  creator_handle?: string | null;
  creator_url?: string | null;
  scoring_strategy?: string | null;
  content_type?: string | null;
  created_at?: string | null;
  contributor_profile?: unknown;
};

type RelationWithSkillId = {
  id: string;
  skill_id?: string | null;
  public_note?: string | null;
  skill_level?: SkillResource["skill_level"];
  upvote_count?: number | null;
  downvote_count?: number | null;
  vote_score?: number | null;
  value_score?: number | null;
  curator_score?: number | null;
  curator_reviews?: number | null;
  created_at?: string | null;
  links?: LinkRow | LinkRow[] | null;
};

function unwrapRow<T>(value: T | T[] | null | undefined): T | null {
  return Array.isArray(value) ? value[0] ?? null : value ?? null;
}

async function fetchActiveSkillRelations(
  supabase: SupabaseClient,
  skillIds: string[],
): Promise<RelationWithSkillId[]> {
  const relations: RelationWithSkillId[] = [];
  for (let from = 0; ; from += RELATION_PAGE_SIZE) {
    const to = from + RELATION_PAGE_SIZE - 1;
    const { data, error } = await supabase
      .from("link_skill_relations")
      .select(
        `id, skill_id, public_note, skill_level, ${RELATION_VOTE_SELECT}, created_at, links!inner(${RESOURCE_LINK_SELECT})`,
      )
      .in("skill_id", skillIds)
      .eq("is_active", true)
      .eq("published", true)
      .eq("links.is_active", true)
      .order("curator_score", { ascending: false, nullsFirst: false })
      .order("curator_reviews", { ascending: false, nullsFirst: false })
      .order("value_score", { ascending: false, nullsFirst: false })
      .order("vote_score", { ascending: false })
      .order("created_at", { ascending: false })
      .range(from, to);

    if (error) {
      console.warn("mobile_skill_relations_page_load_failed", error.message);
      break;
    }
    const page = (data ?? []) as RelationWithSkillId[];
    relations.push(...page);
    if (page.length < RELATION_PAGE_SIZE) break;
  }
  return relations;
}

async function fetchLatestSkillThumbnail(
  supabase: SupabaseClient,
  skillId: string,
) {
  const { data } = await supabase
    .from("link_skill_relations")
    .select("created_at, links!inner(thumbnail_url, thumbnail_storage_path, canonical_url, url)")
    .eq("skill_id", skillId)
    .eq("is_active", true)
    .eq("published", true)
    .eq("links.is_active", true)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const link = unwrapRow(data?.links as LinkRow | LinkRow[] | null | undefined);
  return normalizeThumbnailUrl(
    link?.thumbnail_storage_path ?? link?.thumbnail_url ?? null,
    link?.canonical_url ?? link?.url ?? null,
    link?.thumbnail_storage_path ? link?.thumbnail_url ?? null : null,
  );
}

function shapeRelationResource(
  relation: RelationWithSkillId,
  skill: Pick<SkillSummary, "id" | "slug" | "name" | "category_slug"> & {
    category_name?: string | null;
  },
): SkillResource | null {
  const link = unwrapRow(relation.links);
  if (!link) return null;
  return {
    id: relation.id,
    public_note: relation.public_note ?? null,
    skill_level: relation.skill_level ?? null,
    ...relationVotes(relation),
    created_at: relation.created_at ?? link.created_at ?? null,
    link: shapeLinkWithContributor(link),
    skill: {
      id: skill.id,
      slug: skill.slug,
      name: skill.name,
      category_slug: skill.category_slug,
      category_name: skill.category_name ?? null,
    },
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
  const { data: resourceCounts } = skillIds.length
    ? await supabase.rpc("get_skill_resource_counts", { p_skill_ids: skillIds })
    : { data: [] };

  const counts = new Map<string, number>();
  for (const count of resourceCounts ?? []) {
    counts.set(count.skill_id, Number(count.resource_count));
  }

  return {
    category,
    skills: (data ?? []).map((skill) => ({
      ...skill,
      category_slug: category.slug,
      resource_count: counts.get(skill.id) ?? 0,
      preview_thumbnails: [],
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
      ? sortResources(
          (fallbackResources[skillSlug] ?? []).map((resource) => ({
            ...resource,
            skill: {
              id: skill.id,
              slug: skill.slug,
              name: skill.name,
              category_slug: skill.category_slug,
              category_name: category?.name ?? null,
            },
          })),
          sort,
        )
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
    .select(`id, public_note, skill_level, ${RELATION_VOTE_SELECT}, created_at, links!inner(${RESOURCE_LINK_SELECT})`)
    .eq("skill_id", skill.id)
    .eq("is_active", true)
    .eq("published", true)
    .eq("links.is_active", true)
    .order(sort === "newest" ? "created_at" : "curator_score", { ascending: false, nullsFirst: false })
    .order(sort === "newest" ? "id" : "curator_reviews", { ascending: false, nullsFirst: false })
    .order(sort === "newest" ? "id" : "value_score", { ascending: false, nullsFirst: false })
    .order(sort === "newest" ? "id" : "vote_score", { ascending: false });

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
    resources: sortResources(
      ((relations ?? []) as RelationWithSkillId[]).flatMap((relation) => {
        const resource = shapeRelationResource(relation, {
          id: skill.id,
          slug: skill.slug,
          name: skill.name,
          category_slug: category.slug,
          category_name: category.name,
        });
        return resource ? [resource] : [];
      }),
      sort,
    ),
  };
}

export async function getDiscoverSections(perCategorySkills: number | null = null): Promise<DiscoverCategorySection[]> {
  const supabase = getSupabase();
  const categories = await getCategories();

  if (!supabase) {
    return categories.map((category) => {
      const skills = fallbackSkillsForCategory(category.slug);
      return {
        category,
        skills: skills.slice(0, perCategorySkills ?? undefined).map((skill) => {
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
      const skillsWithResources = skills
        .filter((skill) => skill.resource_count > 0)
        .slice(0, perCategorySkills ?? undefined);
      if (skillsWithResources.length === 0) {
        return { category, skills: [] as DiscoverSkillTile[] };
      }

      const latestThumbBySkill = new Map(
        await Promise.all(
          skillsWithResources.map(async (skill) => [
            skill.id,
            await fetchLatestSkillThumbnail(supabase, skill.id),
          ] as const),
        ),
      );

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
): Promise<{
  category: CategorySummary | null;
  skills: SkillSummary[];
  resources: SkillResource[];
}> {
  const { category, skills } = await getSkillsForCategory(categorySlug);
  if (!category) return { category: null, skills: [], resources: [] };

  const supabase = getSupabase();
  const skillsWithResources = skills.filter((skill) => skill.resource_count > 0);
  if (!supabase) {
    const resources = sortResources(
      skillsWithResources.flatMap((skill) =>
        (fallbackResources[skill.slug] ?? []).map((resource) => ({
          ...resource,
          skill: {
            id: skill.id,
            slug: skill.slug,
            name: skill.name,
            category_slug: skill.category_slug,
            category_name: category.name,
          },
        })),
      ),
      "popular",
    );
    return { category, skills: skillsWithResources, resources };
  }

  if (skillsWithResources.length === 0) {
    return { category, skills: skillsWithResources, resources: [] };
  }

  const skillById = new Map(skillsWithResources.map((skill) => [skill.id, skill]));
  const resources = sortResources(
    (await fetchActiveSkillRelations(supabase, skillsWithResources.map((skill) => skill.id))).flatMap(
      (relation) => {
        const skill = relation.skill_id ? skillById.get(relation.skill_id) : null;
        if (!skill) return [];
        const resource = shapeRelationResource(relation, {
          id: skill.id,
          slug: skill.slug,
          name: skill.name,
          category_slug: skill.category_slug,
          category_name: category.name,
        });
        return resource ? [resource] : [];
      },
    ),
    "popular",
  );

  return { category, skills: skillsWithResources, resources };
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
    .eq("published", true)
    .eq("links.is_active", true)
    .order("curator_score", { ascending: false, nullsFirst: false })
    .order("curator_reviews", { ascending: false, nullsFirst: false })
    .order("value_score", { ascending: false, nullsFirst: false })
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
