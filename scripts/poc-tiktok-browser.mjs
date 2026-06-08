#!/usr/bin/env node
/**
 * POC — browser-session TikTok collection (search + engagement enrichment).
 *
 * Throwaway exploration script (2026-06-08). Goal: prove the
 * Google-discovery-or-TikTok-search → browser-session-scrape → engagement-stats
 * path works on TikTok the same way it works on YouTube. If this stays useful,
 * promote into scripts/_lib/tiktok-fetcher-browser.mjs and integrate with the
 * Link Searcher / Link Checker pipeline. Otherwise delete it.
 *
 * Reuses the CDP-attach pattern from scripts/_lib/transcript-fetcher-browser.mjs
 * — same Chrome profile dir, same one-time sign-in approach.
 *
 * One-time setup:
 *   1) Launch the CDP Chrome and sign into TikTok:
 *        node scripts/poc-tiktok-browser.mjs --setup
 *      A Chrome window opens on tiktok.com. Sign in. Close the script with
 *      Ctrl-C if it doesn't exit on its own — Chrome stays running, the
 *      session persists in .collection/cdp-chrome-profile/.
 *
 *   2) Run a query (search + detail + creator-profile probe):
 *        node scripts/poc-tiktok-browser.mjs "padel volley"
 *        node scripts/poc-tiktok-browser.mjs --limit 5 "badminton smash"
 *
 *   3) Probe a single creator:
 *        node scripts/poc-tiktok-browser.mjs --creator-probe hellopadel
 *
 * Output:
 *   - JSON to stdout (pipe into jq).
 *   - Structured logs to stderr (what selector hit, login/captcha detection).
 *   - First search-result page HTML  -> /tmp/tiktok-poc-search.html
 *   - First detail page HTML         -> /tmp/tiktok-poc-detail.html
 *     Inspect these when selectors break to find the new stable hooks.
 *
 * Known POC limits (called out so you don't read more into the results than is there):
 *   - View count is usually NOT on the standalone video URL — TikTok renders
 *     it on the creator profile feed instead. Like count is the most reliable
 *     engagement signal from a video-detail scrape.
 *   - No pagination/scroll. One search request, harvest what rendered, done.
 *   - No captcha solving. If TikTok serves a challenge, the script logs it
 *     and you solve it manually in the Chrome window, then re-run.
 *   - DOM is volatile. Expect the data-e2e selectors below to need patching.
 */

import { writeFileSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";
import { chromium } from "playwright";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const config = {
  chromePath: process.env.COLLECT_BROWSER_CHROME_PATH
    ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  cdpPort: Number(process.env.COLLECT_BROWSER_CDP_PORT ?? 9222),
  cdpProfileDir: process.env.COLLECT_BROWSER_CDP_PROFILE_DIR
    ?? resolve(root, ".collection", "cdp-chrome-profile"),
  navTimeoutMs: 25_000,
  resultsWaitMs: 4_000,
  detailWaitMs: 3_000,
  detailGapMs: 1_500,
  dumpDir: "/tmp",
};

// ---------------------------------------------------------------------------
// arg parsing — flags then a quoted query string
// ---------------------------------------------------------------------------
const args = process.argv.slice(2);
let setupMode = false;
let probeHandle = null;
let skipCreatorProbe = false;
let limit = 3;
const queryParts = [];
for (let i = 0; i < args.length; i += 1) {
  const a = args[i];
  if (a === "--setup") { setupMode = true; continue; }
  if (a === "--creator-probe") { probeHandle = args[i + 1]; i += 1; continue; }
  if (a === "--no-creator-probe") { skipCreatorProbe = true; continue; }
  if (a === "--limit") { limit = Number(args[i + 1] || "3"); i += 1; continue; }
  if (a === "--help" || a === "-h") { printUsage(); process.exit(0); }
  queryParts.push(a);
}
const query = queryParts.join(" ").trim();

function printUsage() {
  console.error(`Usage:
  node scripts/poc-tiktok-browser.mjs --setup
  node scripts/poc-tiktok-browser.mjs [--limit N] [--no-creator-probe] "<query>"
  node scripts/poc-tiktok-browser.mjs --creator-probe <handle>

Examples:
  node scripts/poc-tiktok-browser.mjs --setup
  node scripts/poc-tiktok-browser.mjs "padel volley"
  node scripts/poc-tiktok-browser.mjs --limit 5 "knife sharpening technique"
  node scripts/poc-tiktok-browser.mjs --creator-probe hellopadel`);
}

// ---------------------------------------------------------------------------
// CDP attach — verbatim shape from transcript-fetcher-browser.mjs
// ---------------------------------------------------------------------------
async function cdpUp(port) {
  try {
    const res = await fetch(`http://127.0.0.1:${port}/json/version`);
    return res.ok;
  } catch {
    return false;
  }
}

async function waitForCdp(port, timeoutMs = 20_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await cdpUp(port)) return;
    await sleep(400);
  }
  throw new Error(`cdp_endpoint_not_ready_after_${timeoutMs}ms`);
}

