import { buildDedupeKey } from "../_shared/dedupe.ts";
import { getDomain, normalizeCanonicalUrl } from "../_shared/normalization.ts";
import { corsForbiddenResponse, errorResponse, isAllowedCorsOrigin, jsonResponse, optionsResponse, readJson } from "../_shared/responses.ts";
import { submitSuggestionSchema, suggestionPayloadByType } from "../_shared/schemas.ts";
import { chooseInternalAuthor } from "../_shared/database.ts";
import { callFunction, getServiceClient } from "../_shared/supabase.ts";
import { cacheThumbnail } from "../_shared/thumbnail-storage.ts";
import { tiktokVideoIdFromUrl } from "../_shared/tiktok-url.mjs";
import { finalSuggestionStatus, isInternalRequest, resolveSubmittedByUserId } from "./security.ts";

const HUMAN_RATE_LIMIT_WINDOW_SECONDS = 60 * 60;
const HUMAN_RATE_LIMIT_MAX = 10;
const RECENT_DUPLICATE_WINDOW_MS = 24 * 60 * 60 * 1000;
const STATIC_SPAM_DOMAINS = new Set([
  "bit.ly",
  "tinyurl.com",
  "goo.gl",
  "ow.ly",
  "is.gd",
  "cutt.ly",
  "rebrand.ly",
  "t.co",
  "shorte.st",
  "adf.ly",
  "bc.vc",
  "clk.sh",
  "linkvertise.com",
  "ouo.io",
  "sh.st",
  "trafficmonsoon.com",
]);

function clientIp(request: Request) {
  const forwardedFor = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return (
    request.headers.get("cf-connecting-ip") ??
    forwardedFor ??
    request.headers.get("x-real-ip") ??
    "unknown"
  );
}

function isPrivateHostname(hostname: string) {
  const normalized = hostname.toLowerCase();
  if (normalized === "localhost" || normalized.endsWith(".localhost") || normalized === "0.0.0.0") {
    return true;
  }
  if (/^10\./.test(normalized)) return true;
  if (/^127\./.test(normalized)) return true;
  if (/^169\.254\./.test(normalized)) return true;
  if (/^192\.168\./.test(normalized)) return true;
  if (/^172\.(1[6-9]|2\d|3[0-1])\./.test(normalized)) return true;
  return false;
}

function validateHumanLinkUrl(value: string) {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error("URL is invalid.");
  }

  if (!["http:", "https:"].includes(parsed.protocol)) {
    throw new Error("Only http and https URLs can be suggested.");
  }

  const hostname = parsed.hostname.replace(/^www\./, "").toLowerCase();
  if (!hostname.includes(".") || isPrivateHostname(hostname)) {
    throw new Error("Public links only, please.");
  }
  if (STATIC_SPAM_DOMAINS.has(hostname)) {
    throw new Error("That domain is not accepted for public suggestions.");
  }
}

