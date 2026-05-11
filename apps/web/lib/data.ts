import {
  badmintonCategory,
  badmintonSkills,
  fallbackCategories,
  fallbackResources,
  fallbackSkills,
  type CategorySummary,
  type SkillLevel,
  type SkillResource,
  type SkillSummary,
} from "@skillsaggregator/shared";
import { getPublicSupabase, getServiceSupabase } from "./supabase";

export interface CatalogData {
  category: CategorySummary;
  skills: SkillSummary[];
}

export type ResourceSort = "newest" | "popular";

export interface ResourceListingFilters {
  categorySlug?: string;
  level?: SkillLevel | null;
  sort?: ResourceSort;
  page?: number;
  pageSize?: number;
}

export interface ResourceListingData {
  categories: CategorySummary[];
  category: CategorySummary | null;
  skills: SkillSummary[];
  resources: SkillResource[];
  totalCount: number;
  page: number;
  pageSize: number;
  pageCount: number;
  level: SkillLevel | null;
  sort: ResourceSort;
}

const DEFAULT_PAGE_SIZE = 20;

function normalizeSort(sort: ResourceSort | undefined): ResourceSort {
  return sort === "popular" ? "popular" : "newest";
}

function normalizePage(page: number | undefined) {
  return Number.isFinite(page) && page && page > 0 ? Math.floor(page) : 1;
}

function categorySkills(categorySlug: string) {
  return fallbackSkills.filter((skill) => skill.category_slug === categorySlug);
}

function fallbackResourceRows() {
  const skillBySlug = new Map(fallbackSkills.map((skill) => [skill.slug, skill]));
  return Object.entries(fallbackResources).flatMap(([skillSlug, resources]) => {
    const skill = skillBySlug.get(skillSlug);
    const category = skill
      ? fallbackCategories.find((item) => item.slug === skill.category_slug) ?? null
      : null;
    return resources.map((resource) => {
      if (!skill) return resource;
      return {
        ...resource,
        skill: {
          id: skill.id,
          slug: skill.slug,
          name: skill.name,
          category_slug: skill.category_slug,
          category_name: category?.name ?? null,
        },
      };
    });
  });
}

function resourceSorter(sort: ResourceSort) {
  return (a: SkillResource, b: SkillResource) => {
    if (sort === "popular") return b.upvote_count - a.upvote_count;
    return Date.parse(b.created_at ?? "") - Date.parse(a.created_at ?? "");
  };
}

