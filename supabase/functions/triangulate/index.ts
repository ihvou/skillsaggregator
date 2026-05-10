// Dormant for local-collection MVP.
// The free-tier collection path runs through scripts/run-collection.mjs and
// scripts/run-article-collection.mjs; keep this cloud Edge Function for a future
// deployed-agent mode.
import { voteWithModels } from "../_shared/llm.ts";
import { corsForbiddenResponse, errorResponse, isAllowedCorsOrigin, jsonResponse, optionsResponse, readJson } from "../_shared/responses.ts";

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return optionsResponse(request);
  if (!isAllowedCorsOrigin(request)) return corsForbiddenResponse(request);
  if (request.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405, request);

  try {
    const body = await readJson<{
      candidate: { title: string; url: string; public_note?: string | null };
      skill: { name: string; description?: string | null };
    }>(request);
    if (!body.candidate || !body.skill) {
      return jsonResponse({ error: "candidate and skill are required" }, 400, request);
    }

    const result = await voteWithModels(body.skill, body.candidate);
    return jsonResponse(result, 200, request);
  } catch (error) {
    return errorResponse(error, 500, request);
  }
});
