import { mkdir } from "node:fs/promises";
import { writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";
import { chromium } from "playwright";
import { isCdpChromeHealthy, killChromeOnPort } from "./cdp-health.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");

const config = {
  chromePath: process.env.COLLECT_BROWSER_CHROME_PATH
    ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  cdpPort: Number(process.env.COLLECT_BROWSER_CDP_PORT ?? 9222),
  cdpProfileDir: process.env.COLLECT_BROWSER_CDP_PROFILE_DIR
    ?? resolve(root, ".collection", "cdp-chrome-profile"),
  navTimeoutMs: Number(process.env.COLLECT_TIKTOK_NAV_TIMEOUT_MS ?? 25_000),
  resultsWaitMs: Number(process.env.COLLECT_TIKTOK_RESULTS_WAIT_MS ?? 4_000),
  detailWaitMs: Number(process.env.COLLECT_TIKTOK_DETAIL_WAIT_MS ?? 3_000),
  dumpDir: process.env.COLLECT_TIKTOK_DUMP_DIR ?? "/tmp",
};

let chromeProcess = null;
let cdpBrowser = null;
let context = null;
let contextPromise = null;
let firstProfileDumped = false;

// Keep the attach lifecycle local to this fetcher, but point it at the same
// CDP port/profile as transcript-fetcher-browser.mjs. That shares the logged-in
// Chrome session without changing the proven YouTube transcript path.

async function cdpEndpointUp(port) {
  try {
    const res = await fetch(`http://127.0.0.1:${port}/json/version`);
    return res.ok;
  } catch {
    return false;
  }
}

async function waitForCdpEndpoint(port, timeoutMs = 20_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await cdpEndpointUp(port)) return;
    await sleep(400);
  }
  throw new Error(`cdp_endpoint_not_ready_after_${timeoutMs}ms`);
}

async function spawnCdpChrome(openUrl) {
  chromeProcess = spawn(config.chromePath, [
    `--remote-debugging-port=${config.cdpPort}`,
    `--user-data-dir=${config.cdpProfileDir}`,
    "--profile-directory=Default",
    "--no-first-run",
    "--no-default-browser-check",
    "--hide-crash-restore-bubble",
    openUrl,
  ], { stdio: "ignore", detached: true });
  chromeProcess.unref();
  chromeProcess.on("exit", () => { chromeProcess = null; });
  await waitForCdpEndpoint(config.cdpPort, 20_000);
}

async function launchContext({ openUrl = "about:blank" } = {}) {
  await mkdir(config.cdpProfileDir, { recursive: true });
  const attached = await cdpEndpointUp(config.cdpPort);
  if (!attached) await spawnCdpChrome(openUrl);
  cdpBrowser = await chromium.connectOverCDP(`http://127.0.0.1:${config.cdpPort}`);

  // A reused long-lived Chrome can lose its network stack after a sleep/wake
  // cycle or a network change and never recover — every navigation then times
  // out (observed 2026-06-15: the nightly attached to a days-old Chrome and 0
  // TikTok cards loaded). Only an *attached* instance is suspect; a fresh spawn
  // is known-good. Probe it, and if it can't reach the network kill it and
  // respawn (a fresh launch of the same profile stays logged in).
  if (attached && !(await isCdpChromeHealthy(cdpBrowser))) {
    process.stderr.write(`${JSON.stringify({ level: "warn", event: "cdp_chrome_respawned", reason: "stale_unhealthy", port: config.cdpPort })}\n`);
    await cdpBrowser.close().catch(() => undefined);
    await killChromeOnPort(config.cdpPort);
    await spawnCdpChrome(openUrl);
    cdpBrowser = await chromium.connectOverCDP(`http://127.0.0.1:${config.cdpPort}`);
  }
  return cdpBrowser.contexts()[0] ?? (await cdpBrowser.newContext());
}

export async function getTikTokBrowserContext(options = {}) {
  if (context) return context;
  if (!contextPromise) {
    contextPromise = launchContext(options)
      .then((ctx) => { context = ctx; return ctx; })
      .catch((error) => { contextPromise = null; throw error; });
  }
  return contextPromise;
}

export async function closeTikTokBrowser() {
  if (cdpBrowser) {
    await cdpBrowser.close().catch(() => undefined);
    cdpBrowser = null;
  }
  if (chromeProcess) {
    const proc = chromeProcess;
    try { proc.kill("SIGTERM"); } catch { /* already gone */ }
    await sleep(1500);
    try { if (!proc.killed) proc.kill("SIGKILL"); } catch { /* already gone */ }
    chromeProcess = null;
  }
  context = null;
  contextPromise = null;
}

