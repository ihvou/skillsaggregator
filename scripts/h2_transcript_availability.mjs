#!/usr/bin/env node
import { appendValidationRow, readJson, writeJson } from "./validation-utils.mjs";

function extractPlayerResponse(html) {
  const marker = "ytInitialPlayerResponse = ";
  const start = html.indexOf(marker);
  if (start === -1) throw new Error("ytInitialPlayerResponse not found");
  const jsonStart = start + marker.length;
  let depth = 0;
  for (let index = jsonStart; index < html.length; index += 1) {
    const char = html[index];
    if (char === "{") depth += 1;
    if (char === "}") depth -= 1;
    if (depth === 0) return JSON.parse(html.slice(jsonStart, index + 1));
  }
  throw new Error("ytInitialPlayerResponse JSON did not terminate");
}

function stripXml(value) {
  return value
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

async function fetchTranscript(videoId) {
  const page = await fetch(`https://www.youtube.com/watch?v=${videoId}`);
  if (!page.ok) throw new Error(`YouTube page failed with ${page.status}`);
  const player = extractPlayerResponse(await page.text());
  const tracks = player.captions?.playerCaptionsTracklistRenderer?.captionTracks ?? [];
  if (!tracks.length) throw new Error("No caption tracks");
  const transcript = await fetch(tracks[0].baseUrl);
  if (!transcript.ok) throw new Error(`Transcript track failed with ${transcript.status}`);
  return stripXml(await transcript.text());
}

const h1 = readJson(".validation/h1_candidates.json", []);
const candidates = h1.flatMap((item) => item.candidates ?? []).slice(0, Number(process.env.H2_SAMPLE_SIZE ?? 50));
if (!candidates.length) {
  throw new Error("No H1 candidates found. Run `npm run h1` first.");
}

const results = [];
for (const candidate of candidates) {
  try {
    const transcript = await fetchTranscript(candidate.video_id);
    results.push({
      ...candidate,
      transcript_ok: transcript.length > 0,
      transcript_excerpt: transcript.slice(0, 1000),
    });
  } catch (error) {
    results.push({
      ...candidate,
      transcript_ok: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

writeJson(".validation/h2_transcripts.json", results);

const passing = results.filter((item) => item.transcript_ok).length;
const rate = passing / results.length;
appendValidationRow({
  hypothesis: "H2",
  procedure: `youtube-transcript availability on ${results.length} H1 candidates`,
  result: `${passing}/${results.length} transcripts available (${Math.round(rate * 100)}%)`,
  decision: rate >= Number(process.env.H2_MIN_SUCCESS_RATE ?? 0.6) ? "Pass" : "Fail",
});

console.log(JSON.stringify({ passing, total: results.length, rate }, null, 2));
