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
#   DB_BACKUP_VERIFY_FULL  1 = stream the whole archive through pg_restore to
#                          prove every block decompresses (slower; see below)

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

hosted_db_require_bin pg_dump
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

mkdir -p "$backup_dir" "$weekly_dir"

schema_args=""
for schema in $schemas; do
  schema_args="${schema_args} --schema=${schema}"
done

# --no-owner/--no-privileges: Supabase owns auth.* and storage.* with roles that
# do not exist outside the project, so a dump that preserves them cannot be
# restored into a fresh project. Ownership is re-established by the migrations.
# shellcheck disable=SC2086
if ! PGPASSWORD="$HOSTED_DB_PASSWORD" pg_dump "$HOSTED_DB_URL_ARGV" \
  --format=custom \
  --compress="$compress" \
  --no-owner \
  --no-privileges \
  $schema_args \
  --file "$tmp_path" 2> >(hosted_db_scrub >&2); then
  rm -f "$tmp_path"
  echo "pg_dump failed; no backup written" >&2
  exit 1
fi

# A dump is only a backup once it is known to be readable. pg_restore -l parses
# the archive's table of contents, which catches a truncated or corrupt file —
# the failure mode that otherwise stays invisible until a real restore.
if ! toc="$(pg_restore -l "$tmp_path" 2>&1)"; then
  rm -f "$tmp_path"
  echo "Dump failed verification (pg_restore -l could not read it); discarded" >&2
  exit 1
fi
table_data_count="$(printf '%s\n' "$toc" | grep -c 'TABLE DATA' || true)"
if [ "$table_data_count" -eq 0 ]; then
  rm -f "$tmp_path"
  echo "Dump contains no TABLE DATA entries; discarded as empty" >&2
  exit 1
fi

# Optional deep check: pg_restore -f - streams every block through the
# decompressor, so it detects corruption the TOC scan cannot. Costs roughly the
# dump time again, which is why it is opt-in rather than nightly.
if [ "${DB_BACKUP_VERIFY_FULL:-0}" = "1" ]; then
  if ! pg_restore -f /dev/null "$tmp_path" 2>&1 | hosted_db_scrub >&2; then
    rm -f "$tmp_path"
    echo "Dump failed full verification; discarded" >&2
    exit 1
  fi
  echo "full archive verification passed" >&2
fi

mv "$tmp_path" "$host_path"

# Row counts are the restore-time answer to "did everything come back?".
# psql emits plain name|count pairs; awk does the JSON quoting, which keeps the
# SQL free of the backslash-escaping that a quoted -c string would need.
row_counts="$(PGPASSWORD="$HOSTED_DB_PASSWORD" psql "$HOSTED_DB_URL_ARGV" -X -A -t -F'|' -c "
  select c.relname, coalesce(s.n_live_tup, 0)
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  left join pg_stat_user_tables s on s.relid = c.oid
  where n.nspname = 'public' and c.relkind = 'r'
  order by c.relname;" 2>/dev/null |
  awk -F'|' 'NF == 2 { printf "%s    \"%s\": %s", sep, $1, $2; sep = ",\n" } END { printf "\n" }')"

dump_bytes="$(wc -c < "$host_path" | tr -d ' ')"
dump_sha="$(shasum -a 256 "$host_path" | awk '{print $1}')"

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
  "table_data_entries": ${table_data_count},
  "public_row_counts": {
${row_counts}
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

echo "hosted backup complete: ${dump_bytes} bytes, ${table_data_count} table-data entries" >&2
echo "$host_path"
