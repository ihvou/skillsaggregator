#!/usr/bin/env bash
set -uo pipefail

# Scheduled transcript gap-filler (launchd: com.skillsaggregator.transcripts).
# Runs the M52 recurring scraper against HOSTED to fill link_transcripts for
# active YouTube items that don't have a transcript yet. Intended for a daily
# 6 AM (WITA / Bali) start with a 3-hour cap so it stops by ~9 AM. The script
# itself throttles (global min-gap) and has a rate-limit circuit breaker, so the
# cap is just an upper bound. Browser/CDP fetch uses focus emulation (M53), so
# it won't steal focus if the Mac is in use.
#
# Override the window/args:
#   TRANSCRIPTS_TIME_CAP=2h bash scripts/fetch-missing-transcripts-cron.sh
#   bash scripts/fetch-missing-transcripts-cron.sh --dry-run --limit 3

export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:$PATH"
cd "$(dirname "$0")/.."

mkdir -p .collection/logs
stamp="$(date +%Y%m%dT%H%M%S%z)"
log_file=".collection/logs/transcripts-${stamp}.log"

export COLLECT_TARGET="${COLLECT_TARGET:-hosted}"

# Default to clearing the whole backlog; the time cap bounds the run.
args=("$@")
if [ "${#args[@]}" -eq 0 ]; then
  args=(--all)
fi

time_cap="${TRANSCRIPTS_TIME_CAP:-3h}"
timeout_bin="${TIMEOUT_BIN:-gtimeout}"
if ! command -v "$timeout_bin" >/dev/null 2>&1; then
  if command -v timeout >/dev/null 2>&1; then
    timeout_bin="timeout"
  else
    timeout_bin=""
  fi
fi

echo "[$(date +%Y-%m-%dT%H:%M:%S%z)] transcripts-cron starting target=${COLLECT_TARGET} cap=${time_cap} args=${args[*]}" | tee -a "$log_file"

if [ -n "$timeout_bin" ]; then
  "$timeout_bin" --signal=TERM --kill-after=60s "$time_cap" \
    node scripts/fetch-missing-transcripts.mjs "${args[@]}" 2>&1 | tee -a "$log_file"
  exit_code="${PIPESTATUS[0]}"
else
  echo "[$(date +%Y-%m-%dT%H:%M:%S%z)] WARNING: no gtimeout/timeout found; running without a time cap" | tee -a "$log_file"
  node scripts/fetch-missing-transcripts.mjs "${args[@]}" 2>&1 | tee -a "$log_file"
  exit_code="${PIPESTATUS[0]}"
fi

echo "[$(date +%Y-%m-%dT%H:%M:%S%z)] transcripts-cron exited with code ${exit_code}" | tee -a "$log_file"
exit "$exit_code"
