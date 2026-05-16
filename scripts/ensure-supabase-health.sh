#!/usr/bin/env bash
set -euo pipefail

prefix="${SUPABASE_CONTAINER_PREFIX:-supabase_}"
restart_policy="${SUPABASE_RESTART_POLICY:-unless-stopped}"

if ! command -v docker >/dev/null 2>&1; then
  echo "docker not found; cannot verify Supabase containers" >&2
  exit 127
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