export async function preflightTikTokBrowser() {
  const ctx = await getTikTokBrowserContext({ openUrl: "https://www.tiktok.com" });
  const page = await ctx.newPage();
  try {
    await page.bringToFront().catch(() => undefined);
    await page.goto("https://www.tiktok.com", { waitUntil: "domcontentloaded", timeout: config.navTimeoutMs });
    await sleep(1500);
    const state = await page.evaluate(() => {
      const hasText = (selectors) => {
        for (const selector of selectors) {
          const el = document.querySelector(selector);
          if (el && (el.textContent || "").trim()) return { selector, text: el.textContent.trim().slice(0, 120) };
        }
        return null;
      };
      const authWall = hasText([
        '[id*="login-modal" i]',
        '[class*="login-modal" i]',
        '[data-e2e*="login-modal"]',
        '[data-e2e="login-title"]',
      ]);
      const captcha = hasText([
        '[id*="captcha" i]',
        '[class*="captcha" i]',
        '[data-e2e*="captcha"]',
      ]);
      const loggedIn = Boolean(
        document.querySelector('[data-e2e="profile-icon"], [data-e2e="nav-profile"], a[href^="/@"] img'),
      );
      return { authWall, captcha, loggedIn };
    });
    return {
      mode: "cdp-attach",
      chrome_path: config.chromePath,
      cdp_port: config.cdpPort,
      cdp_profile_dir: config.cdpProfileDir,
      spawned_chrome: chromeProcess != null,
      logged_in: state.loggedIn || state.authWall || state.captcha ? state.loggedIn : null,
      auth_wall: state.authWall,
      captcha: state.captcha,
    };
  } finally {
    await page.close().catch(() => undefined);
  }
}

export function parseCount(text) {
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

export async function searchTikTok(ctx, q, { dumpHtml = true } = {}) {
  const page = await ctx.newPage();
  await page.bringToFront().catch(() => {});
  const url = `https://www.tiktok.com/search?q=${encodeURIComponent(q)}`;

  try {
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: config.navTimeoutMs });
    await page.bringToFront().catch(() => {});
    await sleep(config.resultsWaitMs);

    if (dumpHtml) {
      const html = await page.content();
      writeFileSync(`${config.dumpDir}/tiktok-poc-search.html`, html);
    }

    const wall = await page.evaluate(() => {
      const selectors = [
        '[id*="login-modal" i]', '[class*="login-modal" i]', '[data-e2e*="login-modal"]',
        '[id*="captcha" i]', '[class*="captcha" i]', '[data-e2e*="captcha"]',
      ];
      for (const selector of selectors) {
        const el = document.querySelector(selector);
        if (el && (el.textContent || "").trim()) {
          return { selector, text: el.textContent.trim().slice(0, 120) };
        }
      }
      return null;
    });

    const cards = await page.evaluate(() => {
      const out = [];
      const seenHrefs = new Set();
      for (const row of document.querySelectorAll('div[id^="grid-item-container-"]')) {
        const videoA = row.querySelector('a[href*="/video/"]');
        if (!videoA) continue;
        const href = videoA.href.split("?")[0];
        if (!/^https:\/\/www\.tiktok\.com\/@[^/]+\/video\/\d+/.test(href)) continue;
        if (seenHrefs.has(href)) continue;
        seenHrefs.add(href);
        const handleEl = row.querySelector('[data-e2e="search-card-user-unique-id"]');
        const captionEl = row.querySelector('[data-e2e="search-card-video-caption"]');
        const viewsEl = row.querySelector('[data-e2e="video-views"]');
        const userLinkA = row.querySelector('a[data-e2e="search-card-user-link"]');
        const img = row.querySelector("img[src], img[srcset]");
        out.push({
          href,
          handle: handleEl ? handleEl.textContent.trim() : null,
          caption: captionEl ? captionEl.textContent.trim().slice(0, 280) : null,
          views_text: viewsEl ? viewsEl.textContent.trim() : null,
          creator_url: userLinkA ? userLinkA.href : null,
          thumbnail_url: img ? (img.currentSrc || img.src || null) : null,
        });
      }
      return out;
    });
    cards.forEach((card) => { card.views_count = parseCount(card.views_text); });
    return { url, video_urls: cards.map((card) => card.href), cards, wall };
  } finally {
    await page.close().catch(() => {});
  }
}

