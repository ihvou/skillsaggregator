export interface PromptSkill {
  name: string;
  description?: string | null;
}

export interface PromptCategory {
  name: string;
}

export interface PromptCandidate {
  title: string;
  channel?: string | null;
  url?: string | null;
  public_note?: string | null;
}

export interface PromptMessages {
  system: string;
  user: string;
}

export function promptToText(prompt: PromptMessages): string {
  return [`SYSTEM: ${prompt.system}`, "", prompt.user].join("\n");
}

export function renderSearchQueryPrompt(category: PromptCategory, skill: PromptSkill): PromptMessages {
  return {
    system: [
      "You are a learning-resource discovery assistant. Given a category and a sub-skill,",
      "produce 3-5 search queries that maximize the chance of finding teaching-quality videos",
      "or articles for that exact sub-skill, at any level (beginner to advanced).",
      "",
      'Return JSON with shape: { "queries": string[] }',
      "",
      "Rules:",
      "- queries must mention the sub-skill explicitly",
      '- prefer technique-oriented phrasing ("how to", "drill", "tutorial", "footwork")',
      "- avoid product/equipment queries unless the sub-skill is equipment-related",
    ].join("\n"),
    user: `INPUT: category="${category.name}", sub_skill="${skill.name}", description="${skill.description ?? ""}"`,
  };
}

export function renderTranscriptScorePrompt(
  skill: PromptSkill,
  candidate: PromptCandidate,
  transcriptExcerpt: string,
): PromptMessages {
  return {
    system: [
      "You evaluate a candidate learning resource against a sub-skill.",
      "",
      "Return JSON with schema:",
      "{",
      '  "relevance": number,',
      '  "teaching_quality": number,',
      '  "demo_vs_talk": number,',
      '  "level": "beginner"|"intermediate"|"advanced",',
      '  "public_note": string,',
      '  "evidence_quote": string',
      "}",
      "",
      "Rules:",
      "- if the transcript does not actually teach the sub-skill, set relevance < 0.4",
      "- be strict on teaching_quality; clickbait and rambling = low",
      "- if uncertain, prefer lower scores",
    ].join("\n"),
    user: [
      "INPUT:",
      `sub_skill: "${skill.name}"`,
      `sub_skill_description: "${skill.description ?? ""}"`,
      `candidate_title: "${candidate.title}"`,
      `candidate_channel: "${candidate.channel ?? ""}"`,
      `transcript_excerpt: "${transcriptExcerpt.slice(0, 3000)}"`,
    ].join("\n"),
  };
}

export function renderTriangulationPrompt(
  skill: PromptSkill,
  candidate: PromptCandidate,
): PromptMessages {
  return {
    system: [
      "Decide whether the resource described is a good learning resource for the sub-skill.",
      'Return JSON with schema: { "approve": boolean, "confidence": number, "reason": string }',
      "",
      "Rules:",
      "- approve only if you would personally recommend it to a learner asking about this exact sub-skill",
      "- be strict; this vote feeds an auto-approval threshold",
    ].join("\n"),
    user: [
      "INPUT:",
      `sub_skill: "${skill.name}"`,
      `description: "${skill.description ?? ""}"`,
      `candidate_title: "${candidate.title}"`,
      `candidate_url: "${candidate.url ?? ""}"`,
      `candidate_summary: "${candidate.public_note ?? ""}"`,
    ].join("\n"),
  };
}
