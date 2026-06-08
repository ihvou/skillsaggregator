# Collection tuning reference

`apps/web/.env.local` and `supabase/.env` are gitignored, so the actual values being run against don't live in version control. This doc tracks **what's currently configured, why, and the next lever to pull** if things break.

Last updated: 2026-05-25 after R31 yt-dlp impersonation tuning for subtitle 429s.

## Current settings (apps/web/.env.local)

### Agent rate-limit tuning (added 2026-05-21 after the YouTube 429 incident)

```bash
YTDLP_SLEEP_REQUESTS=10            # default 3 — between channel-listing yt-dlp calls
YTDLP_SLEEP_SUBTITLES=25           # default 5  — between subtitle downloads (per yt-dlp internal)
COLLECT_SEARCH_RESULTS_PER_CHANNEL=12  # default 25 — fewer results per channel-search call
COLLECT_CANDIDATES_TO_SCORE=15     # default 30 — fewer transcript fetches per skill
```

Why: R25 grew the YouTube channel pool from 17 → 54 channels. Per-skill yt-dlp call volume tripled, and on 5/21 the 03:00 run hit `HTTP 429` 17 of 20 transcript fetches, aborting after 33 minutes with 0 content collected.

The cap order matters most:
1. Lowering `COLLECT_CANDIDATES_TO_SCORE` halves the **number of subtitle fetches** per skill — the throttled endpoint.
2. Bumping `YTDLP_SLEEP_SUBTITLES` doubles the **spacing** between them.
3. Lowering `COLLECT_SEARCH_RESULTS_PER_CHANNEL` cuts each search-page payload (less work, less throttle risk).
4. Bumping `YTDLP_SLEEP_REQUESTS` spaces channel-search calls (a softer endpoint).

### Authenticated YouTube via exported cookies file (added 2026-05-22, **preferred**)

```bash
COLLECT_YTDLP_COOKIES_FILE=/path/to/youtube-cookies.txt
```

Reads a Netscape-format cookies.txt exported from your browser. Reliable across any browser, bypasses the macOS Keychain entirely, gives yt-dlp the actual YouTube auth tokens. The agent gracefully falls back to anonymous if the path doesn't exist (logs `ytdlp_cookies_file_missing` warning).

**How to export (one-time setup, ~2 min)**:
1. Install "[Get cookies.txt LOCALLY](https://chromewebstore.google.com/detail/get-cookiestxt-locally/cclelndahbckbenkjhflpdbgdldlbecc)" extension in your browser
2. Visit `https://www.youtube.com` while signed in
3. Click the extension icon → "Export As" → "Netscape"
4. Save to the path configured in `COLLECT_YTDLP_COOKIES_FILE`

**Refresh cadence**: roughly monthly, or whenever the agent logs start showing `HTTP Error 401` on YouTube requests (means cookies expired). Re-export and overwrite the file.

### yt-dlp impersonation for subtitle downloads (added 2026-05-25, R31)

```bash
/opt/homebrew/Cellar/yt-dlp/2026.3.17_1/libexec/bin/python -m pip install "curl-cffi==0.13.0"
/opt/homebrew/bin/yt-dlp --list-impersonate-targets
```

Why: YouTube's subtitle endpoint started fingerprinting non-browser TLS handshakes in late May. The 2026-05-25 nightly saw transcript requests hang until the wall timeout, while manual retries against the same videos returned `HTTP Error 429: Too Many Requests` immediately and warned that no impersonation target was available. `curl-cffi` is yt-dlp's optional dependency that provides Chrome/Edge/Safari-like TLS fingerprints.

Expected verification: `/opt/homebrew/bin/yt-dlp --list-impersonate-targets` should print at least one browser target, ideally `chrome` or a `chrome-*` variant. The collector now prefers `/opt/homebrew/bin/yt-dlp` over the bundled `./bin/yt-dlp` when `YTDLP_BIN` is unset, because the bundled Mach-O cannot see Python packages installed after the fact. The collector preflight logs:

- `ytdlp_impersonation_available` when a target is detected. Transcript downloads then include `--impersonate <target>` automatically.
- `ytdlp_impersonation_unavailable` when yt-dlp runs but no target is available.
- `ytdlp_impersonation_check_failed` when the target-list command itself fails.

