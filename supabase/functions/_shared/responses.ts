export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-internal-token, x-revalidate-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });
}

export async function readJson<T>(request: Request): Promise<T> {
  const text = await request.text();
  if (!text) return {} as T;
  return JSON.parse(text) as T;
}

export function errorResponse(error: unknown, status = 500): Response {
  const maybeIssues = error && typeof error === "object" && "issues" in error
    ? (error as { issues?: unknown }).issues
    : null;
  const inferredStatus =
    Array.isArray(maybeIssues) || error instanceof SyntaxError ? 400 : status;
  const message = error instanceof Error ? error.message : String(error);
  return jsonResponse({ error: message }, inferredStatus);
}
