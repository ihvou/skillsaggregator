# Database backup & restore (hosted / production)

Production is the **hosted** Supabase project `vqxsaabskkkjdljxiyqi` (ap-southeast-2,
Postgres 17.6, ~232 MB). It is the single source of truth — the local Docker
Postgres is dev only.

**Supabase takes no automated backups of this project on the Free plan.** Their
docs tell Free-plan projects to export their own data and keep off-site copies.
Pro adds 7 daily backups, Team 14, Enterprise 30; PITR is a paid add-on. Until
the project is on a paid plan, the dumps described here are the *only* backups
that exist.

`scripts/db-backup.sh` / `scripts/db-restore.sh` are the **local Docker**
equivalents. They do not touch production. Use the `-hosted` scripts below.

## What runs automatically

`scripts/nightly-collect.sh` takes a dump **before** each nightly collection run
(03:00, launchd `com.skillsaggregator.collection`). It is a safety net, not a
gate: a failed backup logs a WARNING and collection continues.

Set `COLLECT_SKIP_BACKUP=1` to skip it for a one-off run.

## Taking a backup by hand

```bash
npm run db:backup:hosted
```

Roughly 3.5 minutes and ~74 MB. Prints the dump path on stdout; diagnostics go
to stderr.

| | |
|---|---|
| Location | `.collection/backups/hosted/` (gitignored) |
| Weekly copies | `.collection/backups/hosted/weekly/` |
| Retention | 7 daily + 4 weekly ≈ 815 MB |
| Format | pg_dump custom (`-Fc`), compression level 6 |
| Schemas | `public`, `auth`, `storage` |

Weekly copies are **hard links**, so they cost no extra disk while the daily
still exists and keep the data alive after the daily rotates out.

Each dump gets a `.json` manifest beside it: project ref, server version,
sha256, and per-table row counts at dump time. The row counts are how you answer
"did everything come back?" after a restore.

### Safety properties

- The dump is written to `*.partial` and only renamed once `pg_restore -l` can
  read its table of contents, so a killed run never leaves a file that looks
  like a valid backup.
- A dump with zero `TABLE DATA` entries is discarded rather than kept.
- `DB_BACKUP_VERIFY_FULL=1` additionally streams every block through
  `pg_restore` to catch corruption the TOC scan cannot. Roughly doubles the
  runtime — worth running occasionally, not nightly.
- The connection is validated as remote Supabase before anything runs (see
  *Production guards*).
- The password never appears in `argv`; it travels in `PGPASSWORD`.

## Restoring

```bash
npm run db:restore:hosted -- <dump-file> [options]
```

**With no `--confirm`, it is a plan: it prints the target, the dump, and the
current row counts, and changes nothing.** Always start there.

```bash
npm run db:restore:hosted -- .collection/backups/hosted/db-hosted-<ref>-<stamp>.dump
```

### Scenario 1 — one table lost to a bad migration (most common)

This is the case Supabase's own backups cannot help with: their restore is
whole-project, at any price tier. A local dump gives table-level recovery.

```bash
# See what the dump holds
npm run db:restore:hosted -- <dump> --list

# Plan, then do it
npm run db:restore:hosted -- <dump> --table link_transcripts
npm run db:restore:hosted -- <dump> --table link_transcripts --confirm vqxsaabskkkjdljxiyqi
```

Table restores are `--data-only --single-transaction`: the definition normally
still exists, and a mid-load failure rolls back rather than leaving the table
half-populated. If the table still holds rows that would collide on the primary
key, add `--truncate-first`.

### Scenario 2 — the public schema is wrecked

```bash
npm run db:restore:hosted -- <dump> --confirm vqxsaabskkkjdljxiyqi
```

Restores `public` only, with `--clean --if-exists` so each object is dropped and
recreated. A safety dump of the current state is taken first; if that dump
fails, the restore aborts (override with `--no-pre-dump`, accepting the loss).

`auth` and `storage` are in the dump but **not** restored by default. They are
owned by `supabase_auth_admin` / `supabase_storage_admin`, and dropping and
recreating them as `postgres` can break GoTrue or the storage API. Opt in with
`--include-auth` / `--include-storage` only when you specifically need them —
and note `storage.objects` rows are metadata; the files themselves are not in
any database backup.

### Scenario 3 — the whole project is gone

1. Create a new Supabase project.
2. Update `.env.hosted` with the new `SUPABASE_URL`, `SUPABASE_DB_PASSWORD`,
   keys, and `COLLECT_DB_URL`.
3. Restore the public schema — the dump carries the DDL, so this does not need
   migrations applied first:
   ```bash
   npm run db:restore:hosted -- <dump> --allow-different-project --confirm <new-ref>
   ```
   The `--allow-different-project` flag is required because a dump is otherwise
   refused against a project it did not come from.
4. Recreate what lives **outside** the dumped schemas — see below.

## What a database backup does not cover

| Thing | Current state | How to get it back |
|---|---|---|
| Storage API files | 248 objects, buckets `link-thumbnails`, `thumbnails` (both public) | Not in any DB backup. Re-fetch or re-upload. |
| Edge functions | 9 in `supabase/functions/` | `supabase functions deploy` |
| `pg_cron` jobs | `cleanup_failed_runs` (`0 3 * * *`), `cleanup_suggest_rate_limits` (`0 3 * * *`), `relation_publish_gate_15min` (`*/15 * * * *`) | Re-apply the migrations that create them |
| Vault secrets | currently **0** rows — check before assuming | Re-enter by hand |
| Custom role passwords | — | Supabase's own daily backups do not store these either; reset after a restore |
| Auth config (providers, redirect URLs) | Google OAuth, anonymous sign-ins | Dashboard / `supabase/config.toml` |

## Rehearsing a restore safely

Do **not** rehearse by restoring a copy into the hosted project: at 232 MB, a
second copy would push it past the Free plan's 500 MB limit and force the
project into read-only mode.

Rehearse against local Docker Supabase instead — a hosted dump restores into it
fine:

```bash
npx supabase start
npm run db:restore -- .collection/backups/hosted/db-hosted-<ref>-<stamp>.dump
```

That path uses the local container and cannot touch production.

For a check that needs no server at all, prove the archive decompresses end to
end and that a single table can be extracted from it:

```bash
pg_restore -l <dump> | head                       # table of contents
pg_restore -f /dev/null <dump>                    # every block decompresses
pg_restore -t link_transcripts --data-only -f - <dump> | head
```

## Production guards

Both scripts resolve the connection through `scripts/_lib/hosted-db-env.sh`,
which refuses to run unless the target really is remote Supabase. It rejects:

- loopback hosts (`localhost`, `127.0.0.1`, `::1`, `0.0.0.0`)
- port `54322` (the local Supabase Postgres port from `supabase/config.toml`)
- hosts that are not `*.supabase.co` / `*.supabase.com`
  (override with `HOSTED_DB_ALLOW_ANY_HOST=1` only if the project moves off Supabase)
- a pooler user ref (`postgres.<ref>`) that disagrees with the ref in `SUPABASE_URL`

The restore script adds:

- the dump's manifest sha256 must match the file
- the dump's project ref must match the target, unless `--allow-different-project`
- `--confirm <project-ref>` must equal the resolved target, or nothing is written
- a pre-restore safety dump, unless `--no-pre-dump`

## Known gap

Backups live on the same Mac that runs collection, so one disk failure loses
both. Getting a copy off this machine — iCloud Drive, an external disk, or
object storage — is still open. Note the dump contains `auth.users`, so it must
not go anywhere public; the GitHub repo is public and Actions artifacts on
public repos are world-readable.
