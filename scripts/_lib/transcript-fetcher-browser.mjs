import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
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
//   we emulate focus via CDP (Emulation.setFocusEmulationEnabled, M53) so the page
//   reports focused WITHOUT raising the window/stealing OS focus. get_transcript 200s and
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
  // How long to poll for the "Show transcript" control before concluding the
  // video genuinely has none. Long enough to survive a slow mount, short enough
  // that a caption-less video costs seconds instead of ~18s of fixed waits.
  transcriptControlTimeoutMs: Number(process.env.COLLECT_BROWSER_CONTROL_TIMEOUT_MS ?? 4_000),
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
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (trimmed.startsWith("WEBVTT")) continue;
    if (trimmed.startsWith("Kind:") || trimmed.startsWith("Language:")) continue;
    if (/^\d{2}:\d{2}/.test(trimmed) || trimmed.includes("-->")) continue;
    if (trimmed.startsWith("NOTE")) continue;
    const stripped = decodeHtmlEntities(trimmed.replace(/<[^>]+>/g, "")).replace(/\s+/g, " ").trim();
    appendCaptionLine(out, stripped);
  }
  return out.join(" ").replace(/\s+/g, " ").trim();
}

function appendCaptionLine(out, line) {
  const current = line.replace(/\s+/g, " ").trim();
  if (!current) return;
  const previous = out.at(-1);
  if (!previous) {
    out.push(current);
    return;
  }
  if (current === previous) return;
  if (current.startsWith(previous)) {
    out[out.length - 1] = current;
    return;
  }

  const overlap = overlappingCaptionText(previous, current);
  if (overlap) out[out.length - 1] = overlap;
  else out.push(current);
}

