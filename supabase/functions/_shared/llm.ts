import { scoreResultSchema, triangulationVoteSchema } from "./schemas.ts";
import {
  promptToText,
  renderSearchQueryPrompt,
  renderTranscriptScorePrompt,
  renderTriangulationPrompt,
  type PromptMessages,
} from "./prompts.ts";

interface ModelUsage {
  input_tokens?: number;
  output_tokens?: number;
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
}

interface ModelJsonResult {
  json: unknown;
  provider: "anthropic" | "openai" | "perplexity";
  model: string;
  usage: ModelUsage;
  cost_usd: number;
}

const querySchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    queries: {
      type: "array",
      minItems: 3,
      maxItems: 5,
      items: { type: "string" },
    },
  },
  required: ["queries"],
} as const;

const scoreSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    relevance: { type: "number", minimum: 0, maximum: 1 },
    teaching_quality: { type: "number", minimum: 0, maximum: 1 },
    demo_vs_talk: { type: "number", minimum: 0, maximum: 1 },
    level: { type: "string", enum: ["beginner", "intermediate", "advanced"] },
    public_note: { type: "string", minLength: 1, maxLength: 140 },
    evidence_quote: { type: "string", minLength: 1, maxLength: 200 },
  },
  required: [
    "relevance",
    "teaching_quality",
    "demo_vs_talk",
    "level",
    "public_note",
    "evidence_quote",
  ],
} as const;

const voteSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    approve: { type: "boolean" },
    confidence: { type: "number", minimum: 0, maximum: 1 },
    reason: { type: "string", minLength: 1, maxLength: 200 },
  },
  required: ["approve", "confidence", "reason"],
} as const;

function parseJsonObject(text: string): unknown {
  const trimmed = text.trim();
  if (trimmed.startsWith("{")) return JSON.parse(trimmed);
  const match = trimmed.match(/\{[\s\S]*\}/);
  if (!match) throw new Error("Model response did not contain JSON");
  return JSON.parse(match[0]);
}

function inputTokens(usage: ModelUsage) {
  return usage.input_tokens ?? usage.prompt_tokens ?? 0;
}

function outputTokens(usage: ModelUsage) {
  return usage.output_tokens ?? usage.completion_tokens ?? 0;
}

function price(provider: ModelJsonResult["provider"], direction: "input" | "output") {
  const key = `${provider.toUpperCase()}_${direction.toUpperCase()}_USD_PER_1M`;
  const defaults: Record<string, number> = {
    ANTHROPIC_INPUT_USD_PER_1M: 0.8,
    ANTHROPIC_OUTPUT_USD_PER_1M: 4,
    OPENAI_INPUT_USD_PER_1M: 0.15,
    OPENAI_OUTPUT_USD_PER_1M: 0.6,
    PERPLEXITY_INPUT_USD_PER_1M: 0.2,
    PERPLEXITY_OUTPUT_USD_PER_1M: 0.2,
  };
  return Number(Deno.env.get(key) ?? defaults[key] ?? 0);
}

function estimateCost(provider: ModelJsonResult["provider"], usage: ModelUsage) {
  return (
    (inputTokens(usage) * price(provider, "input")) / 1_000_000 +
    (outputTokens(usage) * price(provider, "output")) / 1_000_000
  );
}

function responseUsage(payload: { usage?: ModelUsage }) {
  return payload.usage ?? {};
}

async function retry<T>(label: string, operation: () => Promise<T>): Promise<T> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
      const retryable =
        message.includes("rate") ||
        message.includes("timeout") ||
        message.includes("overload") ||
        message.includes("temporarily") ||
        message.includes("429") ||
        message.includes("500") ||
        message.includes("502") ||
        message.includes("503") ||
        message.includes("504");
      if (!retryable || attempt === 3) break;
      await new Promise((resolve) => setTimeout(resolve, 300 * attempt));
    }
  }

  throw lastError instanceof Error ? lastError : new Error(`${label} failed`);
}

async function anthropicJson(
  prompt: PromptMessages,
  toolName: string,
  inputSchema: Record<string, unknown>,
): Promise<ModelJsonResult> {
  const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not configured");
  const model = Deno.env.get("ANTHROPIC_MODEL") ?? "claude-3-5-haiku-20241022";

  return retry("Anthropic request", async () => {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      system: prompt.system,
      max_tokens: 700,
      tools: [
        {
          name: toolName,
          description: "Return the requested JSON object.",
          input_schema: inputSchema,
        },
      ],
      tool_choice: { type: "tool", name: toolName },
      messages: [{ role: "user", content: prompt.user }],
    }),
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error?.message ?? `Anthropic request failed with ${response.status}`);

    const toolUse = payload.content?.find((part: { type?: string; input?: unknown }) => part.type === "tool_use");
    const text = payload.content?.map((part: { text?: string }) => part.text ?? "").join("") ?? "";
    const usage = responseUsage(payload);
    return {
      json: toolUse?.input ?? parseJsonObject(text),
      provider: "anthropic",
      model,
      usage,
      cost_usd: estimateCost("anthropic", usage),
    };
  });
}

