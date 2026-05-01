import { scoreResultSchema, triangulationVoteSchema } from "./schemas.ts";
import {
  renderSearchQueryPrompt,
  renderTranscriptScorePrompt,
  renderTriangulationPrompt,
} from "./prompts.ts";

function parseJsonObject(text: string): unknown {
  const trimmed = text.trim();
  if (trimmed.startsWith("{")) return JSON.parse(trimmed);
  const match = trimmed.match(/\{[\s\S]*\}/);
  if (!match) throw new Error("Model response did not contain JSON");
  return JSON.parse(match[0]);
}

async function anthropicJson(prompt: string): Promise<unknown> {
  const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not configured");

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: Deno.env.get("ANTHROPIC_MODEL") ?? "claude-haiku-4-5",
      max_tokens: 700,
      messages: [{ role: "user", content: prompt }],
    }),
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error?.message ?? "Anthropic request failed");
  const text = payload.content?.map((part: { text?: string }) => part.text ?? "").join("") ?? "";
  return parseJsonObject(text);
}

async function openAiVote(prompt: string) {
  const apiKey = Deno.env.get("OPENAI_API_KEY");
  if (!apiKey) throw new Error("OPENAI_API_KEY is not configured");

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: Deno.env.get("OPENAI_TRIANGULATION_MODEL") ?? "gpt-4o-mini",
      response_format: { type: "json_object" },
      messages: [{ role: "user", content: prompt }],
      temperature: 0,
    }),
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error?.message ?? "OpenAI request failed");
  return parseJsonObject(payload.choices?.[0]?.message?.content ?? "");
}

async function perplexityVote(prompt: string) {
  const apiKey = Deno.env.get("PERPLEXITY_API_KEY");
  if (!apiKey) throw new Error("PERPLEXITY_API_KEY is not configured");

  const response = await fetch("https://api.perplexity.ai/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: Deno.env.get("PERPLEXITY_TRIANGULATION_MODEL") ?? "sonar-small-online",
      messages: [{ role: "user", content: prompt }],
      temperature: 0,
    }),
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error?.message ?? "Perplexity request failed");
  return parseJsonObject(payload.choices?.[0]?.message?.content ?? "");
}

export async function generateSearchQueries(
  category: { name: string },
  skill: { name: string; description?: string | null },
) {
  const fallback = [
    `${skill.name} badminton tutorial`,
    `how to ${skill.name} badminton`,
    `${skill.name} badminton drill`,
  ];

  try {
    const result = await anthropicJson(renderSearchQueryPrompt(category, skill));
    const queries = (result as { queries?: unknown }).queries;
    if (Array.isArray(queries) && queries.every((query) => typeof query === "string")) {
      return queries.slice(0, 5);
    }
    return fallback;
  } catch (_error) {
    return fallback;
  }
}

export async function scoreTranscript(
  skill: { name: string; description?: string | null },
  candidate: { title: string; channel?: string | null },
  transcript: string,
) {
  const result = await anthropicJson(renderTranscriptScorePrompt(skill, candidate, transcript));
  return scoreResultSchema.parse(result);
}

export async function voteWithModels(
  skill: { name: string; description?: string | null },
  candidate: { title: string; url: string; public_note?: string | null },
) {
  const prompt = renderTriangulationPrompt(skill, candidate);
  const requests = [
    ["claude-haiku", () => anthropicJson(prompt)],
    ["gpt-4o-mini", () => openAiVote(prompt)],
    ["perplexity-sonar-small", () => perplexityVote(prompt)],
  ] as const;

  const results = await Promise.all(
    requests.map(async ([model, request]) => {
      try {
        const vote = triangulationVoteSchema.parse(await request());
        return { model, ...vote };
      } catch (error) {
        return {
          model,
          approve: false,
          confidence: 0,
          reason: error instanceof Error ? error.message.slice(0, 200) : "Model failed",
        };
      }
    }),
  );

  return {
    votes: results,
    approve_count: results.filter((vote) => vote.approve).length,
  };
}
