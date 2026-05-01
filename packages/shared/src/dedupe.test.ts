import { describe, expect, it } from "vitest";
import { buildDedupeKey, normalizeCanonicalUrl, slugify } from "./dedupe";

describe("dedupe helpers", () => {
  it("normalizes noisy youtube URLs", () => {
    expect(
      normalizeCanonicalUrl("https://youtu.be/abc123?si=share&utm_source=test#chapter"),
    ).toBe("https://www.youtube.com/watch?v=abc123");
  });

  it("builds LINK_ADD keys from canonical URL and target skill", () => {
    expect(
      buildDedupeKey("LINK_ADD", {
        url: "https://example.com/watch",
        canonical_url: "https://example.com/watch?utm_medium=social",
        target_skill_id: "skill-1",
      }),
    ).toBe("LINK_ADD:https://example.com/watch:skill-1");
  });

  it("slugifies skill names", () => {
    expect(slugify("Serve (low)")).toBe("serve-low");
  });
});
