import { corsHeaders, errorResponse, jsonResponse, readJson } from "../_shared/responses.ts";

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  try {
    const body = await readJson<{ category: string; skill?: string }>(request);
    const baseUrl = Deno.env.get("BASE_URL");
    const secret = Deno.env.get("REVALIDATE_SECRET");
    if (!baseUrl || !secret) throw new Error("BASE_URL and REVALIDATE_SECRET are required");

    const response = await fetch(`${baseUrl.replace(/\/+$/, "")}/api/revalidate`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-revalidate-secret": secret,
      },
      body: JSON.stringify(body),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error ?? "Web revalidation failed");

    return jsonResponse(payload);
  } catch (error) {
    return errorResponse(error);
  }
});
