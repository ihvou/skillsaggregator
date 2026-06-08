import { describe, expect, it } from "vitest";
import { badmintonSkills, makeCanonical, makeSkillMetaDescription } from "@skillsaggregator/shared";
import { normalizeThumbnailUrl } from "../lib/thumbnails";

describe("SEO helpers", () => {
  it("builds canonical skill URLs", () => {
    expect(makeCanonical("https://example.com/", "badminton", "forehand-smash")).toBe(
      "https://example.com/badminton/forehand-smash",
    );
  });

  it("keeps meta descriptions within search-friendly length", () => {
    expect(makeSkillMetaDescription(badmintonSkills[2]!).length).toBeLessThanOrEqual(150);
  });

  it("normalizes unsafe thumbnail URLs before they reach next/image", () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://project.supabase.co";
    expect(
      normalizeThumbnailUrl(
        "http://kong:8000/storage/v1/object/public/link-thumbnails/demo.jpg",
        "https://example.com/article",
      ),
    ).toBe("https://project.supabase.co/storage/v1/object/public/link-thumbnails/demo.jpg");
    expect(normalizeThumbnailUrl("https://bad.example/image.jpg", "https://youtu.be/abc123def45")).toBe(
      "https://i.ytimg.com/vi/abc123def45/hqdefault.jpg",
    );
    expect(
      normalizeThumbnailUrl(
        "https://bad.example/image.jpg",
        "https://example.com/article",
        "https://bad.example/image.jpg",
      ),
    ).toBeNull();
  });
});
