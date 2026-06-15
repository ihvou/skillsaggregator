import { mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";
import { chromium } from "playwright";
import { isCdpChromeHealthy, killChromeOnPort } from "./cdp-health.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");

// Transcript fetcher — CDP-attached real Chrome + native el.click().
//
// Why this shape (verified empirically 2026-06-06):
//   YouTube's /youtubei/v1/get_transcript rejects CDP-synthesized mouse input
//   (Playwright .click() / Input.dispatchMouseEvent) with HTTP 400
//   "failedPrecondition" — BotGuard fingerprints the injected input. The fix is
//   to click via native element.click() executed in the page's MAIN world
//   (exactly what the webscraper.io content script does), while ATTACHED to a
//   normally-launched Chrome over CDP (NOT chromium.launch* — those add
//   automation that taints the click). A focused/visible tab is also required;
//   page.bringToFront() supplies that. With this, get_transcript returns 200 and
//   the panel renders. Hands-off batch: 9/9 vs 0/9 for every Playwright-click
//   variant. The debug port also requires a NON-default --user-data-dir
//   (Chrome 136+ blocks it on the default profile dir).
const config = {
  chromePath: process.env.COLLECT_BROWSER_CHROME_PATH
    ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  cdpPort: Number(process.env.COLLECT_BROWSER_CDP_PORT ?? 9222),
  // Dedicated, logged-in Chrome profile (non-default dir). Sign into YouTube here
  // once; the session persists across runs. See docs/collection-tuning.md.
  cdpProfileDir: process.env.COLLECT_BROWSER_CDP_PROFILE_DIR
    ?? resolve(root, ".collection", "cdp-chrome-profile"),
  navTimeoutMs: Number(process.env.COLLECT_BROWSER_NAV_TIMEOUT_MS ?? 25_000),
  transcriptTimeoutMs: Number(process.env.COLLECT_BROWSER_TRANSCRIPT_TIMEOUT_MS ?? 12_000),
};

// ---------------------------------------------------------------------------
// Text-parsing helpers (exported; kept for callers/tests).
// ---------------------------------------------------------------------------
function decodeHtmlEntities(value) {
  return String(value ?? "")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, " ");
}

export function vttToText(vtt) {
  const lines = String(vtt ?? "").split("\n");
  const out = [];
  let prevText = "";
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (trimmed.startsWith("WEBVTT")) continue;
    if (trimmed.startsWith("Kind:") || trimmed.startsWith("Language:")) continue;
    if (/^\d{2}:\d{2}/.test(trimmed) || trimmed.includes("-->")) continue;
    if (trimmed.startsWith("NOTE")) continue;
    const stripped = decodeHtmlEntities(trimmed.replace(/<[^>]+>/g, "")).replace(/\s+/g, " ").trim();
    if (stripped && stripped !== prevText) {
      out.push(stripped);
      prevText = stripped;
    }
  }
  return out.join(" ").replace(/\s+/g, " ").trim();
}

function json3ToText(payload) {
  const parsed = JSON.parse(payload);
  const out = [];
  for (const event of parsed.events ?? []) {
    const text = (event.segs ?? [])
      .map((segment) => segment.utf8 ?? "")
      .join("")
      .replace(/\s+/g, " ")
      .trim();
    if (text) out.push(text);
  }
  return out.join(" ").replace(/\s+/g, " ").trim();
}

function xmlTimedTextToText(payload) {
  return decodeHtmlEntities(
    [...String(payload ?? "").matchAll(/<text\b[^>]*>([\s\S]*?)<\/text>/g)]
      .map((match) => match[1].replace(/<[^>]+>/g, " "))
      .join(" "),
  ).replace(/\s+/g, " ").trim();
}

