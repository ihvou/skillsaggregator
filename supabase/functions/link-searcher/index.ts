import { loadSkill, loadTrustedYouTubeChannels } from "../_shared/database.ts";
import { generateSearchQueries, scoreTranscript } from "../_shared/llm.ts";
import { createRunLogger } from "../_shared/logger.ts";
import { getDomain } from "../_shared/normalization.ts";
import { corsHeaders, errorResponse, jsonResponse, readJson } from "../_shared/responses.ts";
import { callFunction, getServiceClient, internalFunctionHeaders } from "../_shared/supabase.ts";
import {
  fetchTranscript,
  searchYouTube,
  TranscriptFetchError,
  TranscriptUnavailableError,
  type YouTubeCandidate,
  YouTubeApiError,
} from "../_shared/youtube.ts";

interface TriangulationResponse {
  votes: Array<{
    model: string;
    approve: boolean;
    confidence: number;
    reason: string;
    cost_usd?: number;
  }>;
  approve_count: number;
  cost_usd?: number;
}

interface LinkSearcherRequest {
  skill_id: string;
}

type EdgeRuntime = {
  waitUntil?: (promise: Promise<unknown>) => void;
};

function thresholds() {
  return {
    relevance: Number(Deno.env.get("STAGE2_RELEVANCE_THRESHOLD") ?? 0.7),
    quality: Number(Deno.env.get("STAGE2_QUALITY_THRESHOLD") ?? 0.6),
    approveCount: Number(Deno.env.get("TRIANGULATION_APPROVE_COUNT") ?? 2),
    maxCandidates: Number(Deno.env.get("LINK_SEARCHER_MAX_CANDIDATES_PER_RUN") ?? 30),
    costCapUsd: Number(Deno.env.get("RUN_COST_CAP_USD") ?? 0.5),
  };
}

function runInBackground(promise: Promise<unknown>) {
  const runtime = (globalThis as { EdgeRuntime?: EdgeRuntime }).EdgeRuntime;
  if (runtime?.waitUntil) runtime.waitUntil(promise);
  else void promise;
}

