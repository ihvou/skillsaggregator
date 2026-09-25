#!/usr/bin/env bash
set -uo pipefail

# Scheduled report regeneration (launchd: com.skillsaggregator.reports).
#
# WHY THIS EXISTS SEPARATELY FROM nightly-collect.sh. The reports already run as a
# post-step there, but that couples them to a six-hour collection run that has to
# reach its end with a live network. On 2026-08-19 collection did most of its work,
# the network died at 07:32, and the report step — one second later — failed with
# it, leaving every report two days stale. Collection also routinely exits 124
# (gtimeout SIGTERM at its cap).
#
# This job needs none of that: no Chrome, no yt-dlp, no collection. It is a handful
# of psql queries plus a cached log pass, ~10 seconds, so it can run on its own
# schedule and pick up whatever the nightly run left behind. The reports rebuild
# from scratch every time, so running twice a day costs nothing and a missed run
# self-heals.
#
# Retries because a laptop at a fixed hour is a coin toss — asleep, mid-wake, or
# on a network that has not come back yet.

export PATH="/opt/homebrew/opt/libpq/bin:/usr/local/opt/libpq/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:$PATH"
cd "$(dirname "$0")/.."

mkdir -p .collection/logs
log_file=".collection/logs/reports-$(date +%Y%m%dT%H%M%S%z).log"

log() {
  echo "[$(date +%Y-%m-%dT%H:%M:%S%z)] $*" | tee -a "$log_file"
}

source_env_file() {
  local env_file="$1"
  if [ -f "$env_file" ]; then
    set -o allexport
    # shellcheck source=/dev/null
    . "$env_file"
    set +o allexport
  fi
}

# Same layering as nightly-collect.sh: local tuning first, hosted credentials win.
source_env_file "apps/web/.env.local"
source_env_file ".env.hosted"

if [ -z "${COLLECT_DB_URL:-}" ] && [ -z "${SUPABASE_DB_PASSWORD:-}" ]; then
  log "ERROR: no COLLECT_DB_URL or SUPABASE_DB_PASSWORD; cannot reach the database"
  exit 64
fi

attempts="${REPORTS_MAX_ATTEMPTS:-5}"
delay="${REPORTS_RETRY_DELAY_SEC:-300}"

for attempt in $(seq 1 "$attempts"); do
  log "content-ops report attempt ${attempt}/${attempts}"
  if node scripts/content-ops-report.mjs 2>&1 | tee -a "$log_file"; then
    log "reports written"
    exit 0
  fi
  if [ "$attempt" -lt "$attempts" ]; then
    log "attempt ${attempt} failed; retrying in ${delay}s"
    sleep "$delay"
  fi
done

log "ERROR: all ${attempts} attempts failed"
exit 1
