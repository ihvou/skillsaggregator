import { corsForbiddenResponse, errorResponse, isAllowedCorsOrigin, jsonResponse, optionsResponse, readJson } from "../_shared/responses.ts";
import { getServiceClient } from "../_shared/supabase.ts";
import { cacheThumbnail } from "../_shared/thumbnail-storage.ts";
import { tiktokVideoIdFromUrl } from "../_shared/tiktok-url.mjs";

type SourceAddPayload = {
  source_type?: "youtube_channel" | "domain" | "rss" | "tiktok_search";
  identifier?: string;
  display_name?: string;
  category_id?: string | null;
  discovery_score?: number | null;
  discovery_evidence_json?: Record<string, unknown> | null;
};

type LinkAddPayload = {
  url?: string;
  canonical_url?: string;
  thumbnail_url?: string | null;
  thumbnail_dynamic_url?: string | null;
  thumbnail_storage_path?: string | null;
  thumbnail_cache_status?: "cached" | "failed" | null;
  thumbnail_cache_error?: string | null;
  thumbnail_cache_attempted_at?: string | null;
  duration_seconds?: number | null;
  like_count?: number | null;
  comment_count?: number | null;
  share_count?: number | null;
  favorite_count?: number | null;
  creator_handle?: string | null;
  creator_url?: string | null;
  creator_platform?: "youtube" | "tiktok" | null;
  creator_profile?: Record<string, unknown> | null;
  scoring_strategy?: "transcript_llm" | "engagement_authority";
};

function isInternalApplyRequest(request: Request) {
  const expected = Deno.env.get("INTERNAL_FUNCTION_TOKEN");
  if (!expected) {
    console.error("apply_suggestion_internal_token_missing");
    return false;
  }
  return request.headers.get("x-internal-token") === expected;
}

function youtubeVideoIdFromUrl(value: string | null | undefined) {
  if (!value) return null;
  try {
    const parsed = new URL(value);
    const hostname = parsed.hostname.replace(/^www\./, "").toLowerCase();
    if (hostname === "youtu.be") return parsed.pathname.split("/").filter(Boolean)[0] ?? null;
    if (hostname === "youtube.com" || hostname.endsWith(".youtube.com")) {
      if (parsed.pathname.startsWith("/shorts/")) return parsed.pathname.split("/")[2] ?? null;
      if (parsed.pathname.startsWith("/embed/")) return parsed.pathname.split("/")[2] ?? null;
      return parsed.searchParams.get("v");
    }
    if (hostname === "i.ytimg.com" || hostname.endsWith(".ytimg.com") || hostname === "img.youtube.com") {
      const parts = parsed.pathname.split("/").filter(Boolean);
      const videoIndex = parts.findIndex((part) => part === "vi");
      return videoIndex >= 0 ? parts[videoIndex + 1] ?? null : null;
    }
  } catch {
    return null;
  }
  return null;
}

function normalizeTranscriptText(value: unknown) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