async function processRun(runId: string, skillId: string) {
  const supabase = getServiceClient();
  const logger = createRunLogger(supabase, { runId, agentType: "link_searcher" });
  const config = thresholds();
  let suggestionsCreated = 0;
  let triangulationCalls = 0;
  let actualCostUsd = 0;

  try {
    await logger.info("run_started", "Link searcher background work started", {
      skill_id: skillId,
      config,
      internal_token_configured: Boolean(Deno.env.get("INTERNAL_FUNCTION_TOKEN")),
    });

    const skill = await loadSkill(supabase, skillId);
    const channels = await loadTrustedYouTubeChannels(supabase, skill.category_id);
    const queries = await generateSearchQueries(skill.category, skill);
    await logger.info("discovery_inputs_loaded", "Loaded skill, trusted channels, and generated queries", {
      skill: { id: skill.id, slug: skill.slug, name: skill.name },
      channel_count: channels.length,
      queries,
    });

    const seen = new Set<string>();
    const candidates: YouTubeCandidate[] = [];

    for (const query of queries) {
      for (const channelId of channels) {
        try {
          const found = await searchYouTube(query, channelId);
          await logger.debug("youtube_candidates_loaded", "Loaded upload candidates for query/channel", {
            query,
            channel_id: channelId,
            count: found.length,
          });

          for (const candidate of found) {
            if (!seen.has(candidate.canonical_url)) {
              seen.add(candidate.canonical_url);
              candidates.push(candidate);
            }
            if (candidates.length >= config.maxCandidates) break;
          }
        } catch (error) {
          if (error instanceof YouTubeApiError) {
            await logger.error("youtube_api_failed", error.message, {
              query,
              channel_id: channelId,
              status: error.status,
              reason: error.reason,
              quota_exceeded: error.quotaExceeded,
            });
            if (error.quotaExceeded) throw error;
          } else {
            await logger.warn("youtube_channel_skipped", error instanceof Error ? error.message : String(error), {
              query,
              channel_id: channelId,
            });
          }
        }
        if (candidates.length >= config.maxCandidates) break;
      }
      if (candidates.length >= config.maxCandidates) break;
    }

    await logger.info("candidate_pool_ready", "Candidate pool assembled", {
      candidate_count: candidates.length,
      max_candidates: config.maxCandidates,
    });

    for (const candidate of candidates) {
      if (actualCostUsd >= config.costCapUsd) {
        await logger.warn("cost_cap_reached", "Stopping run because the configured cost cap was reached", {
          cost_usd: actualCostUsd,
          cap_usd: config.costCapUsd,
        });
        break;
      }

      await logger.debug("candidate_started", "Evaluating candidate", {
        title: candidate.title,
        canonical_url: candidate.canonical_url,
        channel_id: candidate.channel_id,
      });

      const { data: existingLink, error: existingError } = await supabase
        .from("links")
        .select("id")
        .eq("canonical_url", candidate.canonical_url)
        .maybeSingle();
      if (existingError) throw existingError;
      if (existingLink) {
        await logger.debug("candidate_skipped_existing_link", "Candidate already exists in links", {
          link_id: existingLink.id,
          canonical_url: candidate.canonical_url,
        });
        continue;
      }

      let transcript = "";
      try {
        transcript = await fetchTranscript(candidate.video_id);
      } catch (error) {
        const eventType =
          error instanceof TranscriptUnavailableError
            ? "candidate_no_transcript"
            : error instanceof TranscriptFetchError
              ? "candidate_transcript_fetch_failed"
              : "candidate_transcript_unknown_error";
        await logger.warn(eventType, error instanceof Error ? error.message : String(error), {
          video_id: candidate.video_id,
          canonical_url: candidate.canonical_url,
        });
      }
      if (!transcript) continue;

      const score = await scoreTranscript(
        skill,
        { title: candidate.title, channel: candidate.channel_title },
        transcript,
      ).catch(async (error) => {
        await logger.warn("candidate_score_failed", error instanceof Error ? error.message : String(error), {
          video_id: candidate.video_id,
          canonical_url: candidate.canonical_url,
        });
        return null;
      });
      if (!score) continue;
      actualCostUsd += score.cost_usd ?? 0;

      await logger.debug("candidate_scored", "Candidate scored by transcript model", {
        canonical_url: candidate.canonical_url,
        relevance: score.relevance,
        teaching_quality: score.teaching_quality,
        demo_vs_talk: score.demo_vs_talk,
        level: score.level,
        model: score.model,
        cost_usd: score.cost_usd,
      });

      if (score.relevance < config.relevance || score.teaching_quality < config.quality) {
        await logger.debug("candidate_rejected_threshold", "Candidate failed configured score thresholds", {
          canonical_url: candidate.canonical_url,
          relevance: score.relevance,
          relevance_threshold: config.relevance,
          teaching_quality: score.teaching_quality,
          quality_threshold: config.quality,
        });
        continue;
      }

      const triangulation = await callFunction<TriangulationResponse>("triangulate", {
        candidate: {
          title: candidate.title,
          url: candidate.url,
          public_note: score.public_note,
        },
        skill: {
          name: skill.name,
          description: skill.description,
        },
      });
      triangulationCalls += 1;
      actualCostUsd += triangulation.cost_usd ?? 0;

      await logger.debug("candidate_triangulated", "Triangulation complete", {
        canonical_url: candidate.canonical_url,
        approve_count: triangulation.approve_count,
        required_approve_count: config.approveCount,
        votes: triangulation.votes,
        cost_usd: triangulation.cost_usd,
      });

      const requestedStatus =
        triangulation.approve_count >= config.approveCount ? "auto_approved" : "pending";

      const submitted = await callFunction<{ suggestion_id: string; duplicate?: boolean; status: string }>(
        "submit-suggestion",
        {
          type: "LINK_ADD",
          status: requestedStatus,
          requested_status: requestedStatus,
          origin_type: "agent",
          origin_name: "link-searcher",
          category_id: skill.category_id,
          skill_id: skill.id,
          payload_json: {
            url: candidate.url,
            canonical_url: candidate.canonical_url,
            domain: getDomain(candidate.canonical_url),
            title: candidate.title,
            description: candidate.description,
            thumbnail_url: candidate.thumbnail_url,
            content_type: "video",
            language: "en",
            target_skill_id: skill.id,
            public_note: score.public_note,
            skill_level: score.level,
          },
          evidence_json: {
            source: "youtube_uploads_playlist",
            channel_id: candidate.channel_id,
            channel_title: candidate.channel_title,
            score,
            transcript_excerpt: transcript.slice(0, 600),
            evidence_quote: score.evidence_quote,
          },
          triangulation_json: triangulation,
          confidence: Math.min(score.relevance, score.teaching_quality),
        },
        { headers: internalFunctionHeaders() },
      );

      if (!submitted.duplicate) suggestionsCreated += 1;
      await logger.info("suggestion_submitted", "Suggestion submitted for candidate", {
        suggestion_id: submitted.suggestion_id,
        duplicate: Boolean(submitted.duplicate),
        requested_status: requestedStatus,
        stored_status: submitted.status,
        canonical_url: candidate.canonical_url,
      });
    }

    const { error: updateError } = await supabase
      .from("agent_runs")
      .update({
        status: "completed",
        suggestions_created: suggestionsCreated,
        triangulation_calls: triangulationCalls,
        cost_usd: actualCostUsd,
        completed_at: new Date().toISOString(),
      })
      .eq("id", runId);
    if (updateError) throw updateError;

    await logger.info("run_completed", "Link searcher run completed", {
      suggestions_created: suggestionsCreated,
      triangulation_calls: triangulationCalls,
      cost_usd: actualCostUsd,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await logger.error("run_failed", message, {
      skill_id: skillId,
      suggestions_created: suggestionsCreated,
      triangulation_calls: triangulationCalls,
      cost_usd: actualCostUsd,
    });
    await supabase
      .from("agent_runs")
      .update({
        status: "failed",
        error_message: message,
        completed_at: new Date().toISOString(),
      })
      .eq("id", runId);
  }
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  try {
    const body = await readJson<LinkSearcherRequest>(request);
    if (!body.skill_id) return jsonResponse({ error: "skill_id is required" }, 400);

    const supabase = getServiceClient();
    const { data: run, error: runError } = await supabase
      .from("agent_runs")
      .insert({
        agent_type: "link_searcher",
        target_type: "skill",
        target_id: body.skill_id,
      })
      .select("id")
      .single();
    if (runError) throw runError;

    runInBackground(processRun(run.id, body.skill_id));
    return jsonResponse({ run_id: run.id, status: "started" }, 202);
  } catch (error) {
    return errorResponse(error);
  }
});
