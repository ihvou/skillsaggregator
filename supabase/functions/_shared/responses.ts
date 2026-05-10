function allowedOrigins() {
  const configured =
    Deno.env.get("ALLOWED_ORIGINS") ??
    Deno.env.get("BASE_URL") ??
    Deno.env.get("NEXT_PUBLIC_BASE_URL") ??
    "http://localhost:3000";
  return configured
    .split(",")
    .map((origin) => origin.trim().replace(/\/+$/, ""))
    .filter(Boolean);
}

export function isAllowedCorsOrigin(request: Request) {
  const origin = request.headers.get("origin")?.replace(/\/+$/, "");
  if (!origin) return true;
  const allowed = allowedOrigins();
  return allowed.includes("*") || allowed.includes(origin);
}

export function corsHeadersFor(request?: Request) {
  const origin = request?.headers.get("origin")?.replace(/\/+$/, "");
  const allowed = allowedOrigins();
  const allowOrigin = allowed.includes("*")
    ? "*"
    : origin && allowed.includes(origin)
      ? origin
      : allowed[0] ?? "null";

  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Vary": "Origin",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-revalidate-secret",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
}

export const corsHeaders = corsHeadersFor();

export function optionsResponse(request: Request): Response {
  if (!isAllowedCorsOrigin(request)) {
    return new Response("Forbidden origin", {
      status: 403,
      headers: corsHeadersFor(request),
    });
  }
  return new Response("ok", { headers: corsHeadersFor(request) });
}

export function corsForbiddenResponse(request: Request): Response {
  return new Response(JSON.stringify({ error: "Origin is not allowed" }), {
    status: 403,
    headers: {
      ...corsHeadersFor(request),
      "Content-Type": "application/json",
    },
  });
}

export function jsonResponse(body: unknown, status = 200, request?: Request): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeadersFor(request),
      "Content-Type": "application/json",
    },
  });
}

export async function readJson<T>(request: Request): Promise<T> {
  const text = await request.text();
  if (!text) return {} as T;
  return JSON.parse(text) as T;
}

export function errorResponse(error: unknown, status = 500, request?: Request): Response {
  const maybeIssues = error && typeof error === "object" && "issues" in error
    ? (error as { issues?: unknown }).issues
    : null;
  const inferredStatus =
    Array.isArray(maybeIssues) || error instanceof SyntaxError ? 400 : status;
  const message = error instanceof Error ? error.message : String(error);
  return jsonResponse({ error: message }, inferredStatus, request);
}