async function attachChrome({ openUrl = "about:blank" } = {}) {
  mkdirSync(config.cdpProfileDir, { recursive: true });
  let spawnedHere = false;
  if (!(await cdpUp(config.cdpPort))) {
    spawn(config.chromePath, [
      `--remote-debugging-port=${config.cdpPort}`,
      `--user-data-dir=${config.cdpProfileDir}`,
      "--profile-directory=Default",
      "--no-first-run",
      "--no-default-browser-check",
      "--hide-crash-restore-bubble",
      openUrl,
    ], { stdio: "ignore", detached: true });
    spawnedHere = true;
    await waitForCdp(config.cdpPort);
  }
  const browser = await chromium.connectOverCDP(`http://127.0.0.1:${config.cdpPort}`);
  return { browser, spawnedHere };
}

// ---------------------------------------------------------------------------
// number parsing — TikTok renders counts as "1.2K", "3.4M", etc.
// ---------------------------------------------------------------------------
function parseCount(text) {
  if (!text) return null;
  const cleaned = String(text).replace(/[,\s]/g, "").trim();
  const m = cleaned.match(/^([\d.]+)([KMB])?$/i);
  if (!m) return null;
  let n = parseFloat(m[1]);
  if (!Number.isFinite(n)) return null;
  const unit = (m[2] || "").toUpperCase();
  if (unit === "K") n *= 1_000;
  else if (unit === "M") n *= 1_000_000;
  else if (unit === "B") n *= 1_000_000_000;
  return Math.round(n);
}

