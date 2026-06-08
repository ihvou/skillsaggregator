#!/usr/bin/env node
// webscraper-style native el.click() in the page main world, + focus diagnostics.
import { chromium } from "playwright";

const videoIds = process.argv.slice(2);
if (!videoIds.length) videoIds.push("F6_AzU4NVn4");

async function runOne(ctx, videoId) {
  const page = await ctx.newPage();
  await page.bringToFront().catch(() => {});
  const net = [];
  page.on("response", async (r) => {
    const u = r.url();
    if (!/get_transcript|timedtext/.test(u)) return;
    const e = { ep: u.includes("get_transcript") ? "get_transcript" : "timedtext", status: r.status() };
    try { const b = await r.text(); e.bytes = b.length; } catch {}
    net.push(e);
  });
  try {
    await page.goto(`https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}`, { waitUntil: "domcontentloaded", timeout: 25000 });
    await page.bringToFront().catch(() => {});
    await page.waitForSelector("ytd-watch-metadata", { timeout: 15000 }).catch(() => {});
    await page.waitForTimeout(2500);
    const focus = await page.evaluate(() => ({ vis: document.visibilityState, hasFocus: document.hasFocus() })).catch(() => null);
    const clicks = await page.evaluate(async () => {
      const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
      const out = {};
      const more = document.querySelector(".ytd-watch-metadata tp-yt-paper-button#expand");
      out.more = !!more; if (more) more.click();
      await sleep(2000);
      const btns = [...document.querySelectorAll(".ytd-watch-metadata button")];
      const sb = btns.find((b) => /show transcript/i.test(b.textContent || ""));
      const target = sb ? (sb.querySelector("div.ytSpecTouchFeedbackShapeFill") || sb) : null;
      out.show = !!target; if (target) target.click();
      await sleep(2000);
      const tab = document.querySelector('[aria-label="Transcript"][role="tab"]');
      out.tab = !!tab; if (tab) tab.click();
      return out;
    });
    await page.waitForTimeout(3500);
    const panels = await page.locator("ytd-engagement-panel-section-list-renderer[visibility='ENGAGEMENT_PANEL_VISIBILITY_EXPANDED']").count().catch(() => -1);
    const seg = page.locator("transcript-segment-view-model, div.segment");
    let segCount = 0;
    try { await seg.first().waitFor({ state: "visible", timeout: 9000 }); segCount = await seg.count(); } catch { segCount = await seg.count().catch(() => 0); }
    const gt = net.filter((n) => n.ep === "get_transcript").map((n) => n.status);
    return { videoId, focus, clicks, panels, segCount, get_transcript: gt.length ? gt.join(",") : "(none)", ok: segCount > 0 };
  } catch (err) {
    return { videoId, error: String(err?.message ?? err), ok: false };
  } finally {
    await page.close().catch(() => {});
  }
}

const browser = await chromium.connectOverCDP("http://localhost:9222");
const results = [];
try {
  const ctx = browser.contexts()[0];
  for (const id of videoIds) {
    const r = await runOne(ctx, id);
    results.push(r);
    console.log(`${r.ok ? "✅" : "❌"} ${id}  focus=${JSON.stringify(r.focus)}  clicks=${JSON.stringify(r.clicks ?? r.error)}  panels=${r.panels}  seg=${r.segCount ?? 0}  gt=${r.get_transcript ?? ""}`);
    await new Promise((res) => setTimeout(res, 2500));
  }
} finally {
  await browser.close().catch(() => {});
}
console.log(`\n=== ${results.filter((r) => r.ok).length}/${results.length} ===`);
