#!/usr/bin/env bash
set -euo pipefail

# Nightly logical backup of the HOSTED (production) Supabase database.
#
# scripts/db-backup.sh is the LOCAL Docker equivalent and does not protect
# production: since the collector moved to Option A (hosted is the single source
# of truth) the nightly run wrote ~575 rows a night into a database nothing was
# dumping. This script is that missing guard.
#
# Diagnostics go to stderr; the finished dump path is the only thing on stdout,
# so callers can do:  backup_path="$(bash scripts/db-backup-hosted.sh)"
#
# Env overrides:
#   DB_BACKUP_DIR          default .collection/backups/hosted
#   DB_BACKUP_KEEP         daily dumps to retain (default 7)
#   DB_BACKUP_WEEKLY_KEEP  weekly dumps to retain (default 4)
#   DB_BACKUP_SCHEMAS      default "public auth storage"
#   DB_BACKUP_COMPRESS     pg_dump -Z level (default 6)
#   DB_BACKUP_ATTEMPTS     tries before giving up (default 3)
#   DB_BACKUP_RETRY_DELAY  seconds before the first retry, doubling after (default 60)
#   DB_BACKUP_TIMEOUT_SEC  hard cap on ONE pg_dump attempt (default 1200)
#   PG_DUMP_BIN            pg_dump to run (default pg_dump; tests swap in a stub)

export PATH="/opt/homebrew/opt/libpq/bin:/usr/local/opt/libpq/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:$PATH"

script_dir="$(cd "$(dirname "$0")" && pwd)"
cd "${script_dir}/.."

# Absolute path: `source` searches PATH before the working directory, so a bare
# relative path here is not reliable across shells.
# shellcheck source=scripts/_lib/hosted-db-env.sh
. "${script_dir}/_lib/hosted-db-env.sh"

backup_dir="${DB_BACKUP_DIR:-.collection/backups/hosted}"
weekly_dir="${backup_dir}/weekly"
keep="${DB_BACKUP_KEEP:-7}"
weekly_keep="${DB_BACKUP_WEEKLY_KEEP:-4}"
schemas="${DB_BACKUP_SCHEMAS:-public auth storage}"
compress="${DB_BACKUP_COMPRESS:-6}"
attempts="${DB_BACKUP_ATTEMPTS:-3}"
retry_delay="${DB_BACKUP_RETRY_DELAY:-60}"
pg_dump_bin="${PG_DUMP_BIN:-pg_dump}"
# A CAP ON ONE ATTEMPT, because retries cannot rescue an attempt that never
# returns. On 2026-09-18 the COPY of curator_votes lost its pooler connection and
# libpq sat on a dead socket until the OS TCP timeout gave up — 19h25m. The retry
# logic then worked perfectly and attempt 2 succeeded, but by that point the
# nightly collection had started 19 hours late, was killed by its own 6h cap, and
# had blocked the following night's run entirely: 09-18 collected 119 YouTube
# links against a normal ~500.
#
# A healthy dump of this database takes about 3 minutes, so 20 gives ample room
# while turning that failure from "a lost night" into "a few minutes, then retry".
backup_timeout="${DB_BACKUP_TIMEOUT_SEC:-1200}"

[[ "$attempts" =~ ^[1-9][0-9]*$ ]] || attempts=3
[[ "$retry_delay" =~ ^[0-9]+$ ]] || retry_delay=60
[[ "$backup_timeout" =~ ^[1-9][0-9]*$ ]] || backup_timeout=1200

# Same resolution as nightly-collect.sh: coreutils gtimeout on macOS, timeout
# elsewhere. If neither exists the dump still runs, just unbounded — a missing
# tool must not stop backups happening.
timeout_bin="${TIMEOUT_BIN:-gtimeout}"
if ! command -v "$timeout_bin" >/dev/null 2>&1; then
  if command -v timeout >/dev/null 2>&1; then
    timeout_bin="timeout"
  else
    timeout_bin=""
    echo "note: neither gtimeout nor timeout found; pg_dump will run unbounded (brew install coreutils)" >&2
  fi
fi

hosted_db_require_bin "$pg_dump_bin"
hosted_db_require_bin pg_restore
hosted_db_require_bin psql

