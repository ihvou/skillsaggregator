import {
  badmintonCategory,
  badmintonSkills,
  buildSkillResourceSections,
  fallbackCategories,
  fallbackResources,
  fallbackSkills,
  sortResources,
  type CategorySummary,
  type ContributorProfileSummary,
  type SkillResource,
  type SkillSummary,
} from "@skillsaggregator/shared";
import {
  type JoinedRelationRow,
  RELATION_VOTE_SELECT,
  RESOURCE_LINK_SELECT,
  type RelationWithSkillId,
  shapeJoinedRelationResource,
  shapeLinkWithContributor,
  shapeRelationResource,
  unwrapRow,
} from "./resourceRows";
import { getPublicSupabase, getServiceSupabase } from "./supabase";
import { normalizeThumbnailUrl } from "./thumbnails";

export interface CatalogData {
  category: CategorySummary;
  skills: SkillSummary[];
}

export type ResourceSort = "newest" | "popular";
export interface CatalogOptions {
  publicOnly?: boolean;
}

function categorySkills(categorySlug: string) {
  return fallbackSkills.filter((skill) => skill.category_slug === categorySlug);
}

function withFallbackResourceCounts(skills: SkillSummary[]) {
  return skills.map((skill) => ({
    ...skill,
    resource_count: fallbackResources[skill.slug]?.length ?? skill.resource_count ?? 0,
  }));
}

export function getPublishMinResources() {
  const raw = process.env.COLLECT_PUBLISH_MIN_RESOURCES ?? process.env.PUBLISH_MIN_RESOURCES;
  const parsed = Number(raw ?? 3);
  return Number.isFinite(parsed) && parsed >= 0 ? Math.floor(parsed) : 3;
}

export function isPublishedSkill(skill: Pick<SkillSummary, "resource_count">) {
  return skill.resource_count >= getPublishMinResources();
}

function filterPublicSkills(skills: SkillSummary[], publicOnly?: boolean) {
  return publicOnly ? skills.filter(isPublishedSkill) : skills;
}

export async function getCategories(): Promise<CategorySummary[]> {
  const supabase = getPublicSupabase();
  if (!supabase) return fallbackCategories;

  const { data } = await supabase
    .from("categories")
    .select("id, slug, name, description, updated_at")
    .eq("is_active", true)
    .order("name");

  return data?.length ? data : fallbackCategories;
}

export async function getCatalog(
  categorySlug = badmintonCategory.slug,
  options: CatalogOptions = {},
): Promise<CatalogData> {
  const supabase = getPublicSupabase();
  if (!supabase) {
    const category = fallbackCategories.find((item) => item.slug === categorySlug) ?? badmintonCategory;
    return {
      category,
      skills: filterPublicSkills(withFallbackResourceCounts(categorySkills(category.slug)), options.publicOnly),
    };
  }

  const { data: category } = await supabase
    .from("categories")
    .select("id, slug, name, description, updated_at")
    .eq("slug", categorySlug)
    .eq("is_active", true)
    .single();

  const { data: skills } = await supabase
    .from("skills")
    .select("id, category_id, slug, name, description, updated_at")
    .eq("category_id", category?.id ?? badmintonCategory.id)
    .eq("is_active", true)
    .order("name");

  const skillIds = (skills ?? []).map((skill) => skill.id);
  const { data: resourceCounts } = skillIds.length
    ? await supabase.rpc("get_skill_resource_counts", { p_skill_ids: skillIds })
    : { data: [] };

  const counts = new Map<string, number>();
  for (const count of resourceCounts ?? []) {
    counts.set(count.skill_id, Number(count.resource_count));
  }

  return {
    category: category ?? badmintonCategory,
    skills: filterPublicSkills(
      (skills ?? categorySkills(categorySlug)).map((skill) => ({
        ...skill,
        category_slug: category?.slug ?? categorySlug,
        resource_count: counts.get(skill.id) ?? 0,
      })),
      options.publicOnly,
    ),
  };
}

