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
  title?: string | null;
  description?: string | null;
  content_type?: string | null;
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
  creator_platform?: "youtube" | "tiktok" | "instagram" | null;
  creator_profile?: Record<string, unknown> | null;
  scoring_strategy?: "transcript_llm" | "engagement_authority";
  review_lane?: "coach" | "founder" | "agent" | "private";
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
  return payload.creator_platform === "tiktok"
    || sourceFromUrl(payload.canonical_url) === "tiktok"
    || sourceFromUrl(payload.url) === "tiktok"
    || tiktokVideoIdFromUrl(payload.canonical_url)
    || tiktokVideoIdFromUrl(payload.url);
}

function sourceFromUrl(value: string | null | undefined): "youtube" | "tiktok" | "instagram" | "other" {
  if (!value) return "other";
  try {
    const hostname = new URL(value).hostname.replace(/^www\./, "").toLowerCase();
    if (hostname === "youtu.be" || hostname === "youtube.com" || hostname.endsWith(".youtube.com")) {
      return "youtube";
    }
    if (hostname === "tiktok.com" || hostname.endsWith(".tiktok.com")) return "tiktok";
    if (hostname === "instagram.com" || hostname.endsWith(".instagram.com")) return "instagram";
  } catch {
    return "other";
  }
  return "other";
}

function isInstagramPayload(payload: LinkAddPayload) {
  return payload.creator_platform === "instagram"
    || sourceFromUrl(payload.canonical_url) === "instagram"
    || sourceFromUrl(payload.url) === "instagram";
}

function isShortLivedSocialThumbnail(payload: LinkAddPayload) {
  return isTikTokPayload(payload) || isInstagramPayload(payload);
}

function stableSocialThumbnailKey(payload: LinkAddPayload, suggestionId: string) {
  if (isInstagramPayload(payload)) {
    let id = suggestionId;
    try {
      const parsed = new URL(payload.canonical_url ?? payload.url ?? "");
      id = parsed.pathname.split("/").filter(Boolean).slice(0, 3).join("-") || suggestionId;
    } catch {
      id = suggestionId;
    }
    return `instagram/${id}.jpg`;
  }

  const videoId = tiktokVideoIdFromUrl(payload.canonical_url) ?? tiktokVideoIdFromUrl(payload.url) ?? suggestionId;
  return `tiktok/${videoId}.jpg`;
}

function decodeHtmlEntities(value: string | null | undefined) {
  if (!value) return null;
  return value
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim() || null;
}

function metaTagContent(html: string, keys: string[]) {
  const wanted = new Set(keys.map((key) => key.toLowerCase()));
  const tags = html.match(/<meta\b[^>]*>/gi) ?? [];
  for (const tag of tags) {
    const attrs = new Map<string, string>();
    for (const match of tag.matchAll(/\s([a-zA-Z:-]+)\s*=\s*["']([^"']*)["']/g)) {
      attrs.set(match[1].toLowerCase(), match[2]);
    }
    const key = attrs.get("property") ?? attrs.get("name");
    if (key && wanted.has(key.toLowerCase())) {
      return decodeHtmlEntities(attrs.get("content"));
    }
  }
  return null;
}

function titleTagContent(html: string) {
  const match = html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i);
  return decodeHtmlEntities(match?.[1]);
}

