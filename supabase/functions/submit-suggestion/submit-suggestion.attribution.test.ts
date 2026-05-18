import { finalSuggestionStatus, resolveSubmittedByUserId } from "./security.ts";

function assertEqual<T>(actual: T, expected: T, message: string) {
  if (actual !== expected) {
    throw new Error(`${message}: expected ${String(expected)}, got ${String(actual)}`);
  }
}

Deno.test("external agent cannot spoof submitted_by_user_id", () => {
  const submittedByUserId = resolveSubmittedByUserId({
    bearerUserId: null,
    bodySubmittedByUserId: "00000000-0000-4000-8000-000000000123",
    internalRequest: false,
  });

  assertEqual(submittedByUserId, null, "body attribution should be zeroed");
});

Deno.test("external caller attribution is derived from bearer user", () => {
  const submittedByUserId = resolveSubmittedByUserId({
    bearerUserId: "00000000-0000-4000-8000-000000000456",
    bodySubmittedByUserId: "00000000-0000-4000-8000-000000000123",
    internalRequest: false,
  });

  assertEqual(
    submittedByUserId,
    "00000000-0000-4000-8000-000000000456",
    "bearer user should win for external callers",
  );
});

Deno.test("internal auto-approved status is restored", () => {
  assertEqual(finalSuggestionStatus(true, "auto_approved"), "auto_approved", "internal status");
  assertEqual(finalSuggestionStatus(false, "auto_approved"), "pending", "external status");
});
