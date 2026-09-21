#!/usr/bin/env bash
set -euo pipefail

# Restore a hosted dump back into the HOSTED (production) Supabase database.
#
# The most destructive script in the repo: a full restore drops and recreates
# every object in the target schema. It therefore writes nothing unless given
# --confirm <project-ref> matching the resolved target, and it takes its own
# safety dump of the current state first.
#
# Without --confirm it is a PLAN: the target, the dump, how the dump's tables
# compare with the live schema, what it would keep, and row counts now versus in
# the dump. Nothing changes. Always start there.
#
# Usage:
#   scripts/db-restore-hosted.sh <dump-file> [options]
#
#   --list                     Show the dump's contents and exit (no DB connection)
#   --table <name>             Restore only this public table's rows (repeatable)
#   --truncate-first           Empty the --table targets first, in the same transaction
#   --schema-only              Restore DDL only
#   --data-only                Restore data only
#   --include-auth             Also restore the auth schema (see warning below)
#   --include-storage          Also restore the storage schema (see warning below)
#   --allow-schema-rollback    Let a full restore proceed although tables differ
#                              from the live schema (see Schema drift)
#   --no-single-transaction    Carry on past errors instead of rolling back
#   --no-pre-dump              Skip the safety dump of the current state
#   --allow-different-project  Permit restoring a dump into a DIFFERENT project
#                              than it came from. Needed for real disaster recovery
#                              into a freshly created project; blocked otherwise so
#                              a stray dump cannot overwrite the wrong database.
#   --confirm <project-ref>    Actually write. Must equal the resolved target ref.
#
# Exit codes: 0 done (or planned), 3 restored but row counts differ from the
# dump, 64 bad usage, 65 refused, 66 unreadable dump, other = the failing step.
#
# Why auth/storage are opt-in: the dump contains them, but auth.* is owned by
# supabase_auth_admin and storage.* by supabase_storage_admin. Dropping and
# recreating those as the postgres role can leave GoTrue or the storage API
# broken, and storage.objects rows are only metadata — the files themselves live
# in the Storage API, which database backups do not cover. public alone holds the
# irreplaceable content, so it is the default.
#
# One transaction: by default the whole restore commits or none of it does. An
# error half way through a full restore would otherwise leave production with
# some tables dropped and recreated and the rest untouched.
#
# Schema drift: a dump holds the schema from the night it was taken. Once a
# migration changes a table (0061 moved user_watched onto link_id), an older dump
# no longer fits: its rows cannot load, and a full restore quietly puts the table
# back to its old shape, undoing the migration while the app still expects it.
# A table restore therefore refuses when the rows cannot load, and a full restore
# refuses when anything differs, unless --allow-schema-rollback says undoing
# those migrations is the point (re-apply the newer ones afterwards).
#
# Kept live: --clean drops each public object before recreating it, and Postgres
# refuses to drop a function that something OUTSIDE the restore depends on — the
# auth.users trigger from 0008, the event trigger from 0062. Those functions are
# left out and keep their live definition; the plan names them.

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
allow_schema_rollback=0
single_transaction=1
tables=""

while [ "$#" -gt 0 ]; do
  case "$1" in
    --list) list_only=1; shift ;;
    --table)
      [ "$#" -ge 2 ] || { echo "--table needs a table name" >&2; exit 64; }
      tables="${tables} $2"; shift 2 ;;
    --truncate-first) truncate_first=1; shift ;;
    --schema-only) schema_only=1; shift ;;
    --data-only) data_only=1; shift ;;
    --include-auth) include_auth=1; shift ;;
    --include-storage) include_storage=1; shift ;;
    --allow-schema-rollback) allow_schema_rollback=1; shift ;;
    --no-single-transaction) single_transaction=0; shift ;;
    --no-pre-dump) pre_dump=0; shift ;;
    --allow-different-project) allow_different_project=1; shift ;;
    --confirm)
      [ "$#" -ge 2 ] || { echo "--confirm needs the project ref" >&2; exit 64; }
      confirm_ref="$2"; shift 2 ;;
    -h|--help) awk 'NR > 2 && /^#/ { sub(/^# ?/, ""); print; next } NR > 2 { exit }' "$0"; exit 0 ;;
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

