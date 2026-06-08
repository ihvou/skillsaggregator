#!/usr/bin/env node
// Live diagnostic for the browser transcript fetcher.
// Runs the SAME persistent context + cookies the nightly uses (headed),
// opens a failed video, clicks through to the transcript panel, and logs
// what /youtubei/v1/get_transcript actually returns (status + snippet) plus
// whether segments render in the DOM. Captures a screenshot.
process.env.COLLECT_BROWSER_HEADLESS = process.env.COLLECT_BROWSER_HEADLESS ?? "0";
if (process.env.DIAG_NO_COOKIES === "1") {
  // Logged-out: no cookie seeding + a FRESH profile dir (the persistent profile
  // retains a stored YouTube session, so we must use a clean one to be anonymous).
  process.env.COLLECT_BROWSER_COOKIES_FILE = "";
  process.env.COLLECT_BROWSER_PROFILE_DIR = process.env.COLLECT_BROWSER_PROFILE_DIR || "/tmp/diag-fresh-profile";
} else {
  process.env.COLLECT_BROWSER_COOKIES_FILE =
    process.env.COLLECT_BROWSER_COOKIES_FILE ||
    process.env.COLLECT_YTDLP_COOKIES_FILE ||
    new URL("../.collection/youtube-cookies.txt", import.meta.url).pathname;
}
const cookieMode = process.env.DIAG_NO_COOKIES === "1" ? "logged-out" : "logged-in";

const mod = await import("./_lib/transcript-fetcher-browser.mjs");

const videoId = process.argv[2] || "lUNkEHw_kXE";
const net = [];
let ctx;
try {
  ctx = await mod.getTranscriptBrowserContext();
  const page = await ctx.newPage();

  page.on("response", async (r) => {
    const u = r.url();
    if (!/get_transcript|timedtext/.test(u)) return;
    const entry = { ep: u.includes("get_transcript") ? "get_transcript" : "timedtext", status: r.status() };
    try {
      const body = await r.text();
      entry.len = body.length;
      if (r.status() >= 400 || body.length < 400) entry.snippet = body.slice(0, 220).replace(/\s+/g, " ");
      else entry.snippet = "(ok, " + body.length + " bytes)";
    } catch { entry.snippet = "(body unavailable)"; }
    net.push(entry);
  });

  const watchUrl = `https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}`;
  await page.goto(watchUrl, { waitUntil: "domcontentloaded", timeout: 25000 });
  const visBefore = await page.evaluate(() => document.visibilityState).catch(() => "?");
  await page.bringToFront().catch(() => {});
  const visibility = { before: visBefore, after: await page.evaluate(() => ({ state: document.visibilityState, hasFocus: document.hasFocus() })).catch(() => null) };

  // consent
  for (const label of ["Accept all", "I agree", "Accept"]) {
    try { const b = page.getByRole("button", { name: label }).first(); if (await b.isVisible({ timeout: 1200 })) { await b.click({ timeout: 2500 }); break; } } catch {}
  }
  // engagement (startPlayback) — force real playback and VERIFY currentTime advances
  try { const p = page.locator(".html5-video-player, video").first(); if (await p.isVisible({ timeout: 3000 })) await p.click({ timeout: 2000 }); } catch {}
  await page.evaluate(() => { const v = document.querySelector("video"); if (v) { v.muted = true; v.play().catch(() => {}); } }).catch(() => {});
  try { const pb = page.locator(".ytp-large-play-button, button.ytp-play-button").first(); if (await pb.isVisible({ timeout: 1500 })) await pb.click({ timeout: 2000 }); } catch {}
  let playedSeconds = 0;
  for (let i = 0; i < 12; i++) {
    playedSeconds = await page.evaluate(() => { const v = document.querySelector("video"); return v ? v.currentTime : 0; }).catch(() => 0);
    if (playedSeconds > 1.5) break;
    await page.waitForTimeout(1000);
  }

  // scroll + expand description
  await page.evaluate(() => { const t = document.querySelector("#description, ytd-watch-metadata, #below"); if (t) t.scrollIntoView({ block: "center", behavior: "instant" }); }).catch(() => {});
  await page.waitForTimeout(1500);
  const click = async (loc, t = 3000) => { try { if (await loc.isVisible({ timeout: t })) { await loc.click({ timeout: t }); return true; } } catch {} return false; };
  let expanded = false;
  for (const e of [page.locator("tp-yt-paper-button#expand").first(), page.getByRole("button", { name: /^more$/i }).first()]) { if (await click(e)) { expanded = true; break; } }
  await page.waitForTimeout(1500);
  let clickedShow = false;
  for (const b of [page.getByRole("button", { name: /show transcript/i }).first(), page.getByText(/show transcript/i).first()]) { if (await click(b)) { clickedShow = true; break; } }
  await page.waitForTimeout(1500);
  let clickedTab = false;
  for (const tb of [page.locator('[aria-label="Transcript"][role="tab"]').first(), page.getByRole("tab", { name: /^transcript$/i }).first()]) { if (await click(tb, 4000)) { clickedTab = true; break; } }

  const seg = page.locator("transcript-segment-view-model, div.segment");
  let segCount = 0;
  try { await seg.first().waitFor({ state: "visible", timeout: 10000 }); segCount = await seg.count(); } catch {}

  await page.screenshot({ path: "/tmp/transcript-debug.png" }).catch(() => {});
  console.log(JSON.stringify({ videoId, cookieMode, visibility, playedSeconds, expanded, clickedShow, clickedTab, segCount, net }, null, 2));
} catch (err) {
  console.log(JSON.stringify({ videoId, error: String(err?.message ?? err), net }, null, 2));
} finally {
  await mod.closeTranscriptBrowser().catch(() => {});
}
