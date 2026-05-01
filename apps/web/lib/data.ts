import {
  badmintonCategory,
  badmintonSkills,
  fallbackResources,
  type CategorySummary,
  type SkillResource,
  type SkillSummary,
} from "@skillsaggregator/shared";
import { getPublicSupabase, getServiceSupabase } from "./supabase";

export interface CatalogData {
  category: CategorySummary;
  skills: SkillSummary[];
}

export async function getCatalog(): Promise<CatalogData> {
  const supabase = getPublicSupabase();
  if (!supabase) return { category: badmintonCategory, skills: badmintonSkills };

  const { data: category } = await supabase
    .from("categories")
    .select("id, slug, name, description, updated_at")
    .eq("slug", "badminton")
    .eq("is_active", true)
    .single();

  const { data: skills } = await supabase
    .from("skills")
    .select("id, category_id, slug, name, description, updated_at")
    .eq("category_id", category?.id ?? badmintonCategory.id)
    .eq("is_active", true)
    .order("name");

  const skillIds = (skills ?? []).map((skill) => skill.id);
  const { data: relations } = skillIds.length
    ? await supabase
        .from("link_skill_relations")
        .select("skill_id")
        .in("skill_id", skillIds)
        .eq("is_active", true)
    : { data: [] };

  const counts = new Map<string, number>();
  for (const relation of relations ?? []) {
    counts.set(relation.skill_id, (counts.get(relation.skill_id) ?? 0) + 1);
  }

  return {
    category: category ?? badmintonCategory,
    skills: (skills ?? badmintonSkills).map((skill) => ({
      ...skill,
      category_slug: "badminton",
      resource_count: counts.get(skill.id) ?? 0,
    })),
  };
}

export async function getSkillPage(categorySlug: string, skillSlug: string) {
  const supabase = getPublicSupabase();
  if (!supabase) {
    const skill = badmintonSkills.find((item) => item.slug === skillSlug) ?? null;
    return {
      category: categorySlug === "badminton" ? badmintonCategory : null,
      skill,
      resources: fallbackResources[skillSlug] ?? [],
      relatedSkills: badmintonSkills.filter((item) => item.slug !== skillSlug).slice(0, 4),
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
  return data ?? [];
}