async function cacheInternalTikTokThumbnailIfNeeded(
  payload: Record<string, unknown>,
  internalRequest: boolean,
) {
  if (!internalRequest) return;
  if (payload.scoring_strategy !== "engagement_authority") return;
  if (typeof payload.thumbnail_storage_path === "string" && payload.thumbnail_storage_path) return;
  if (typeof payload.thumbnail_url !== "string" || !payload.thumbnail_url) return;

  const videoId = tiktokVideoIdFromUrl(
    typeof payload.canonical_url === "string" ? payload.canonical_url : typeof payload.url === "string" ? payload.url : null,
  );
  if (!videoId) return;

  try {
    const attemptedAt = new Date().toISOString();
    payload.thumbnail_storage_path = await cacheThumbnail(payload.thumbnail_url, `tiktok/${videoId}.jpg`);
    payload.thumbnail_cache_status = "cached";
    payload.thumbnail_cache_error = null;
    payload.thumbnail_cache_attempted_at = attemptedAt;
    console.info("submit_suggestion_tiktok_thumbnail_cached", {
      video_id: videoId,
      thumbnail_storage_path: payload.thumbnail_storage_path,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    payload.thumbnail_cache_status = "failed";
    payload.thumbnail_cache_error = message.slice(0, 500);
    payload.thumbnail_cache_attempted_at = new Date().toISOString();
    console.warn("submit_suggestion_tiktok_thumbnail_cache_failed", {
      video_id: videoId,
      message,
    });
  }
}

async function verifyTurnstileIfConfigured(token: string | null | undefined, ip: string) {
  const siteKey = Deno.env.get("SUGGEST_TURNSTILE_SITE_KEY");
  const secret = Deno.env.get("SUGGEST_TURNSTILE_SECRET_KEY");
  if (!siteKey && !secret) return;
  if (!token) {
    throw Object.assign(new Error("Turnstile verification is required."), { status: 403 });
  }
  if (!secret) {
    throw Object.assign(new Error("SUGGEST_TURNSTILE_SECRET_KEY is required when Turnstile is enabled."), { status: 500 });
  }

  const form = new FormData();
  form.append("secret", secret);
  form.append("response", token);
  if (ip !== "unknown") form.append("remoteip", ip);

  const response = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
    method: "POST",
    body: form,
  });
  const body = await response.json().catch(() => null) as { success?: boolean } | null;
  if (!response.ok || body?.success !== true) {
    throw Object.assign(new Error("Turnstile verification failed."), { status: 403 });
  }
}

async function enforceHumanRateLimit(
  supabase: ReturnType<typeof getServiceClient>,
  ip: string,
) {
  const { data, error } = await supabase.rpc("check_suggest_rate_limit", {
    p_ip: ip,
    p_limit: HUMAN_RATE_LIMIT_MAX,
    p_window_seconds: HUMAN_RATE_LIMIT_WINDOW_SECONDS,
  }).single();
  if (error) throw error;
  if (!data) throw new Error("Rate limit check returned no result.");
  const result = data as { allowed: boolean; request_count: number; window_start: string };

  console.info("submit_suggestion_rate_limit_checked", {
    ip,
    allowed: result.allowed,
    count: result.request_count,
    window_start: result.window_start,
  });

  if (!result.allowed) {
    throw Object.assign(new Error("Slow down. Please try again in about an hour."), { status: 429 });
  }
}