hosted_db_resolve

echo "hosted backup target: project=${HOSTED_PROJECT_REF} host=${HOSTED_DB_HOST}:${HOSTED_DB_PORT}" >&2

# Prove the connection is live and really is the hosted project before spending
# minutes on a dump that might fail at the end.
server_info="$(PGPASSWORD="$HOSTED_DB_PASSWORD" psql "$HOSTED_DB_URL_ARGV" -X -A -t \
  -c "select current_database() || ' pg' || current_setting('server_version') || ' ' || pg_size_pretty(pg_database_size(current_database()))" \
  2>&1 | hosted_db_scrub)" || {
    echo "Cannot reach hosted Postgres: ${server_info}" >&2
    exit 1
  }
echo "hosted backup source: ${server_info}" >&2

timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
file_name="db-hosted-${HOSTED_PROJECT_REF}-${timestamp}.dump"
host_path="${backup_dir}/${file_name}"
tmp_path="${host_path}.partial"
counts_path="${host_path}.counts.partial"

mkdir -p "$backup_dir" "$weekly_dir"

# A run killed outright (SIGKILL, power loss) cannot clean up after itself, and
# *.partial never matches the rotation pattern, so sweep leftovers here. The
# 12-hour age keeps this away from a concurrent run's live file.
find "$backup_dir" -maxdepth 1 -name '*.partial' -type f -mmin +720 -exec rm -f {} + 2>/dev/null || true

schema_args=""
for schema in $schemas; do
  schema_args="${schema_args} --schema=${schema}"
done