export async function getAllCatalogs(options: CatalogOptions = {}): Promise<Array<CatalogData>> {
  const supabase = getPublicSupabase();
  if (!supabase) {
    return fallbackCategories.map((category) => ({
      category,
      skills: filterPublicSkills(withFallbackResourceCounts(categorySkills(category.slug)), options.publicOnly),
    }));
  }

  const categories = await getCategories();
  return Promise.all(categories.map((category) => getCatalog(category.slug, options)));
}

export async function getSkillPage(categorySlug: string, skillSlug: string) {
  const supabase = getPublicSupabase();
  if (!supabase) {
    const category = fallbackCategories.find((item) => item.slug === categorySlug) ?? null;
    const skills = category ? categorySkills(category.slug) : [];
    const skill = skills.find((item) => item.slug === skillSlug) ?? null;
    return {
      category,
      skill: skill
        ? {
            ...skill,
            resource_count: fallbackResources[skillSlug]?.length ?? 0,
          }
        : null,
      resources: skill
        ? (fallbackResources[skillSlug] ?? []).map((resource) => ({
            ...resource,
            link: shapeLinkWithContributor(resource.link),
            skill: {
              id: skill.id,
              slug: skill.slug,
              name: skill.name,
              category_slug: skill.category_slug,
              category_name: category?.name ?? null,
            },
          }))
        : [],
      relatedSkills: skill
        ? filterPublicSkills(withFallbackResourceCounts(skills), true)
            .filter((item) => item.slug !== skillSlug)
            .slice(0, 4)
        : [],
    };
  }

  const { data: skillRow } = await supabase
    .from("skills")
    .select("id, category_id, slug, name, description, updated_at, categories!inner(id, slug, name, description)")
    .eq("slug", skillSlug)
    .eq("categories.slug", categorySlug)
    .eq("is_active", true)
    .single();

  if (!skillRow) return { category: null, skill: null, resources: [], relatedSkills: [] };
  const category = Array.isArray(skillRow.categories) ? skillRow.categories[0] : skillRow.categories;
  if (!category) return { category: null, skill: null, resources: [], relatedSkills: [] };

  const { data: resources } = await supabase
    .from("link_skill_relations")
    .select(
      `id, public_note, skill_level, ${RELATION_VOTE_SELECT}, created_at, links(${RESOURCE_LINK_SELECT})`,
    )
    .eq("skill_id", skillRow.id)
    .eq("is_active", true)
    .order("value_score", { ascending: false, nullsFirst: false })
    .order("vote_score", { ascending: false })
    .order("created_at", { ascending: false });

  const { data: siblings } = await supabase
    .from("skills")
    .select("id, category_id, slug, name, description, updated_at")
    .eq("category_id", skillRow.category_id)
    .eq("is_active", true)
    .neq("id", skillRow.id)
    .limit(4);

  const shapedResources = sortResources(
    ((resources ?? []) as RelationWithSkillId[]).flatMap((relation) => {
      const resource = shapeRelationResource(relation, {
        id: skillRow.id,
        slug: skillRow.slug,
        name: skillRow.name,
        category_slug: category.slug,
        category_name: category.name,
      });
      return resource ? [resource] : [];
    }),
    "popular",
  );

  return {
    category,
    skill: {
      id: skillRow.id,
      category_id: skillRow.category_id,
      category_slug: category.slug,
      slug: skillRow.slug,
      name: skillRow.name,
      description: skillRow.description,
      resource_count: shapedResources.length,
      updated_at: skillRow.updated_at,
    } satisfies SkillSummary,
    resources: shapedResources,
    relatedSkills: (siblings ?? []).map((skill) => ({
      ...skill,
      category_slug: category.slug,
      resource_count: 0,
    })),
  };
}

export interface DiscoverSkillTile {
  skill: SkillSummary;
  latest_thumbnail: string | null;
}