export async function fetchVideoDetail(ctx, videoUrl, { dumpHtml = false } = {}) {
  const page = await ctx.newPage();
  await page.bringToFront().catch(() => {});

  try {
    await page.goto(videoUrl, { waitUntil: "domcontentloaded", timeout: config.navTimeoutMs });
    await page.bringToFront().catch(() => {});
    await sleep(config.detailWaitMs);

    if (dumpHtml) {
      writeFileSync(`${config.dumpDir}/tiktok-poc-detail.html`, await page.content());
    }

    const data = await page.evaluate(() => {
      const text = (selectors) => {
        for (const selector of selectors) {
          const el = document.querySelector(selector);
          if (el && (el.textContent || "").trim()) {
            return { value: el.textContent.trim(), hit: selector };
          }
        }
        return { value: null, hit: null };
      };
      const attr = (selectors, name) => {
        for (const selector of selectors) {
          const el = document.querySelector(selector);
          if (el && el.getAttribute(name)) return { value: el.getAttribute(name), hit: selector };
        }
        return { value: null, hit: null };
      };

      let item = null;
      const jsonScript = document.querySelector('script#__UNIVERSAL_DATA_FOR_REHYDRATION__');
      if (jsonScript?.textContent) {
        try {
          const blob = JSON.parse(jsonScript.textContent);
          item = blob?.__DEFAULT_SCOPE__?.["webapp.video-detail"]?.itemInfo?.itemStruct ?? null;
        } catch { /* ignore parse errors */ }
      }

      let durationSec = null;
      let durationSource = null;
      const duration = item?.video?.duration;
      if (typeof duration === "number" && Number.isFinite(duration)) {
        durationSec = duration;
        durationSource = "ssr_json";
      }
      if (durationSec == null) {
        const video = document.querySelector("video");
        if (video && Number.isFinite(video.duration) && video.duration > 0) {
          durationSec = video.duration;
          durationSource = "video_element";
        }
      }

      return {
        ssr: {
          desc: item?.desc ?? null,
          cover: item?.video?.cover ?? null,
          dynamicCover: item?.video?.dynamicCover ?? null,
          originCover: item?.video?.originCover ?? null,
          stats: item?.stats ?? null,
          author: item?.author ?? null,
        },
        like: text(['strong[data-e2e="like-count"]', '[data-e2e="like-count"]']),
        comment: text(['strong[data-e2e="comment-count"]', '[data-e2e="comment-count"]']),
        share: text(['strong[data-e2e="share-count"]', '[data-e2e="share-count"]']),
        favorite: text(['strong[data-e2e="favorite-count"]', '[data-e2e="favorite-count"]']),
        caption: text(['[data-e2e="video-desc"]', '[data-e2e="browse-video-desc"]']),
        avatar_href: attr(['a[data-e2e="video-author-avatar"]'], "href"),
        music: text(['a[data-e2e="video-music"]', '[data-e2e="video-music"]']),
        durationSec,
        durationSource,
      };
    });

    const flat = {};
    const hits = {};
    for (const [key, raw] of Object.entries(data)) {
      if (key === "durationSec" || key === "durationSource" || key === "ssr") continue;
      flat[`${key}_text`] = raw.value;
      hits[key] = raw.hit;
    }

    let creator_handle = data.ssr.author?.uniqueId ?? null;
    let creator_url = creator_handle ? `https://www.tiktok.com/@${creator_handle}` : null;
    if (!creator_handle && flat.avatar_href_text) {
      creator_url = flat.avatar_href_text.startsWith("http")
        ? flat.avatar_href_text
        : `https://www.tiktok.com${flat.avatar_href_text}`;
      const m = creator_url.match(/\/@([^/?#]+)/);
      if (m?.[1]) creator_handle = m[1];
    }

    const stats = data.ssr.stats ?? {};
    return {
      url: videoUrl,
      duration_seconds: data.durationSec != null ? Math.round(data.durationSec * 100) / 100 : null,
      duration_source: data.durationSource,
      like_count: Number.isFinite(stats.diggCount) ? stats.diggCount : parseCount(flat.like_text),
      comment_count: Number.isFinite(stats.commentCount) ? stats.commentCount : parseCount(flat.comment_text),
      share_count: Number.isFinite(stats.shareCount) ? stats.shareCount : parseCount(flat.share_text),
      favorite_count: Number.isFinite(stats.collectCount) ? stats.collectCount : parseCount(flat.favorite_text),
      caption: flat.caption_text ?? data.ssr.desc ?? null,
      creator_handle,
      creator_url,
      music: flat.music_text ? flat.music_text.trim() : null,
      thumbnail_url: data.ssr.cover ?? data.ssr.originCover ?? null,
      thumbnail_dynamic_url: data.ssr.dynamicCover ?? null,
      _raw_text: flat,
      _selector_hits: hits,
    };
  } finally {
    await page.close().catch(() => {});
  }
}

export async function fetchCreatorProfile(ctx, handle) {
  const cleanHandle = String(handle ?? "").replace(/^@/, "").trim();
  if (!cleanHandle) return null;
  const page = await ctx.newPage();
  await page.bringToFront().catch(() => {});
  const profileUrl = `https://www.tiktok.com/@${cleanHandle}`;

  try {
    await page.goto(profileUrl, { waitUntil: "domcontentloaded", timeout: config.navTimeoutMs });
    await page.bringToFront().catch(() => {});
    await sleep(config.detailWaitMs);

    if (!firstProfileDumped) {
      writeFileSync(`${config.dumpDir}/tiktok-poc-profile.html`, await page.content());
      firstProfileDumped = true;
    }

    const probe = await page.evaluate(() => {
      let jsonInfo = null;
      const jsonEl = document.querySelector('script#__UNIVERSAL_DATA_FOR_REHYDRATION__');
      if (jsonEl?.textContent) {
        try {
          const blob = JSON.parse(jsonEl.textContent);
          jsonInfo = blob?.__DEFAULT_SCOPE__?.["webapp.user-detail"]?.userInfo ?? null;
        } catch { /* swallow */ }
      }

      const text = (selectors) => {
        for (const selector of selectors) {
          const el = document.querySelector(selector);
          if (el && (el.textContent || "").trim()) return { value: el.textContent.trim(), hit: selector };
        }
        return { value: null, hit: null };
      };
      const dom = {
        bio: text(['[data-e2e="user-bio"]', 'h2[data-e2e="user-subtitle"]']),
        nickname: text(['[data-e2e="user-title"]', 'h1[data-e2e="user-title"]']),
        followers: text(['strong[data-e2e="followers-count"]', '[data-e2e="followers-count"]']),
        following: text(['strong[data-e2e="following-count"]', '[data-e2e="following-count"]']),
        likes: text(['strong[data-e2e="likes-count"]', '[data-e2e="likes-count"]']),
      };
      const verifiedEl = document.querySelector('[data-e2e="user-verified"], svg[aria-label*="erified"]');
      const bioLinkEl = document.querySelector('[data-e2e="user-link"] a, [data-e2e="user-bio-link"] a, a[data-e2e="user-link"]');
      return {
        jsonInfo,
        dom,
        verified: Boolean(verifiedEl),
        bioLink: bioLinkEl ? bioLinkEl.getAttribute("href") || bioLinkEl.href : null,
      };
    });

    const user = probe.jsonInfo?.user ?? {};
    const stats = probe.jsonInfo?.stats ?? {};
    return {
      url: profileUrl,
      handle: user.uniqueId ?? cleanHandle,
      nickname: user.nickname ?? probe.dom.nickname.value ?? null,
      bio: user.signature ?? probe.dom.bio.value ?? null,
      verified: user.verified ?? probe.verified ?? false,
      bio_link: user.bioLink?.link ?? probe.bioLink ?? null,
      avatar_url: user.avatarLarger ?? user.avatarMedium ?? user.avatarThumb ?? null,
      sec_uid: user.secUid ?? null,
      followers_count: Number.isFinite(stats.followerCount) ? stats.followerCount : parseCount(probe.dom.followers.value),
      following_count: Number.isFinite(stats.followingCount) ? stats.followingCount : parseCount(probe.dom.following.value),
      hearts_count: Number.isFinite(stats.heart) ? stats.heart : parseCount(probe.dom.likes.value),
      videos_count: Number.isFinite(stats.videoCount) ? stats.videoCount : null,
      _source: {
        json_available: Boolean(probe.jsonInfo),
        dom_hits: {
          bio: probe.dom.bio.hit,
          nickname: probe.dom.nickname.hit,
          followers: probe.dom.followers.hit,
          following: probe.dom.following.hit,
          likes: probe.dom.likes.hit,
        },
      },
    };
  } finally {
    await page.close().catch(() => {});
  }
}