async function fetchTikTokOEmbed(payload: LinkAddPayload) {
  const url = payload.canonical_url ?? payload.url;
  if (!url) return null;
  const endpoint = `https://www.tiktok.com/oembed?url=${encodeURIComponent(url)}`;
  const response = await fetch(endpoint, {
    headers: { "user-agent": "Subskills/1.0 (+https://subskills.xyz)" },
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) {
    console.warn("apply_suggestion_tiktok_oembed_failed", {
      status: response.status,
      url,
    });
    return null;
  }
  return await response.json() as {
    title?: string;
    thumbnail_url?: string;
    author_name?: string;
    author_url?: string;
  };
}

async function fetchOpenGraph(payload: LinkAddPayload) {
  const url = payload.canonical_url ?? payload.url;
  if (!url) return null;
  const response = await fetch(url, {
    headers: {
      accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "user-agent": "Subskills/1.0 (+https://subskills.xyz)",
    },
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) {
    console.warn("apply_suggestion_og_fetch_failed", {
      status: response.status,
      url,
    });
    return null;
  }

  const html = await response.text();
  return {
    title: metaTagContent(html, ["og:title", "twitter:title"]) ?? titleTagContent(html),
    description: metaTagContent(html, ["og:description", "twitter:description", "description"]),
    thumbnail_url: metaTagContent(html, ["og:image", "twitter:image", "twitter:image:src"]),
  };
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

  const nextEvidence: Record<string, unknown> = {
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

/**
 * A human suggestion carries only a URL. Both clients send url, canonical_url,
 * target_skill_id, public_note, skill_level and language — no title, description or
 * thumbnail (apps/web/components/SuggestForm.tsx, apps/mobile/app/suggest.tsx).
 * Collector submissions arrive fully populated, so nothing downstream ever had to
 * cope with a bare link.
 *
 * Without this, a genuinely new user-suggested URL lands with title, description,
 * thumbnail_url and content_type all NULL and preview_status 'pending' — nothing
 * backfills that — so the card renders blank and get_unscored_for_coach hands the
 * coach a NULL title, description and transcript to judge. (URLs already in the
 * catalogue hid this: the RPC's `on conflict ... coalesce` keeps existing metadata.)
 *
 * YouTube and TikTok both have keyless oEmbed endpoints. Instagram public reels
 * expose enough Open Graph data to produce a useful card, but their CDN thumbnails
 * are short-lived, so the cache step below mirrors them to Storage just like TikTok.
 * Enrich the PAYLOAD rather than the row, so apply_suggestion_transaction's own
 * insert consumes it, including preview_status and thumbnail_storage_path.
 * Best-effort by design: the caller swallows failures so a flaky scrape can never
 * block an otherwise valid suggestion.
 */
async function enrichBareLinkPayloadIfNeeded(suggestionId: string) {
  const supabase = getServiceClient();
  const { data: suggestion, error } = await supabase
    .from("suggestions")
    .select("id, type, payload_json")
    .eq("id", suggestionId)
    .single();
  if (error) throw error;
  if (suggestion.type !== "LINK_ADD") return;

  const payload = suggestion.payload_json as LinkAddPayload;
  // Anything the collector produced already has these; only bare human links need it.
  if (payload.title && (payload.thumbnail_url || payload.thumbnail_storage_path)) return;

  const videoId = youtubeVideoIdFromUrl(payload.canonical_url) ?? youtubeVideoIdFromUrl(payload.url);
  if (!videoId && isTikTokPayload(payload)) {
    const body = await fetchTikTokOEmbed(payload);
    if (!body) return;
    await updateSuggestionPayload(suggestionId, {
      ...payload,
      title: payload.title ?? body.title ?? null,
      thumbnail_url: payload.thumbnail_url ?? body.thumbnail_url ?? null,
      content_type: payload.content_type ?? "video",
      creator_handle: payload.creator_handle ?? body.author_name ?? null,
      creator_url: payload.creator_url ?? body.author_url ?? null,
      creator_platform: payload.creator_platform ?? "tiktok",
      scoring_strategy: payload.scoring_strategy ?? "engagement_authority",
    });
    console.info("apply_suggestion_tiktok_metadata_enriched", {
      suggestion_id: suggestionId,
      has_title: Boolean(payload.title ?? body.title),
      has_thumbnail: Boolean(payload.thumbnail_url ?? body.thumbnail_url),
    });
    return;
  }

  if (!videoId && isInstagramPayload(payload)) {
    const og = await fetchOpenGraph(payload);
    if (!og) return;
    await updateSuggestionPayload(suggestionId, {
      ...payload,
      title: payload.title ?? og.title,
      description: payload.description ?? og.description,
      thumbnail_url: payload.thumbnail_url ?? og.thumbnail_url,
      content_type: payload.content_type ?? "video",
      creator_platform: payload.creator_platform ?? "instagram",
      scoring_strategy: payload.scoring_strategy ?? "engagement_authority",
    });
    console.info("apply_suggestion_instagram_metadata_enriched", {
      suggestion_id: suggestionId,
      has_title: Boolean(payload.title ?? og.title),
      has_description: Boolean(payload.description ?? og.description),
      has_thumbnail: Boolean(payload.thumbnail_url ?? og.thumbnail_url),
    });
    return;
  }

  if (!videoId) return;

  const watchUrl = `https://www.youtube.com/watch?v=${videoId}`;
  const endpoint = `https://www.youtube.com/oembed?url=${encodeURIComponent(watchUrl)}&format=json`;

  const response = await fetch(endpoint, { signal: AbortSignal.timeout(10_000) });
  if (!response.ok) {
    // 404 here is meaningful: private, deleted or bogus video id.
    console.warn("apply_suggestion_oembed_failed", {
      suggestion_id: suggestionId,
      video_id: videoId,
      status: response.status,
    });
    return;
  }

  const body = await response.json() as {
    title?: string;
    thumbnail_url?: string;
    author_name?: string;
  };

  await updateSuggestionPayload(suggestionId, {
    ...payload,
    title: body.title ?? null,
    // Fall back to the deterministic thumbnail path; oEmbed always has one, but the
    // link is useless without an image and this URL is derivable from the id alone.
    thumbnail_url: body.thumbnail_url ?? `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
    content_type: "video",
    creator_handle: payload.creator_handle ?? body.author_name ?? null,
    creator_platform: payload.creator_platform ?? "youtube",
    scoring_strategy: payload.scoring_strategy ?? "transcript_llm",
  });

  console.info("apply_suggestion_link_metadata_enriched", {
    suggestion_id: suggestionId,
    video_id: videoId,
    has_title: Boolean(body.title),
  });
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

  if (isShortLivedSocialThumbnail(payload)) {
    try {
      const attemptedAt = new Date().toISOString();
      const storedPath = await cacheThumbnail(payload.thumbnail_url, stableSocialThumbnailKey(payload, suggestionId));
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
      console.info("apply_suggestion_social_thumbnail_cached", {
        suggestion_id: suggestionId,
        link_id: suggestion.link_id,
        source: isInstagramPayload(payload) ? "instagram" : "tiktok",
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
      console.warn("apply_suggestion_social_thumbnail_cache_failed", {
        suggestion_id: suggestionId,
        link_id: suggestion.link_id,
        source: isInstagramPayload(payload) ? "instagram" : "tiktok",
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

async function applyEngagementMetadataIfNeeded(suggestionId: string) {
  const supabase = getServiceClient();
  const { data: suggestion, error } = await supabase
    .from("suggestions")
    .select("id, type, link_id, payload_json, evidence_json")
    .eq("id", suggestionId)
    .single();
  if (error) throw error;
  if (suggestion.type !== "LINK_ADD" || !suggestion.link_id) return;

  const payload = suggestion.payload_json as LinkAddPayload;
  if (!isTikTokPayload(payload) && !isInstagramPayload(payload)) return;

  const profile = payload.creator_profile ?? {};
  const handle = cleanHandle(payload.creator_handle ?? profile.handle);
  const { data: creatorId, error: linkError } = await supabase.rpc("apply_tiktok_link_metadata", {
    p_link_id: suggestion.link_id,
    p_creator_platform: payload.creator_platform ?? (isInstagramPayload(payload) ? "instagram" : "tiktok"),
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

  console.info("apply_suggestion_engagement_metadata_applied", {
    suggestion_id: suggestionId,
    link_id: suggestion.link_id,
    creator_id: creatorId,
    creator_handle: handle,
    creator_platform: payload.creator_platform ?? (isInstagramPayload(payload) ? "instagram" : "tiktok"),
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
    const body = await readJson<{
      suggestion_id: string;
      moderator_user_id?: string | null;
      keep_pending?: boolean | null;
    }>(request);
    if (!body.suggestion_id) return jsonResponse({ error: "suggestion_id is required" }, 400, request);

    const sourceResult = await applySourceAddIfNeeded(
      body.suggestion_id,
      body.moderator_user_id ?? null,
    );
    if (sourceResult) return jsonResponse(sourceResult, 200, request);

    // Must run BEFORE the transaction: the RPC reads title/thumbnail/content_type
    // straight out of payload_json, and its `on conflict ... coalesce` means a value
    // written afterwards would not reach an existing row anyway.
    try {
      await enrichBareLinkPayloadIfNeeded(body.suggestion_id);
    } catch (enrichError) {
      console.warn("apply_suggestion_link_metadata_enrich_failed", {
        suggestion_id: body.suggestion_id,
        message: enrichError instanceof Error ? enrichError.message : String(enrichError),
      });
    }

    const supabase = getServiceClient();
    const { data, error } = await supabase.rpc("apply_suggestion_transaction", {
      p_suggestion_id: body.suggestion_id,
      p_moderator_user_id: body.moderator_user_id ?? null,
      p_keep_pending: Boolean(body.keep_pending),
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
    await applyEngagementMetadataIfNeeded(body.suggestion_id);

    return jsonResponse(data, 200, request);
  } catch (error) {
    return errorResponse(error, 500, request);
  }
});