# Table names end up inside SQL and awk patterns.
for table in $tables; do
  case "$table" in
    *[!a-z0-9_]*) echo "Invalid table name: ${table}" >&2; exit 64 ;;
  esac
done

if [ "$truncate_first" -eq 1 ] && [ -z "$tables" ]; then
  echo "--truncate-first only applies together with --table" >&2
  exit 64
fi

hosted_db_require_bin pg_restore

work_dir="$(mktemp -d "${TMPDIR:-/tmp}/db-restore-hosted.XXXXXX")"
if [ "${DB_RESTORE_KEEP_WORKDIR:-0}" = "1" ]; then
  echo "work dir kept: ${work_dir}" >&2
else
  trap 'rm -rf "$work_dir"' EXIT
fi

# --- dump integrity, before anything else ------------------------------------
if ! toc="$(pg_restore -l "$dump_path" 2>&1)"; then
  echo "Not a readable custom-format dump: ${dump_path}" >&2
  echo "$toc" >&2
  exit 66
fi

manifest="${dump_path}.json"
dump_ref=""
dump_taken=""
counts_exact=0
if [ -f "$manifest" ]; then
  dump_ref="$(sed -n 's/.*"project_ref"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' "$manifest" | head -1)"
  dump_taken="$(sed -n 's/.*"created_at"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' "$manifest" | head -1)"
  if grep -q '"row_counts"[[:space:]]*:[[:space:]]*"exact' "$manifest"; then
    counts_exact=1
  fi
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

psql_query() {
  PGPASSWORD="$HOSTED_DB_PASSWORD" psql "$HOSTED_DB_URL_ARGV" -X -A -t -F'|' -v ON_ERROR_STOP=1 -c "$1" 2> >(hosted_db_scrub >&2)
}

# Exact counts, not pg_stat estimates: a freshly restored table reports 0 live
# tuples until ANALYZE runs, which is the worst moment to show a misleading 0.
exact_counts() {
  psql_query "select c.relname,
      (xpath('/row/n/text()', query_to_xml(format('select count(*) as n from public.%I', c.relname), false, true, '')))[1]::text
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind in ('r', 'p')
    order by 1;"
}

