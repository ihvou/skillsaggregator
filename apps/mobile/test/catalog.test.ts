import { describe, expect, it } from "vitest";
import { getSkills } from "../lib/data";

describe("mobile catalog fallback", () => {
  it("returns badminton skills when Supabase env is absent", async () => {
    const skills = await getSkills();
    expect(skills.length).toBeGreaterThanOrEqual(20);
    expect(skills.some((skill) => skill.slug === "forehand-smash")).toBe(true);
  });
});