export interface DiscoverCategorySection {
  category: CategorySummary;
  skills: DiscoverSkillTile[];
}

export interface SkillSection {
  skill: SkillSummary;
  resources: SkillResource[];
}

export interface CategoryBrowserData {
  category: CategorySummary | null;
  skills: SkillSummary[];
  resources: SkillResource[];
}

const RELATION_PAGE_SIZE = 1000;

type PublicSupabaseClient = NonNullable<ReturnType<typeof getPublicSupabase>>;

async function fetchActiveSkillRelations(
  supabase: PublicSupabaseClient,
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
      .eq("links.is_active", true)
      .order("value_score", { ascending: false, nullsFirst: false })
      .order("vote_score", { ascending: false })
      .order("created_at", { ascending: false })
      .range(from, to);

    if (error) {
      console.warn("skill_relations_page_load_failed", error.message);
      break;
    }
    const page = (data ?? []) as RelationWithSkillId[];
    relations.push(...page);
    if (page.length < RELATION_PAGE_SIZE) break;
  }
  return relations;
}

async function fetchLatestSkillThumbnail(
  supabase: PublicSupabaseClient,
  skillId: string,
) {
  const { data } = await supabase
    .from("link_skill_relations")
    .select("created_at, links!inner(thumbnail_url, thumbnail_storage_path, canonical_url, url)")
    .eq("skill_id", skillId)
    .eq("is_active", true)
    .eq("links.is_active", true)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const link = unwrapRow(data?.links);
  return normalizeThumbnailUrl(
    link?.thumbnail_storage_path ?? link?.thumbnail_url ?? null,
    link?.canonical_url ?? link?.url ?? null,
    link?.thumbnail_storage_path ? link?.thumbnail_url ?? null : null,
  );
}

/**
 * Home-page rollup: each active category with up to N most-popular skills
 * and the latest resource thumbnail per skill (used as the tile artwork).
 */