# The manifest's public_row_counts block, written by db-backup-hosted.sh.
manifest_counts() {
  [ -f "$manifest" ] || return 0
  awk '
    /"public_row_counts"[[:space:]]*:[[:space:]]*\{/ { inside = 1; next }
    inside && /^[[:space:]]*\}/ { exit }
    inside { line = $0; gsub(/[",[:space:]]/, "", line); split(line, kv, ":"); if (kv[1] != "") print kv[1] "|" kv[2] }
  ' "$manifest"
}

# $1 = live counts file, $2 = column header. Limited to --table targets if any.
print_counts() {
  awk -F'|' -v tables="$tables" -v header="$2" '
    BEGIN { n = split(tables, want, " "); for (i = 1; i <= n; i++) keep[want[i]] = 1 }
    FILENAME == ARGV[1] { dump[$1] = $2; next }
    n == 0 || ($1 in keep) { rows[$1] = $2; order[++k] = $1 }
    END {
      printf "    %-34s %10s %10s\n", "table", header, "in dump"
      for (i = 1; i <= k; i++) {
        t = order[i]
        d = (t in dump) ? dump[t] : "-"
        printf "    %-34s %10s %10s%s\n", t, rows[t], d, (d != "-" && d != rows[t]) ? "   differs" : ""
      }
    }' "${work_dir}/dump_counts" "$1"
}

# --- what to restore ------------------------------------------------------------
restore_mode="full"
[ -z "$tables" ] || restore_mode="tables"

scope_schemas="public"
if [ "$include_auth" -eq 1 ]; then scope_schemas="${scope_schemas} auth"; fi
if [ "$include_storage" -eq 1 ]; then scope_schemas="${scope_schemas} storage"; fi

restore_args="--no-owner --no-privileges"
if [ "$restore_mode" = "tables" ]; then
  restore_args="${restore_args} --schema=public"
  for table in $tables; do
    restore_args="${restore_args} --table=${table}"
  done
  # The definition normally still exists; it is the rows that were lost.
  if [ "$schema_only" -eq 0 ]; then restore_args="${restore_args} --data-only"; fi
else
  for schema in $scope_schemas; do
    restore_args="${restore_args} --schema=${schema}"
  done
  if [ "$data_only" -eq 1 ]; then
    restore_args="${restore_args} --data-only"
  else
    # --clean --if-exists drops each object before recreating it, so a restore
    # over a live database replaces rather than collides.
    restore_args="${restore_args} --clean --if-exists"
  fi
  if [ "$schema_only" -eq 1 ]; then restore_args="${restore_args} --schema-only"; fi
fi

# Does this restore load rows into tables as they exist live, or recreate them?
loads_into_live=0
recreates_objects=0
if [ "$restore_mode" = "tables" ] || [ "$data_only" -eq 1 ]; then
  loads_into_live=1
else
  recreates_objects=1
fi

# --- schema drift ---------------------------------------------------------------
# The dump's side comes from its COPY headers, which list each table's columns
# exactly as its rows will load. Reading them streams the archive (seconds).
if ! pg_restore --data-only --schema=public -f - "$dump_path" 2>/dev/null \
    | sed -n -E 's/^COPY public\.([^ ]+) \((.*)\) FROM stdin;$/\1|\2/p' \
    | tr -d '" ' > "${work_dir}/dump_columns"; then
  echo "Cannot read the dump's data section: ${dump_path}" >&2
  exit 66
fi

if [ "$restore_mode" = "tables" ]; then
  : > "${work_dir}/dump_columns.scoped"
  for table in $tables; do
    if ! grep "^${table}|" "${work_dir}/dump_columns" >> "${work_dir}/dump_columns.scoped"; then
      echo "Table '${table}' is not in this dump." >&2
      exit 66
    fi
  done
  mv "${work_dir}/dump_columns.scoped" "${work_dir}/dump_columns"
fi

psql_query "select c.relname,
    string_agg(a.attname, ',' order by a.attnum),
    coalesce(string_agg(a.attname, ',' order by a.attnum)
      filter (where a.attnotnull and not a.atthasdef and a.attidentity = ''), '')
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  join pg_attribute a on a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped and a.attgenerated = ''
  where n.nspname = 'public' and c.relkind in ('r', 'p')
  group by c.relname
  order by 1;" > "${work_dir}/live_columns"

full_flag=0
[ "$restore_mode" = "tables" ] || full_flag=1
awk -F'|' -v full="$full_flag" '
  FILENAME == ARGV[1] { dump[$1] = $2; next }
  { live[$1] = $2; required[$1] = $3 }
  END {
    for (t in dump) {
      if (!(t in live)) { print "DUMP_ONLY|" t; continue }
      split("", in_live); split("", in_dump)
      nd = split(dump[t], dcols, ","); nl = split(live[t], lcols, ",")
      for (i = 1; i <= nl; i++) in_live[lcols[i]] = 1
      for (i = 1; i <= nd; i++) in_dump[dcols[i]] = 1
      dump_only = ""; live_only = ""; missing = ""
      for (i = 1; i <= nd; i++) if (!(dcols[i] in in_live)) dump_only = dump_only (dump_only == "" ? "" : ",") dcols[i]
      for (i = 1; i <= nl; i++) if (!(lcols[i] in in_dump)) live_only = live_only (live_only == "" ? "" : ",") lcols[i]
      nr = split(required[t], rcols, ",")
      for (i = 1; i <= nr; i++) if (rcols[i] != "" && !(rcols[i] in in_dump)) missing = missing (missing == "" ? "" : ",") rcols[i]
      if (dump_only == "" && live_only == "") print "SAME|" t
      else print "DIFF|" t "|" dump_only "|" live_only "|" missing
    }
    if (full == 1) for (t in live) if (!(t in dump)) print "LIVE_ONLY|" t
  }' "${work_dir}/dump_columns" "${work_dir}/live_columns" | sort -t'|' -k2 > "${work_dir}/drift"

blocked=""
drift_report=""
while IFS='|' read -r kind table dump_only live_only missing; do
  case "$kind" in
    SAME) ;;
    DUMP_ONLY)
      if [ "$loads_into_live" -eq 1 ]; then
        drift_report="${drift_report}    ${table}: does not exist live, so its rows have nowhere to load\n"
        blocked="rows for ${table} cannot load"
      else
        drift_report="${drift_report}    ${table}: in the dump but not live — will be created\n"
      fi ;;
    LIVE_ONLY)
      if [ "$recreates_objects" -eq 1 ]; then
        drift_report="${drift_report}    ${table}: exists live but not in the dump — left as it is; a foreign key it holds into a restored table would block the restore\n"
        if [ "$allow_schema_rollback" -eq 0 ]; then blocked="the live schema has changed since this dump was taken"; fi
      fi ;;
    DIFF)
      if [ -n "$live_only" ]; then drift_report="${drift_report}    ${table}: live has columns the dump lacks: ${live_only}\n"; fi
      if [ -n "$dump_only" ]; then drift_report="${drift_report}    ${table}: the dump has columns live lacks: ${dump_only}\n"; fi
      if [ "$loads_into_live" -eq 1 ]; then
        if [ -n "$missing" ]; then drift_report="${drift_report}    ${table}: live requires columns the dump cannot fill: ${missing}\n"; fi
        if [ -n "$dump_only" ] || [ -n "$missing" ]; then blocked="rows for ${table} cannot load into its current shape"; fi
      elif [ "$allow_schema_rollback" -eq 0 ]; then
        blocked="the live schema has changed since this dump was taken"
      fi ;;
  esac
