export function renderSearchQueryPrompt(category: { name: string }, skill: { name: string; description?: string | null }) {
  return [
    "You are a learning-resource discovery assistant. Produce 3-5 search queries for this exact badminton sub-skill.",
    'Return only JSON with shape: { "queries": string[] }.',
    "Queries must mention the sub-skill explicitly and prefer technique-oriented phrases.",
    `category="${category.name}"`,
    `sub_skill="${skill.name}"`,
    `description="${skill.description ?? ""}"`,
  ].join("\n");
}

export function renderTranscriptScorePrompt(
  skill: { name: string; description?: string | null },
  candidate: { title: string; channel?: string | null },
  transcriptExcerpt: string,
) {
  return [
    "You evaluate a candidate learning resource against a badminton sub-skill.",
    'Return only JSON with keys: relevance, teaching_quality, demo_vs_talk, level, public_note, evidence_quote.',
    "If the transcript does not teach the sub-skill, relevance must be below 0.4. Be strict.",
    `sub_skill="${skill.name}"`,
    `sub_skill_description="${skill.description ?? ""}"`,
    `candidate_title="${candidate.title}"`,
    `candidate_channel="${candidate.channel ?? ""}"`,
    `transcript_excerpt="${transcriptExcerpt.slice(0, 3000)}"`,
  ].join("\n");
}

export function renderTriangulationPrompt(
  skill: { name: string; description?: string | null },
  candidate: { title: string; url: string; public_note?: string | null },
) {
  return [
    "Decide whether this is a good learning resource for the exact badminton sub-skill.",
    'Return only JSON with keys: approve, confidence, reason.',
    "Approve only if you would personally recommend it to a learner.",
    `sub_skill="${skill.name}"`,
    `description="${skill.description ?? ""}"`,
    `candidate_title="${candidate.title}"`,
    `candidate_url="${candidate.url}"`,
    `candidate_summary="${candidate.public_note ?? ""}"`,
  ].join("\n");
}
