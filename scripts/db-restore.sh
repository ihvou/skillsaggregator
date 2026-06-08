#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

dump_path="${1:-}"
container="${SUPABASE_DB_CONTAINER:-supabase_db_skillsaggregator}"

if [ -z "$dump_path" ]; then
  echo "Usage: scripts/db-restore.sh .collection/backups/db-YYYYMMDDTHHMMSSZ.dump" >&2
  exit 64
fi

if [ ! -f "$dump_path" ]; then
  echo "Dump file not found: ${dump_path}" >&2
  exit 66
fi

if ! command -v docker >/dev/null 2>&1; then
  echo "docker not found; cannot restore database backup" >&2
  exit 127
fi

if ! docker inspect "$container" >/dev/null 2>&1; then
  echo "Supabase DB container not found: ${container}" >&2
  exit 1
fi

container_path="/tmp/$(basename "$dump_path")"
docker cp "$dump_path" "${container}:${container_path}"
docker exec "$container" pg_restore -U postgres --clean --if-exists --no-owner --no-privileges -d postgres "$container_path"
docker exec "$container" rm -f "$container_path" >/dev/null

echo "Restored ${dump_path}"

