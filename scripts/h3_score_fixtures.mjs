#!/usr/bin/env node
import { appendValidationRow, readJson, requireEnv, writeJson } from "./validation-utils.mjs";

const apiKey = requireEnv("ANTHROPIC_API_KEY");
const model = process.env.ANTHROPIC_MODEL ?? "claude-3-5-haiku-20241022";
const transcripts = readJson(".validation/h2_transcripts.json", []).filter((item) => item.transcript_ok);
const fixtures = transcripts.slice(0, Number(process.env.H3_SAMPLE_SIZE ?? 10));
if (!fixtures.length) {
  throw new Error("No H2 transcript fixtures found. Run `npm run h1` and `npm run h2` first.");
}

const schema = {
  type: "object",
  additionalProperties: false,
  properties: {
    relevance: { type: "number", minimum: 0, maximum: 1 },
    teaching_quality: { type: "number", minimum: 0, maximum: 1 },
    demo_vs_talk: { type: "number", minimum: 0, maximum: 1 },
    level: { type: "string", enum: ["beginner", "intermediate", "advanced"] },
    public_note: { type: "string" },
    evidence_quote: { type: "string" },
  },
  required: ["relevance", "teaching_quality", "demo_vs_talk", "level", "public_note", "evidence_quote"],
};

async function score(fixture) {
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      max_tokens: 700,
      system: "Score whether this resource teaches its badminton sub-skill. Be strict.",
      tools: [{ name: "score_resource", description: "Return the score JSON.", input_schema: schema }],
      tool_choice: { type: "tool", name: "score_resource" },
      messages: [{
        role: "user",
        content: `skill="${fixture.skill ?? "unknown"}"\ntitle="${fixture.title}"\ntranscript="${fixture.transcript_excerpt}"`,
      }],
    }),
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error?.message ?? "Anthropic scoring failed");
  return payload.content.find((part) => part.type === "tool_use")?.input;
}

const results = [];
for (const fixture of fixtures) {
  results.push({ ...fixture, score: await score(fixture) });
}

writeJson(".validation/h3_scores.json", results);

const likelyRelevant = results.filter((item) => item.score?.relevance >= 0.7).length;
appendValidationRow({
  hypothesis: "H3",
  procedure: `Anthropic structured scoring on ${results.length} transcript fixtures`,
  result: `${likelyRelevant}/${results.length} scored relevance >= 0.7; review .validation/h3_scores.json against hand grades`,
  decision: "Review",
});

console.log(JSON.stringify({ likelyRelevant, total: results.length }, null, 2));