function overlappingCaptionText(previous, current) {
  const max = Math.min(previous.length, current.length);
  for (let length = max; length >= 12; length -= 1) {
    const previousSuffix = previous.slice(previous.length - length).toLowerCase();
    const currentPrefix = current.slice(0, length).toLowerCase();
    if (previousSuffix === currentPrefix) {
      return `${previous}${current.slice(length)}`;
    }
  }
  return null;
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

// Make the page report focused/active (document.hasFocus() === true) so YouTube's
// get_transcript serves us — WITHOUT page.bringToFront() raising the Chrome window
// and stealing macOS focus. Set once per page; persists for the page lifetime. (M53)
async function enableFocusEmulation(page) {
  try {
    const cdp = await page.context().newCDPSession(page);
    await cdp.send("Emulation.setFocusEmulationEnabled", { enabled: true });
  } catch {
    await page.bringToFront().catch(() => undefined); // fallback if focus emulation is unavailable
  }
}

export async function preflightTranscriptBrowser() {
  const ctx = await getTranscriptBrowserContext();
  const page = await ctx.newPage();
  await enableFocusEmulation(page);
  let loggedIn = null;
  let navOk = false;
  let lastError = null;
  // Retry the YouTube nav with escalating timeouts. A cold-start / slow-network
  // morning can push the load just past a single 25s timeout (observed 2026-06-24:
  // the run died here while an interactive run took ~50s and barely passed), so
  // one shot is too brittle. Escalating timeouts + short waits absorb that without
  // hanging indefinitely.
  const navTimeouts = [
    config.navTimeoutMs,
    config.navTimeoutMs + 20_000,
    config.navTimeoutMs + 35_000,
  ];
  try {
    for (let i = 0; i < navTimeouts.length; i += 1) {
      try {
        await page.goto("https://www.youtube.com", { waitUntil: "domcontentloaded", timeout: navTimeouts[i] });
        navOk = true;
        break;
      } catch (error) {
        lastError = error;
        if (i < navTimeouts.length - 1) await sleep(5_000);
      }
    }
    if (!navOk) throw lastError ?? new Error("youtube_nav_failed");
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
  //
  // EARLY BAIL. A video with no captions has no "Show transcript" button and no
  // Transcript tab, but the old code still walked the whole happy path: 2.5s +
  // 1.5s of fixed waits and then a 12s wait for segments that can never render —
  // ~18s of pure waiting per caption-less video. Measured on the 2026-08-11 run:
  // 212 caption-less fetches at a 41.8s median = 147 min, i.e. 2.5 of the 6-hour
  // budget spent learning "there is nothing here".
  //
  // We poll briefly rather than bailing instantly: on a slow page load the button
  // may not have mounted yet, and a false "no captions" would silently discard a
  // good video — far worse than being slow. Only a CONFIRMED absence after the
  // poll window bails.
  const controlDeadline = Date.now() + config.transcriptControlTimeoutMs;
  let hasControl = false;
  while (Date.now() < controlDeadline) {
    hasControl = await page.evaluate(() => {
      const btn = [...document.querySelectorAll(".ytd-watch-metadata button, ytd-watch-metadata button")]
        .find((b) => /show transcript/i.test(b.textContent || ""));
      if (btn) return true;
      return Boolean(document.querySelector('[aria-label="Transcript"][role="tab"]'));
    }).catch(() => false);
    if (hasControl) break;
    await page.waitForTimeout(500);
  }
  if (!hasControl) return { text: "", absent: true };

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

  // 4) Wait for segments to render. Reaching here means the control DID exist, so
  //    a failure now is ambiguous (slow render, A/B layout, transient) — NOT a
  //    confirmed absence, and must not be cached as one.
  try {
    await seg.first().waitFor({ state: "visible", timeout: config.transcriptTimeoutMs });
  } catch {
    return { text: "", absent: false };
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
  return { text: text.replace(/\s+/g, " ").trim(), absent: false };
}

async function fetchTranscriptBrowserOnce(videoId, { waitUntil }) {
  const ctx = await getTranscriptBrowserContext();
  const page = await ctx.newPage();
  await enableFocusEmulation(page); // focus emulation instead of bringToFront so we don't steal the window (M53)
  const watchUrl = `https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}`;
  try {
    await page.goto(watchUrl, { waitUntil, timeout: config.navTimeoutMs });
    await page.waitForSelector("ytd-watch-metadata", { timeout: 15_000 }).catch(() => undefined);
    await acceptConsentIfPresent(page);
    const { text, absent } = await scrapeTranscriptElementClick(page);
    return { text: text || null, absent };
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

// ---------------------------------------------------------------------------
// Caption-less memo
//
// A video with no captions never becomes a link (the collector drops it with
// candidate_skipped_no_transcript), so it leaves no known_url record — which
// means the SAME caption-less videos are rediscovered and re-probed every single
// night, at full price. This memo makes night 1 pay and every night after skip
// them before even navigating.
//
// Only CONFIRMED absences are recorded (no "Show transcript" control after the
// poll window). Ambiguous outcomes — nav timeouts, crashes, controls that exist
// but never render segments — are deliberately not cached, because wrongly
// memoising a captioned video would silently discard good content forever.
// Entries expire so that captions added later are eventually picked up.
// ---------------------------------------------------------------------------
const CAPTIONLESS_PATH = process.env.COLLECT_CAPTIONLESS_CACHE
  ?? join(process.env.COLLECT_CACHE_DIR ?? ".collection/cache", "captionless-videos.json");
const CAPTIONLESS_TTL_DAYS = Number(process.env.COLLECT_CAPTIONLESS_TTL_DAYS ?? 60);
let captionless = null;

async function loadCaptionless() {
  if (captionless) return captionless;
  captionless = new Map();
  try {
    const raw = JSON.parse(await readFile(CAPTIONLESS_PATH, "utf8"));
    const cutoff = Date.now() - CAPTIONLESS_TTL_DAYS * 86_400_000;
    for (const [videoId, seenAt] of Object.entries(raw?.videos ?? {})) {
      if (Date.parse(seenAt) > cutoff) captionless.set(videoId, seenAt);
    }
  } catch { /* absent or unreadable — start empty, this cache is disposable */ }
  return captionless;
}

async function rememberCaptionless(videoId) {
  const map = await loadCaptionless();
  if (map.has(videoId)) return;
  map.set(videoId, new Date().toISOString());
  try {
    await mkdir(dirname(CAPTIONLESS_PATH), { recursive: true });
    await writeFile(CAPTIONLESS_PATH, JSON.stringify({ videos: Object.fromEntries(map) }), "utf8");
  } catch { /* best-effort: losing the memo costs time, never correctness */ }
}

export async function fetchTranscriptBrowser(videoId) {
  // Known caption-less → skip without opening a page at all.
  if ((await loadCaptionless()).has(videoId)) return null;

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
      const { text, absent } = await fetchTranscriptBrowserOnce(videoId, attempt);
      if (text) return text;
      // Confirmed absent: do NOT spend the second, slower attempt on a video we
      // just proved has no transcript control. This is where most of the saving
      // comes from — the old code paid for both passes.
      if (absent) {
        await rememberCaptionless(videoId);
        return null;
      }
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