// ---------------------------------------------------------------------------
// phase 1: search
// ---------------------------------------------------------------------------
async function searchTikTok(ctx, q) {
  const page = await ctx.newPage();
  await page.bringToFront().catch(() => {});
  const url = `https://www.tiktok.com/search?q=${encodeURIComponent(q)}`;
  console.error(`[search] navigating: ${url}`);

  try {
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: config.navTimeoutMs });
    await page.bringToFront().catch(() => {});
    await sleep(config.resultsWaitMs);

    // Snapshot for offline selector debugging.
    const html = await page.content();
    const dumpPath = `${config.dumpDir}/tiktok-poc-search.html`;
    writeFileSync(dumpPath, html);
    console.error(`[search] dumped HTML -> ${dumpPath} (${(html.length / 1024).toFixed(1)}KB)`);

    // Friendly detection of login wall / captcha.
    const wallText = await page.evaluate(() => {
      const sels = [
        '[id*="login-modal" i]', '[class*="login-modal" i]', '[data-e2e*="login-modal"]',
        '[id*="captcha" i]',     '[class*="captcha" i]',     '[data-e2e*="captcha"]',
      ];
      for (const s of sels) {
        const el = document.querySelector(s);
        if (el && (el.textContent || "").trim()) return { sel: s, text: el.textContent.trim().slice(0, 120) };
      }
      return null;
    });
    if (wallText) console.error(`[search] possible auth/captcha wall: ${JSON.stringify(wallText)}`);

    // Card-level harvest. Verified DOM structure (2026-06-08):
    //   #search_top-item-list                    <- top-results grid wrapper
    //     div[id^="grid-item-container-N"]       <- one row per result
    //       a[href*="/@.../video/..."]           <- video URL (no data-e2e on it)
    //       [data-e2e="search_top-item"]         <- thumbnail/player child (holds video-views)
    //         [data-e2e="video-views"]
    //       [data-e2e="search-card-video-caption"]   <- caption (sibling of search_top-item)
    //       a[data-e2e="search-card-user-link"]      <- /@<handle>
    //       p[data-e2e="search-card-user-unique-id"] <- handle text
    //
    // The earlier "search inside [data-e2e='search_top-item']" approach missed
    // the handle/caption because those are SIBLINGS of search_top-item inside
    // the grid-item-container, not descendants. Using the row container fixes it.
    //
    // We also no longer use a broad a[href*='/video/'] sweep — that pulled in
    // videos from the "You may also like" feed below the results (numeric @<userId>
    // URLs whose actual content was unrelated to the query).
    const cards = await page.evaluate(() => {
      const out = [];
      const seenHrefs = new Set();
      for (const row of document.querySelectorAll('div[id^="grid-item-container-"]')) {
        const videoA = row.querySelector('a[href*="/video/"]');
        if (!videoA) continue;
        const href = videoA.href.split("?")[0];
        if (!/^https:\/\/www\.tiktok\.com\/@[^\/]+\/video\/\d+/.test(href)) continue;
        if (seenHrefs.has(href)) continue;
        seenHrefs.add(href);
        const handleEl  = row.querySelector('[data-e2e="search-card-user-unique-id"]');
        const captionEl = row.querySelector('[data-e2e="search-card-video-caption"]');
        const viewsEl   = row.querySelector('[data-e2e="video-views"]');
        const userLinkA = row.querySelector('a[data-e2e="search-card-user-link"]');
        out.push({
          href,
          handle: handleEl ? handleEl.textContent.trim() : null,
          caption: captionEl ? captionEl.textContent.trim().slice(0, 280) : null,
          views_text: viewsEl ? viewsEl.textContent.trim() : null,
          creator_url: userLinkA ? userLinkA.href : null,
        });
      }
      return out;
    });
    cards.forEach((c) => { c.views_count = parseCount(c.views_text); });
    console.error(`[search] structured cards from grid-item-container: ${cards.length}`);

    // Filter video URLs to only what came from the top-results grid.
    // This is the bug-fix that matters most: in the v1 run, the broad anchor
    // sweep dragged in /@<numeric-userId>/video/<id> links from feed sections,
    // so the detail-fetch step burned its limit budget on non-padel content.
    const videoUrls = cards.map((c) => c.href);
    console.error(`[search] grid-only video URLs: ${videoUrls.length}`);

    return { url, video_urls: videoUrls, cards };
  } finally {
    await page.close().catch(() => {});
  }
}

