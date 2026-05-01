import { loadSkill, loadTrustedYouTubeChannels } from "../_shared/database.ts";
import { generateSearchQueries, scoreTranscript } from "../_shared/llm.ts";
import { getDomain } from "../_shared/normalization.ts";
import { corsHeaders, errorResponse, jsonResponse, readJson } from "../_shared/responses.ts";
import { callFunction, getServiceClient } from "../_shared/supabase.ts";
import { fetchTranscript, searchYouTube, type YouTubeCandidate } from "../_shared/youtube.ts";

interface TriangulationResponse {
  votes: Array<{ model: string; approve: boolean; confidence: number; reason: string }>;
  approve_count: number;
}

function thresholds() {
  return {
    relevance: Number(Deno.env.get("STAGE2_RELEVANCE_THRESHOLD") ?? 0.7),
    quality: Number(Deno.env.get("STAGE2_QUALITY_THRESHOLD") ?? 0.6),
    approveCount: Number(Deno.env.get("TRIANGULATION_APPROVE_COUNT") ?? 2),
    maxCandidates: Number(Deno.env.get("LINK_SEARCHER_MAX_CANDIDATES_PER_RUN") ?? 30),
    costCapUsd: Number(Deno.env.get("RUN_COST_CAP_USD") ?? 0.5),
  };
}

async function maybeDelay(seconds?: number) {
  if (!seconds || seconds <= 0) return;
  await new Promise((resolve) => setTimeout(resolve, Math.min(seconds, 120) * 1000));
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  const supabase = getServiceClient();
  let runId: string | null = null;

  try {
    const body = await readJson<{ skill_id: string; delay_seconds?: number }>(request);
    if (!body.skill_id) return jsonResponse({ error: "skill_id is required" }, 400);
    await maybeDelay(body.delay_seconds);

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
    runId = run.id;

    const skill = await loadSkill(supabase, body.skill_id);
    const channels = await loadTrustedYouTubeChannels(supabase, skill.category_id);
    const queries = await generateSearchQueries(skill.category, skill);
    const config = thresholds();
    const seen = new Set<string>();
    const candidates: YouTubeCandidate[] = [];

    for (const query of queries) {
      for (const channelId of channels) {
        const found = await searchYouTube(query, channelId).catch(() => []);
        for (const candidate of found) {
          if (!seen.has(candidate.canonical_url)) {
            seen.add(candidate.canonical_url);
            candidates.push(candidate);
          }
          if (candidates.length >= config.maxCandidates) break;
        }
        if (candidates.length >= config.maxCandidates) break;
      }
      if (candidates.length >= config.maxCandidates) break;
    }

    let suggestionsCreated = 0;
    let triangulationCalls = 0;
    let estimatedCostUsd = 0;

    for (const candidate of candidates) {
      if (estimatedCostUsd >= config.costCapUsd) break;
      const { data: existingLink, error: existingError } = await supabase
        .from("links")
        .select("id")
        .eq("canonical_url", candidate.canonical_url)
        .maybeSingle();
      if (existingError) throw existingError;
      if (existingLink) continue;

      const transcript = await fetchTranscript(candidate.video_id).catch(() => "");
      if (!transcript) continue;

      const score = await scoreTranscript(
        skill,
        { title: candidate.title, channel: candidate.channel_title },
        transcript,
      ).catch(() => null);
      estimatedCostUsd += 0.02;
      if (!score) continue;
      if (score.relevance < config.relevance || score.teaching_quality < config.quality) continue;

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
      estimatedCostUsd += 0.03;

      const status =
        triangulation.approve_count >= config.approveCount ? "auto_approved" : "pending";

      const submitted = await callFunction<{ suggestion_id: string; duplicate?: boolean }>(
        "submit-suggestion",
        {
          type: "LINK_ADD",
          status,
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
            source: "youtube_search",
            channel_id: candidate.channel_id,
            channel_title: candidate.channel_title,
            score,
            transcript_excerpt: transcript.slice(0, 600),
            evidence_quote: score.evidence_quote,
          },
          triangulation_json: triangulation,
          confidence: Math.min(score.relevance, score.teaching_quality),
        },
      );

      if (!submitted.duplicate) suggestionsCreated += 1;
    }

    const { error: updateError } = await supabase
      .from("agent_runs")
      .update({
        status: "completed",
        suggestions_created: suggestionsCreated,
        triangulation_calls: triangulationCalls,
        cost_usd: estimatedCostUsd,
        completed_at: new Date().toISOString(),
      })
      .eq("id", runId);
    if (updateError) throw updateError;

    return jsonResponse({ run_id: runId, suggestions_created: suggestionsCreated });
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
    return errorResponse(error);
  }
});