async function submittedUserIdFromAuthorization(
  supabase: ReturnType<typeof getServiceClient>,
  request: Request,
) {
  const authorization = request.headers.get("authorization");
  const token = authorization?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) return null;
  const { data, error } = await supabase.auth.getUser(token);
  if (error) {
    console.warn("submit_suggestion_auth_user_lookup_failed", { message: error.message });
    return null;
  }
  return data.user?.id ?? null;
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return optionsResponse(request);
  if (!isAllowedCorsOrigin(request)) return corsForbiddenResponse(request);
  if (request.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405, request);

  try {
    const supabase = getServiceClient();
    const input = submitSuggestionSchema.parse(await readJson(request));
    const ip = clientIp(request);
    const requestedStatus = input.requested_status ?? input.status;
    const internalRequest = isInternalRequest(request);
    const finalStatus = finalSuggestionStatus(internalRequest, requestedStatus);
    const payload = suggestionPayloadByType[input.type].parse(input.payload_json) as Record<string, unknown>;
    const isHuman = input.origin_type === "human";

    console.info("submit_suggestion_received", {
      type: input.type,
      origin_type: input.origin_type,
      origin_name: input.origin_name,
      requested_status: requestedStatus,
      final_status: finalStatus,
      internal_request: internalRequest,
      ip,
    });

    if (isHuman) {
      await verifyTurnstileIfConfigured(input.turnstile_token, ip);
      await enforceHumanRateLimit(supabase, ip);
    }

    if (input.type === "LINK_ADD") {
      if (isHuman) validateHumanLinkUrl(String(payload.url));
      payload.canonical_url = normalizeCanonicalUrl(String(payload.canonical_url));
      payload.domain = getDomain(String(payload.canonical_url));
      await cacheInternalTikTokThumbnailIfNeeded(payload, internalRequest);
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
      console.info("submit_suggestion_duplicate_active", {
        suggestion_id: existing.id,
        status: existing.status,
        dedupe_key: dedupeKey,
      });
      return jsonResponse({
        suggestion_id: existing.id,
        status: existing.status,
        duplicate: true,
      }, 200, request);
    }

    if (input.type === "LINK_ADD") {
      const since = new Date(Date.now() - RECENT_DUPLICATE_WINDOW_MS).toISOString();
      let recentQuery = supabase
        .from("suggestions")
        .select("id, status")
        .eq("type", "LINK_ADD")
        .eq("payload_json->>canonical_url", String(payload.canonical_url))
        .gte("created_at", since);
      // Agent/internal collection legitimately multi-tags the same video across
      // sub-skills (search surfaces it under several), so dedupe a recent URL only
      // within the SAME target skill. Human submissions keep the broad URL-level
      // guard (anti-abuse).
      if (internalRequest && targetSkillId) {
        recentQuery = recentQuery.eq("payload_json->>target_skill_id", String(targetSkillId));
      }
      const { data: recent, error: recentError } = await recentQuery
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (recentError) throw recentError;
      if (recent) {
        console.info("submit_suggestion_duplicate_recent_url", {
          suggestion_id: recent.id,
          status: recent.status,
          canonical_url: payload.canonical_url,
          target_skill_id: internalRequest ? targetSkillId : undefined,
        });
        return jsonResponse({
          suggestion_id: recent.id,
          status: recent.status,
          duplicate: true,
          message: "already submitted, thanks",
        }, 200, request);
      }
    }

    const bearerUserId = await submittedUserIdFromAuthorization(supabase, request);
    const submittedByUserId = resolveSubmittedByUserId({
      bearerUserId,
      bodySubmittedByUserId: input.submitted_by_user_id ?? null,
      internalRequest,
    });

    if (!internalRequest && input.submitted_by_user_id && input.submitted_by_user_id !== submittedByUserId) {
      console.warn("submit_suggestion_body_attribution_ignored", {
        origin_type: input.origin_type,
        body_submitted_by_user_id: input.submitted_by_user_id,
        bearer_user_id: bearerUserId,
      });
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
        submitted_by_user_id: submittedByUserId,
        payload_json: payload,
        evidence_json: input.evidence_json ?? null,
        triangulation_json: input.triangulation_json ?? null,
        confidence: input.confidence ?? null,
        dedupe_key: dedupeKey,
      })
      .select("id, status")
      .single();

    if (insertError) throw insertError;

    console.info("submit_suggestion_inserted", {
      suggestion_id: inserted.id,
      status: inserted.status,
      submitted_by_user_id: submittedByUserId,
      dedupe_key: dedupeKey,
    });

    if (finalStatus === "auto_approved") {
      console.info("submit_suggestion_auto_apply_started", {
        suggestion_id: inserted.id,
        requested_status: requestedStatus,
      });
      const applied = await callFunction("apply-suggestion", {
        suggestion_id: inserted.id,
        moderator_user_id: null,
      });
      console.info("submit_suggestion_auto_apply_completed", {
        suggestion_id: inserted.id,
      });
      return jsonResponse({
        suggestion_id: inserted.id,
        status: "auto_approved",
        requested_status: requestedStatus,
        applied,
      }, 200, request);
    }

    return jsonResponse({
      suggestion_id: inserted.id,
      status: inserted.status,
      requested_status: requestedStatus,
    }, 200, request);
  } catch (error) {
    const status = error && typeof error === "object" && "status" in error
      ? Number((error as { status?: number }).status)
      : 500;
    console.warn("submit_suggestion_failed", {
      status,
      message: error instanceof Error ? error.message : String(error),
    });
    return errorResponse(error, status, request);
  }
});