// ---------------------------------------------------------------------------
// phase 2: video detail enrichment
// ---------------------------------------------------------------------------
async function fetchVideoDetail(ctx, videoUrl, { dumpHtml = false } = {}) {
  const page = await ctx.newPage();
  await page.bringToFront().catch(() => {});
  console.error(`[detail] ${videoUrl}`);

  try {
    await page.goto(videoUrl, { waitUntil: "domcontentloaded", timeout: config.navTimeoutMs });
    await page.bringToFront().catch(() => {});
    await sleep(config.detailWaitMs);

    if (dumpHtml) {
      const dumpPath = `${config.dumpDir}/tiktok-poc-detail.html`;
      writeFileSync(dumpPath, await page.content());
      console.error(`[detail] dumped HTML -> ${dumpPath}`);
    }

    // Selectors verified against /tmp/tiktok-poc-detail.html dump on 2026-06-08.
    // The v1 selector list got bookmark and creator-handle wrong:
    //   - Bookmark count is exposed as `favorite-count`, not `undefined-count`.
    //   - There is no `browse-username` selector; the handle is encoded in the
    //     `video-author-avatar` anchor href (`/@<handle>`) and we derive it.
    //   - Duration is not on any data-e2e — it's in the SSR JSON blob at
    //     __UNIVERSAL_DATA_FOR_REHYDRATION__ under
    //     __DEFAULT_SCOPE__["webapp.video-detail"].itemInfo.itemStruct.video.duration
    //     (integer seconds). We try the JSON first, fall back to <video>.duration.
    const data = await page.evaluate(() => {
      const text = (sels) => {
        for (const s of sels) {
          const el = document.querySelector(s);
          if (el && (el.textContent || "").trim()) {
            return { value: el.textContent.trim(), hit: s };
          }
        }
        return { value: null, hit: null };
      };
      const attr = (sels, name) => {
        for (const s of sels) {
          const el = document.querySelector(s);
          if (el && el.getAttribute(name)) return { value: el.getAttribute(name), hit: s };
        }
        return { value: null, hit: null };
      };
      let durationSec = null;
      let durationSource = null;
      const jsonScript = document.querySelector('script#__UNIVERSAL_DATA_FOR_REHYDRATION__');
      if (jsonScript && jsonScript.textContent) {
        try {
          const blob = JSON.parse(jsonScript.textContent);
          const item = blob?.__DEFAULT_SCOPE__?.["webapp.video-detail"]?.itemInfo?.itemStruct;
          const d = item?.video?.duration;
          if (typeof d === "number" && Number.isFinite(d)) {
            durationSec = d;
            durationSource = "ssr_json";
          }
        } catch { /* ignore parse errors */ }
      }
      if (durationSec == null) {
        const v = document.querySelector("video");
        if (v && Number.isFinite(v.duration) && v.duration > 0) {
          durationSec = v.duration;
          durationSource = "video_element";
        }
      }
      return {
        like:         text(['strong[data-e2e="like-count"]', '[data-e2e="like-count"]']),
        comment:      text(['strong[data-e2e="comment-count"]', '[data-e2e="comment-count"]']),
        share:        text(['strong[data-e2e="share-count"]', '[data-e2e="share-count"]']),
        favorite:     text(['strong[data-e2e="favorite-count"]', '[data-e2e="favorite-count"]']),
        caption:      text(['[data-e2e="video-desc"]', '[data-e2e="browse-video-desc"]']),
        avatar_href:  attr(['a[data-e2e="video-author-avatar"]'], 'href'),
        music:        text(['a[data-e2e="video-music"]', '[data-e2e="video-music"]']),
        durationSec,
        durationSource,
      };
    });

    // Flatten { value, hit } pairs (excluding the already-scalar duration fields).
    const flat = {};
    const hits = {};
    for (const [key, raw] of Object.entries(data)) {
      if (key === "durationSec" || key === "durationSource") continue;
      flat[`${key}_text`] = raw.value;
      hits[key] = raw.hit;
    }
    // Handle = first path segment of avatar href after "/@".
    let creator_handle = null;
    let creator_url = null;
    if (flat.avatar_href_text) {
      creator_url = flat.avatar_href_text.startsWith("http")
        ? flat.avatar_href_text
        : `https://www.tiktok.com${flat.avatar_href_text}`;
      const m = creator_url.match(/\/@([^\/?#]+)/);
      if (m && m[1]) creator_handle = m[1];
    }

    return {
      url: videoUrl,
      duration_seconds: data.durationSec != null ? Math.round(data.durationSec * 100) / 100 : null,
      duration_source:  data.durationSource,
      like_count:     parseCount(flat.like_text),
      comment_count:  parseCount(flat.comment_text),
      share_count:    parseCount(flat.share_text),
      favorite_count: parseCount(flat.favorite_text),
      caption:        flat.caption_text,
      creator_handle,
      creator_url,
      music:          flat.music_text ? flat.music_text.trim() : null,
      _raw_text:      flat,
      _selector_hits: hits,
    };
  } finally {
    await page.close().catch(() => {});
  }
}

// ---------------------------------------------------------------------------
// phase 3: creator profile probe — followers, bio, verified, video count
// ---------------------------------------------------------------------------
// Profile pages also embed a __UNIVERSAL_DATA_FOR_REHYDRATION__ JSON blob.
// On /@<handle>, it lives at __DEFAULT_SCOPE__["webapp.user-detail"].userInfo:
//   userInfo.user.{uniqueId, nickname, signature, verified, secUid, bioLink}
//   userInfo.stats.{followerCount, followingCount, heart, videoCount, diggCount}
// We try the JSON first (no DOM-rotation risk, gives us numeric counts directly)
// and fall back to data-e2e selectors. Worth knowing: signature is the bio.
let firstProfileDumped = false;
async function fetchCreatorProfile(ctx, handle) {
  if (!handle) return null;
  const page = await ctx.newPage();
  await page.bringToFront().catch(() => {});
  const profileUrl = `https://www.tiktok.com/@${handle}`;
  console.error(`[profile] ${profileUrl}`);

  try {
    await page.goto(profileUrl, { waitUntil: "domcontentloaded", timeout: config.navTimeoutMs });
    await page.bringToFront().catch(() => {});
    await sleep(config.detailWaitMs);

    if (!firstProfileDumped) {
      const dumpPath = `${config.dumpDir}/tiktok-poc-profile.html`;
      writeFileSync(dumpPath, await page.content());
      console.error(`[profile] dumped HTML -> ${dumpPath}`);
      firstProfileDumped = true;
    }

    const probe = await page.evaluate(() => {
      // -- SSR JSON path (preferred — gives numeric stats directly) --
      let jsonInfo = null;
      const jsonEl = document.querySelector('script#__UNIVERSAL_DATA_FOR_REHYDRATION__');
      if (jsonEl && jsonEl.textContent) {
        try {
          const blob = JSON.parse(jsonEl.textContent);
          jsonInfo = blob?.__DEFAULT_SCOPE__?.["webapp.user-detail"]?.userInfo ?? null;
        } catch { /* swallow */ }
      }

      // -- DOM fallback / cross-check --
      const text = (sels) => {
        for (const s of sels) {
          const el = document.querySelector(s);
          if (el && (el.textContent || "").trim()) return { value: el.textContent.trim(), hit: s };
        }
        return { value: null, hit: null };
      };
      const dom = {
        bio:        text(['[data-e2e="user-bio"]', 'h2[data-e2e="user-subtitle"]']),
        nickname:   text(['[data-e2e="user-title"]', 'h1[data-e2e="user-title"]']),
        followers:  text(['strong[data-e2e="followers-count"]', '[data-e2e="followers-count"]']),
        following:  text(['strong[data-e2e="following-count"]', '[data-e2e="following-count"]']),
        likes:      text(['strong[data-e2e="likes-count"]', '[data-e2e="likes-count"]']),
      };
      const verifiedEl = document.querySelector('[data-e2e="user-verified"], svg[aria-label*="erified"]');
      const verified = !!verifiedEl;
      // Bio link (external) — frequently a YouTube/IG/website URL
      const bioLinkEl = document.querySelector('[data-e2e="user-link"] a, [data-e2e="user-bio-link"] a, a[data-e2e="user-link"]');
      const bioLink = bioLinkEl ? bioLinkEl.getAttribute("href") || bioLinkEl.href : null;

      return { jsonInfo, dom, verified, bioLink };
    });

    // Merge JSON + DOM. JSON is authoritative for numeric counts when present.
    const user  = probe.jsonInfo?.user  ?? {};
    const stats = probe.jsonInfo?.stats ?? {};
    const merged = {
      handle:           user.uniqueId  ?? handle,
      nickname:         user.nickname  ?? probe.dom.nickname.value ?? null,
      bio:              user.signature ?? probe.dom.bio.value ?? null,
      verified:         user.verified ?? probe.verified ?? false,
      bio_link:         user.bioLink?.link ?? probe.bioLink ?? null,
      sec_uid:          user.secUid ?? null,
      followers_count:  Number.isFinite(stats.followerCount)  ? stats.followerCount  : parseCount(probe.dom.followers.value),
      following_count:  Number.isFinite(stats.followingCount) ? stats.followingCount : parseCount(probe.dom.following.value),
      hearts_count:     Number.isFinite(stats.heart)          ? stats.heart          : parseCount(probe.dom.likes.value),
      videos_count:     Number.isFinite(stats.videoCount)     ? stats.videoCount     : null,
      _source: {
        json_available: !!probe.jsonInfo,
        dom_hits: {
          bio: probe.dom.bio.hit,
          nickname: probe.dom.nickname.hit,
          followers: probe.dom.followers.hit,
          following: probe.dom.following.hit,
          likes: probe.dom.likes.hit,
        },
      },
    };
    return { url: profileUrl, ...merged };
  } finally {
    await page.close().catch(() => {});
  }
}

// ---------------------------------------------------------------------------
// main
// ---------------------------------------------------------------------------
(async () => {
  if (setupMode) {
    console.error("setup: opening Chrome on tiktok.com. Sign in, then re-run with a query.");
    const { browser } = await attachChrome({ openUrl: "https://www.tiktok.com" });
    await browser.close().catch(() => {});
    return;
  }

  // Standalone creator probe path — useful for inspecting one creator.
  if (probeHandle) {
    const { browser } = await attachChrome();
    try {
      const ctx = browser.contexts()[0] ?? await browser.newContext();
      const profile = await fetchCreatorProfile(ctx, probeHandle.replace(/^@/, ""));
      process.stdout.write(JSON.stringify(profile, null, 2) + "\n");
    } finally {
      await browser.close().catch(() => {});
    }
    return;
  }

  if (!query) { printUsage(); process.exit(2); }

  const { browser } = await attachChrome();
  let exitCode = 0;
  try {
    const ctx = browser.contexts()[0] ?? await browser.newContext();

    const searchResult = await searchTikTok(ctx, query);
    const topUrls = searchResult.video_urls.slice(0, limit);
    const details = [];
    for (let i = 0; i < topUrls.length; i += 1) {
      try {
        const detail = await fetchVideoDetail(ctx, topUrls[i], { dumpHtml: i === 0 });
        details.push(detail);
      } catch (err) {
        console.error(`[detail] failed: ${topUrls[i]} — ${err?.message ?? err}`);
        details.push({ url: topUrls[i], error: String(err?.message ?? err) });
      }
      if (i < topUrls.length - 1) await sleep(config.detailGapMs);
    }

    // Creator-profile probe step: collect unique handles from this run
    // (search cards + details), probe each one once, attach to output.
    const creatorProfiles = {};
    if (!skipCreatorProbe) {
      const handles = new Set();
      for (const c of searchResult.cards) if (c.handle) handles.add(c.handle);
      for (const d of details) if (d.creator_handle) handles.add(d.creator_handle);
      const handleList = [...handles];
      console.error(`[profile] probing ${handleList.length} unique creator(s)`);
      for (let i = 0; i < handleList.length; i += 1) {
        try {
          creatorProfiles[handleList[i]] = await fetchCreatorProfile(ctx, handleList[i]);
        } catch (err) {
          console.error(`[profile] failed: ${handleList[i]} — ${err?.message ?? err}`);
          creatorProfiles[handleList[i]] = { error: String(err?.message ?? err) };
        }
        if (i < handleList.length - 1) await sleep(config.detailGapMs);
      }
    }

    // Summary block — distributions per query so a sweep across sub-skills
    // is easy to eyeball without jq gymnastics.
    const cards = searchResult.cards;
    const durations = details.map((d) => d.duration_seconds).filter((n) => typeof n === "number");
    const likes     = cards.map((c) => c.views_count).filter((n) => typeof n === "number");  // see prior note: search "views" === likes
    const followerCounts = Object.values(creatorProfiles).map((p) => p?.followers_count).filter((n) => typeof n === "number");
    const summary = {
      cards_count: cards.length,
      details_count: details.length,
      creators_probed: Object.keys(creatorProfiles).length,
      likes:     summarize(likes),
      duration_s: summarize(durations),
      followers: summarize(followerCounts),
      verified_creators: Object.values(creatorProfiles).filter((p) => p?.verified).length,
      creators_with_bio_link: Object.values(creatorProfiles).filter((p) => !!p?.bio_link).length,
    };

    process.stdout.write(JSON.stringify({
      query,
      summary,
      search: {
        url: searchResult.url,
        total_video_urls: searchResult.video_urls.length,
        cards_count: cards.length,
        cards,
      },
      details,
      creator_profiles: creatorProfiles,
    }, null, 2) + "\n");
  } catch (err) {
    console.error("POC failed:", err?.stack || err);
    exitCode = 1;
  } finally {
    await browser.close().catch(() => {});
    process.exit(exitCode);
  }
})();

function summarize(nums) {
  if (!nums.length) return { n: 0 };
  const sorted = [...nums].sort((a, b) => a - b);
  const sum = sorted.reduce((acc, v) => acc + v, 0);
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
