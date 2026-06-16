#!/usr/bin/env node
/**
 * Recurring transcript gap-filler.
 *
 * Selects active YouTube links that do not have a link_transcripts row, scrapes
 * via the same browser/CDP fetcher used by collection, and upserts idempotently.
 *
 * Usage:
 *   node scripts/fetch-missing-transcripts.mjs --limit 10
 *   COLLECT_TARGET=hosted node scripts/fetch-missing-transcripts.mjs --all
 *   node scripts/fetch-missing-transcripts.mjs --dry-run
 */
import { setTimeout as sleep } from "node:timers/promises";
import {
  closeTranscriptBrowser,
  fetchTranscriptBrowser,
  preflightTranscriptBrowser,
} from "./_lib/transcript-fetcher-browser.mjs";
import { loadCollectionEnv } from "./_lib/script-env.mjs";
import {
  createServiceRoleSupabaseClient,
  listActiveYoutubeLinksMissingTranscripts,
  MIN_TRANSCRIPT_LENGTH,
  normalizeTranscriptText,
  upsertLinkTranscript,
} from "./_lib/link-transcripts.mjs";

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

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}

function isRateLimitEquivalent(error) {
  const message = errorMessage(error).toLowerCase();
  return message.includes("429")
    || message.includes("too many requests")
    || message.includes("rate limit")
    || message.includes("rate_limit")
    || message.includes("timeout")
    || message.includes("timed out")
    || message.includes("browser_transcript_timeout_after_")
    || message.includes("youtube_transcript_request_failed");
}

function resolveLimit() {
  if (flag("all")) return Infinity;
  const raw = arg("limit", process.env.COLLECT_MISSING_TRANSCRIPTS_LIMIT ?? "25");
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < 1) throw new Error(`Invalid --limit value: ${raw}`);
  return Math.floor(parsed);
}

await loadCollectionEnv({ preferHosted: process.env.COLLECT_TARGET === "hosted" });

const dryRun = flag("dry-run");
const limit = resolveLimit();
const minGapMs = Math.max(
  0,
  Number(process.env.COLLECT_TRANSCRIPT_GLOBAL_MIN_GAP_MS
    ?? Number(process.env.YTDLP_SLEEP_SUBTITLES ?? 25) * 1000),
);
const circuitThreshold = Math.max(
  1,
  Number(process.env.COLLECT_TRANSCRIPT_RATE_LIMIT_CONSECUTIVE ?? 5),
);
const supabase = createServiceRoleSupabaseClient();

log("info", "missing_transcript_scrape_started", {
  dry_run: dryRun,
  limit: limit === Infinity ? "all" : limit,
  min_gap_ms: minGapMs,
  rate_limit_consecutive_threshold: circuitThreshold,
  collect_target: process.env.COLLECT_TARGET ?? null,
  supabase_url: process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? null,
});

const links = await listActiveYoutubeLinksMissingTranscripts(supabase, { limit });
const stats = {
  selected: links.length,
  fetched: 0,
  upserted: 0,
  dry_run_selected: dryRun ? links.length : 0,
  skipped_short_transcript: 0,
  failed: 0,
  rate_limit_equivalent_failures: 0,
  circuit_open: false,
};

if (dryRun) {
  for (const link of links) {
    log("info", "missing_transcript_scrape_dry_run_link", {
      link_id: link.id,
      video_id: link.video_id,
      title: link.title,
      canonical_url: link.canonical_url,
    });
  }
  log("info", "missing_transcript_scrape_completed", stats);
  process.exit(0);
}

let lastFetchStartedAt = 0;
let consecutiveRateLimitEquivalentFailures = 0;

try {
  const preflight = await preflightTranscriptBrowser();
  log("info", "missing_transcript_browser_preflight_completed", preflight);

  for (const link of links) {
    const now = Date.now();
    const waitMs = lastFetchStartedAt ? Math.max(0, lastFetchStartedAt + minGapMs - now) : 0;
    if (waitMs > 0) {
      log("debug", "missing_transcript_global_throttle_wait", {
        wait_ms: waitMs,
        link_id: link.id,
        video_id: link.video_id,
      });
      await sleep(waitMs);
    }

    lastFetchStartedAt = Date.now();
    try {
      log("info", "missing_transcript_fetch_started", {
        link_id: link.id,
        video_id: link.video_id,
        title: link.title,
      });
      const transcript = normalizeTranscriptText(await fetchTranscriptBrowser(link.video_id));
      stats.fetched += 1;
      consecutiveRateLimitEquivalentFailures = 0;

      if (transcript.length < MIN_TRANSCRIPT_LENGTH) {
        stats.skipped_short_transcript += 1;
        log("warn", "missing_transcript_skipped_short", {
          link_id: link.id,
          video_id: link.video_id,
          transcript_length: transcript.length,
        });
        continue;
      }

      const result = await upsertLinkTranscript(supabase, {
        linkId: link.id,
        videoId: link.video_id,
        provider: "browser",
        language: "en",
        transcriptText: transcript,
      });
      stats.upserted += 1;
      log("info", "missing_transcript_upserted", {
        link_id: result.link_id,
        video_id: result.video_id,
        transcript_length: transcript.length,
        transcript_hash: result.transcript_hash,
      });
    } catch (error) {
      stats.failed += 1;
      const rateLimitEquivalent = isRateLimitEquivalent(error);
      if (rateLimitEquivalent) {
        stats.rate_limit_equivalent_failures += 1;
        consecutiveRateLimitEquivalentFailures += 1;
      } else {
        consecutiveRateLimitEquivalentFailures = 0;
      }
      log("warn", "missing_transcript_fetch_failed", {
        link_id: link.id,
        video_id: link.video_id,
        message: errorMessage(error),
        rate_limit_equivalent: rateLimitEquivalent,
        consecutive_rate_limit_equivalent_failures: consecutiveRateLimitEquivalentFailures,
        threshold: circuitThreshold,
      });

      if (consecutiveRateLimitEquivalentFailures >= circuitThreshold) {
        stats.circuit_open = true;
        log("error", "missing_transcript_rate_limit_circuit_open", {
          link_id: link.id,
          video_id: link.video_id,
          consecutive_rate_limit_equivalent_failures: consecutiveRateLimitEquivalentFailures,
          threshold: circuitThreshold,
        });
        break;
      }
    }
  }
} finally {
  await closeTranscriptBrowser().catch((error) => {
    log("warn", "missing_transcript_browser_close_failed", { message: errorMessage(error) });
  });
}

log(stats.circuit_open || stats.failed ? "warn" : "info", "missing_transcript_scrape_completed", stats);
if (stats.circuit_open) process.exitCode = 2;
else if (stats.failed) process.exitCode = 1;
