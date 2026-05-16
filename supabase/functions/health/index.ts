import { corsForbiddenResponse, isAllowedCorsOrigin, jsonResponse, optionsResponse } from "../_shared/responses.ts";

Deno.serve((request) => {
  if (request.method === "OPTIONS") return optionsResponse(request);
  if (!isAllowedCorsOrigin(request)) return corsForbiddenResponse(request);
  if (request.method !== "GET") return jsonResponse({ error: "Method not allowed" }, 405, request);

  return jsonResponse({
    ok: true,
    service: "skillsaggregator-edge-runtime",
    ts: new Date().toISOString(),
  }, 200, request);
});
