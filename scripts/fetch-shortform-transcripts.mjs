#!/usr/bin/env node
/**
 * Transcript gap-filler for short-form video — the TikTok/Instagram counterpart
 * to fetch-missing-transcripts.mjs.
 *
 * Selects active TikTok and Instagram links with no link_transcripts row,
 * downloads each clip, transcribes it with local whisper, and upserts
 * idempotently. Human-submitted links first, so something a user shared is
 * transcribed before backlog the collector found on its own.
 *
 * DELIBERATELY A SEPARATE SCRIPT, not a branch inside the YouTube gap-filler.
 * They select different rows and need different machinery: that one drives a
 * CDP browser holding a Google session to scrape caption tracks, this one shells
 * out to yt-dlp/instaloader and whisper. Folding them together would mean one
 * process holding a browser it does not need for two thirds of its work, and
 * would put the YouTube path — which runs on a cron and works — at risk for no
 * gain. The DB selector and the transcript writer ARE shared.
 *
 * A clip that fails the speech-density gate stores NOTHING and is left without a
 * transcript, which is the correct outcome: it degrades to the existing
 * metadata_fallback scoring mode exactly as a caption-less YouTube video does.
 * Storing what whisper returns for a music-only clip would feed song lyrics to
 * the coach as technique instruction.
 *
 * Usage:
 *   node scripts/fetch-shortform-transcripts.mjs --limit 10
 *   node scripts/fetch-shortform-transcripts.mjs --all
 *   node scripts/fetch-shortform-transcripts.mjs --dry-run --limit 5
 *   node scripts/fetch-shortform-transcripts.mjs --platform instagram --limit 3
 */
import { setTimeout as sleep } from "node:timers/promises";
import { loadCollectionEnv } from "./_lib/script-env.mjs";
import {
  createServiceRoleSupabaseClient,
  listActiveShortFormLinksMissingTranscripts,
  transcriptSourceFromUrl,
  upsertLinkTranscript,
} from "./_lib/link-transcripts.mjs";
import {
  ensureWhisperModel,
  transcribeShortForm,
} from "./_lib/short-form-transcriber.mjs";

await loadCollectionEnv({ preferHosted: process.env.COLLECT_TARGET === "hosted" });

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
  const line = JSON.stringify({ ts: new Date().toISOString(), level, event, ...metadata });
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

function errorMessage(error) {
  if (error instanceof Error) {
    // execFile rejections carry the real detail on .stderr; Supabase errors
    // carry it on .details/.hint. Plain String() on either gives the useless
    // "[object Object]" that hid five distinct failures in the first batch.
    const extra = String(error.stderr ?? "").trim().split("\n").filter(Boolean).pop();
    return extra ? `${error.message} :: ${extra}` : error.message;
  }
  if (error && typeof error === "object") {
    const parts = [error.message, error.details, error.hint, error.code]
      .filter((value) => typeof value === "string" && value.trim());
    if (parts.length) return parts.join(" :: ");
    try { return JSON.stringify(error); } catch { return "unserializable error" }
  }
  return String(error);
}

async function main() {
  const dryRun = flag("dry-run");
  const all = flag("all");
  const limit = all ? Infinity : Number(arg("limit", "10"));
  const platform = arg("platform", null);
  // Downloads are the expensive part and they hit third-party hosts; pace them
  // so a backlog run does not look like a scrape.
  const gapMs = Number(arg("gap-ms", process.env.COLLECT_SHORTFORM_GAP_MS ?? "2000"));

  const supabase = createServiceRoleSupabaseClient();
  const links = await listActiveShortFormLinksMissingTranscripts(supabase, { limit, platform });

  log("info", "shortform_transcripts_started", {
    candidates: links.length,
    limit: all ? "all" : limit,
    platform: platform ?? "any",
    dry_run: dryRun,
  });
  if (!links.length) return;

  if (dryRun) {
    for (const link of links) {
      log("info", "shortform_transcript_would_fetch", {
        link_id: link.id, platform: link.platform, human: link.human_submitted,
        title: (link.title ?? "").slice(0, 80),
      });
    }
    return;
  }

  // Fetch the model once up front rather than on the first clip, so a 1.5 GB
  // download is not mistaken for a hung transcription.
  const modelPath = await ensureWhisperModel({ log: (l, e, _m, meta) => log(l, e, meta ?? {}) });

  const stats = { stored: 0, rejected: 0, failed: 0, by_reason: {} };

  for (const [index, link] of links.entries()) {
    const url = link.canonical_url ?? link.url;
    try {
      const result = await transcribeShortForm(url, { modelPath });

      if (!result.ok) {
        stats.rejected += 1;
        stats.by_reason[result.reason] = (stats.by_reason[result.reason] ?? 0) + 1;
        log("warn", "shortform_transcript_rejected", {
          link_id: link.id, platform: link.platform, reason: result.reason,
          chars: result.chars ?? 0, chars_per_second: Number((result.charsPerSecond ?? 0).toFixed(1)),
          seconds: Math.round(result.seconds ?? 0),
        });
        continue;
      }

      await upsertLinkTranscript(supabase, {
        linkId: link.id,
        transcriptText: result.text,
        provider: "whisper",
        source: transcriptSourceFromUrl(link.canonical_url, link.url),
        language: "en",
      });
      stats.stored += 1;
      log("info", "shortform_transcript_stored", {
        link_id: link.id, platform: link.platform, chars: result.chars,
        chars_per_second: Number(result.charsPerSecond.toFixed(1)),
        seconds: Math.round(result.seconds),
      });
    } catch (error) {
      stats.failed += 1;
      log("warn", "shortform_transcript_failed", {
        link_id: link.id, platform: link.platform, message: errorMessage(error).slice(0, 200),
      });
    }

    if (index < links.length - 1 && gapMs > 0) await sleep(gapMs);
  }

  log("info", "shortform_transcripts_completed", {
    candidates: links.length, ...stats,
  });
}

main().catch((error) => {
  log("error", "shortform_transcripts_fatal", { message: errorMessage(error) });
  process.exitCode = 1;
});
