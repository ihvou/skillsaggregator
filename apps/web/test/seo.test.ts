import { describe, expect, it } from "vitest";
import { badmintonSkills, makeCanonical, makeSkillMetaDescription } from "@skillsaggregator/shared";

describe("SEO helpers", () => {
  it("builds canonical skill URLs", () => {
    expect(makeCanonical("https://example.com/", "badminton", "forehand-smash")).toBe(
      "https://example.com/badminton/forehand-smash",
    );
  });

  it("keeps meta descriptions within search-friendly length", () => {
    expect(makeSkillMetaDescription(badmintonSkills[2]!).length).toBeLessThanOrEqual(150);
  });
});
