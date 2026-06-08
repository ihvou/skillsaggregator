#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

force_no_backup=0
pass_args=()
for arg in "$@"; do
  if [ "$arg" = "--force-no-backup" ]; then
    force_no_backup=1
  else
    pass_args+=("$arg")
  fi
done

if [ "$force_no_backup" -eq 0 ]; then
  backup_path="$(scripts/db-backup.sh)"
  echo "Created pre-reset backup: ${backup_path}"
else
  echo "WARNING: running supabase db reset without a backup because --force-no-backup was provided." >&2
fi

supabase db reset "${pass_args[@]}"

