import { z } from "npm:zod@3.24.1";
import { corsForbiddenResponse, errorResponse, isAllowedCorsOrigin, jsonResponse, optionsResponse, readJson } from "../_shared/responses.ts";
import { getServiceClient } from "../_shared/supabase.ts";

// Skill summaries — synthesise what the coaches on a sub-skill page agree on.
//
// Deliberately a SEPARATE function from coach-curation rather than two more actions
// on it. The hosted coach-curation is ahead of this repo (it serves difficulty_queue
// and tag, which are absent from the checked-in source), so deploying it from source
// would silently break difficulty tagging. A new function cannot touch it.
//
// Same internal-token gate as coach-curation: verify_jwt is off at the gateway, so
// this header is the only thing standing between the internet and a service-role
// write path. Keep it that way.

const queueRequestSchema = z.object({
  action: z.literal("queue"),
  min_videos: z.number().int().min(1).max(100).optional(),
  growth_factor: z.number().min(1).max(10).optional(),
  max_videos: z.number().int().min(1).max(80).optional(),
  transcript_chars: z.number().int().min(500).max(20000).optional(),
});

// A point is the sentence plus how many of the videos support it. `support` is not
// decoration: for physical technique an unattributed claim is not good enough, and it
// lets weakly-backed points be dropped or de-emphasised later without regenerating.
const pointSchema = z.object({
  point: z.string().min(10).max(400),
  support: z.number().int().min(1).max(200),
});

const storeRequestSchema = z.object({
  action: z.literal("store"),
  skill_id: z.string().uuid(),
  // 1-4 and 0-3 mirror the CHECKs in store_skill_summary. Enforced in both places on
  // purpose: the caller is a language model, and a malformed summary would render as
  // page content.
  consensus: z.array(pointSchema).min(1).max(4),
  mistakes: z.array(pointSchema).max(3),
  source_count: z.number().int().min(0),
  used_count: z.number().int().min(0),
});

const requestSchema = z.discriminatedUnion("action", [queueRequestSchema, storeRequestSchema]);

function isInternalRequest(request: Request) {
  const expected = Deno.env.get("INTERNAL_FUNCTION_TOKEN");
  if (!expected) {
    console.error("skill_summary_internal_token_missing");
    return false;
  }
  return request.headers.get("x-internal-token") === expected;
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return optionsResponse(request);
  if (!isAllowedCorsOrigin(request)) return corsForbiddenResponse(request);
  if (request.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405, request);
  if (!isInternalRequest(request)) {
    console.warn("skill_summary_unauthorized", {
      has_internal_header: Boolean(request.headers.get("x-internal-token")),
    });
    return jsonResponse({ error: "Unauthorized" }, 401, request);
  }

  try {
    const body = requestSchema.parse(await readJson(request));
    const supabase = getServiceClient();

    if (body.action === "queue") {
      const { data, error } = await supabase.rpc("get_skill_for_summary", {
        p_min_videos: body.min_videos ?? 6,
        p_growth_factor: body.growth_factor ?? 1.3,
        p_max_videos: body.max_videos ?? 40,
        p_transcript_chars: body.transcript_chars ?? 6000,
      });
      if (error) throw error;

      // The RPC returns at most one row; an empty result means nothing needs
      // generating right now, which is the normal steady state once the backlog
      // is cleared. Report it explicitly so the routine can stop rather than guess.
      const skill = Array.isArray(data) ? data[0] ?? null : data ?? null;
      console.info("skill_summary_queue_returned", {
        skill: skill?.skill_name ?? null,
        published_count: skill?.published_count ?? 0,
        videos: Array.isArray(skill?.videos) ? skill.videos.length : 0,
        reason: skill?.reason ?? null,
      });
      return jsonResponse({ ok: true, skill }, 200, request);
    }

    const { error } = await supabase.rpc("store_skill_summary", {
      p_skill_id: body.skill_id,
      p_consensus: body.consensus,
      p_mistakes: body.mistakes,
      p_source_count: body.source_count,
      p_used_count: body.used_count,
    });
    if (error) throw error;

    console.info("skill_summary_stored", {
      skill_id: body.skill_id,
      consensus: body.consensus.length,
      mistakes: body.mistakes.length,
      source_count: body.source_count,
      used_count: body.used_count,
    });
    return jsonResponse({ ok: true, skill_id: body.skill_id }, 200, request);
  } catch (error) {
    console.warn("skill_summary_failed", {
      message: error instanceof Error ? error.message : String(error),
    });
    return errorResponse(error, error instanceof z.ZodError ? 400 : 500, request);
  }
});
