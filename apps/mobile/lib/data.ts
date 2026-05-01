import {
  badmintonCategory,
  badmintonSkills,
  fallbackResources,
  type CategorySummary,
  type LinkResource,
  type SkillResource,
  type SkillSummary,
} from "@skillsaggregator/shared";
import { getSupabase } from "./supabase";

export async function getCategory(): Promise<CategorySummary> {
  const supabase = getSupabase();
  if (!supabase) return badmintonCategory;
  const { data } = await supabase
    .from("categories")
    .select("id, slug, name, description")
    .eq("slug", "badminton")
    .single();
  return data ?? badmintonCategory;
}

export async function getSkills(): Promise<SkillSummary[]> {
  const supabase = getSupabase();
  if (!supabase) return badmintonSkills;

  const category = await getCategory();
  const { data } = await supabase
    .from("skills")
    .select("id, category_id, slug, name, description")
    .eq("category_id", category.id)
    .eq("is_active", true)
    .order("name");

  const skillIds = (data ?? []).map((skill) => skill.id);
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

  return (data ?? badmintonSkills).map((skill) => ({
    ...skill,
    category_slug: "badminton",
    resource_count: counts.get(skill.id) ?? 0,
  }));
}

export async function getSkillResources(skillSlug: string): Promise<{
  skill: SkillSummary | null;
  resources: SkillResource[];
}> {
  const supabase = getSupabase();
  if (!supabase) {
    const skill = badmintonSkills.find((item) => item.slug === skillSlug) ?? null;
    return { skill, resources: fallbackResources[skillSlug] ?? [] };
  }

  const { data: skill } = await supabase
    .from("skills")
    .select("id, category_id, slug, name, description")
    .eq("slug", skillSlug)
    .single();
  if (!skill) return { skill: null, resources: [] };

  const { data: relations } = await supabase
    .from("link_skill_relations")
    .select("id, public_note, skill_level, upvote_count, links(id, url, canonical_url, domain, title, description, thumbnail_url, content_type)")
    .eq("skill_id", skill.id)
    .eq("is_active", true)
    .order("upvote_count", { ascending: false });

  return {
    skill: { ...skill, category_slug: "badminton", resource_count: relations?.length ?? 0 },
    resources: (relations ?? []).flatMap((relation) => {
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
    }),
  };
}

export async function getLinksByIds(ids: string[]): Promise<LinkResource[]> {
  if (ids.length === 0) return [];
  const supabase = getSupabase();
  if (!supabase) {
    return Object.values(fallbackResources)
      .flat()
      .map((resource) => resource.link)
      .filter((link) => ids.includes(link.id));
  }

  const { data } = await supabase
    .from("links")
    .select("id, url, canonical_url, domain, title, description, thumbnail_url, content_type")
    .in("id", ids)
    .eq("is_active", true);
  return data ?? [];
}