done < "${work_dir}/drift"

drift_total="$(wc -l < "${work_dir}/drift" | tr -d ' ')"
drift_same="$(grep -c '^SAME|' "${work_dir}/drift" || true)"

# --- functions that must keep their live definition -----------------------------
: > "${work_dir}/pinned"
if [ "$recreates_objects" -eq 1 ]; then
  scope_sql="array[$(for s in $scope_schemas; do printf "'%s'," "$s"; done | sed 's/,$//')]"
  psql_query "select distinct p.proname || '|' || pg_describe_object(d.classid, d.objid, d.objsubid)
    from pg_depend d
    join pg_proc p on d.refclassid = 'pg_proc'::regclass and p.oid = d.refobjid
    join pg_namespace pn on pn.oid = p.pronamespace and pn.nspname = 'public'
    where d.deptype in ('n', 'a')
      and (
        d.classid = 'pg_event_trigger'::regclass
        or (d.classid = 'pg_trigger'::regclass and exists (
          select 1 from pg_trigger o join pg_class c on c.oid = o.tgrelid join pg_namespace n on n.oid = c.relnamespace
          where o.oid = d.objid and n.nspname::text <> all (${scope_sql})))
        or (d.classid = 'pg_policy'::regclass and exists (
          select 1 from pg_policy o join pg_class c on c.oid = o.polrelid join pg_namespace n on n.oid = c.relnamespace
          where o.oid = d.objid and n.nspname::text <> all (${scope_sql})))
        or (d.classid = 'pg_constraint'::regclass and exists (
          select 1 from pg_constraint o join pg_class c on c.oid = o.conrelid join pg_namespace n on n.oid = c.relnamespace
          where o.oid = d.objid and n.nspname::text <> all (${scope_sql})))
        or (d.classid = 'pg_attrdef'::regclass and exists (
          select 1 from pg_attrdef o join pg_class c on c.oid = o.adrelid join pg_namespace n on n.oid = c.relnamespace
          where o.oid = d.objid and n.nspname::text <> all (${scope_sql})))
        or (d.classid = 'pg_rewrite'::regclass and exists (
          select 1 from pg_rewrite o join pg_class c on c.oid = o.ev_class join pg_namespace n on n.oid = c.relnamespace
          where o.oid = d.objid and n.nspname::text <> all (${scope_sql})))
        or (d.classid = 'pg_proc'::regclass and exists (
          select 1 from pg_proc o join pg_namespace n on n.oid = o.pronamespace
          where o.oid = d.objid and n.nspname::text <> all (${scope_sql})))
      )
    order by 1;" > "${work_dir}/pinned"
