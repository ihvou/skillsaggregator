#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

backup_dir="${DB_BACKUP_DIR:-.collection/backups}"
container="${SUPABASE_DB_CONTAINER:-supabase_db_skillsaggregator}"
keep="${DB_BACKUP_KEEP:-7}"
timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
file_name="db-${timestamp}.dump"
container_path="/tmp/${file_name}"
host_path="${backup_dir}/${file_name}"

if ! command -v docker >/dev/null 2>&1; then
  echo "docker not found; cannot create database backup" >&2
  exit 127
fi

if ! docker inspect "$container" >/dev/null 2>&1; then
  echo "Supabase DB container not found: ${container}" >&2
  exit 1
fi

mkdir -p "$backup_dir"
docker exec "$container" pg_dump -U postgres -Fc -f "$container_path"
docker cp "${container}:${container_path}" "$host_path"
docker exec "$container" rm -f "$container_path" >/dev/null

if [[ "$keep" =~ ^[0-9]+$ ]] && [ "$keep" -gt 0 ]; then
  # Avoid mapfile/readarray (bash 4+) so rotation still runs on stock macOS bash
  # 3.2 — otherwise a successful dump exits non-zero and every `set -e` caller
  # treats the backup as failed.
  find "$backup_dir" -maxdepth 1 -name 'db-*.dump' -type f | sort -r | tail -n +"$((keep + 1))" |
    while IFS= read -r old_backup; do
      if [ -n "$old_backup" ]; then
        rm -f "$old_backup"
      fi
    done
fi

echo "$host_path"

