#!/usr/bin/env bash
set -euo pipefail

# Explicit PATH for launchd / cron, which start with a minimal environment.
# Includes both Intel and Apple Silicon Homebrew prefixes plus standard system paths.
export PATH="/opt/homebrew/opt/libpq/bin:/usr/local/opt/libpq/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:$PATH"

cd "$(dirname "$0")/.."

mkdir -p .collection/runs .collection/logs

source_env_file() {
  local env_file="$1"
  if [ -f "$env_file" ]; then
    set -o allexport
    # shellcheck source=/dev/null
    . "$env_file"
    set +o allexport
  else
    echo "Env file not found at $env_file." >&2
    exit 64
  fi
}

# apps/web/.env.local remains the source of local dev creds plus collection
# tuning (Ollama, yt-dlp, internal token). Hosted overrides are layered below.
ENV_FILE="${COLLECT_ENV_FILE:-apps/web/.env.local}"
source_env_file "$ENV_FILE"

COLLECT_TARGET="${COLLECT_TARGET:-hosted}"
case "$COLLECT_TARGET" in
  hosted)
    HOSTED_ENV_FILE="${COLLECT_HOSTED_ENV_FILE:-.env.hosted}"
    source_env_file "$HOSTED_ENV_FILE"
    export COLLECT_TARGET
    export COLLECT_SKIP_EVENT_PERSIST="${COLLECT_SKIP_EVENT_PERSIST:-1}"
    if [ -z "${COLLECT_DB_URL:-}" ] && [ -z "${SUPABASE_DB_PASSWORD:-}" ]; then
      echo "COLLECT_TARGET=hosted requires COLLECT_DB_URL or SUPABASE_DB_PASSWORD in ${HOSTED_ENV_FILE}." >&2
      exit 64
    fi
    ;;
  local)
    export COLLECT_TARGET
    export COLLECT_SKIP_EVENT_PERSIST="${COLLECT_SKIP_EVENT_PERSIST:-0}"
    unset COLLECT_DB_URL
    ;;
  *)
    echo "COLLECT_TARGET must be 'hosted' or 'local' (got '${COLLECT_TARGET}')." >&2
    exit 64
    ;;
esac

# The Node script reads SUPABASE_URL; the local web env file provides
# NEXT_PUBLIC_SUPABASE_URL, while .env.hosted provides SUPABASE_URL directly.
if [ "$COLLECT_TARGET" = "local" ]; then
  export SUPABASE_URL="${SUPABASE_URL:-${NEXT_PUBLIC_SUPABASE_URL:-}}"
fi

if [ -z "${SUPABASE_URL:-}" ] || [ -z "${SUPABASE_SERVICE_ROLE_KEY:-}" ]; then
  echo "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY after sourcing target=${COLLECT_TARGET} env files." >&2
  exit 64
fi

if [ "$COLLECT_TARGET" = "hosted" ] && [ -z "${INTERNAL_FUNCTION_TOKEN:-}" ]; then
  echo "Missing INTERNAL_FUNCTION_TOKEN after sourcing ${ENV_FILE}; the collector sends it as the internal-request token." >&2
  exit 64
fi

# Scoring v2: the nightly run is a pure collector. The local Ollama scorer is
# unwired (COLLECT_SCORING=off), and auto-apply is on by default
# (COLLECT_AUTO_APPLY=1): accepted items are applied directly as UNPUBLISHED
# link<->skill relations (transcripts persisted on the link), so they stay out of
# the public catalog until the relevance + value coaches score them and the
# publish-gate cron promotes the good ones. Set COLLECT_AUTO_APPLY=0 in the env
# file to leave items as pending suggestions for manual debugging instead.
export COLLECT_SCORING="${COLLECT_SCORING:-off}"

if [ "$COLLECT_TARGET" = "hosted" ] && ! command -v "${PSQL_BIN:-psql}" >/dev/null 2>&1; then
  echo "psql not found. Install libpq (brew install libpq); this script adds Homebrew libpq bin dirs to PATH." >&2
  exit 127
fi

timeout_bin="${TIMEOUT_BIN:-gtimeout}"
if ! command -v "$timeout_bin" >/dev/null 2>&1; then
  if command -v timeout >/dev/null 2>&1; then
    timeout_bin="timeout"
  else
    echo "gtimeout not found. Install with: brew install coreutils" >&2
    exit 127
  fi
fi

hard_timeout="${COLLECT_HARD_TIMEOUT_SEC:-10800}"
stamp="$(date +%Y%m%dT%H%M%S%z)"
log_file=".collection/logs/nightly-${stamp}.log"

echo "[$(date +%Y-%m-%dT%H:%M:%S%z)] nightly-collect starting target=${COLLECT_TARGET} timeout=${hard_timeout}s" | tee -a "$log_file"

if [ "$COLLECT_TARGET" = "local" ]; then
  # Restore container health BEFORE backing up. A stopped DB cannot be dumped, so
  # a backup-first ordering would abort the whole run (set -e) before the health
  # step that exists to recover it.
  SKIP_DB_BACKUP=1 bash scripts/ensure-supabase-health.sh 2>&1 | tee -a "$log_file"

  # The pre-run backup is a safety net, not a hard gate — never let a transient
  # backup failure abort the nightly collection.
  if backup_path="$(bash scripts/db-backup.sh)"; then
    echo "[$(date +%Y-%m-%dT%H:%M:%S%z)] pre-run database backup: ${backup_path}" | tee -a "$log_file"
  else
    echo "[$(date +%Y-%m-%dT%H:%M:%S%z)] WARNING: pre-run database backup failed; continuing" | tee -a "$log_file"
  fi
