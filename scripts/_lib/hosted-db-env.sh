#!/usr/bin/env bash
# Shared resolver for the HOSTED (production) Supabase Postgres connection.
#
# Sourced by scripts/db-backup-hosted.sh and scripts/db-restore-hosted.sh. It is
# deliberately NOT executable on its own: it only defines functions and exports.
#
# Two jobs:
#   1. Derive the hosted connection the same way scripts/run-collection.mjs does
#      (COLLECT_DB_URL wins; otherwise build the pooler URL from
#      SUPABASE_DB_PASSWORD + the project ref in SUPABASE_URL).
#   2. Refuse to proceed unless the resolved target really is remote Supabase.
#      Backup and restore both read/write production; pointing either of them at
#      the local Docker Postgres by accident would silently back up an empty dev
#      database, or — far worse on restore — write dev rows over production.
#
# Keep this bash 3.2 compatible: stock macOS ships bash 3.2 and launchd runs it.

# Local Supabase (supabase/config.toml) binds the DB on 54322. Anything on that
# port, or on a loopback host, is dev — never a valid target here.
HOSTED_LOCAL_DB_PORT="54322"

hosted_db_source_env_file() {
  local env_file="$1"
  local required="${2:-required}"
  if [ -f "$env_file" ]; then
    set -o allexport
    # shellcheck source=/dev/null
    . "$env_file"
    set +o allexport
  elif [ "$required" = "required" ]; then
    echo "Env file not found at ${env_file}." >&2
    return 64
  fi
  return 0
}

# Percent-decode a URL component (only used when SUPABASE_DB_PASSWORD is absent
# and the password has to come back out of COLLECT_DB_URL).
hosted_db_urldecode() {
  local value="$1"
  printf '%b' "${value//%/\\x}"
}

hosted_db_ref_from_supabase_url() {
  local url="${1:-}"
  [ -n "$url" ] || return 0
  # https://<ref>.supabase.co  ->  <ref>
  local host="${url#*://}"
  host="${host%%/*}"
  case "$host" in
    *.supabase.co|*.supabase.com) printf '%s' "${host%%.*}" ;;
    *) return 0 ;;
  esac
}

