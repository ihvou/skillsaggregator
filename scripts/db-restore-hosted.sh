#!/usr/bin/env bash
set -euo pipefail

# Restore a hosted dump back into the HOSTED (production) Supabase database.
#
# This is the most destructive script in the repo: a full restore drops and
# recreates every object in the target schema. It therefore refuses to write
# anything unless you pass --confirm <project-ref> matching the resolved target,
# and it takes its own safety dump of the current state first.
#
# With no --confirm it runs as a PLAN: it shows the target, the dump, and the
# current row counts, and changes nothing. That is the intended way to start.
#
# Usage:
#   scripts/db-restore-hosted.sh <dump-file> [options]
#
#   --list                  Show the dump's contents and exit (no DB connection)
#   --table <name>          Restore only this table (repeatable; data-only)
#   --truncate-first        TRUNCATE the --table targets before loading them
#   --schema-only           Restore DDL only
#   --data-only             Restore data only
#   --include-auth          Also restore the auth schema (see warning below)
#   --include-storage       Also restore the storage schema (see warning below)
#   --no-pre-dump           Skip the safety dump of the current state
#   --allow-different-project  Permit restoring a dump into a DIFFERENT project
#                           than it came from. Needed for real disaster recovery
#                           into a freshly created project; blocked otherwise so
#                           a stray dump cannot overwrite the wrong database.
#   --confirm <project-ref> Actually write. Must equal the resolved target ref.
#
# Why auth/storage are opt-in: the dump contains them, but auth.* is owned by
# supabase_auth_admin and storage.* by supabase_storage_admin. Dropping and
# recreating those as the postgres role can leave GoTrue or the storage API
# broken, and storage.objects rows are only metadata — the files themselves live
# in the Storage API, which database backups do not cover. public alone holds the
# irreplaceable content, so it is the default.

export PATH="/opt/homebrew/opt/libpq/bin:/usr/local/opt/libpq/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:$PATH"

script_dir="$(cd "$(dirname "$0")" && pwd)"
cd "${script_dir}/.."

# Absolute path: `source` searches PATH before the working directory, so a bare
# relative path here is not reliable across shells.
# shellcheck source=scripts/_lib/hosted-db-env.sh
. "${script_dir}/_lib/hosted-db-env.sh"

dump_path=""
confirm_ref=""
list_only=0
truncate_first=0
schema_only=0
data_only=0
include_auth=0
include_storage=0
pre_dump=1
allow_different_project=0
tables=""

while [ "$#" -gt 0 ]; do
  case "$1" in
    --list) list_only=1; shift ;;
    --table) tables="${tables} $2"; shift 2 ;;
    --truncate-first) truncate_first=1; shift ;;
    --schema-only) schema_only=1; shift ;;
    --data-only) data_only=1; shift ;;
    --include-auth) include_auth=1; shift ;;
    --include-storage) include_storage=1; shift ;;
    --no-pre-dump) pre_dump=0; shift ;;
    --allow-different-project) allow_different_project=1; shift ;;
    --confirm) confirm_ref="$2"; shift 2 ;;
    -h|--help) sed -n '3,40p' "$0"; exit 0 ;;
    -*) echo "Unknown option: $1" >&2; exit 64 ;;
    *) dump_path="$1"; shift ;;
  esac
done

if [ -z "$dump_path" ]; then
  echo "Usage: scripts/db-restore-hosted.sh <dump-file> [--confirm <project-ref>]" >&2
  echo "Run with --help for the full option list." >&2
  exit 64
fi

if [ ! -f "$dump_path" ]; then
  echo "Dump file not found: ${dump_path}" >&2
  exit 66
fi

hosted_db_require_bin pg_restore

# --- dump integrity, before anything else ------------------------------------
if ! toc="$(pg_restore -l "$dump_path" 2>&1)"; then
  echo "Not a readable custom-format dump: ${dump_path}" >&2
  echo "$toc" >&2
  exit 66
fi

manifest="${dump_path}.json"
dump_ref=""
if [ -f "$manifest" ]; then
  dump_ref="$(sed -n 's/.*"project_ref"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' "$manifest" | head -1)"
  expected_sha="$(sed -n 's/.*"sha256"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' "$manifest" | head -1)"
  if [ -n "$expected_sha" ]; then
    actual_sha="$(shasum -a 256 "$dump_path" | awk '{print $1}')"
    if [ "$expected_sha" != "$actual_sha" ]; then
      echo "Checksum mismatch — this dump has been altered or truncated since it was written." >&2
      echo "  manifest: ${expected_sha}" >&2
      echo "  actual:   ${actual_sha}" >&2
      exit 66
    fi
    echo "dump checksum verified (sha256 matches manifest)" >&2
  fi
fi

if [ "$list_only" -eq 1 ]; then
  printf '%s\n' "$toc"
  exit 0
fi

hosted_db_require_bin pg_dump
hosted_db_require_bin psql
hosted_db_resolve

if [ -n "$dump_ref" ] && [ "$dump_ref" != "$HOSTED_PROJECT_REF" ]; then
  if [ "$allow_different_project" -eq 1 ]; then
    echo "WARNING: restoring a dump from project '${dump_ref}' into '${HOSTED_PROJECT_REF}'." >&2
    echo "WARNING: this is only correct for disaster recovery into a new project." >&2
  else
    echo "Refusing to run: dump was taken from project '${dump_ref}' but the target is '${HOSTED_PROJECT_REF}'." >&2
    echo "Pass --allow-different-project if this is a deliberate recovery into a new project." >&2
    exit 65
  fi
