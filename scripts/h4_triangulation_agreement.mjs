#!/usr/bin/env node
import { appendValidationRow, readJson, requireEnv, writeJson } from "./validation-utils.mjs";

const anthropicKey = requireEnv("ANTHROPIC_API_KEY");
const openAiKey = requireEnv("OPENAI_API_KEY");
const perplexityKey = requireEnv("PERPLEXITY_API_KEY");
const fixtures = readJson(".validation/h3_scores.json", []).slice(0, Number(process.env.H4_SAMPLE_SIZE ?? 10));
if (!fixtures.length) throw new Error("No H3 scored fixtures found. Run `npm run h3` first.");

const voteSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    approve: { type: "boolean" },
    confidence: { type: "number", minimum: 0, maximum: 1 },
    reason: { type: "string" },
  },
  required: ["approve", "confidence", "reason"],
};

async function anthropicVote(fixture) {
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": anthropicKey,
      "anthropic-version": "2023-06-01",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: process.env.ANTHROPIC_MODEL ?? "claude-3-5-haiku-20241022",
      max_tokens: 400,
      system: "Vote whether this is a good resource for the exact badminton sub-skill.",
      tools: [{ name: "vote", description: "Return the vote JSON.", input_schema: voteSchema }],
      tool_choice: { type: "tool", name: "vote" },
      messages: [{ role: "user", content: `title="${fixture.title}"\nsummary="${fixture.score?.public_note ?? ""}"` }],
    }),
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error?.message ?? "Anthropic vote failed");
  return payload.content.find((part) => part.type === "tool_use")?.input;
}

async function openAiVote(fixture) {
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${openAiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: process.env.OPENAI_TRIANGULATION_MODEL ?? "gpt-4o-mini-2024-07-18",
      response_format: { type: "json_schema", json_schema: { name: "vote", strict: true, schema: voteSchema } },
      messages: [
        { role: "system", content: "Vote whether this is a good resource for the exact badminton sub-skill." },
        { role: "user", content: `title="${fixture.title}"\nsummary="${fixture.score?.public_note ?? ""}"` },
      ],
      temperature: 0,
    }),
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error?.message ?? "OpenAI vote failed");
  return JSON.parse(payload.choices[0].message.content);
}

async function perplexityVote(fixture) {
  const response = await fetch("https://api.perplexity.ai/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${perplexityKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: process.env.PERPLEXITY_TRIANGULATION_MODEL ?? "sonar",
      messages: [{ role: "user", content: `Return JSON vote approve/confidence/reason for title="${fixture.title}" summary="${fixture.score?.public_note ?? ""}"` }],
      temperature: 0,
    }),
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error?.message ?? "Perplexity vote failed");
  return JSON.parse(payload.choices[0].message.content.match(/\{[\s\S]*\}/)[0]);
}

const results = [];
for (const fixture of fixtures) {
  const votes = await Promise.all([anthropicVote(fixture), openAiVote(fixture), perplexityVote(fixture)]);
  results.push({ title: fixture.title, votes, approve_count: votes.filter((vote) => vote.approve).length });
}

writeJson(".validation/h4_votes.json", results);

const consensus = results.filter((item) => item.approve_count >= 2 || item.approve_count <= 1).length;
appendValidationRow({
  hypothesis: "H4",
  procedure: `3-model triangulation on ${results.length} scored fixtures`,
  result: `${consensus}/${results.length} fixtures produced a majority decision`,
  decision: consensus === results.length ? "Pass" : "Review",
});

console.log(JSON.stringify({ consensus, total: results.length }, null, 2));