fi
pinned_names="$(cut -d'|' -f1 "${work_dir}/pinned" | sort -u | tr '\n' ' ')"
if [ -n "${pinned_names// /}" ]; then
  # A ';' at the start of a TOC line tells pg_restore to skip that entry.
  pg_restore -l "$dump_path" | awk -v names="$pinned_names" '
    BEGIN { n = split(names, list, " ") }
    {
      for (i = 1; i <= n; i++)
        if (index($0, " FUNCTION public " list[i] "(") > 0) { print ";" $0; next }
      print
    }' > "${work_dir}/restore.list"
  restore_args="${restore_args} --use-list=${work_dir}/restore.list"
fi

# --- the plan ---------------------------------------------------------------------
if [ "$restore_mode" = "tables" ]; then
  scope_desc="rows of public:${tables}"
else
  scope_desc="schema $(echo $scope_schemas | tr ' ' ',')"
fi
if [ "$data_only" -eq 1 ]; then scope_desc="${scope_desc} (data only)"; fi
if [ "$schema_only" -eq 1 ]; then scope_desc="${scope_desc} (schema only)"; fi
if [ "$single_transaction" -eq 1 ]; then
  txn_desc="one transaction: commits whole or changes nothing"
else
  txn_desc="NO transaction: carries on past errors (--no-single-transaction)"
fi

echo "" >&2
echo "  target project : ${HOSTED_PROJECT_REF}  (${HOSTED_DB_HOST}:${HOSTED_DB_PORT})" >&2
echo "  dump           : ${dump_path}" >&2
echo "  dump taken     : ${dump_ref:-unknown project} ${dump_taken}" >&2
echo "  restore scope  : ${scope_desc}" >&2
echo "  transaction    : ${txn_desc}" >&2
if [ "$truncate_first" -eq 1 ]; then
  echo "  truncate first :${tables} (same transaction, no CASCADE)" >&2
fi
if [ -s "${work_dir}/pinned" ]; then
  echo "  kept live      : functions something outside the restore depends on" >&2
  while IFS='|' read -r fn dependent; do
    echo "    public.${fn} — needed by ${dependent}" >&2
  done < "${work_dir}/pinned"
fi
if [ -z "$drift_report" ]; then
  if [ "$drift_total" -eq 1 ]; then
    echo "  schema drift   : none — the table in scope matches the live database" >&2
  else
    echo "  schema drift   : none — all ${drift_total} tables in scope match the live database" >&2
  fi
else
  echo "  schema drift   : $((drift_total - drift_same)) of ${drift_total} tables differ from the live database" >&2
  printf '%b' "$drift_report" >&2
fi
echo "" >&2

manifest_counts > "${work_dir}/dump_counts"
exact_counts > "${work_dir}/live_counts_before"
if [ "$counts_exact" -eq 1 ]; then
  echo "  row counts, live now (exact) vs in the dump (exact):" >&2
else
  echo "  row counts, live now (exact) vs in the dump (planner estimates — an older manifest):" >&2
fi
print_counts "${work_dir}/live_counts_before" "live now" >&2
echo "" >&2

