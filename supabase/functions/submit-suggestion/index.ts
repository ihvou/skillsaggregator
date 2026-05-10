import { buildDedupeKey } from "../_shared/dedupe.ts";
import { getDomain, normalizeCanonicalUrl } from "../_shared/normalization.ts";
import { corsForbiddenResponse, errorResponse, isAllowedCorsOrigin, jsonResponse, optionsResponse, readJson } from "../_shared/responses.ts";
import { submitSuggestionSchema, suggestionPayloadByType } from "../_shared/schemas.ts";
import { chooseInternalAuthor } from "../_shared/database.ts";
import { getServiceClient } from "../_shared/supabase.ts";

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return optionsResponse(request);
  if (!isAllowedCorsOrigin(request)) return corsForbiddenResponse(request);
  if (request.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405, request);

  try {
    const supabase = getServiceClient();
    const input = submitSuggestionSchema.parse(await readJson(request));
    const requestedStatus = input.requested_status ?? input.status;
    const finalStatus = "pending";
    const payload = suggestionPayloadByType[input.type].parse(input.payload_json) as Record<string, unknown>;

    if (input.type === "LINK_ADD") {
      payload.canonical_url = normalizeCanonicalUrl(String(payload.canonical_url));
      payload.domain = getDomain(String(payload.canonical_url));
    }

    const targetSkillId = "target_skill_id" in payload ? String(payload.target_skill_id) : input.skill_id;
    let categoryId = input.category_id ?? null;
    if (!categoryId && targetSkillId) {
      const { data, error } = await supabase
        .from("skills")
        .select("category_id")
        .eq("id", targetSkillId)
        .single();
      if (error) throw error;
      categoryId = data.category_id;
    }

    const authorInternalUserId =
      input.author_internal_user_id ?? (await chooseInternalAuthor(supabase, categoryId));
    let dedupeKey: string;
    try {
      dedupeKey = buildDedupeKey(input.type, payload, authorInternalUserId);
    } catch (error) {
      return errorResponse(error, 400, request);
    }

    const { data: existing, error: existingError } = await supabase
      .from("suggestions")
      .select("id, status")
      .eq("dedupe_key", dedupeKey)
      .in("status", ["pending", "approved", "auto_approved"])
      .maybeSingle();
    if (existingError) throw existingError;
    if (existing) {
      return jsonResponse({
        suggestion_id: existing.id,
        status: existing.status,
        duplicate: true,
      }, 200, request);
    }

    const { data: inserted, error: insertError } = await supabase
      .from("suggestions")
      .insert({
        type: input.type,
        status: finalStatus,
        origin_type: input.origin_type,
        origin_name: input.origin_name ?? null,
        author_internal_user_id: authorInternalUserId,
        category_id: categoryId,
        skill_id: targetSkillId ?? input.skill_id ?? null,
        link_id: input.link_id ?? ("link_id" in payload ? payload.link_id : null),
        payload_json: payload,
        evidence_json: input.evidence_json ?? null,
        triangulation_json: input.triangulation_json ?? null,
        confidence: input.confidence ?? null,
        dedupe_key: dedupeKey,
      })
      .select("id, status")
      .single();

    if (insertError) throw insertError;

    return jsonResponse({
      suggestion_id: inserted.id,
      status: inserted.status,
      requested_status: requestedStatus,
    }, 200, request);
  } catch (error) {
    return errorResponse(error, 500, request);
  }
});