function fallbackListing(filters: ResourceListingFilters): ResourceListingData {
  const sort = normalizeSort(filters.sort);
  const page = normalizePage(filters.page);
  const pageSize = filters.pageSize ?? DEFAULT_PAGE_SIZE;
  const category = filters.categorySlug
    ? fallbackCategories.find((item) => item.slug === filters.categorySlug) ?? null
    : null;
  const skills = category ? categorySkills(category.slug) : fallbackSkills;
  const skillIds = new Set(skills.map((skill) => skill.id));
  const filtered = fallbackResourceRows()
    .filter((resource) => !filters.categorySlug || (resource.skill && skillIds.has(resource.skill.id)))
    .filter((resource) => !filters.level || resource.skill_level === filters.level)
    .sort(resourceSorter(sort));
  const offset = (page - 1) * pageSize;

  return {
    categories: fallbackCategories,
    category,
    skills,
    resources: filtered.slice(offset, offset + pageSize),
    totalCount: filtered.length,
    page,
    pageSize,
    pageCount: Math.max(1, Math.ceil(filtered.length / pageSize)),
    level: filters.level ?? null,
    sort,
  };
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

export async function getCatalog(categorySlug = badmintonCategory.slug): Promise<CatalogData> {
  const supabase = getPublicSupabase();
  if (!supabase) {
    const category = fallbackCategories.find((item) => item.slug === categorySlug) ?? badmintonCategory;
    return { category, skills: categorySkills(category.slug) };
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
    skills: (skills ?? categorySkills(categorySlug)).map((skill) => ({
      ...skill,
      category_slug: category?.slug ?? categorySlug,
      resource_count: counts.get(skill.id) ?? 0,
    })),
  };
}

export async function getAllCatalogs(): Promise<Array<CatalogData>> {
  const supabase = getPublicSupabase();
  if (!supabase) {
    return fallbackCategories.map((category) => ({
      category,
      skills: categorySkills(category.slug),
    }));
  }

  const categories = await getCategories();
  const { data: skills } = await supabase
    .from("skills")
    .select("id, category_id, slug, name, description, updated_at")
    .eq("is_active", true)
    .order("name");
  const categoryById = new Map(categories.map((category) => [category.id, category]));
  const skillsByCategory = new Map<string, SkillSummary[]>();

  for (const skill of skills ?? []) {
    const category = categoryById.get(skill.category_id);
    if (!category) continue;
    const shaped = {
      ...skill,
      category_slug: category.slug,
      resource_count: 0,
    };
    skillsByCategory.set(category.id, [...(skillsByCategory.get(category.id) ?? []), shaped]);
  }

  return categories.map((category) => ({
    category,
    skills: skillsByCategory.get(category.id) ?? [],
  }));
}

export async function getResourceListing(
  filters: ResourceListingFilters = {},
): Promise<ResourceListingData> {
  const supabase = getPublicSupabase();
  if (!supabase) return fallbackListing(filters);

  const sort = normalizeSort(filters.sort);
  const page = normalizePage(filters.page);
  const pageSize = filters.pageSize ?? DEFAULT_PAGE_SIZE;
  const categories = await getCategories();
  const category = filters.categorySlug
    ? categories.find((item) => item.slug === filters.categorySlug) ?? null
    : null;
  if (filters.categorySlug && !category) return fallbackListing(filters);

  let skillQuery = supabase
    .from("skills")
    .select("id, category_id, slug, name, description, updated_at")
    .eq("is_active", true)
    .order("name");

  if (category) skillQuery = skillQuery.eq("category_id", category.id);
  const { data: skillRows } = await skillQuery;
  const categoryById = new Map(categories.map((item) => [item.id, item]));
  const skills = (skillRows ?? []).flatMap((skill) => {
    const skillCategory = categoryById.get(skill.category_id);
    if (!skillCategory) return [];
    return [{
      ...skill,
      category_slug: skillCategory.slug,
      resource_count: 0,
    }];
  });
  const skillById = new Map(skills.map((skill) => [skill.id, skill]));
  const skillIds = skills.map((skill) => skill.id);
  if (!skillIds.length) {
    return {
      categories,
      category,
      skills,
      resources: [],
      totalCount: 0,
      page,
      pageSize,
      pageCount: 1,
      level: filters.level ?? null,
      sort,
    };
  }

  const offset = (page - 1) * pageSize;
  let relationQuery = supabase
    .from("link_skill_relations")
    .select(
      "id, skill_id, public_note, skill_level, upvote_count, created_at, links!inner(id, url, canonical_url, domain, title, description, thumbnail_url, content_type)",
      { count: "exact" },
    )
    .in("skill_id", skillIds)
    .eq("is_active", true)
    .eq("links.is_active", true);

  if (filters.level) relationQuery = relationQuery.eq("skill_level", filters.level);
  relationQuery = sort === "popular"
    ? relationQuery.order("upvote_count", { ascending: false })
    : relationQuery.order("created_at", { ascending: false });

  const { data: relations, count } = await relationQuery.range(offset, offset + pageSize - 1);
  const resources: SkillResource[] = (relations ?? []).flatMap((relation) => {
    const link = Array.isArray(relation.links) ? relation.links[0] : relation.links;
    const skill = skillById.get(relation.skill_id);
    if (!link || !skill) return [];
    const relationCategory = categoryById.get(skill.category_id);
    return [{
      id: relation.id,
      public_note: relation.public_note,
      skill_level: relation.skill_level,
      upvote_count: relation.upvote_count,
      created_at: relation.created_at,
      link,
      skill: {
        id: skill.id,
        slug: skill.slug,
        name: skill.name,
        category_slug: skill.category_slug,
        category_name: relationCategory?.name ?? null,
      },
    }];
  });

  return {
    categories,
    category,
    skills,
    resources,
    totalCount: count ?? resources.length,
    page,
    pageSize,
    pageCount: Math.max(1, Math.ceil((count ?? resources.length) / pageSize)),
    level: filters.level ?? null,
    sort,
  };
}

export async function getSkillPage(categorySlug: string, skillSlug: string) {
  const supabase = getPublicSupabase();
  if (!supabase) {
    const category = fallbackCategories.find((item) => item.slug === categorySlug) ?? null;
    const skills = category ? categorySkills(category.slug) : [];
    const skill = skills.find((item) => item.slug === skillSlug) ?? null;
    return {
      category,
      skill,
      resources: skill
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
        : [],
      relatedSkills: skill ? skills.filter((item) => item.slug !== skillSlug).slice(0, 4) : [],
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
    .select("id, public_note, skill_level, upvote_count, links(id, url, canonical_url, domain, title, description, thumbnail_url, content_type)")
    .eq("skill_id", skillRow.id)
    .eq("is_active", true)
    .order("upvote_count", { ascending: false });

  const { data: siblings } = await supabase
    .from("skills")
    .select("id, category_id, slug, name, description, updated_at")
    .eq("category_id", skillRow.category_id)
    .eq("is_active", true)
    .neq("id", skillRow.id)
    .limit(4);

  const shapedResources: SkillResource[] = (resources ?? []).flatMap((relation) => {
    const link = Array.isArray(relation.links) ? relation.links[0] : relation.links;
    if (!link) return [];
    return [
      {
        id: relation.id,
        public_note: relation.public_note,
        skill_level: relation.skill_level,
        upvote_count: relation.upvote_count,
        skill: {
          id: skillRow.id,
          slug: skillRow.slug,
          name: skillRow.name,
          category_slug: category.slug,
          category_name: category.name,
        },
        link,
      },
    ];
  });

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
  link: { title: string | null; domain: string | null; thumbnail_url: string | null } | null;
  author: { display_name: string } | null;
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
    .select("id, type, status, origin_type, origin_name, payload_json, evidence_json, triangulation_json, confidence, created_at, categories(name, slug), skills(name, slug), links(title, domain, thumbnail_url), internal_users(display_name)")
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