async function sha256Hex(value: string) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function evidenceString(
  evidence: Record<string, unknown> | null | undefined,
  key: string,
) {
  const value = evidence?.[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function transcriptProviderFromEvidence(evidence: Record<string, unknown> | null | undefined) {
  return evidenceString(evidence, "transcript_fetcher") === "browser" ? "browser" : "ytdlp";
}

function storageKeyFromPublicUrl(value: string | null | undefined) {
  if (!value) return null;
  const marker = "/storage/v1/object/public/";
  try {
    const parsed = new URL(value);
    const markerIndex = parsed.pathname.indexOf(marker);
    return markerIndex === -1
      ? null
      : decodeURIComponent(parsed.pathname.slice(markerIndex + marker.length));
  } catch {
    return value.startsWith("link-thumbnails/") || value.startsWith("thumbnails/") ? value : null;
  }
}

function isTikTokPayload(payload: LinkAddPayload) {
  return payload.scoring_strategy === "engagement_authority"
    || tiktokVideoIdFromUrl(payload.canonical_url)
    || tiktokVideoIdFromUrl(payload.url);
}

function cleanHandle(value: unknown) {
  if (typeof value !== "string") return null;
  const cleaned = value.trim().replace(/^@/, "").toLowerCase();
  return cleaned ? cleaned.slice(0, 120) : null;
}

function numberOrNull(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function boolOrFalse(value: unknown) {
  return typeof value === "boolean" ? value : false;
}

async function persistTranscriptFromEvidenceIfNeeded(suggestionId: string) {
  const supabase = getServiceClient();
  const { data: suggestion, error } = await supabase
    .from("suggestions")
    .select("id, type, link_id, payload_json, evidence_json")
    .eq("id", suggestionId)
    .single();
  if (error) throw error;
  if (suggestion.type !== "LINK_ADD" || !suggestion.link_id) return;

  const evidence = (suggestion.evidence_json ?? null) as Record<string, unknown> | null;
  const transcriptText = normalizeTranscriptText(evidence?.transcript_full);
  if (!transcriptText) {
    console.info("apply_suggestion_transcript_persist_skipped", {
      suggestion_id: suggestionId,
      link_id: suggestion.link_id,
      reason: "missing_transcript_full",
    });
    return;
  }

  const payload = suggestion.payload_json as LinkAddPayload;
  const videoId =
    evidenceString(evidence, "video_id")
    ?? youtubeVideoIdFromUrl(payload.canonical_url)
    ?? youtubeVideoIdFromUrl(payload.url);
  const provider = transcriptProviderFromEvidence(evidence);
  const transcriptHash = await sha256Hex(transcriptText);

  const { error: upsertError } = await supabase
    .from("link_transcripts")
    .upsert(
      {
        link_id: suggestion.link_id,
        source: "youtube",
        provider,
        video_id: videoId,
        language: "en",
        transcript_text: transcriptText,
        transcript_hash: transcriptHash,
        fetched_at: new Date().toISOString(),
      },
      { onConflict: "link_id" },
    );
  if (upsertError) throw upsertError;

  const nextEvidence = {
    ...(evidence ?? {}),
    transcript_persisted: true,
    transcript_length: transcriptText.length,
    transcript_hash: transcriptHash,
  };
  delete nextEvidence.transcript_full;

  const { error: updateError } = await supabase
    .from("suggestions")
    .update({ evidence_json: nextEvidence })
    .eq("id", suggestionId);
  if (updateError) throw updateError;

  console.info("apply_suggestion_transcript_persisted", {
    suggestion_id: suggestionId,
    link_id: suggestion.link_id,
    provider,
    video_id: videoId,
    transcript_length: transcriptText.length,
    transcript_hash: transcriptHash,
  });
}

async function updateSuggestionPayload(suggestionId: string, payload: LinkAddPayload) {
  const supabase = getServiceClient();
  const { error } = await supabase
    .from("suggestions")
    .update({ payload_json: payload })
    .eq("id", suggestionId);
  if (error) throw error;
}

async function cacheThumbnailIfNeeded(suggestionId: string) {
  const supabase = getServiceClient();
  const { data: suggestion, error } = await supabase
    .from("suggestions")
    .select("id, type, link_id, payload_json")
    .eq("id", suggestionId)
    .single();
  if (error) throw error;
  if (suggestion.type !== "LINK_ADD") return;

  const payload = suggestion.payload_json as LinkAddPayload;
  if (payload.thumbnail_storage_path) {
    if (suggestion.link_id) {
      await supabase
        .from("links")
        .update({
          thumbnail_storage_path: payload.thumbnail_storage_path,
          preview_status: "fetched",
          fetched_at: new Date().toISOString(),
        })
        .eq("id", suggestion.link_id);
    }
    return;
  }

  if (!payload.thumbnail_url) return;
  const existingStorageKey = storageKeyFromPublicUrl(payload.thumbnail_url);
  if (existingStorageKey) {
    const storageColumn = existingStorageKey.startsWith("thumbnails/")
      ? { thumbnail_storage_path: existingStorageKey }
      : { thumbnail_url: existingStorageKey };
    if (existingStorageKey !== payload.thumbnail_url || "thumbnail_storage_path" in storageColumn) {
      await updateSuggestionPayload(suggestionId, { ...payload, ...storageColumn });
      if (suggestion.link_id) {
        await supabase
          .from("links")
          .update(storageColumn)
          .eq("id", suggestion.link_id);
      }
    }
    return;
  }

  if (isTikTokPayload(payload)) {
    const videoId = tiktokVideoIdFromUrl(payload.canonical_url) ?? tiktokVideoIdFromUrl(payload.url) ?? suggestionId;
    try {
      const attemptedAt = new Date().toISOString();
      const storedPath = await cacheThumbnail(payload.thumbnail_url, `tiktok/${videoId}.jpg`);
      const nextPayload = {
        ...payload,
        thumbnail_storage_path: storedPath,
        thumbnail_cache_status: "cached" as const,
        thumbnail_cache_error: null,
        thumbnail_cache_attempted_at: attemptedAt,
      };
      await updateSuggestionPayload(suggestionId, nextPayload);
      if (suggestion.link_id) {
        await supabase
          .from("links")
          .update({
            thumbnail_storage_path: storedPath,
            thumbnail_url: payload.thumbnail_url,
            preview_status: "fetched",
            fetched_at: new Date().toISOString(),
          })
          .eq("id", suggestion.link_id);
      }
      console.info("apply_suggestion_tiktok_thumbnail_cached", {
        suggestion_id: suggestionId,
        link_id: suggestion.link_id,
        video_id: videoId,
        thumbnail_storage_path: storedPath,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await updateSuggestionPayload(suggestionId, {
        ...payload,
        thumbnail_cache_status: "failed",
        thumbnail_cache_error: message.slice(0, 500),
        thumbnail_cache_attempted_at: new Date().toISOString(),
      });
      console.warn("apply_suggestion_tiktok_thumbnail_cache_failed", {
        suggestion_id: suggestionId,
        link_id: suggestion.link_id,
        video_id: videoId,
        message,
      });
    }
    return;
  }

  if (youtubeVideoIdFromUrl(payload.canonical_url) || youtubeVideoIdFromUrl(payload.thumbnail_url)) {
    const thumbnailUrl = `https://i.ytimg.com/vi/${youtubeVideoIdFromUrl(payload.canonical_url) ?? youtubeVideoIdFromUrl(payload.thumbnail_url)}/hqdefault.jpg`;
    await updateSuggestionPayload(suggestionId, { ...payload, thumbnail_url: thumbnailUrl });
    if (suggestion.link_id) {
      await supabase
        .from("links")
        .update({
          thumbnail_url: thumbnailUrl,
          preview_status: "fetched",
          fetched_at: new Date().toISOString(),
        })
        .eq("id", suggestion.link_id);
    }
    return;
  }

  try {
    const imageResponse = await fetch(payload.thumbnail_url);
    if (!imageResponse.ok) return;
    const contentType = imageResponse.headers.get("content-type") ?? "image/jpeg";
    const extension = contentType.includes("png") ? "png" : "jpg";
    const bytes = await imageResponse.arrayBuffer();
    const objectPath = `${suggestionId}.${extension}`;
    const storedThumbnailKey = `link-thumbnails/${objectPath}`;

    const { error: uploadError } = await supabase.storage
      .from("link-thumbnails")
      .upload(objectPath, bytes, {
        contentType,
        upsert: true,
      });
    if (uploadError) return;

    await supabase
      .from("suggestions")
      .update({ payload_json: { ...payload, thumbnail_url: storedThumbnailKey } })
      .eq("id", suggestionId);
    if (suggestion.link_id) {
      await supabase
        .from("links")
        .update({
          thumbnail_url: storedThumbnailKey,
          preview_status: "fetched",
          fetched_at: new Date().toISOString(),
        })
        .eq("id", suggestion.link_id);
    }
  } catch (_error) {
    return;
  }
}

async function applyTikTokMetadataIfNeeded(suggestionId: string) {
  const supabase = getServiceClient();
  const { data: suggestion, error } = await supabase
    .from("suggestions")
    .select("id, type, link_id, payload_json, evidence_json")
    .eq("id", suggestionId)
    .single();
  if (error) throw error;
  if (suggestion.type !== "LINK_ADD" || !suggestion.link_id) return;

  const payload = suggestion.payload_json as LinkAddPayload;
  if (!isTikTokPayload(payload)) return;

  const profile = payload.creator_profile ?? {};
  const handle = cleanHandle(payload.creator_handle ?? profile.handle);
  const { data: creatorId, error: linkError } = await supabase.rpc("apply_tiktok_link_metadata", {
    p_link_id: suggestion.link_id,
    p_creator_platform: payload.creator_platform ?? "tiktok",
    p_creator_handle: handle,
    p_creator_nickname: typeof profile.nickname === "string" ? profile.nickname : null,
    p_creator_bio: typeof profile.bio === "string" ? profile.bio : null,
    p_creator_bio_link: typeof profile.bio_link === "string" ? profile.bio_link : null,
    p_followers_count: numberOrNull(profile.followers_count),
    p_following_count: numberOrNull(profile.following_count),
    p_videos_count: numberOrNull(profile.videos_count),
    p_verified: boolOrFalse(profile.verified),
    p_authority_score: numberOrNull(profile.authority_score),
    p_duration_seconds: numberOrNull(payload.duration_seconds),
    p_like_count: numberOrNull(payload.like_count),
    p_comment_count: numberOrNull(payload.comment_count),
    p_share_count: numberOrNull(payload.share_count),
    p_favorite_count: numberOrNull(payload.favorite_count),
    p_creator_url: payload.creator_url ?? null,
    p_scoring_strategy: payload.scoring_strategy ?? "engagement_authority",
    p_thumbnail_storage_path: payload.thumbnail_storage_path ?? null,
    p_thumbnail_url: payload.thumbnail_url ?? null,
  });
  if (linkError) throw linkError;

  console.info("apply_suggestion_tiktok_metadata_applied", {
    suggestion_id: suggestionId,
    link_id: suggestion.link_id,
    creator_id: creatorId,
    creator_handle: handle,
    scoring_strategy: payload.scoring_strategy ?? "engagement_authority",
    has_cached_thumbnail: Boolean(payload.thumbnail_storage_path),
  });
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
  if (!isInternalApplyRequest(request)) return jsonResponse({ error: "Unauthorized" }, 401, request);

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

    try {
      await persistTranscriptFromEvidenceIfNeeded(body.suggestion_id);
    } catch (transcriptError) {
      console.warn("apply_suggestion_transcript_persist_failed", {
        suggestion_id: body.suggestion_id,
        message: transcriptError instanceof Error ? transcriptError.message : String(transcriptError),
      });
    }

    await cacheThumbnailIfNeeded(body.suggestion_id);
    await applyTikTokMetadataIfNeeded(body.suggestion_id);

    return jsonResponse(data, 200, request);
  } catch (error) {
    return errorResponse(error, 500, request);
  }
});
