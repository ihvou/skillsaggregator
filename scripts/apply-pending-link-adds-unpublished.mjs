#!/usr/bin/env node
/**
 * One-time M74 backfill:
 *   - applies pending LINK_ADD suggestions through the normal apply path
 *   - leaves new relations active but unpublished (0023 column default)
 *   - moves evidence_json.transcript_full into link_transcripts
 *
 * Usage:
 *   node scripts/apply-pending-link-adds-unpublished.mjs --dry-run
 *   node scripts/apply-pending-link-adds-unpublished.mjs --limit 100
 *   node scripts/apply-pending-link-adds-unpublished.mjs --direct
 */
import {
  createServiceRoleSupabaseClient,
  normalizeTranscriptText,
  transcriptHash,
  transcriptProviderFromFetcher,
  upsertLinkTranscript,
  youtubeVideoIdFromUrl,
} from "./_lib/link-transcripts.mjs";

function parseArgs(argv) {
  const options = {
    dryRun: false,
    direct: false,
    limit: Number(process.env.APPLY_PENDING_LINK_ADDS_LIMIT ?? 1000),
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--dry-run") {
      options.dryRun = true;
    } else if (arg === "--direct") {
      options.direct = true;
    } else if (arg === "--limit") {
      options.limit = Number(argv[index + 1] ?? options.limit);
      index += 1;
    } else if (arg.startsWith("--limit=")) {
      options.limit = Number(arg.slice("--limit=".length));
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (!Number.isFinite(options.limit) || options.limit < 1) {
    throw new Error("--limit must be a positive number");
  }

  return {
    ...options,
    limit: Math.floor(options.limit),
  };
}

function env(name) {
  return process.env[name] ?? "";
}

function log(event, metadata = {}) {
  console.log(JSON.stringify({
    event,
    ts: new Date().toISOString(),
    ...metadata,
  }));
}

function transcriptFullFromEvidence(evidence) {
  return normalizeTranscriptText(evidence?.transcript_full);
}

function nextEvidenceWithoutTranscript(evidence, transcriptText) {
  const nextEvidence = {
    ...(evidence ?? {}),
    transcript_persisted: true,
    transcript_length: transcriptText.length,
    transcript_hash: transcriptHash(transcriptText),
  };
  delete nextEvidence.transcript_full;
  return nextEvidence;
}

function linkIdFromApplyResult(result) {
  if (!result || typeof result !== "object") return null;
  if (typeof result.link_id === "string") return result.link_id;
  if (result.applied && typeof result.applied === "object" && typeof result.applied.link_id === "string") {
    return result.applied.link_id;
  }
  return null;
}

async function listPendingLinkAddSuggestions(supabase, limit) {
  const pageSize = Math.min(limit, 500);
  const rows = [];

  for (let from = 0; rows.length < limit; from += pageSize) {
    const to = Math.min(from + pageSize - 1, limit - 1);
    const { data, error } = await supabase
      .from("suggestions")
      .select("id, status, type, link_id, payload_json, evidence_json, created_at")
      .eq("type", "LINK_ADD")
      .eq("status", "pending")
      .order("created_at", { ascending: true })
      .range(from, to);
    if (error) throw error;
    if (!data?.length) break;
    rows.push(...data);
    if (data.length < pageSize) break;
  }

  return rows.slice(0, limit);
}

async function applyViaEdge(suggestionId) {
  const supabaseUrl = env("SUPABASE_URL") || env("NEXT_PUBLIC_SUPABASE_URL");
  const serviceRoleKey = env("SUPABASE_SERVICE_ROLE_KEY");
  const internalToken = env("INTERNAL_FUNCTION_TOKEN");
  if (!supabaseUrl || !serviceRoleKey || !internalToken) return null;

  const response = await fetch(`${supabaseUrl}/functions/v1/apply-suggestion`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${serviceRoleKey}`,
      "Content-Type": "application/json",
      "x-internal-token": internalToken,
    },
    body: JSON.stringify({
      suggestion_id: suggestionId,
      moderator_user_id: null,
    }),
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`apply-suggestion ${response.status}: ${text}`);
  }
  return text ? JSON.parse(text) : {};
}

async function applyDirect(supabase, suggestionId) {
  const { data, error } = await supabase.rpc("apply_suggestion_transaction", {
    p_suggestion_id: suggestionId,
    p_moderator_user_id: null,
  });
  if (error) throw error;
  return data;
}

async function resolveLinkId(supabase, suggestion, applyResult) {
  const resultLinkId = linkIdFromApplyResult(applyResult);
  if (resultLinkId) return resultLinkId;
  if (suggestion.link_id) return suggestion.link_id;

  const { data: updatedSuggestion, error: suggestionError } = await supabase
    .from("suggestions")
    .select("link_id")
    .eq("id", suggestion.id)
    .maybeSingle();
  if (suggestionError) throw suggestionError;
  if (updatedSuggestion?.link_id) return updatedSuggestion.link_id;

  const canonicalUrl = suggestion.payload_json?.canonical_url ?? suggestion.payload_json?.url;
  if (typeof canonicalUrl !== "string" || !canonicalUrl) return null;

  const { data: link, error: linkError } = await supabase
    .from("links")
    .select("id")
    .eq("canonical_url", canonicalUrl)
    .maybeSingle();
  if (linkError) throw linkError;
  if (link?.id) return link.id;

  const { data: urlLink, error: urlLinkError } = await supabase
    .from("links")
    .select("id")
    .eq("url", canonicalUrl)
    .maybeSingle();
  if (urlLinkError) throw urlLinkError;
  return urlLink?.id ?? null;
}

async function persistTranscriptIfPresent(supabase, suggestion, linkId, dryRun) {
  const evidence = suggestion.evidence_json ?? {};
  const transcriptText = transcriptFullFromEvidence(evidence);
  if (!transcriptText) return { skipped: "missing_transcript_full" };
  if (!linkId) return { skipped: "missing_link_id", transcript_length: transcriptText.length };

  const videoId =
    typeof evidence.video_id === "string"
      ? evidence.video_id
      : youtubeVideoIdFromUrl(suggestion.payload_json?.canonical_url)
        ?? youtubeVideoIdFromUrl(suggestion.payload_json?.url);
  const provider = transcriptProviderFromFetcher(evidence.transcript_fetcher);
  const hash = transcriptHash(transcriptText);

  if (dryRun) {
    return {
      dry_run: true,
      link_id: linkId,
      video_id: videoId,
      provider,
      transcript_length: transcriptText.length,
      transcript_hash: hash,
    };
  }

  await upsertLinkTranscript(supabase, {
    linkId,
    videoId,
    transcriptText,
    provider,
    language: "en",
  });

  const { error } = await supabase
    .from("suggestions")
    .update({ evidence_json: nextEvidenceWithoutTranscript(evidence, transcriptText) })
    .eq("id", suggestion.id);
  if (error) throw error;

  return {
    link_id: linkId,
    video_id: videoId,
    provider,
    transcript_length: transcriptText.length,
    transcript_hash: hash,
  };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const supabase = createServiceRoleSupabaseClient();
  const suggestions = await listPendingLinkAddSuggestions(supabase, options.limit);
  const useEdge = !options.direct && Boolean(env("INTERNAL_FUNCTION_TOKEN"));

  log("pending_link_add_backfill_started", {
    pending_count: suggestions.length,
    dry_run: options.dryRun,
    apply_path: useEdge ? "edge" : "direct_rpc",
    limit: options.limit,
  });

  const stats = {
    seen: 0,
    applied: 0,
    transcripts_persisted: 0,
    transcripts_skipped: 0,
    failed: 0,
  };

  for (const suggestion of suggestions) {
    stats.seen += 1;
    try {
      const transcriptText = transcriptFullFromEvidence(suggestion.evidence_json ?? {});
      if (options.dryRun) {
        log("pending_link_add_backfill_dry_run_item", {
          suggestion_id: suggestion.id,
          created_at: suggestion.created_at,
          has_transcript_full: Boolean(transcriptText),
          transcript_length: transcriptText.length,
        });
        continue;
      }

      const applyResult = useEdge
        ? await applyViaEdge(suggestion.id)
        : await applyDirect(supabase, suggestion.id);
      stats.applied += 1;

      const linkId = await resolveLinkId(supabase, suggestion, applyResult);
      const transcriptResult = await persistTranscriptIfPresent(supabase, suggestion, linkId, false);
      if (transcriptResult.skipped) {
        stats.transcripts_skipped += 1;
      } else {
        stats.transcripts_persisted += 1;
      }

      log("pending_link_add_backfill_item_applied", {
        suggestion_id: suggestion.id,
        link_id: linkId,
        apply_path: useEdge ? "edge" : "direct_rpc",
        transcript: transcriptResult,
      });
    } catch (error) {
      stats.failed += 1;
      log("pending_link_add_backfill_item_failed", {
        suggestion_id: suggestion.id,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  log("pending_link_add_backfill_finished", stats);
  if (stats.failed > 0) process.exitCode = 1;
}

main().catch((error) => {
  log("pending_link_add_backfill_fatal", {
    message: error instanceof Error ? error.message : String(error),
  });
  process.exitCode = 1;
});
