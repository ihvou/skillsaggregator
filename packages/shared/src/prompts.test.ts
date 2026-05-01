import { describe, expect, it } from "vitest";
import { renderTranscriptScorePrompt } from "./prompts";

describe("prompt rendering", () => {
  it("keeps the P2 transcript prompt stable", () => {
    expect(
      renderTranscriptScorePrompt(
        { name: "Forehand smash", description: "Steep attacking overhead shot." },
        { title: "Smash tutorial", channel: "Badminton Insight" },
        "Contact the shuttle in front of the body and rotate through the hit.",
      ),
    ).toMatchInlineSnapshot(`
      "SYSTEM: You evaluate a candidate learning resource against a sub-skill.

      Return JSON with schema:
      {
        "relevance": number,
        "teaching_quality": number,
        "demo_vs_talk": number,
        "level": "beginner"|"intermediate"|"advanced",
        "public_note": string,
        "evidence_quote": string
      }

      Rules:
      - if the transcript does not actually teach the sub-skill, set relevance < 0.4
      - be strict on teaching_quality; clickbait and rambling = low
      - if uncertain, prefer lower scores

      INPUT:
      sub_skill: "Forehand smash"
      sub_skill_description: "Steep attacking overhead shot."
      candidate_title: "Smash tutorial"
      candidate_channel: "Badminton Insight"
      transcript_excerpt: "Contact the shuttle in front of the body and rotate through the hit.""
    `);
  });
});
