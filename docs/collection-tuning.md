# Collection tuning reference

`apps/web/.env.local` and `supabase/.env` are gitignored, so the actual values being run against don't live in version control. This doc tracks **what's currently configured, why, and the next lever to pull** if things break.

Last updated: 2026-05-22 after the 5/21 rate-limit failure + R28 recovery.

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
| `apps/web/.env.local` | `scripts/nightly-collect.sh` (sourced) → `scripts/run-collection.mjs` (process env) |
| `supabase/.env` | `supabase_edge_runtime_skillsaggregator` Docker container (set at container start) |
| `~/Library/LaunchAgents/com.skillsaggregator.collection.plist` | launchd, fires `nightly-collect.sh` at 03:00 daily |

When you change `supabase/.env`, the edge runtime container needs to be restarted to pick it up — `npx supabase stop && npx supabase start` is data-safe (preserves volumes; only `db reset` is destructive — see [README's destructive-ops section](../README.md#-destructive-operations--read-before-applying-migrations)).
