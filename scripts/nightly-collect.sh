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
  echo "Missing INTERNAL_FUNCTION_TOKEN after sourcing ${ENV_FILE}; hosted auto-approve requires it." >&2
  exit 64
fi

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
  echo "[$(date +%Y-%m-%dT%H:%M:%S%z)] hosted target: skipping local Supabase health check and pg_dump backup" | tee -a "$log_file"
fi

"$timeout_bin" --signal=TERM --kill-after=30s "$hard_timeout" \
  node scripts/run-collection.mjs --all "$@" 2>&1 | tee -a "$log_file"
exit_code="${PIPESTATUS[0]}"

echo "[$(date +%Y-%m-%dT%H:%M:%S%z)] nightly-collect exited with code $exit_code" | tee -a "$log_file"
exit "$exit_code"
