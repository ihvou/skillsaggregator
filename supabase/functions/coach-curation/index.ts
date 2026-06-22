import { z } from "npm:zod@3.24.1";
import { corsForbiddenResponse, errorResponse, isAllowedCorsOrigin, jsonResponse, optionsResponse, readJson } from "../_shared/responses.ts";
import { getServiceClient } from "../_shared/supabase.ts";

const coachRoleSchema = z.enum(["relevance", "value"]);

const queueRequestSchema = z.object({
  action: z.literal("queue"),
  coach_role: coachRoleSchema,
  limit: z.number().int().min(1).max(100).optional(),
});

const voteRequestSchema = z.object({
  action: z.literal("vote"),
  relation_id: z.string().uuid(),
  coach_role: coachRoleSchema,
  weight: z.number().min(-2).max(2),
  comment_internal: z.string().max(4000).nullable().optional(),
  comment_public: z.string().max(280).nullable().optional(),
});

const requestSchema = z.discriminatedUnion("action", [queueRequestSchema, voteRequestSchema]);

function isInternalCoachRequest(request: Request) {
  const expected = Deno.env.get("INTERNAL_FUNCTION_TOKEN");
  if (!expected) {
    console.error("coach_curation_internal_token_missing");
    return false;
  }
  return request.headers.get("x-internal-token") === expected;
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return optionsResponse(request);
  if (!isAllowedCorsOrigin(request)) return corsForbiddenResponse(request);
  if (request.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405, request);
  if (!isInternalCoachRequest(request)) {
    console.warn("coach_curation_unauthorized", {
      has_internal_header: Boolean(request.headers.get("x-internal-token")),
    });
    return jsonResponse({ error: "Unauthorized" }, 401, request);
  }

  try {
    const body = requestSchema.parse(await readJson(request));
    const supabase = getServiceClient();

    if (body.action === "queue") {
      console.info("coach_curation_queue_requested", {
        coach_role: body.coach_role,
        limit: body.limit ?? 10,
      });
      const { data, error } = await supabase.rpc("get_unscored_for_coach", {
        p_coach_role: body.coach_role,
        p_limit: body.limit ?? 10,
      });
      if (error) throw error;
      console.info("coach_curation_queue_returned", {
        coach_role: body.coach_role,
        count: data?.length ?? 0,
      });
      return jsonResponse({ ok: true, items: data ?? [] }, 200, request);
    }

    console.info("coach_curation_vote_requested", {
      relation_id: body.relation_id,
      coach_role: body.coach_role,
      weight: body.weight,
      has_public_comment: Boolean(body.comment_public?.trim()),
      has_internal_comment: Boolean(body.comment_internal?.trim()),
    });
    const { error } = await supabase.rpc("set_curator_vote", {
      p_relation_id: body.relation_id,
      p_coach_role: body.coach_role,
      p_weight: body.weight,
      p_comment_internal: body.comment_internal ?? null,
      p_comment_public: body.comment_public ?? null,
    });
    if (error) throw error;

    const { data: gate, error: gateError } = await supabase.rpc("refresh_relation_publish_gate", {
      p_min_reviews: 2,
      p_min_score: 1.3,
      p_unpublish_unreviewed: false,
    });
    if (gateError) throw gateError;

    const { data: relation, error: relationError } = await supabase
      .from("link_skill_relations")
      .select("id, relevance_vote, value_vote, curator_score, curator_reviews, user_score, combined_score, published, coach_take")
      .eq("id", body.relation_id)
      .maybeSingle();
    if (relationError) throw relationError;

    console.info("coach_curation_vote_completed", {
      relation_id: body.relation_id,
      coach_role: body.coach_role,
      gate,
      relation,
    });
    return jsonResponse({ ok: true, gate, relation }, 200, request);
  } catch (error) {
    console.warn("coach_curation_failed", {
      message: error instanceof Error ? error.message : String(error),
    });
    return errorResponse(error, error instanceof z.ZodError ? 400 : 500, request);
  }
});
