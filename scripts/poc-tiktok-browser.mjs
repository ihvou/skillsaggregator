#!/usr/bin/env node
/**
 * Thin CLI wrapper for the reusable TikTok browser fetcher.
 *
 * One-time setup:
 *   node scripts/poc-tiktok-browser.mjs --setup
 *
 * Query:
 *   node scripts/poc-tiktok-browser.mjs --limit 5 "padel volley"
 *
 * Creator probe:
 *   node scripts/poc-tiktok-browser.mjs --creator-probe hellopadel
 */

import { setTimeout as sleep } from "node:timers/promises";
import {
  closeTikTokBrowser,
  fetchCreatorProfile,
  fetchVideoDetail,
  getTikTokBrowserContext,
  preflightTikTokBrowser,
  searchTikTok,
} from "./_lib/tiktok-fetcher-browser.mjs";

const args = process.argv.slice(2);
let setupMode = false;
let probeHandle = null;
let skipCreatorProbe = false;
let limit = 3;
const queryParts = [];

for (let i = 0; i < args.length; i += 1) {
  const arg = args[i];
  if (arg === "--setup") { setupMode = true; continue; }
  if (arg === "--creator-probe") { probeHandle = args[i + 1]; i += 1; continue; }
  if (arg === "--no-creator-probe") { skipCreatorProbe = true; continue; }
  if (arg === "--limit") { limit = Number(args[i + 1] || "3"); i += 1; continue; }
  if (arg === "--help" || arg === "-h") { printUsage(); process.exit(0); }
  queryParts.push(arg);
}

const query = queryParts.join(" ").trim();
const detailGapMs = Number(process.env.COLLECT_TIKTOK_PROBE_GAP_MS ?? 1_500);

function printUsage() {
  console.error(`Usage:
  node scripts/poc-tiktok-browser.mjs --setup
  node scripts/poc-tiktok-browser.mjs [--limit N] [--no-creator-probe] "<query>"
  node scripts/poc-tiktok-browser.mjs --creator-probe <handle>`);
}

function summarize(nums) {
  if (!nums.length) return { n: 0 };
  const sorted = [...nums].sort((a, b) => a - b);
  const sum = sorted.reduce((acc, value) => acc + value, 0);
  return {
    n: sorted.length,
    min: sorted[0],
    p25: sorted[Math.floor(sorted.length * 0.25)],
    median: sorted[Math.floor(sorted.length * 0.5)],
    p75: sorted[Math.floor(sorted.length * 0.75)],
    max: sorted[sorted.length - 1],
    mean: Math.round((sum / sorted.length) * 10) / 10,
  };
}

(async () => {
  if (setupMode) {
    console.error("setup: opening Chrome on tiktok.com. Sign in, then re-run with a query.");
    const preflight = await preflightTikTokBrowser();
    process.stderr.write(`${JSON.stringify(preflight, null, 2)}\n`);
    return;
  }

  if (probeHandle) {
    const ctx = await getTikTokBrowserContext();
    try {
      const profile = await fetchCreatorProfile(ctx, probeHandle.replace(/^@/, ""));
      process.stdout.write(`${JSON.stringify(profile, null, 2)}\n`);
    } finally {
      await closeTikTokBrowser();
    }
    return;
  }

  if (!query) {
    printUsage();
    process.exit(2);
  }

  let exitCode = 0;
  const ctx = await getTikTokBrowserContext();
  try {
    const searchResult = await searchTikTok(ctx, query);
    const topUrls = searchResult.video_urls.slice(0, limit);
    const details = [];
    for (let i = 0; i < topUrls.length; i += 1) {
      try {
        details.push(await fetchVideoDetail(ctx, topUrls[i], { dumpHtml: i === 0 }));
      } catch (error) {
        console.error(`[detail] failed: ${topUrls[i]} - ${error?.message ?? error}`);
        details.push({ url: topUrls[i], error: String(error?.message ?? error) });
      }
      if (i < topUrls.length - 1) await sleep(detailGapMs);
    }

    const creatorProfiles = {};
    if (!skipCreatorProbe) {
      const handles = new Set();
      for (const card of searchResult.cards) if (card.handle) handles.add(card.handle);
      for (const detail of details) if (detail.creator_handle) handles.add(detail.creator_handle);
      const handleList = [...handles];
      console.error(`[profile] probing ${handleList.length} unique creator(s)`);
      for (let i = 0; i < handleList.length; i += 1) {
        try {
          creatorProfiles[handleList[i]] = await fetchCreatorProfile(ctx, handleList[i]);
        } catch (error) {
          console.error(`[profile] failed: ${handleList[i]} - ${error?.message ?? error}`);
          creatorProfiles[handleList[i]] = { error: String(error?.message ?? error) };
        }
        if (i < handleList.length - 1) await sleep(detailGapMs);
      }
    }

    const cards = searchResult.cards;
    const durations = details.map((detail) => detail.duration_seconds).filter((n) => typeof n === "number");
    const likes = cards.map((card) => card.views_count).filter((n) => typeof n === "number");
    const followerCounts = Object.values(creatorProfiles)
      .map((profile) => profile?.followers_count)
      .filter((n) => typeof n === "number");

    process.stdout.write(`${JSON.stringify({
      query,
      summary: {
        cards_count: cards.length,
        details_count: details.length,
        creators_probed: Object.keys(creatorProfiles).length,
        likes: summarize(likes),
        duration_s: summarize(durations),
        followers: summarize(followerCounts),
        verified_creators: Object.values(creatorProfiles).filter((profile) => profile?.verified).length,
        creators_with_bio_link: Object.values(creatorProfiles).filter((profile) => Boolean(profile?.bio_link)).length,
      },
      search: {
        url: searchResult.url,
        total_video_urls: searchResult.video_urls.length,
        cards_count: cards.length,
        cards,
      },
      details,
      creator_profiles: creatorProfiles,
    }, null, 2)}\n`);
  } catch (error) {
    console.error("POC failed:", error?.stack || error);
    exitCode = 1;
  } finally {
    await closeTikTokBrowser();
    process.exit(exitCode);
  }
})();