The default requested target is `chrome`. If yt-dlp exposes only versioned targets such as `chrome-133`, the collector chooses the first Chrome target. Override only if needed:

```bash
COLLECT_YTDLP_IMPERSONATE_TARGET=chrome
# COLLECT_YTDLP_DISABLE_IMPERSONATION=1  # emergency off switch
```

Manual re-test for the known throttled captions:

```bash
mkdir -p /tmp/skillsaggregator-caption-test
cd /tmp/skillsaggregator-caption-test
/opt/homebrew/bin/yt-dlp --impersonate chrome-133 --cookies /path/to/youtube-cookies.txt \
  --skip-download --write-auto-subs --write-subs --sub-lang en,en-orig --sub-format vtt \
  "https://www.youtube.com/watch?v=CffMP0ohy-Q"
ls -lh *.vtt
```

If that still 429s, keep the cookies file fresh, then try a longer `COLLECT_TRANSCRIPT_GLOBAL_MIN_GAP_MS` before reducing candidate volume.

R31 verification note: on 2026-05-25, Homebrew yt-dlp exposed Chrome targets after pinning `curl-cffi==0.13.0`, but the known-throttled `CffMP0ohy-Q` caption download still returned HTTP 429 with both `chrome-133` and `chrome-133:macos-15`. Treat impersonation as required setup and preflight signal, not as a proven complete fix for this throttle bucket yet.

### Browser-based transcript fetcher (R33, rewritten 2026-06-06)

```bash
COLLECT_TRANSCRIPT_FETCHER=browser
COLLECT_BROWSER_CHROME_PATH="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
COLLECT_BROWSER_CDP_PORT=9222
COLLECT_BROWSER_CDP_PROFILE_DIR=.collection/cdp-chrome-profile   # dedicated, logged-in
COLLECT_BROWSER_TRANSCRIPT_TIMEOUT_MS=12000
```

**How it works — and why R32 broke ~Jun 3.** The fetcher attaches to a
**normally-launched real Chrome over CDP** (`chromium.connectOverCDP`) and clicks
the transcript buttons with **native `element.click()` run in the page's MAIN
world** — NOT Playwright's `.click()` / `Input.dispatchMouseEvent`. Verified
empirically 2026-06-06: YouTube's `/youtubei/v1/get_transcript` returns
`400 failedPrecondition` for *any* CDP-synthesized mouse input (BotGuard
fingerprints it) — independent of cookies, login, profile, or tab visibility —
while a native main-world `el.click()` (exactly what the webscraper.io content
script does via `triggerButtonClick`) returns `200`. Hands-off batch: **9/9 vs
0/9** for every Playwright-click variant, and transcript lengths match the Jun 2
nightly byte-for-byte. R32's `launchPersistentContext` + Playwright-click worked
until YouTube tightened BotGuard around Jun 3, then silently collapsed (77–96%
empty in the nightly logs).

Notes:
- The debug port requires a **non-default `--user-data-dir`** (Chrome 136+ blocks
  it on the default profile dir) — hence the dedicated `cdp-chrome-profile`.
- The page must be the **focused/visible tab**; `page.bringToFront()` supplies
  that over CDP (no OS activation needed — confirmed even when another app is
  frontmost). For an unattended nightly, verify focus survives a locked screen,
  or keep the display awake with `caffeinate`.
- The fetcher spawns and tears down its own Chrome; if a debug Chrome is already
  running on the port it **reuses** it instead of spawning a duplicate.
- Clicks the Transcript tab **only** when "Show transcript" didn't already render
  segments, so a single panel opens (no duplicate read); the read is scoped to
  the first `ytd-transcript-segment-list-renderer` and matches the leaf segment
  (`transcript-segment-view-model, div.segment`) — never the outer
  `ytd-transcript-segment-renderer` wrapper, which would double every segment.

**One-time login setup (dedicated profile).** `cdp-chrome-profile` must be signed
into YouTube. Either seed it from your everyday Chrome profile (with Chrome
closed):

```bash
DST=.collection/cdp-chrome-profile
cp "$HOME/Library/Application Support/Google/Chrome/Local State" "$DST/"
rsync -a --exclude='*Cache*' "$HOME/Library/Application Support/Google/Chrome/Default" "$DST/"
```

…or launch it once and sign in by hand:

```bash
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
  --user-data-dir="$PWD/.collection/cdp-chrome-profile" --profile-directory=Default
```

