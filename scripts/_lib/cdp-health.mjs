import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { setTimeout as sleep } from "node:timers/promises";

const execFileP = promisify(execFile);

// A neutral connectivity probe. Overridable so a locked-down environment can
// point it at an always-reachable internal URL.
const HEALTHCHECK_URL =
  process.env.COLLECT_BROWSER_HEALTHCHECK_URL ?? "https://example.com";

async function portListening(port) {
  try {
    const res = await fetch(`http://127.0.0.1:${port}/json/version`);
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Probe a connected CDP Chrome for basic network reachability.
 *
 * Why this exists (2026-06-15): a long-lived CDP Chrome that the collector
 * reuses across nightly runs can lose its network stack after a sleep/wake
 * cycle or a network change and never recover — every navigation then times
 * out, so TikTok searches return 0 cards and YouTube transcripts can fail,
 * while a *freshly launched* Chrome with the very same profile loads pages
 * fine. Callers use this to decide whether to kill the stale instance and
 * respawn. Returns true only if a real page loads within `timeoutMs`.
 */
export async function isCdpChromeHealthy(browser, { timeoutMs = 15_000 } = {}) {
  let page;
  try {
    const ctx = browser.contexts()[0] ?? (await browser.newContext());
    page = await ctx.newPage();
    const res = await page.goto(HEALTHCHECK_URL, {
      waitUntil: "domcontentloaded",
      timeout: timeoutMs,
    });
    return Boolean(res && res.ok());
  } catch {
    return false;
  } finally {
    await page?.close().catch(() => undefined);
  }
}

/**
 * Surgically kill the Chrome bound to the CDP debug port. The `--remote-
 * debugging-port=<port>` flag is unique to the collector's Chrome — the user's
 * other Chrome/Arc windows don't carry it, and neither does the node process —
 * so pkill -f on it can't touch anything else. Waits for the port to free up.
 */
export async function killChromeOnPort(port) {
  try {
    await execFileP("pkill", ["-f", `remote-debugging-port=${port}`]);
  } catch {
    // pkill exit 1 = no matching process; nothing to kill.
  }
  for (let i = 0; i < 20; i += 1) {
    if (!(await portListening(port))) return;
    await sleep(300);
  }
}
