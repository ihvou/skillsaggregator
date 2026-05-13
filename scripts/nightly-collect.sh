#!/usr/bin/env bash
set -euo pipefail

# Explicit PATH for launchd / cron, which start with a minimal environment.
# Includes both Intel and Apple Silicon Homebrew prefixes plus standard system paths.
export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:$PATH"

cd "$(dirname "$0")/.."

mkdir -p .collection/runs .collection/logs

# Source Supabase config from apps/web/.env.local so we don't duplicate secrets.
ENV_FILE="${COLLECT_ENV_FILE:-apps/web/.env.local}"
if [ -f "$ENV_FILE" ]; then
  set -o allexport
  # shellcheck source=/dev/null
  . "$ENV_FILE"
  set +o allexport
else
  echo "Env file not found at $ENV_FILE — set COLLECT_ENV_FILE or create it." >&2
  exit 64
fi

# The Node script reads SUPABASE_URL; the web env file provides NEXT_PUBLIC_SUPABASE_URL.
export SUPABASE_URL="${SUPABASE_URL:-${NEXT_PUBLIC_SUPABASE_URL:-}}"

if [ -z "${SUPABASE_URL:-}" ] || [ -z "${SUPABASE_SERVICE_ROLE_KEY:-}" ]; then
  echo "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY after sourcing $ENV_FILE." >&2
  exit 64
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

hard_timeout="${COLLECT_HARD_TIMEOUT_SEC:-7200}"
stamp="$(date +%Y%m%dT%H%M%S%z)"
log_file=".collection/logs/nightly-${stamp}.log"

echo "[$(date +%Y-%m-%dT%H:%M:%S%z)] nightly-collect starting (timeout ${hard_timeout}s)" | tee -a "$log_file"

"$timeout_bin" --signal=TERM --kill-after=30s "$hard_timeout" \
  node scripts/run-collection.mjs --all "$@" 2>&1 | tee -a "$log_file"
exit_code="${PIPESTATUS[0]}"

echo "[$(date +%Y-%m-%dT%H:%M:%S%z)] nightly-collect exited with code $exit_code" | tee -a "$log_file"
exit "$exit_code"
