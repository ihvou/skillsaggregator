type SuggestionStatus = "pending" | "approved" | "declined" | "auto_approved";

interface AttributionInput {
  bearerUserId: string | null;
  bodySubmittedByUserId: string | null;
  internalRequest: boolean;
}

export function isInternalRequest(request: Request) {
  const expected = Deno.env.get("INTERNAL_FUNCTION_TOKEN");
  if (!expected) return false;
  return request.headers.get("x-internal-token") === expected;
}

export function finalSuggestionStatus(
  internalRequest: boolean,
  requestedStatus: SuggestionStatus | undefined,
): SuggestionStatus {
  return internalRequest && requestedStatus === "auto_approved" ? "auto_approved" : "pending";
}

export function resolveSubmittedByUserId({
  bearerUserId,
  bodySubmittedByUserId,
  internalRequest,
}: AttributionInput) {
  if (internalRequest) return bodySubmittedByUserId ?? bearerUserId;
  return bearerUserId;
}