export async function getDiscoverSections(perCategorySkills: number | null = null): Promise<DiscoverCategorySection[]> {
  const supabase = getPublicSupabase();
  const categories = await getCategories();

  if (!supabase) {
    return categories.map((category) => {
      const skills = filterPublicSkills(withFallbackResourceCounts(categorySkills(category.slug)), true);
      return {
        category,
        skills: skills.slice(0, perCategorySkills ?? undefined).map((skill) => {
          const resources = fallbackResources[skill.slug] ?? [];
          const latest =
            resources
              .map((resource) =>
                normalizeThumbnailUrl(resource.link.thumbnail_url, resource.link.canonical_url),
              )
              .find(Boolean) ?? null;
          return { skill, latest_thumbnail: latest };
        }),
      };
    });
  }

  const sections = await Promise.all(
    categories.map(async (category): Promise<DiscoverCategorySection> => {
      const { skills } = await getCatalog(category.slug, { publicOnly: true });
      const skillsWithResources = skills.slice(0, perCategorySkills ?? undefined);
      if (skillsWithResources.length === 0) {
        return { category, skills: [] };
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

/**
 * Category-page rollup: each skill with up to N top resources for the
 * horizontal-scroll thumbnail rail.
 */
export async function getCategoryWithSkillResources(
  categorySlug: string,
  perSkill = 12,
): Promise<{ category: CategorySummary | null; sections: SkillSection[] }> {
  const supabase = getPublicSupabase();
  const { category, skills } = await getCatalog(categorySlug, { publicOnly: true });
  if (!category) return { category: null, sections: [] };

  if (!supabase) {
    const resources = sortResources(
      skills.flatMap((skill) =>
        (fallbackResources[skill.slug] ?? []).map((resource) => ({
          ...resource,
          link: shapeLinkWithContributor(resource.link),
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
    return {
      category,
      sections: buildSkillResourceSections(skills, resources, { perSkill }),
    };
  }

  if (skills.length === 0) return { category, sections: [] };

  const skillById = new Map(skills.map((skill) => [skill.id, skill]));
  const resources = sortResources(
    (await fetchActiveSkillRelations(supabase, skills.map((skill) => skill.id))).flatMap((relation) => {
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
    }),
    "popular",
  );

  return { category, sections: buildSkillResourceSections(skills, resources, { perSkill }) };
}

export async function getCategoryBrowserData(categorySlug: string): Promise<CategoryBrowserData> {
  const supabase = getPublicSupabase();
  const { category, skills } = await getCatalog(categorySlug, { publicOnly: true });
  if (!category) return { category: null, skills: [], resources: [] };

  if (!supabase) {
    const resources = sortResources(
      skills.flatMap((skill) =>
        (fallbackResources[skill.slug] ?? []).map((resource) => ({
          ...resource,
          link: shapeLinkWithContributor(resource.link),
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
    return { category, skills, resources };
  }

  if (skills.length === 0) {
    return { category, skills, resources: [] };
  }

  const skillById = new Map(skills.map((skill) => [skill.id, skill]));
  const resources = sortResources(
    (await fetchActiveSkillRelations(supabase, skills.map((skill) => skill.id))).flatMap((relation) => {
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
    }),
    "popular",
  );

  return { category, skills, resources };
}

export interface AdminSuggestion {
  id: string;
  type: string;
  status: string;
  origin_type: string;
  origin_name: string | null;
  payload_json: Record<string, unknown>;
  evidence_json: Record<string, unknown> | null;
  triangulation_json: Record<string, unknown> | null;
  confidence: number | null;
  created_at: string;
  category: { name: string; slug: string } | null;
  skill: { name: string; slug: string } | null;
  link: { title: string | null; domain: string | null; thumbnail_url: string | null; thumbnail_storage_path?: string | null } | null;
  author: { display_name: string } | null;
}

export interface ContributorProfile extends ContributorProfileSummary {
  bio: string | null;
  created_at: string;
}

export async function getContributorProfiles(): Promise<ContributorProfile[]> {
  const supabase = getPublicSupabase();
  if (!supabase) return [];

  const { data, error } = await supabase
    .from("contributor_profiles")
    .select("id, slug, display_name, bio, avatar_url, accepted_count, created_at")
    .order("accepted_count", { ascending: false })
    .order("created_at", { ascending: true });

  if (error) {
    console.warn("contributors_load_failed", error.message);
    return [];
  }
  return data ?? [];
}

export async function getContributorProfileBySlug(slug: string): Promise<{
  profile: ContributorProfile | null;
  resources: SkillResource[];
}> {
  const supabase = getPublicSupabase();
  if (!supabase) return { profile: null, resources: [] };

  const { data: profile, error: profileError } = await supabase
    .from("contributor_profiles")
    .select("id, slug, display_name, bio, avatar_url, accepted_count, created_at")
    .eq("slug", slug)
    .maybeSingle();
  if (profileError) {
    console.warn("contributor_profile_load_failed", profileError.message);
    return { profile: null, resources: [] };
  }
  if (!profile) return { profile: null, resources: [] };

  const { data: relations, error: relationsError } = await supabase
    .from("link_skill_relations")
    .select(
      `id, public_note, skill_level, ${RELATION_VOTE_SELECT}, created_at, links!inner(${RESOURCE_LINK_SELECT}), skills!inner(id, slug, name, categories!inner(slug, name))`,
    )
    .eq("is_active", true)
    .eq("links.is_active", true)
    .eq("links.contributor_profile_id", profile.id)
    .order("created_at", { ascending: false })
    .limit(50);
  if (relationsError) {
    console.warn("contributor_resources_load_failed", relationsError.message);
    return { profile, resources: [] };
  }

  const resources: SkillResource[] = ((relations ?? []) as JoinedRelationRow[]).flatMap((relation) => {
    const resource = shapeJoinedRelationResource(relation);
    return resource ? [resource] : [];
  });

  return { profile, resources };
}

export async function getPendingSuggestions(): Promise<AdminSuggestion[]> {
  const supabase = getServiceSupabase();
  if (!supabase) {
    return [
      {
        id: "demo-suggestion-1",
        type: "LINK_ADD",
        status: "pending",
        origin_type: "agent",
        origin_name: "link-searcher",
        payload_json: {
          title: "Badminton forehand smash tutorials",
          canonical_url: "https://www.youtube.com/results?search_query=badminton+forehand+smash+tutorial",
          target_skill_id: badmintonSkills[2]?.id,
          public_note: "Clear demonstration of rotation, contact height, and recovery after the smash.",
          skill_level: "intermediate",
          thumbnail_url: null,
        },
        evidence_json: { source: "demo_fixture", summary: "Demo suggestion shown while Supabase env is missing." },
        triangulation_json: {
          votes: [
            { model: "claude-haiku", approve: true, reason: "Relevant technique focus" },
            { model: "gpt-4o-mini", approve: true, reason: "Clear match" },
            { model: "perplexity-sonar-small", approve: false, reason: "Needs source review" },
          ],
        },
        confidence: 0.78,
        created_at: new Date().toISOString(),
        category: { name: "Badminton", slug: "badminton" },
        skill: { name: "Forehand smash", slug: "forehand-smash" },
        link: null,
        author: { display_name: "AI Scout" },
      },
    ];
  }

  const { data, error } = await supabase
    .from("suggestions")
    .select("id, type, status, origin_type, origin_name, payload_json, evidence_json, triangulation_json, confidence, created_at, categories(name, slug), skills(name, slug), links(title, domain, thumbnail_url, thumbnail_storage_path), internal_users(display_name)")
    .eq("status", "pending")
    .order("created_at", { ascending: false });

  if (error) throw error;
  return (data ?? []).map((item) => ({
    id: item.id,
    type: item.type,
    status: item.status,
    origin_type: item.origin_type,
    origin_name: item.origin_name,
    payload_json: (item.payload_json ?? {}) as Record<string, unknown>,
    evidence_json: item.evidence_json as Record<string, unknown> | null,
    triangulation_json: item.triangulation_json as Record<string, unknown> | null,
    confidence: item.confidence,
    created_at: item.created_at,
    category: (Array.isArray(item.categories) ? item.categories[0] : item.categories) ?? null,
    skill: (Array.isArray(item.skills) ? item.skills[0] : item.skills) ?? null,
    link: (Array.isArray(item.links) ? item.links[0] : item.links) ?? null,
    author: (Array.isArray(item.internal_users) ? item.internal_users[0] : item.internal_users) ?? null,
  }));
}

export async function getAgentRuns() {
  const supabase = getServiceSupabase();
  if (!supabase) return [];

  const { data, error } = await supabase
    .from("agent_runs")
    .select("id, agent_type, target_type, target_id, status, suggestions_created, triangulation_calls, cost_usd, error_message, started_at, completed_at")
    .order("started_at", { ascending: false })
    .limit(50);

  if (error) throw error;
  const runs = data ?? [];
  const runIds = runs.map((run) => run.id);
  const { data: events, error: eventsError } = runIds.length
    ? await supabase
        .from("agent_run_events")
        .select("run_id, level, event_type, message, created_at")
        .in("run_id", runIds)
        .order("created_at", { ascending: false })
    : { data: [], error: null };
  if (eventsError) throw eventsError;

  const latestEventByRun = new Map<
    string,
    { run_id: string; level: string; event_type: string; message: string; created_at: string }
  >();
  for (const event of events ?? []) {
    if (!latestEventByRun.has(event.run_id)) latestEventByRun.set(event.run_id, event);
  }

  return runs.map((run) => ({
    ...run,
    latest_event: latestEventByRun.get(run.id) ?? null,
  }));
}
