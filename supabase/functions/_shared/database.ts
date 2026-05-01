import type { SupabaseClient } from "npm:@supabase/supabase-js@2.48.1";

export async function loadSkill(supabase: SupabaseClient, skillId: string) {
  const { data, error } = await supabase
    .from("skills")
    .select("id, slug, name, description, category_id, categories(id, slug, name, description)")
    .eq("id", skillId)
    .single();

  if (error) throw error;
  const category = Array.isArray(data.categories) ? data.categories[0] : data.categories;
  if (!category) throw new Error("Skill category not found");
  return {
    id: data.id,
    slug: data.slug,
    name: data.name,
    description: data.description,
    category_id: data.category_id,
    category,
  };
}

export async function loadTrustedYouTubeChannels(supabase: SupabaseClient, categoryId: string) {
  const { data, error } = await supabase
    .from("trusted_sources")
    .select("identifier")
    .eq("source_type", "youtube_channel")
    .eq("is_active", true)
    .or(`category_id.eq.${categoryId},category_id.is.null`);

  if (error) throw error;
  return data.map((source) => source.identifier);
}

export async function chooseInternalAuthor(supabase: SupabaseClient, categoryId: string | null) {
  if (!categoryId) return null;

  const { data, error } = await supabase
    .from("internal_user_category_interests")
    .select("internal_user_id, weight, internal_users(is_active)")
    .eq("category_id", categoryId)
    .eq("is_active", true)
    .order("weight", { ascending: false })
    .limit(1);

  if (error) throw error;
  return data?.[0]?.internal_user_id ?? null;
}