The session persists across runs. Redo this if `preflightTranscriptBrowser()`
reports `logged_in: false`.

During nightly runs the Chromium window will appear visibly. Workarounds if disruptive:
- Reposition off-screen via Chromium flag in `args`: `--window-position=10000,10000` (works on multi-monitor setups; single-monitor users can use macOS Mission Control to send the window to a different desktop).
- Run on a dedicated machine where window visibility doesn't matter.
- Accept the visible window — at ~15s/fetch with R28's 25s global gap, the window is active ~25 min for a 6-skill nightly.

Why this approach overall: R31 proved TLS impersonation was not enough; R32's first iteration tried intercepting the `/api/timedtext` network response and got 429 from YouTube's per-IP daily quota. Switching to UI-only DOM scraping of the transcript panel (the same approach the Web Scraper Chrome extension uses successfully) bypasses the throttled endpoint entirely — but only when running headed.

Lifecycle:

- The collector launches one persistent browser context for the whole run, stored under `.collection/browser-profile/`.
- The profile is reused across nightly runs so YouTube cookies, player settings, consent state, and other browser state survive.
- The fetcher still uses R28's global transcript spacing before each browser fetch.
- `scripts/run-collection.mjs` preflights browser launch when `COLLECT_TRANSCRIPT_FETCHER=browser`; a launch failure produces `browser_transcript_preflight_failed` before candidate work starts.
- `candidate_scored` and `transcript_failed` events include `transcript_fetcher`, and `nightly-report.mjs` splits scored/failure counts by fetcher.

Cookie/profile seeding:

1. If `COLLECT_BROWSER_COOKIES_FILE` is set, the browser profile is seeded from that Netscape cookies file. Otherwise it reuses `COLLECT_YTDLP_COOKIES_FILE`.
2. For a stronger session, run one headed launch and sign into YouTube manually:

   ```bash
   COLLECT_TRANSCRIPT_FETCHER=browser node scripts/run-collection.mjs --category surfing --skill pop-up
   ```

   The YouTube login state is saved in `.collection/browser-profile/`. Subsequent runs reuse it.

Smoke test:

```bash
node -e "import('./scripts/_lib/transcript-fetcher-browser.mjs').then(async (m) => { const text = await m.fetchTranscriptBrowser('CffMP0ohy-Q'); console.log((text || '').slice(0, 500)); await m.closeTranscriptBrowser(); })"
```

Expected: a non-empty transcript string. If you get an empty result, the most likely cause is `COLLECT_BROWSER_HEADLESS=1` being set in your env — unset it or set to `0`.

R32 verification note (2026-05-26): final-iteration testing confirmed headed Playwright + UI DOM scraping reaches **13/13 success** on the same video set where yt-dlp gets 0/13 (timedtext throttled) and headless Playwright gets 6/13 (only embedded-transcript videos). The transcript panel UI carries the full segment DOM (modern `transcript-segment-view-model` or legacy `div.segment`) once YouTube's content fetch succeeds, and that fetch succeeds only for windowed browsers.

### Authenticated YouTube via cookies-from-browser (added 2026-05-21, **don't use with Arc**)

```bash
# COLLECT_YTDLP_COOKIES_FROM_BROWSER=chrome   # disabled 2026-05-22, see below
```

yt-dlp's `--cookies-from-browser` flag. **This was wired in originally but had a silent failure mode**: yt-dlp's supported browsers list is `brave | chrome | chromium | edge | firefox | opera | safari | vivaldi | whale`. Arc is NOT in that list. The closest workaround (`chromium:<arc-path>`) tries to look up the cookie-encryption key in macOS Keychain under the name "Chrome Safe Storage", but Arc stores it as "Arc Safe Storage", so the lookup misses — and yt-dlp silently grabs only the un-encrypted preference/analytics cookies, NOT the encrypted YouTube auth tokens. No Keychain prompt fires (because nothing asked for the actual key), so the misconfig is invisible. Output looks like `Extracted 468 cookies from chrome` but functionally identical to anonymous.

If your browser IS in the supported list (Safari users especially) AND you've granted Keychain access once, this can work. But the cookies-file path is more durable and the recommended default.

### Internal-token auto-approve gate (added 2026-05-19, see W7)

