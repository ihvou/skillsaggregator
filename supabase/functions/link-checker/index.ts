import { corsHeaders, errorResponse, jsonResponse, readJson } from "../_shared/responses.ts";
import { callFunction, getServiceClient } from "../_shared/supabase.ts";

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  const supabase = getServiceClient();
  let runId: string | null = null;

  try {
    const body = await readJson<{ relation_id: string }>(request);
    if (!body.relation_id) return jsonResponse({ error: "relation_id is required" }, 400);

    const { data: run, error: runError } = await supabase
      .from("agent_runs")
      .insert({
        agent_type: "link_checker",
        target_type: "link_skill_relation",
        target_id: body.relation_id,
      })
      .select("id")
      .single();
    if (runError) throw runError;
    runId = run.id;

    const { data: relation, error: relationError } = await supabase
      .from("link_skill_relations")
      .select("id, link_id, skill_id, upvote_count, links(id, title, domain, is_active), skills(id, name, category_id)")
      .eq("id", body.relation_id)
      .single();
    if (relationError) throw relationError;

    const link = Array.isArray(relation.links) ? relation.links[0] : relation.links;
    const skill = Array.isArray(relation.skills) ? relation.skills[0] : relation.skills;
    if (!link || !skill) throw new Error("Relation is missing link or skill");

    const submitted = await callFunction<{ suggestion_id: string; duplicate?: boolean }>(
      "submit-suggestion",
      {
        type: "LINK_UPVOTE_SKILL",
        status: "pending",
        origin_type: "agent",
        origin_name: "link-checker",
        category_id: skill.category_id,
        skill_id: skill.id,
        link_id: link.id,
        payload_json: {
          link_id: link.id,
          target_skill_id: skill.id,
          reason: `Existing ${link.domain} resource remains useful for ${skill.name}.`,
        },
        evidence_json: {
          source: "relation_recheck",
          current_upvote_count: relation.upvote_count,
          link_title: link.title,
        },
        confidence: 0.55,
      },
    );

    await supabase
      .from("link_skill_relations")
      .update({ last_checked_at: new Date().toISOString() })
      .eq("id", body.relation_id);

    const suggestionsCreated = submitted.duplicate ? 0 : 1;
    const { error: updateError } = await supabase
      .from("agent_runs")
      .update({
        status: "completed",
        suggestions_created: suggestionsCreated,
        completed_at: new Date().toISOString(),
      })
      .eq("id", runId);
    if (updateError) throw updateError;

    return jsonResponse({ run_id: runId, suggestions_created: suggestionsCreated });
  } catch (error) {
    if (runId) {
      await supabase
        .from("agent_runs")
        .update({
          status: "failed",
          error_message: error instanceof Error ? error.message : String(error),
          completed_at: new Date().toISOString(),
        })
        .eq("id", runId);
    }
    return errorResponse(error);
  }
});
