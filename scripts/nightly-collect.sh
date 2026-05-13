#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

mkdir -p .collection/runs .collection/logs

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
stamp="$(date -u +%Y%m%dT%H%M%SZ)"
log_file=".collection/logs/nightly-${stamp}.log"

"$timeout_bin" --signal=TERM --kill-after=30s "$hard_timeout" \
  node scripts/run-collection.mjs --all "$@" 2>&1 | tee -a "$log_file"
