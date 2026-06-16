#!/usr/bin/env node
/**
 * One-time transcript recovery from the local yt-dlp cache.
 *
 * This script performs zero network scraping: it parses .collection/transcripts/*.vtt,
 * matches each video id to an active YouTube link, then upserts link_transcripts
 * through the Supabase service-role API.
 *
 * Usage:
 *   COLLECT_TARGET=hosted node scripts/backfill-transcripts-from-cache.mjs --dry-run
 *   COLLECT_TARGET=hosted node scripts/backfill-transcripts-from-cache.mjs
 *   node scripts/backfill-transcripts-from-cache.mjs --dir .collection/transcripts --limit 25
 */
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { vttToText } from "./_lib/transcript-fetcher-browser.mjs";
import { loadCollectionEnv } from "./_lib/script-env.mjs";
import {
  createServiceRoleSupabaseClient,
  findActiveYoutubeLinkByVideoId,
  MIN_TRANSCRIPT_LENGTH,
  readTranscriptCacheEntries,
  upsertLinkTranscript,
} from "./_lib/link-transcripts.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function arg(name, fallback = null) {
  const eq = `--${name}=`;
  const found = process.argv.find((a) => a.startsWith(eq));
  if (found) return found.slice(eq.length);
  const i = process.argv.indexOf(`--${name}`);
  if (i >= 0 && process.argv[i + 1] && !process.argv[i + 1].startsWith("--")) return process.argv[i + 1];
  return fallback;
}

function flag(name) {
  return process.argv.includes(`--${name}`);
}

function log(level, event, metadata = {}) {
  const line = JSON.stringify({
    ts: new Date().toISOString(),
    level,
    event,
    ...metadata,
  });
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

await loadCollectionEnv({ preferHosted: true });

const dryRun = flag("dry-run");
const dir = resolve(root, arg("dir", process.env.COLLECT_TRANSCRIPT_TMP_DIR ?? ".collection/transcripts"));
const limitRaw = arg("limit");
const limit = limitRaw ? Math.max(0, Number(limitRaw)) : Infinity;
const supabase = createServiceRoleSupabaseClient();

log("info", "transcript_cache_backfill_started", {
  dir,
  dry_run: dryRun,
  limit: limit === Infinity ? "all" : limit,
  collect_target: process.env.COLLECT_TARGET ?? null,
  supabase_url: process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? null,
});

const entries = await readTranscriptCacheEntries(dir, { vttToText });
const selectedEntries = entries.slice(0, limit === Infinity ? entries.length : limit);
const stats = {
  cache_videos: entries.length,
  selected: selectedEntries.length,
  matched_active_links: 0,
  upserted: 0,
  dry_run_matches: 0,
  skipped_no_active_link: 0,
  skipped_short_transcript: 0,
  failed: 0,
};

for (const entry of selectedEntries) {
  if (entry.transcript_length < MIN_TRANSCRIPT_LENGTH) {
    stats.skipped_short_transcript += 1;
    log("debug", "transcript_cache_backfill_skipped_short", {
      video_id: entry.video_id,
      file: entry.file,
      transcript_length: entry.transcript_length,
    });
    continue;
  }

  try {
    const link = await findActiveYoutubeLinkByVideoId(supabase, entry.video_id);
    if (!link) {
      stats.skipped_no_active_link += 1;
      log("debug", "transcript_cache_backfill_no_active_link", {
        video_id: entry.video_id,
        file: entry.file,
      });
      continue;
    }

    stats.matched_active_links += 1;
    if (dryRun) {
      stats.dry_run_matches += 1;
      log("info", "transcript_cache_backfill_dry_run_match", {
        link_id: link.id,
        video_id: entry.video_id,
        file: entry.file,
        language: entry.language,
        transcript_length: entry.transcript_length,
      });
      continue;
    }

    const result = await upsertLinkTranscript(supabase, {
      linkId: link.id,
      videoId: entry.video_id,
      language: entry.language ?? "en",
      provider: "disk_backfill",
      transcriptText: entry.transcript_text,
    });
    stats.upserted += 1;
    log("info", "transcript_cache_backfill_upserted", {
      link_id: result.link_id,
      video_id: result.video_id,
      file: entry.file,
      language: entry.language,
      transcript_length: entry.transcript_length,
      transcript_hash: result.transcript_hash,
    });
  } catch (error) {
    stats.failed += 1;
    log("error", "transcript_cache_backfill_failed", {
      video_id: entry.video_id,
      file: entry.file,
      message: error instanceof Error ? error.message : String(error),
    });
  }
}

log(stats.failed ? "warn" : "info", "transcript_cache_backfill_completed", stats);
if (stats.failed) process.exitCode = 1;