async function openAiVote(prompt: PromptMessages): Promise<ModelJsonResult> {
  const apiKey = Deno.env.get("OPENAI_API_KEY");
  if (!apiKey) throw new Error("OPENAI_API_KEY is not configured");
  const model = Deno.env.get("OPENAI_TRIANGULATION_MODEL") ?? "gpt-4o-mini-2024-07-18";

  return retry("OpenAI request", async () => {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "triangulation_vote",
          strict: true,
          schema: voteSchema,
        },
      },
      messages: [
        { role: "system", content: prompt.system },
        { role: "user", content: prompt.user },
      ],
      temperature: 0,
    }),
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error?.message ?? `OpenAI request failed with ${response.status}`);
    const usage = responseUsage(payload);
    return {
      json: JSON.parse(payload.choices?.[0]?.message?.content ?? "{}"),
      provider: "openai",
      model,
      usage,
      cost_usd: estimateCost("openai", usage),
    };
  });
}

async function perplexityVote(prompt: PromptMessages): Promise<ModelJsonResult> {
  const apiKey = Deno.env.get("PERPLEXITY_API_KEY");
  if (!apiKey) throw new Error("PERPLEXITY_API_KEY is not configured");
  const model = Deno.env.get("PERPLEXITY_TRIANGULATION_MODEL") ?? "sonar";

  return retry("Perplexity request", async () => {
    const response = await fetch("https://api.perplexity.ai/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      messages: [{ role: "user", content: promptToText(prompt) }],
      temperature: 0,
    }),
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error?.message ?? `Perplexity request failed with ${response.status}`);
    const usage = responseUsage(payload);
    return {
      json: parseJsonObject(payload.choices?.[0]?.message?.content ?? ""),
      provider: "perplexity",
      model,
      usage,
      cost_usd: estimateCost("perplexity", usage),
    };
  });
}

export async function generateSearchQueries(
  category: { name: string },
  skill: { name: string; description?: string | null },
) {
  const categoryName = category.name.toLowerCase();
  const fallback = [
    `${skill.name} ${categoryName} tutorial`,
    `how to ${skill.name} ${categoryName}`,
    `${skill.name} ${categoryName} drill`,
  ];

  try {
    const result = await anthropicJson(
      renderSearchQueryPrompt(category, skill),
      "return_search_queries",
      querySchema,
    );
    const queries = (result.json as { queries?: unknown }).queries;
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
  const result = await anthropicJson(
    renderTranscriptScorePrompt(skill, candidate, transcript),
    "return_transcript_score",
    scoreSchema,
  );
  const score = scoreResultSchema.parse(result.json);
  return {
    ...score,
    usage: result.usage,
    model: result.model,
    cost_usd: result.cost_usd,
  };
}

export async function voteWithModels(
  skill: { name: string; description?: string | null },
  candidate: { title: string; url: string; public_note?: string | null },
) {
  const prompt = renderTriangulationPrompt(skill, candidate);
  const requests = [
    [Deno.env.get("ANTHROPIC_MODEL") ?? "claude-3-5-haiku-20241022", () => anthropicJson(prompt, "return_triangulation_vote", voteSchema)],
    [Deno.env.get("OPENAI_TRIANGULATION_MODEL") ?? "gpt-4o-mini-2024-07-18", () => openAiVote(prompt)],
    [Deno.env.get("PERPLEXITY_TRIANGULATION_MODEL") ?? "sonar", () => perplexityVote(prompt)],
  ] as const;

  const results = await Promise.all(
    requests.map(async ([model, request]) => {
      try {
        const result = await request();
        const vote = triangulationVoteSchema.parse(result.json);
        return {
          model,
          ...vote,
          cost_usd: result.cost_usd,
          usage: result.usage,
        };
      } catch (error) {
        return {
          model,
          approve: false,
          confidence: 0,
          reason: error instanceof Error ? error.message.slice(0, 200) : "Model failed",
          cost_usd: 0,
          usage: {},
        };
      }
    }),
  );

  return {
    votes: results,
    approve_count: results.filter((vote) => vote.approve).length,
    cost_usd: results.reduce((sum, vote) => sum + vote.cost_usd, 0),
  };
}