# One attempt: dump, then prove the archive is whole. On success the dump is at
# $tmp_path and exact per-table row counts are at $counts_path; on any failure
# it returns non-zero and the caller cleans up.
dump_and_verify() {
  rm -f "$tmp_path" "$counts_path"

  # --no-owner/--no-privileges: Supabase owns auth.* and storage.* with roles that
  # do not exist outside the project, so a dump that preserves them cannot be
  # restored into a fresh project. Ownership is re-established by the migrations.
  # shellcheck disable=SC2086
  PGPASSWORD="$HOSTED_DB_PASSWORD" ${timeout_bin:+$timeout_bin --signal=TERM --kill-after=30s "$backup_timeout"} \
    "$pg_dump_bin" "$HOSTED_DB_URL_ARGV" \
    --format=custom \
    --compress="$compress" \
    --no-owner \
    --no-privileges \
    $schema_args \
    --file "$tmp_path" 2> >(hosted_db_scrub >&2)
  dump_status=$?
  if [ "$dump_status" -ne 0 ]; then
    # 124 is timeout's own code for "killed at the deadline"; say so explicitly,
    # because a stalled COPY and a rejected connection look identical otherwise.
    if [ "$dump_status" -eq 124 ] || [ "$dump_status" -eq 137 ]; then
      echo "pg_dump exceeded ${backup_timeout}s and was killed (stalled connection?)" >&2
    else
      echo "pg_dump failed" >&2
    fi
    return 1
  fi

  # The table of contents first: cheap, and it catches a truncated file.
  if ! toc="$(pg_restore -l "$tmp_path" 2>&1)"; then
    echo "verification failed: pg_restore -l cannot read the archive" >&2
    return 1
  fi
  table_data_count="$(printf '%s\n' "$toc" | grep -c 'TABLE DATA' || true)"
  if [ "$table_data_count" -eq 0 ]; then
    echo "verification failed: the archive holds no TABLE DATA entries" >&2
    return 1
  fi

  # Then every block. Streaming the whole archive through pg_restore decompresses
  # all of it, which catches corruption the TOC scan cannot, and counting the
  # lines of each COPY block on the way gives exact, snapshot-consistent row
  # counts for the manifest rather than planner estimates. This is local CPU
  # (~6 s for an 86 MB dump), not another trip to Sydney, so it runs every time.
  if ! pg_restore -f - "$tmp_path" 2> >(hosted_db_scrub >&2) | awk '
      /^COPY [^ ]+ \(/ { table = $2; gsub(/"/, "", table); rows = 0; in_copy = 1; next }
      in_copy && $0 == "\\." { print table "\t" rows; in_copy = 0; next }
      in_copy { rows++ }
    ' > "$counts_path"; then
    echo "verification failed: the archive does not decompress end to end" >&2
    return 1
  fi

  return 0
}

# Retry, because a dump is one long COPY stream from Sydney: on 2026-09-12 the
# SSL connection dropped 7 minutes in, and with no retry that night simply had no
# backup. Each attempt starts from scratch; pg_dump cannot resume.
attempt=1
delay="$retry_delay"
until dump_and_verify; do
  rm -f "$tmp_path" "$counts_path"
  if [ "$attempt" -ge "$attempts" ]; then
    echo "giving up after ${attempt} attempt(s); no backup written" >&2
    exit 1
  fi
  echo "attempt ${attempt}/${attempts} failed; retrying in ${delay}s" >&2
  sleep "$delay"
  attempt=$((attempt + 1))
  delay=$((delay * 2))
done

mv "$tmp_path" "$host_path"

dump_bytes="$(wc -c < "$host_path" | tr -d ' ')"
dump_sha="$(shasum -a 256 "$host_path" | awk '{print $1}')"

# Row counts are the restore-time answer to "did everything come back?". awk does
# the JSON quoting.
public_counts="$(awk -F'\t' '$1 ~ /^public\./ { sub(/^public\./, "", $1); printf "%s    \"%s\": %s", sep, $1, $2; sep = ",\n" } END { printf "\n" }' "$counts_path")"
other_counts="$(awk -F'\t' '$1 !~ /^public\./ { printf "%s    \"%s\": %s", sep, $1, $2; sep = ",\n" } END { printf "\n" }' "$counts_path")"
rm -f "$counts_path"

cat > "${host_path}.json" <<JSON
{
  "created_at": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "project_ref": "${HOSTED_PROJECT_REF}",
  "host": "${HOSTED_DB_HOST}",
  "server": "${server_info}",
  "schemas": "${schemas}",
  "dump_file": "${file_name}",
  "dump_bytes": ${dump_bytes},
  "sha256": "${dump_sha}",
  "attempts": ${attempt},
  "table_data_entries": ${table_data_count},
  "row_counts": "exact, counted from the archive's COPY blocks",
  "public_row_counts": {
${public_counts}
  },
  "other_row_counts": {
${other_counts}
  }
}
JSON

# Weekly copy, one per ISO week, made as a HARD LINK: it costs no extra bytes
# while the daily still exists, and keeps the data alive once the daily rotates
# out. Gives ~4 weeks of depth for the price of the dailies.
week_stamp="$(date -u +%GW%V)"
if [ -z "$(find "$weekly_dir" -maxdepth 1 -name "db-hosted-*-${week_stamp}-*.dump" -type f 2>/dev/null)" ]; then
  weekly_path="${weekly_dir}/db-hosted-${HOSTED_PROJECT_REF}-${week_stamp}-${timestamp}.dump"
  ln "$host_path" "$weekly_path" 2>/dev/null || cp "$host_path" "$weekly_path"
  cp "${host_path}.json" "${weekly_path}.json"
  echo "weekly copy: ${weekly_path}" >&2
fi

# Rotation. Avoid mapfile/readarray (bash 4+) so this still runs on stock macOS
# bash 3.2 — otherwise a successful dump exits non-zero and every `set -e`
# caller treats the backup as failed.
rotate_dir() {
  local dir="$1" retain="$2"
  [[ "$retain" =~ ^[0-9]+$ ]] || return 0
  [ "$retain" -gt 0 ] || return 0
  find "$dir" -maxdepth 1 -name 'db-hosted-*.dump' -type f | sort -r | tail -n +"$((retain + 1))" |
    while IFS= read -r old_backup; do
      if [ -n "$old_backup" ]; then
        rm -f "$old_backup" "${old_backup}.json"
      fi
    done
}
rotate_dir "$backup_dir" "$keep"
rotate_dir "$weekly_dir" "$weekly_keep"

echo "hosted backup complete: ${dump_bytes} bytes, ${table_data_count} table-data entries, verified end to end, attempt ${attempt}/${attempts}" >&2
echo "$host_path"
