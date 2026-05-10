// Dormant for local-collection MVP.
// The free-tier collection path runs through scripts/run-collection.mjs and
// scripts/run-article-collection.mjs; keep this cloud Edge Function for a future
// deployed-agent mode.
import { scoreTranscript } from "../_shared/llm.ts";
import { createRunLogger } from "../_shared/logger.ts";
import { normalizeCanonicalUrl } from "../_shared/normalization.ts";
import { corsForbiddenResponse, errorResponse, isAllowedCorsOrigin, jsonResponse, optionsResponse, readJson } from "../_shared/responses.ts";
import { callFunction, getServiceClient } from "../_shared/supabase.ts";
import { fetchTranscript, TranscriptFetchError, TranscriptUnavailableError } from "../_shared/youtube.ts";

function thresholds() {
  return {
    relevance: Number(Deno.env.get("LINK_CHECKER_RELEVANCE_THRESHOLD") ?? Deno.env.get("STAGE2_RELEVANCE_THRESHOLD") ?? 0.7),
    quality: Number(Deno.env.get("LINK_CHECKER_QUALITY_THRESHOLD") ?? Deno.env.get("STAGE2_QUALITY_THRESHOLD") ?? 0.6),
  };
}

function youtubeVideoId(url: string | null | undefined) {
  if (!url) return null;
  try {
    const parsed = new URL(normalizeCanonicalUrl(url));
    if (!parsed.hostname.includes("youtube.com")) return null;
    return parsed.searchParams.get("v");
  } catch {
    return null;
  }
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return optionsResponse(request);
  if (!isAllowedCorsOrigin(request)) return corsForbiddenResponse(request);
  if (request.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405, request);

  const supabase = getServiceClient();
  let runId: string | null = null;

  try {
    const body = await readJson<{ relation_id: string }>(request);
    if (!body.relation_id) return jsonResponse({ error: "relation_id is required" }, 400, request);

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

    const logger = createRunLogger(supabase, { runId, agentType: "link_checker" });
    const config = thresholds();
    await logger.info("run_started", "Link checker started", {
      relation_id: body.relation_id,
      config,
    });

    const { data: relation, error: relationError } = await supabase
      .from("link_skill_relations")
      .select("id, link_id, skill_id, upvote_count, links(id, url, canonical_url, title, description, domain, content_type, thumbnail_url, is_active), skills(id, name, description, category_id)")
      .eq("id", body.relation_id)
      .single();
    if (relationError) throw relationError;

    const link = Array.isArray(relation.links) ? relation.links[0] : relation.links;
    const skill = Array.isArray(relation.skills) ? relation.skills[0] : relation.skills;
    if (!link || !skill) throw new Error("Relation is missing link or skill");

    let evidenceText = [link.title, link.description].filter(Boolean).join("\n\n");
    const videoId = youtubeVideoId(link.canonical_url ?? link.url);
    if (videoId) {
      try {
        evidenceText = await fetchTranscript(videoId);
        await logger.debug("transcript_loaded", "Loaded current transcript for YouTube relation", {
          relation_id: relation.id,
          link_id: link.id,
          video_id: videoId,
          transcript_length: evidenceText.length,
        });
      } catch (error) {
        const eventType =
          error instanceof TranscriptUnavailableError
            ? "transcript_unavailable"
            : error instanceof TranscriptFetchError
              ? "transcript_fetch_failed"
              : "transcript_unknown_error";
        await logger.warn(eventType, error instanceof Error ? error.message : String(error), {
          relation_id: relation.id,
          link_id: link.id,
          video_id: videoId,
        });
      }
    }

    if (!evidenceText.trim()) {
      await logger.warn("insufficient_evidence", "No title, description, or transcript was available for re-scoring", {
        relation_id: relation.id,
        link_id: link.id,
      });
      evidenceText = `${link.title ?? "Untitled resource"}\n${link.domain ?? ""}`;
    }

    const score = await scoreTranscript(
      skill,
      { title: link.title ?? link.url, channel: link.domain },
      evidenceText,
    );

    await logger.info("relation_scored", "Existing relation re-scored", {
      relation_id: relation.id,
      link_id: link.id,
      skill_id: skill.id,
      relevance: score.relevance,
      teaching_quality: score.teaching_quality,
      model: score.model,
      cost_usd: score.cost_usd,
    });

    // LINK_ATTACH_SKILL is intentionally not emitted here: the checker only
    // re-scores an existing relation, so it can detach stale matches or upvote
    // still-good ones without inventing new attachments.
    const suggestion =
      score.relevance < config.relevance
        ? {
            type: "LINK_DETACH_SKILL",
            payload_json: {
              link_id: link.id,
              target_skill_id: skill.id,
              reason: `Re-check score fell below relevance threshold (${score.relevance.toFixed(2)} < ${config.relevance}).`,
            },
            confidence: 1 - score.relevance,
          }
        : score.teaching_quality >= config.quality
          ? {
              type: "LINK_UPVOTE_SKILL",
              payload_json: {
                link_id: link.id,
                target_skill_id: skill.id,
                reason: score.public_note,
              },
              confidence: Math.min(score.relevance, score.teaching_quality),
            }
          : null;

    let suggestionsCreated = 0;
    let submitted: { suggestion_id: string; duplicate?: boolean } | null = null;

    if (suggestion) {
      submitted = await callFunction<{ suggestion_id: string; duplicate?: boolean }>(
        "submit-suggestion",
        {
          type: suggestion.type,
          status: "pending",
          origin_type: "agent",
          origin_name: "link-checker",
          category_id: skill.category_id,
          skill_id: skill.id,
          link_id: link.id,
          payload_json: suggestion.payload_json,
          evidence_json: {
            source: "relation_recheck",
            current_upvote_count: relation.upvote_count,
            link_title: link.title,
            score,
            evidence_excerpt: evidenceText.slice(0, 600),
          },
          confidence: suggestion.confidence,
        },
      );
      suggestionsCreated = submitted.duplicate ? 0 : 1;
      await logger.info("suggestion_submitted", "Relation recheck emitted a moderation suggestion", {
        suggestion_id: submitted.suggestion_id,
        duplicate: Boolean(submitted.duplicate),
        suggestion_type: suggestion.type,
        relation_id: relation.id,
      });
    } else {
      await logger.info("relation_held", "Relation remained relevant but did not meet the upvote threshold", {
        relation_id: relation.id,
        link_id: link.id,
        relevance: score.relevance,
        teaching_quality: score.teaching_quality,
      });
    }

    await supabase
      .from("link_skill_relations")
      .update({ last_checked_at: new Date().toISOString() })
      .eq("id", body.relation_id);

    const { error: updateError } = await supabase
      .from("agent_runs")
      .update({
        status: "completed",
        suggestions_created: suggestionsCreated,
        cost_usd: score.cost_usd ?? 0,
        completed_at: new Date().toISOString(),
      })
      .eq("id", runId);
    if (updateError) throw updateError;

    await logger.info("run_completed", "Link checker completed", {
      suggestions_created: suggestionsCreated,
      emitted_suggestion_id: submitted?.suggestion_id ?? null,
    });

    return jsonResponse({ run_id: runId, suggestions_created: suggestionsCreated }, 200, request);
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
    return errorResponse(error, 500, request);
  }
});
