#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

prefix="${SUPABASE_CONTAINER_PREFIX:-supabase_}"
restart_policy="${SUPABASE_RESTART_POLICY:-unless-stopped}"

if ! command -v docker >/dev/null 2>&1; then
  echo "docker not found; cannot verify Supabase containers" >&2
  exit 127
fi

if [ "${SKIP_DB_BACKUP:-0}" != "1" ]; then
  # Best-effort: a failed backup (e.g. the DB container is down) must not abort
  # the restart-policy step below, which may be exactly what recovers it.
  if backup_path="$(bash scripts/db-backup.sh)"; then
    echo "pre-health database backup: ${backup_path}"
  else
    echo "WARNING: pre-health database backup failed; continuing with health checks" >&2
  fi
fi

containers=()
while IFS= read -r container; do
  [ -n "$container" ] && containers+=("$container")
done < <(docker ps -a --format '{{.Names}}' | grep "^${prefix}" || true)

if [ "${#containers[@]}" -eq 0 ]; then
  echo "No containers found with prefix '${prefix}'" >&2
  exit 1
fi

for container in "${containers[@]}"; do
  docker update --restart "$restart_policy" "$container" >/dev/null
done

docker inspect \
  --format '{{.Name}} status={{.State.Status}} restart={{.HostConfig.RestartPolicy.Name}} exit={{.State.ExitCode}}' \
  "${containers[@]}" |
  sed 's#^/##'