if [ -n "$blocked" ]; then
  echo "REFUSED: ${blocked}." >&2
  if [ "$loads_into_live" -eq 1 ]; then
    echo "Use a dump taken after the schema change, or restore into a scratch database and transform the rows." >&2
  else
    echo "Use a dump taken after the last migration, or pass --allow-schema-rollback to put these tables back to" >&2
    echo "the dump's shape on purpose — then re-apply every migration newer than ${dump_taken:-the dump}." >&2
  fi
  exit 65
fi

if [ -z "$confirm_ref" ]; then
  echo "PLAN ONLY — nothing was changed." >&2
  echo "Re-run with --confirm ${HOSTED_PROJECT_REF} to actually restore." >&2
  exit 0
fi

if [ "$confirm_ref" != "$HOSTED_PROJECT_REF" ]; then
  echo "Refusing to run: --confirm '${confirm_ref}' does not match the target project '${HOSTED_PROJECT_REF}'." >&2
  exit 65
fi

# --- write --------------------------------------------------------------------------
safety_path=""
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

# Build the whole script first and only then execute it. Piping pg_restore
# straight into psql would let a pg_restore failure half way look like the end of
# input — and psql commits a --single-transaction run when its input ends.
sql_file="${work_dir}/restore.sql"
: > "$sql_file"
chmod 600 "$sql_file"
if [ "$truncate_first" -eq 1 ]; then
  for table in $tables; do
    # No CASCADE: emptying one table must never silently empty the tables that
    # reference it. Postgres refuses instead, and the transaction rolls back.
    echo "truncate table public.${table};" >> "$sql_file"
  done
fi
# shellcheck disable=SC2086
if ! pg_restore $restore_args -f - "$dump_path" >> "$sql_file" 2> >(hosted_db_scrub >&2); then
  echo "pg_restore could not produce the restore script; nothing was changed." >&2
  exit 1
fi

echo "Restoring into ${HOSTED_PROJECT_REF} (${txn_desc})..." >&2
psql_args="-X -q"
if [ "$single_transaction" -eq 1 ]; then
  psql_args="${psql_args} --single-transaction -v ON_ERROR_STOP=1"
fi
set +e
# shellcheck disable=SC2086
PGPASSWORD="$HOSTED_DB_PASSWORD" psql "$HOSTED_DB_URL_ARGV" $psql_args -f "$sql_file" 2>&1 | hosted_db_scrub >&2
restore_exit="${PIPESTATUS[0]}"
set -e
rm -f "$sql_file"

if [ "$restore_exit" -ne 0 ]; then
  if [ "$single_transaction" -eq 1 ]; then
    echo "Restore FAILED and was rolled back: the database is exactly as it was before." >&2
  else
    echo "Restore finished WITH ERRORS and without a transaction, so part of it applied." >&2
  fi
  [ -z "$safety_path" ] || echo "Safety dump of the pre-restore state: ${safety_path}" >&2
  exit "$restore_exit"
fi

exact_counts > "${work_dir}/live_counts_after"
echo "" >&2
echo "  row counts after the restore (exact) vs the dump:" >&2
print_counts "${work_dir}/live_counts_after" "live now" >&2

read -r bad total <<< "$(awk -F'|' -v tables="$tables" '
  BEGIN { n = split(tables, want, " "); for (i = 1; i <= n; i++) keep[want[i]] = 1 }
  FILENAME == ARGV[1] { dump[$1] = $2; next }
  (n == 0 || ($1 in keep)) && ($1 in dump) { total++; if (dump[$1] != $2) bad++ }
  END { printf "%d %d\n", bad, total }' "${work_dir}/dump_counts" "${work_dir}/live_counts_after")"

echo "" >&2
if [ "$bad" -eq 0 ]; then
  echo "Restore verified: all ${total} tables in scope hold exactly the dump's row counts." >&2
  exit 0
fi
echo "Restore committed, but ${bad} of ${total} tables differ from the dump's row counts." >&2
echo "Expected only for tables written since the restore, for rows loaded into a table that" >&2
echo "already had some, or when the dump's counts are estimates. Anything else: investigate." >&2
exit 3
