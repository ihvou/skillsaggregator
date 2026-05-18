import { corsForbiddenResponse, errorResponse, isAllowedCorsOrigin, jsonResponse, optionsResponse, readJson } from "../_shared/responses.ts";
import { getServiceClient } from "../_shared/supabase.ts";

type SourceAddPayload = {
  source_type?: "youtube_channel" | "domain" | "rss";
  identifier?: string;
  display_name?: string;
  category_id?: string | null;
  discovery_score?: number | null;
  discovery_evidence_json?: Record<string, unknown> | null;
};

async function cacheThumbnailIfNeeded(suggestionId: string) {
  const supabase = getServiceClient();
  const { data: suggestion, error } = await supabase
    .from("suggestions")
    .select("id, type, link_id, payload_json")
    .eq("id", suggestionId)
    .single();
  if (error) throw error;
  if (suggestion.type !== "LINK_ADD") return;

  const payload = suggestion.payload_json as {
    thumbnail_url?: string | null;
    canonical_url?: string;
  };
  if (!payload.thumbnail_url || payload.thumbnail_url.includes("/storage/v1/object/public/")) return;

  try {
    const imageResponse = await fetch(payload.thumbnail_url);
    if (!imageResponse.ok) return;
    const contentType = imageResponse.headers.get("content-type") ?? "image/jpeg";
    const extension = contentType.includes("png") ? "png" : "jpg";
    const bytes = await imageResponse.arrayBuffer();
    const objectPath = `${suggestionId}.${extension}`;

    const { error: uploadError } = await supabase.storage
      .from("link-thumbnails")
      .upload(objectPath, bytes, {
        contentType,
        upsert: true,
      });
    if (uploadError) return;

    const { data } = supabase.storage.from("link-thumbnails").getPublicUrl(objectPath);
    await supabase
      .from("suggestions")
      .update({
        payload_json: {
          ...payload,
          thumbnail_url: data.publicUrl,
        },
      })
      .eq("id", suggestionId);
    if (suggestion.link_id) {
      await supabase
        .from("links")
        .update({
          thumbnail_url: data.publicUrl,
          preview_status: "fetched",
          fetched_at: new Date().toISOString(),
        })
        .eq("id", suggestion.link_id);
    }
  } catch (_error) {
    return;
  }
}

async function applySourceAddIfNeeded(
  suggestionId: string,
  moderatorUserId: string | null,
) {
  const supabase = getServiceClient();
  const { data: suggestion, error } = await supabase
    .from("suggestions")
    .select("id, type, status, payload_json")
    .eq("id", suggestionId)
    .single();
  if (error) throw error;
  if (suggestion.type !== "SOURCE_ADD") return null;

  if (!["pending", "auto_approved"].includes(suggestion.status)) {
    return {
      ok: true,
      already_decided: true,
      status: suggestion.status,
    };
  }

  const payload = suggestion.payload_json as SourceAddPayload;
  if (!payload.source_type || !payload.identifier || !payload.display_name) {
    return { ok: false, error: "SOURCE_ADD payload is missing source_type, identifier, or display_name" };
  }

  const finalStatus = suggestion.status === "auto_approved" ? "auto_approved" : "approved";
  const now = new Date().toISOString();
  const { data: source, error: upsertError } = await supabase
    .from("trusted_sources")
    .upsert(
      {
        source_type: payload.source_type,
        identifier: payload.identifier,
        display_name: payload.display_name,
        category_id: payload.category_id ?? null,
        is_active: true,
        origin_type: "agent",
        discovered_at: now,
        discovery_score: payload.discovery_score ?? null,
        discovery_evidence_json: payload.discovery_evidence_json ?? null,
        last_validated_at: now,
        last_seen_activity_at:
          typeof payload.discovery_evidence_json?.latest_upload_date === "string"
            ? payload.discovery_evidence_json.latest_upload_date
            : null,
      },
      { onConflict: "source_type,identifier" },
    )
    .select("id")
    .single();
  if (upsertError) throw upsertError;

  const { error: updateError } = await supabase
    .from("suggestions")
    .update({
      status: finalStatus,
      decided_at: now,
      moderator_user_id: moderatorUserId,
    })
    .eq("id", suggestionId);
  if (updateError) throw updateError;

  return {
    ok: true,
    applied_changes: ["source_upserted"],
    trusted_source_id: source.id,
  };
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return optionsResponse(request);
  if (!isAllowedCorsOrigin(request)) return corsForbiddenResponse(request);
  if (request.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405, request);

  try {
    const body = await readJson<{ suggestion_id: string; moderator_user_id?: string | null }>(request);
    if (!body.suggestion_id) return jsonResponse({ error: "suggestion_id is required" }, 400, request);

    const sourceResult = await applySourceAddIfNeeded(
      body.suggestion_id,
      body.moderator_user_id ?? null,
    );
    if (sourceResult) return jsonResponse(sourceResult, 200, request);

    const supabase = getServiceClient();
    const { data, error } = await supabase.rpc("apply_suggestion_transaction", {
      p_suggestion_id: body.suggestion_id,
      p_moderator_user_id: body.moderator_user_id ?? null,
    });
    if (error) throw error;

    await cacheThumbnailIfNeeded(body.suggestion_id);

    return jsonResponse(data, 200, request);
  } catch (error) {
    return errorResponse(error, 500, request);
  }
});