fi

# --- build the pg_restore argument list ---------------------------------------
restore_args="--no-owner --no-privileges"
scope_desc=""

if [ -n "$tables" ]; then
  for table in $tables; do
    restore_args="${restore_args} --table=${table}"
  done
  # A table-level restore is the common real recovery (one table lost to a bad
  # migration). Default it to data-only: the table definition normally still
  # exists, and a single transaction means a mid-load failure rolls back rather
  # than leaving the table half-populated.
  if [ "$schema_only" -eq 0 ]; then
    restore_args="${restore_args} --data-only"
  fi
  restore_args="${restore_args} --single-transaction"
  scope_desc="tables:${tables}"
else
  restore_args="${restore_args} --schema=public"
  [ "$include_auth" -eq 1 ] && restore_args="${restore_args} --schema=auth"
  [ "$include_storage" -eq 1 ] && restore_args="${restore_args} --schema=storage"
  # --clean --if-exists drops each object before recreating it, so a restore over
  # a live database replaces rather than collides.
  if [ "$data_only" -eq 0 ]; then
    restore_args="${restore_args} --clean --if-exists"
  fi
  scope_desc="schema:public"
  [ "$include_auth" -eq 1 ] && scope_desc="${scope_desc},auth"
  [ "$include_storage" -eq 1 ] && scope_desc="${scope_desc},storage"
fi

[ "$schema_only" -eq 1 ] && restore_args="${restore_args} --schema-only"
[ "$data_only" -eq 1 ] && [ -z "$tables" ] && restore_args="${restore_args} --data-only"

# --- show the plan -------------------------------------------------------------
echo "" >&2
echo "  target project : ${HOSTED_PROJECT_REF}  (${HOSTED_DB_HOST}:${HOSTED_DB_PORT})" >&2
echo "  dump           : ${dump_path}" >&2
echo "  dump taken     : ${dump_ref:-unknown project} $( [ -f "$manifest" ] && sed -n 's/.*"created_at"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' "$manifest" | head -1 )" >&2
echo "  restore scope  : ${scope_desc}" >&2
echo "  pg_restore     : ${restore_args}" >&2
echo "" >&2

current_counts="$(PGPASSWORD="$HOSTED_DB_PASSWORD" psql "$HOSTED_DB_URL_ARGV" -X -A -t -F'|' -c "
  select c.relname, coalesce(s.n_live_tup, 0)
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  left join pg_stat_user_tables s on s.relid = c.oid
  where n.nspname = 'public' and c.relkind = 'r'
  order by c.relname;" 2>&1 | hosted_db_scrub)"
echo "  current row counts in the TARGET (these are what a restore overwrites):" >&2
printf '%s\n' "$current_counts" | sed 's/^/    /' >&2
echo "" >&2

if [ -z "$confirm_ref" ]; then
  echo "PLAN ONLY — nothing was changed." >&2
  echo "Re-run with --confirm ${HOSTED_PROJECT_REF} to actually restore." >&2
  exit 0
fi

if [ "$confirm_ref" != "$HOSTED_PROJECT_REF" ]; then
  echo "Refusing to run: --confirm '${confirm_ref}' does not match the target project '${HOSTED_PROJECT_REF}'." >&2
  exit 65
fi

# --- safety dump of the current state ------------------------------------------
if [ "$pre_dump" -eq 1 ]; then
  echo "Taking a safety dump of the current state before restoring..." >&2
  if safety_path="$(bash scripts/db-backup-hosted.sh)"; then
    echo "safety dump: ${safety_path}" >&2
  else
    echo "Refusing to restore: the pre-restore safety dump failed." >&2
    echo "Pass --no-pre-dump only if you accept losing the current state." >&2
    exit 1
  fi
fi

if [ -n "$tables" ] && [ "$truncate_first" -eq 1 ]; then
  for table in $tables; do
    echo "TRUNCATE public.${table}" >&2
    PGPASSWORD="$HOSTED_DB_PASSWORD" psql "$HOSTED_DB_URL_ARGV" -X -v ON_ERROR_STOP=1 \
      -c "truncate table public.${table} cascade;" 2>&1 | hosted_db_scrub >&2
  done
fi

echo "Restoring into ${HOSTED_PROJECT_REF}..." >&2
set +e
# shellcheck disable=SC2086
PGPASSWORD="$HOSTED_DB_PASSWORD" pg_restore $restore_args \
  --dbname "$HOSTED_DB_URL_ARGV" "$dump_path" 2>&1 | hosted_db_scrub >&2
restore_exit="${PIPESTATUS[0]}"
set -e

# pg_restore exits non-zero on ignorable "does not exist" noise from --clean, so
# the row counts below are the real verdict, not this exit code alone.
echo "pg_restore exit code: ${restore_exit}" >&2

echo "" >&2
echo "  row counts AFTER restore:" >&2
PGPASSWORD="$HOSTED_DB_PASSWORD" psql "$HOSTED_DB_URL_ARGV" -X -A -t -F'|' -c "
  select c.relname, coalesce(s.n_live_tup, 0)
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  left join pg_stat_user_tables s on s.relid = c.oid
  where n.nspname = 'public' and c.relkind = 'r'
  order by c.relname;" 2>&1 | hosted_db_scrub | sed 's/^/    /' >&2

echo "" >&2
echo "Restore finished. Freshly restored tables report 0 rows until ANALYZE runs;" >&2
echo "run 'analyze;' or compare with select count(*) if a number looks wrong." >&2

exit "$restore_exit"