# Resolves and validates the hosted connection. On success exports:
#   HOSTED_DB_URL_ARGV  connection URL with the password stripped (safe for argv)
#   HOSTED_DB_PASSWORD  the password, to be passed via PGPASSWORD only
#   HOSTED_DB_HOST / HOSTED_DB_PORT / HOSTED_PROJECT_REF
hosted_db_resolve() {
  hosted_db_source_env_file "${COLLECT_HOSTED_ENV_FILE:-.env.hosted}" || return $?

  local url="${COLLECT_DB_URL:-}"
  local ref
  ref="$(hosted_db_ref_from_supabase_url "${SUPABASE_URL:-}")"

  if [ -z "$url" ]; then
    if [ -z "${SUPABASE_DB_PASSWORD:-}" ]; then
      echo "Need COLLECT_DB_URL or SUPABASE_DB_PASSWORD in ${COLLECT_HOSTED_ENV_FILE:-.env.hosted}." >&2
      return 64
    fi
    if [ -z "$ref" ]; then
      echo "Cannot derive the project ref: SUPABASE_URL is missing or not a supabase.co/.com URL." >&2
      return 64
    fi
    local pooler_host="${COLLECT_DB_POOLER_HOST:-aws-1-ap-southeast-2.pooler.supabase.com}"
    local pooler_port="${COLLECT_DB_POOLER_PORT:-5432}"
    url="postgresql://postgres.${ref}:${SUPABASE_DB_PASSWORD}@${pooler_host}:${pooler_port}/postgres"
  fi

  # Split on the LAST '@' so an unencoded '@' inside the password cannot shift
  # the host boundary.
  local after_scheme="${url#*://}"
  local userinfo="" hostpart="$after_scheme"
  case "$after_scheme" in
    *@*)
      userinfo="${after_scheme%@*}"
      hostpart="${after_scheme##*@}"
      ;;
  esac

  local user="$userinfo" password=""
  case "$userinfo" in
    *:*)
      user="${userinfo%%:*}"
      password="${userinfo#*:}"
      ;;
  esac

  local hostport="${hostpart%%/*}"
  local host="${hostport%%:*}"
  local port="5432"
  case "$hostport" in
    *:*) port="${hostport##*:}" ;;
  esac

  # Prefer the raw password from the env file; only fall back to decoding the one
  # embedded in COLLECT_DB_URL, which is percent-encoded when built by
  # run-collection.mjs (encodeURIComponent).
  if [ -n "${SUPABASE_DB_PASSWORD:-}" ]; then
    password="$SUPABASE_DB_PASSWORD"
  elif [ -n "$password" ]; then
    password="$(hosted_db_urldecode "$password")"
  fi

  # --- production guards -----------------------------------------------------
  case "$host" in
    localhost|127.0.0.1|0.0.0.0|::1|"")
      echo "Refusing to run: resolved host '${host:-<empty>}' is local, not hosted Supabase." >&2
      return 65
      ;;
  esac

  case "$host" in
    *.supabase.co|*.supabase.com) ;;
    *)
      echo "Refusing to run: host '${host}' is not a supabase.co/.com address." >&2
      echo "Set HOSTED_DB_ALLOW_ANY_HOST=1 only if you have deliberately moved off Supabase." >&2
      [ "${HOSTED_DB_ALLOW_ANY_HOST:-0}" = "1" ] || return 65
      ;;
  esac

  if [ "$port" = "$HOSTED_LOCAL_DB_PORT" ]; then
    echo "Refusing to run: port ${port} is the local Supabase Postgres port." >&2
    return 65
  fi

  # The pooler user carries the project ref as 'postgres.<ref>'. When both that
  # and SUPABASE_URL give a ref, they must agree — a mismatch means the env file
  # is half-edited and points at two different projects.
  local user_ref=""
  case "$user" in
    postgres.*) user_ref="${user#postgres.}" ;;
  esac
  if [ -n "$user_ref" ] && [ -n "$ref" ] && [ "$user_ref" != "$ref" ]; then
    echo "Refusing to run: connection user ref '${user_ref}' != SUPABASE_URL ref '${ref}'." >&2
    return 65
  fi
  [ -n "$ref" ] || ref="$user_ref"
  if [ -z "$ref" ]; then
    echo "Refusing to run: could not determine the Supabase project ref for the target." >&2
    return 65
  fi

  # Rebuild without the password: `ps` shows argv to every local user, which is
  # how a connection string reached .collection/logs on 2026-08-13. The password
  # travels in PGPASSWORD instead (same rule as run-collection.mjs).
  local scheme="${url%%://*}"
  HOSTED_DB_URL_ARGV="${scheme}://${user}@${hostport}${hostpart#"$hostport"}"
  HOSTED_DB_PASSWORD="$password"
  HOSTED_DB_HOST="$host"
  HOSTED_DB_PORT="$port"
  HOSTED_PROJECT_REF="$ref"
  export HOSTED_DB_URL_ARGV HOSTED_DB_PASSWORD HOSTED_DB_HOST HOSTED_DB_PORT HOSTED_PROJECT_REF
  return 0
}

# Never let a connection string reach a log file, even inside an error message.
hosted_db_scrub() {
  sed -E -e 's#(postgres(ql)?://[^:/@ ]+):[^@ ]*@#\1:***@#g' -e 's#PGPASSWORD=[^ ]*#PGPASSWORD=***#g'
}

hosted_db_require_bin() {
  local bin="$1"
  if ! command -v "$bin" >/dev/null 2>&1; then
    echo "${bin} not found. Install libpq (brew install libpq) and make sure its bin dir is on PATH." >&2
    return 127
  fi
  return 0
}
