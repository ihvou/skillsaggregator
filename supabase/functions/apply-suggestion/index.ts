import { corsHeaders, errorResponse, jsonResponse, readJson } from "../_shared/responses.ts";
import { getServiceClient } from "../_shared/supabase.ts";

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

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  try {
    const body = await readJson<{ suggestion_id: string; moderator_user_id?: string | null }>(request);
    if (!body.suggestion_id) return jsonResponse({ error: "suggestion_id is required" }, 400);

    const supabase = getServiceClient();
    const { data, error } = await supabase.rpc("apply_suggestion_transaction", {
      p_suggestion_id: body.suggestion_id,
      p_moderator_user_id: body.moderator_user_id ?? null,
    });
    if (error) throw error;

    await cacheThumbnailIfNeeded(body.suggestion_id);

    return jsonResponse(data);
  } catch (error) {
    return errorResponse(error);
  }
});
