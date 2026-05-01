import { voteWithModels } from "../_shared/llm.ts";
import { corsHeaders, errorResponse, jsonResponse, readJson } from "../_shared/responses.ts";

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  try {
    const body = await readJson<{
      candidate: { title: string; url: string; public_note?: string | null };
      skill: { name: string; description?: string | null };
    }>(request);
    if (!body.candidate || !body.skill) {
      return jsonResponse({ error: "candidate and skill are required" }, 400);
    }

    const result = await voteWithModels(body.skill, body.candidate);
    return jsonResponse(result);
  } catch (error) {
    return errorResponse(error);
  }
});