```bash
INTERNAL_FUNCTION_TOKEN=<32-hex>   # SAME value must also be in supabase/.env
```

Lets the local agent submit suggestions with `requested_status: "auto_approved"`. Only requests carrying this header bypass the moderation queue. Public callers always get `pending` regardless of what they request. **The same value must be in both files** — `apps/web/.env.local` (sourced by the agent) and `supabase/.env` (sourced by the edge runtime).

Disable by clearing the value: agent then submits as plain `pending`, moderation queue handles everything.

### Auto-approve confidence floor (added 2026-05-19)

```bash
COLLECT_AUTO_APPROVE_FLOOR=0.7     # default 0.7
```

Below this score, agent submits as `pending` (manual review). At or above, requests `auto_approved`. The score is `min(score.relevance, score.teaching_quality)` from the Ollama triangulation step. Lower this if too few candidates auto-approve and the moderation queue gets backed up. Raise it if low-quality content is slipping through.

## R28 cache settings (added 2026-05-22)

These have sane defaults and rarely need touching:

```bash
COLLECT_CACHE_DIR=.collection/cache              # where per-night cache JSONs live
COLLECT_CACHE_DATE=YYYY-MM-DD                    # default: today's local date
COLLECT_TRANSCRIPT_GLOBAL_MIN_GAP_MS=25000       # default: YTDLP_SLEEP_SUBTITLES * 1000
```

The `_GLOBAL_MIN_GAP_MS` is the cross-skill transcript-fetch spacing — the real fix for the 5/21 burst-429 problem. If 429s reappear despite this, bump to 45000 (45s) or 60000 (60s); each bump cuts skills-per-night roughly proportionally.

## Escalation playbook (if 429s reappear)

In order, each one is more aggressive than the last:

1. **Bump `COLLECT_TRANSCRIPT_GLOBAL_MIN_GAP_MS`** to 45000 → 60000
2. **Lower `COLLECT_CANDIDATES_TO_SCORE`** to 10 → 8
3. **Cut the pool**: temporarily lower `COLLECT_MAX_VIDEOS_PER_CHANNEL` from default 25 to 10 (limits fresh-upload + listing scope)
4. **Skip a night**: edit the launchd plist's `StartCalendarInterval` to delay 24h — let YouTube's cooldown fully reset
5. **Last resort**: temporarily disable `COLLECT_YTDLP_COOKIES_FROM_BROWSER` — if our Google account specifically has been flagged, anonymous requests may do better

## Where each value is sourced

| File | Read by |
|---|---|
| `apps/web/.env.local` | `scripts/nightly-collect.sh` (sourced first for tuning, Ollama/yt-dlp settings, and `INTERNAL_FUNCTION_TOKEN`) |
| `.env.hosted` | `scripts/nightly-collect.sh` (sourced second when `COLLECT_TARGET=hosted`; overrides Supabase URL/service role and exports `COLLECT_DB_URL`) |
| `supabase/.env` | `supabase_edge_runtime_skillsaggregator` Docker container (set at container start) |
| `~/Library/LaunchAgents/com.skillsaggregator.collection.plist` | launchd, fires `nightly-collect.sh` at 03:00 daily |

`scripts/nightly-collect.sh` defaults to `COLLECT_TARGET=hosted`. Hosted runs use the Supabase session pooler through `COLLECT_DB_URL`, currently `aws-1-ap-southeast-2.pooler.supabase.com:5432` for project `vqxsaabskkkjdljxiyqi`; `aws-0-ap-southeast-2.pooler.supabase.com` resolves but returns `tenant/user not found` for this project. Local dev runs should use `COLLECT_TARGET=local`, which unsets `COLLECT_DB_URL` and restores the Docker `supabase_db_skillsaggregator` path plus pre-run local `pg_dump` backup.

Hosted runs default `COLLECT_SKIP_EVENT_PERSIST=1`: every log line is still written to `.collection/logs/nightly-*.log`, but `agent_run_events` inserts are skipped to avoid Sydney round trips and free-tier bloat. The compact `agent_runs` row is still written.

When you change `supabase/.env`, the edge runtime container needs to be restarted to pick it up — `npx supabase stop && npx supabase start` is data-safe (preserves volumes; only `db reset` is destructive — see [README's destructive-ops section](../README.md#-destructive-operations--read-before-applying-migrations)).