else
  echo "[$(date +%Y-%m-%dT%H:%M:%S%z)] hosted target: skipping local Supabase health check" | tee -a "$log_file"

  # Hosted is the single source of truth (Option A), and Supabase takes no
  # automated backups on the Free plan — so this pre-run dump is the only thing
  # standing between a bad night and permanent loss of the transcript corpus.
  # Same safety-net rule as the local branch: never let a backup failure cost a
  # night of collection. The script's own diagnostics go to the nightly log.
  if [ "${COLLECT_SKIP_BACKUP:-0}" = "1" ]; then
    echo "[$(date +%Y-%m-%dT%H:%M:%S%z)] pre-run hosted backup skipped (COLLECT_SKIP_BACKUP=1)" | tee -a "$log_file"
  elif backup_path="$(bash scripts/db-backup-hosted.sh 2>>"$log_file")"; then
    echo "[$(date +%Y-%m-%dT%H:%M:%S%z)] pre-run hosted database backup: ${backup_path}" | tee -a "$log_file"
  else
    echo "[$(date +%Y-%m-%dT%H:%M:%S%z)] WARNING: pre-run hosted database backup failed; continuing" | tee -a "$log_file"
  fi
fi

set +e
"$timeout_bin" --signal=TERM --kill-after=30s "$hard_timeout" \
  node scripts/run-collection.mjs --all "$@" 2>&1 | tee -a "$log_file"
exit_code="${PIPESTATUS[0]}"
set -e

echo "[$(date +%Y-%m-%dT%H:%M:%S%z)] nightly-collect exited with code $exit_code" | tee -a "$log_file"

missing_transcripts_limit="${COLLECT_MISSING_TRANSCRIPTS_LIMIT:-10}"
if [ "$exit_code" -eq 0 ] && [ "$missing_transcripts_limit" != "0" ]; then
  echo "[$(date +%Y-%m-%dT%H:%M:%S%z)] missing-transcripts step starting limit=${missing_transcripts_limit}" | tee -a "$log_file"
  set +e
  node scripts/fetch-missing-transcripts.mjs --limit "$missing_transcripts_limit" 2>&1 | tee -a "$log_file"
  missing_transcripts_exit_code="${PIPESTATUS[0]}"
  set -e
  echo "[$(date +%Y-%m-%dT%H:%M:%S%z)] missing-transcripts step exited with code ${missing_transcripts_exit_code}" | tee -a "$log_file"
  if [ "$missing_transcripts_exit_code" -ne 0 ]; then
    echo "[$(date +%Y-%m-%dT%H:%M:%S%z)] WARNING: missing-transcripts step failed; preserving collection exit code ${exit_code}" | tee -a "$log_file"
  fi
fi

# Sweep short-form metadata that enrichment could not complete during the run.
#
# Not optional housekeeping. apply-suggestion enriches each link as it applies,
# and Instagram throttles under the burst a full night produces: on 2026-09-11,
# 42 of 68 published Instagram links came out with no thumbnail at all because
# the og: fetch was rate-limited mid-run. Re-fetched an hour later the same posts
# serve a real og:image, so the cure is simply to try again once the burst is
# over. The script is idempotent and only touches links that are actually
# missing something, so a clean night is a cheap no-op.
#
# It runs even when collection failed, for the same reason the report does: a
# partial night still published links, and those links still need thumbnails.
if [ "${COLLECT_SKIP_SHORTFORM_REPAIR:-0}" != "1" ]; then
  echo "[$(date +%Y-%m-%dT%H:%M:%S%z)] short-form metadata repair starting" | tee -a "$log_file"
  set +e
  node scripts/repair-shortform-link-metadata.mjs --limit "${COLLECT_SHORTFORM_REPAIR_LIMIT:-400}" 2>&1 | tee -a "$log_file"
  repair_exit_code="${PIPESTATUS[0]}"
  set -e
  if [ "$repair_exit_code" -ne 0 ]; then
    echo "[$(date +%Y-%m-%dT%H:%M:%S%z)] WARNING: short-form metadata repair failed with ${repair_exit_code}; preserving collection exit code ${exit_code}" | tee -a "$log_file"
  fi
fi

# Content-ops reports rebuild from scratch, so this runs even when collection
# failed: a dead night has to show up as a zero row rather than as a gap. Never
# let a reporting failure change the collection exit code.
if [ "${COLLECT_SKIP_REPORT:-0}" != "1" ]; then
  echo "[$(date +%Y-%m-%dT%H:%M:%S%z)] content-ops report starting" | tee -a "$log_file"
  set +e
  node scripts/content-ops-report.mjs 2>&1 | tee -a "$log_file"
  report_exit_code="${PIPESTATUS[0]}"
  set -e
  if [ "$report_exit_code" -ne 0 ]; then
    echo "[$(date +%Y-%m-%dT%H:%M:%S%z)] WARNING: content-ops report failed with ${report_exit_code}; preserving collection exit code ${exit_code}" | tee -a "$log_file"
  fi
fi

exit "$exit_code"
