#!/usr/bin/env node
import {
  appendValidationRow,
  channels,
  requireEnv,
  skills,
  termsForSkill,
  uploadPlaylistId,
  writeJson,
  youtubeJson,
} from "./validation-utils.mjs";

const apiKey = requireEnv("YOUTUBE_API_KEY");
const minCandidates = Number(process.env.H1_MIN_CANDIDATES_PER_SKILL ?? 10);
const limit = Number(process.env.H1_SKILL_LIMIT ?? skills.length);

const uploadsByChannel = new Map();
for (const channelId of channels) {
  const url = new URL("https://www.googleapis.com/youtube/v3/playlistItems");
  url.searchParams.set("part", "snippet");
  url.searchParams.set("maxResults", "25");
  url.searchParams.set("playlistId", uploadPlaylistId(channelId));
  url.searchParams.set("key", apiKey);
  const payload = await youtubeJson(url);
  uploadsByChannel.set(
    channelId,
    (payload.items ?? [])
      .map((item) => item.snippet)
      .filter((snippet) => snippet?.resourceId?.videoId)
      .map((snippet) => ({
        video_id: snippet.resourceId.videoId,
        title: snippet.title,
        description: snippet.description ?? "",
        channel_id: snippet.channelId,
        channel_title: snippet.channelTitle,
        url: `https://www.youtube.com/watch?v=${snippet.resourceId.videoId}`,
      })),
  );
}

const results = skills.slice(0, limit).map((skill) => {
  const terms = termsForSkill(skill);
  const candidates = [...uploadsByChannel.values()].flat().filter((video) => {
    const haystack = `${video.title} ${video.description}`.toLowerCase();
    return terms.some((term) => haystack.includes(term));
  });
  return {
    skill,
    candidate_count: candidates.length,
    candidates: candidates.slice(0, 15).map((candidate) => ({ ...candidate, skill })),
  };
});

writeJson(".validation/h1_candidates.json", results);

const passing = results.filter((item) => item.candidate_count >= minCandidates).length;
appendValidationRow({
  hypothesis: "H1",
  procedure: `playlistItems density check across ${channels.length} seeded channels and ${results.length} skills`,
  result: `${passing}/${results.length} skills returned at least ${minCandidates} candidates`,
  decision: passing === results.length ? "Pass" : "Fail",
});

console.log(JSON.stringify({ passing, total: results.length, minCandidates }, null, 2));