export function timedTextPayloadToText(payload, contentType = "") {
  const trimmed = String(payload ?? "").trim();
  if (!trimmed) return "";
  if (trimmed.startsWith("WEBVTT")) return vttToText(trimmed);
  if (trimmed.startsWith("{") || contentType.includes("json")) {
    try {
      return json3ToText(trimmed);
    } catch (_error) {
      return "";
    }
  }
  if (trimmed.includes("<text")) return xmlTimedTextToText(trimmed);
  return vttToText(trimmed) || decodeHtmlEntities(trimmed.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
}

// ---------------------------------------------------------------------------
// Chrome lifecycle — attach to a normally-launched Chrome over CDP.
// ---------------------------------------------------------------------------
let chromeProcess = null; // only set when WE spawned Chrome (so we own teardown)
let cdpBrowser = null;
let context = null;
let contextPromise = null;

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

async function spawnCdpChrome() {
  chromeProcess = spawn(config.chromePath, [
    `--remote-debugging-port=${config.cdpPort}`,
    `--user-data-dir=${config.cdpProfileDir}`,
    "--profile-directory=Default",
    "--no-first-run",
    "--no-default-browser-check",
    "--hide-crash-restore-bubble",
    "about:blank",
  ], { stdio: "ignore", detached: false });
  chromeProcess.on("exit", () => { chromeProcess = null; });
  await waitForCdpEndpoint(config.cdpPort, 20_000);
}

async function launchContext() {
  await mkdir(config.cdpProfileDir, { recursive: true });
  // Reuse an already-running debug Chrome (e.g. a manually-launched logged-in
  // session, or a leftover from a prior run) instead of spawning a duplicate.
  const attached = await cdpEndpointUp(config.cdpPort);
  if (!attached) await spawnCdpChrome();
  cdpBrowser = await chromium.connectOverCDP(`http://127.0.0.1:${config.cdpPort}`);

  // A reused long-lived Chrome can lose its network stack after a sleep/wake
  // cycle or a network change and never recover — every navigation then times
  // out (observed 2026-06-15: the nightly attached to a days-old Chrome and 0
  // pages loaded). Only an *attached* instance is suspect; a fresh spawn is
  // known-good. Probe it, and if it can't reach the network kill it and respawn
  // (a fresh launch of the same profile stays logged in).
  if (attached && !(await isCdpChromeHealthy(cdpBrowser))) {
    process.stderr.write(`${JSON.stringify({ level: "warn", event: "cdp_chrome_respawned", reason: "stale_unhealthy", port: config.cdpPort })}\n`);
    await cdpBrowser.close().catch(() => undefined);
    await killChromeOnPort(config.cdpPort);
    await spawnCdpChrome();
    cdpBrowser = await chromium.connectOverCDP(`http://127.0.0.1:${config.cdpPort}`);
  }
  return cdpBrowser.contexts()[0] ?? (await cdpBrowser.newContext());
}

export async function getTranscriptBrowserContext() {
  if (context) return context;
  if (!contextPromise) {
    contextPromise = launchContext()
      .then((ctx) => { context = ctx; return ctx; })
      .catch((error) => { contextPromise = null; throw error; });
  }
  return contextPromise;
}

export async function closeTranscriptBrowser() {
  if (cdpBrowser) {
    await cdpBrowser.close().catch(() => undefined); // disconnects CDP; does NOT kill Chrome
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

export async function preflightTranscriptBrowser() {
  const ctx = await getTranscriptBrowserContext();
  const page = await ctx.newPage();
  let loggedIn = null;
  try {
    await page.bringToFront().catch(() => undefined);
    await page.goto("https://www.youtube.com", { waitUntil: "domcontentloaded", timeout: config.navTimeoutMs });
    loggedIn = await page.evaluate(() => {
      try { return !!(window.ytcfg && (window.ytcfg.get ? window.ytcfg.get("LOGGED_IN") : window.ytcfg.data_ && window.ytcfg.data_.LOGGED_IN)); } catch { return null; }
    }).catch(() => null);
  } finally {
    await page.close().catch(() => undefined);
  }
  return {
    mode: "cdp-attach",
    chrome_path: config.chromePath,
    cdp_port: config.cdpPort,
    cdp_profile_dir: config.cdpProfileDir,
    spawned_chrome: chromeProcess != null,
    logged_in: loggedIn,
  };
}

// ---------------------------------------------------------------------------
// Transcript scrape — native el.click() in the page MAIN world (no CDP input).
// ---------------------------------------------------------------------------
async function acceptConsentIfPresent(page) {
  await page.evaluate(() => {
    const labels = ["accept all", "i agree", "accept"];
    const candidates = [...document.querySelectorAll("button, tp-yt-paper-button, yt-button-shape, a")];
    for (const el of candidates) {
      const t = (el.textContent || "").trim().toLowerCase();
      if (labels.includes(t)) { el.click(); return; }
    }
  }).catch(() => undefined);
}

async function scrapeTranscriptElementClick(page) {
  // 1) Expand the description ("More") so "Show transcript" mounts.
  await page.evaluate(() => {
    const m = document.querySelector(".ytd-watch-metadata tp-yt-paper-button#expand")
      || document.querySelector("tp-yt-paper-button#expand")
      || document.querySelector("#description-inline-expander #expand");
    if (m) m.click();
  }).catch(() => undefined);
  await page.waitForTimeout(2000);

  // 2) "Show transcript" — native click on the button (or its ripple child,
  //    matching the webscraper selector). This opens ONE transcript panel.
  await page.evaluate(() => {
    const btn = [...document.querySelectorAll(".ytd-watch-metadata button, ytd-watch-metadata button")]
      .find((b) => /show transcript/i.test(b.textContent || ""));
    const target = btn ? (btn.querySelector("div.ytSpecTouchFeedbackShapeFill") || btn) : null;
    if (target) target.click();
  }).catch(() => undefined);
  await page.waitForTimeout(2500);

  // NB: match only the leaf segment (modern view-model OR legacy div.segment) —
  // NOT the outer ytd-transcript-segment-renderer wrapper, which would double
  // every segment (the wrapper + its inner div.segment both match).
  const segSelector = "transcript-segment-view-model, div.segment";
  const seg = page.locator(segSelector);

  // 3) Only if no segments rendered, switch the open panel to its Transcript tab
  //    (some videos default the panel to "In this video"). Doing this ONLY when
  //    needed avoids opening a second, duplicate panel.
  if ((await seg.count().catch(() => 0)) === 0) {
    await page.evaluate(() => {
      const tab = document.querySelector('[aria-label="Transcript"][role="tab"]');
      if (tab) tab.click();
    }).catch(() => undefined);
    await page.waitForTimeout(1500);
  }

  // 4) Wait for segments to render.
  try {
    await seg.first().waitFor({ state: "visible", timeout: config.transcriptTimeoutMs });
  } catch {
    return "";
  }
  await page.waitForTimeout(600);

  // 5) Read ONCE — scope to the first transcript list so a stray second panel
  //    can never duplicate the text; strip each segment's timestamp child.
  const text = await page.evaluate(() => {
    const list = document.querySelector("ytd-transcript-segment-list-renderer");
    const root = list || document;
    const nodes = [...root.querySelectorAll("transcript-segment-view-model, div.segment")];
    return nodes
      .map((node) => {
        const ts = node.querySelector(".ytwTranscriptSegmentViewModelTimestamp, .segment-timestamp");
        const segText = ts ? (node.textContent || "").replace(ts.textContent || "", "") : (node.textContent || "");
        return segText.replace(/\s+/g, " ").trim();
      })
      .filter(Boolean)
      .join(" ");
  }).catch(() => "");
  return text.replace(/\s+/g, " ").trim();
}

async function fetchTranscriptBrowserOnce(videoId, { waitUntil }) {
  const ctx = await getTranscriptBrowserContext();
  const page = await ctx.newPage();
  const watchUrl = `https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}`;
  try {
    await page.bringToFront().catch(() => undefined); // get_transcript only serves the focused/visible tab
    await page.goto(watchUrl, { waitUntil, timeout: config.navTimeoutMs });
    await page.bringToFront().catch(() => undefined);
    await page.waitForSelector("ytd-watch-metadata", { timeout: 15_000 }).catch(() => undefined);
    await acceptConsentIfPresent(page);
    const panelText = await scrapeTranscriptElementClick(page);
    return panelText || null;
  } finally {
    await page.close().catch(() => undefined);
  }
}

function isBrowserCrash(error) {
  const message = String(error?.message ?? error).toLowerCase();
  return message.includes("browser has been closed")
    || message.includes("target page, context or browser has been closed")
    || message.includes("browser closed")
    || message.includes("websocket")
    || message.includes("crash");
}

export async function fetchTranscriptBrowser(videoId) {
  // Two attempts: domcontentloaded (fast), then networkidle for slow layouts.
  // The "execution context was destroyed" race (YouTube SPA soft-nav) is retried
  // by the second attempt. CDP disconnects/crashes relaunch once.
  const attempts = [
    { waitUntil: "domcontentloaded", relaunchOnCrash: true },
    { waitUntil: "networkidle", relaunchOnCrash: false },
  ];
  let lastError = null;
  for (const attempt of attempts) {
    try {
      const result = await fetchTranscriptBrowserOnce(videoId, attempt);
      if (result) return result;
    } catch (error) {
      lastError = error;
      if (isBrowserCrash(error) && attempt.relaunchOnCrash) {
        await closeTranscriptBrowser().catch(() => undefined);
        continue;
      }
      // Non-crash (nav timeout, context destroyed) → fall through to next attempt.
    }
  }
  if (lastError) throw lastError;
  return null;
}
