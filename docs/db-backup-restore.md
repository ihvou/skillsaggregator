# Database backup & restore (hosted / production)

Production is the **hosted** Supabase project `vqxsaabskkkjdljxiyqi` (ap-southeast-2,
Postgres 17.6, ~270 MB). It is the single source of truth — the local Docker
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
gate: if every attempt fails it logs a WARNING and collection continues. The
backup's own diagnostics land in that night's `.collection/logs/nightly-*.log`.

Set `COLLECT_SKIP_BACKUP=1` to skip it for a one-off run.

## Taking a backup by hand

```bash
npm run db:backup:hosted
```

~86 MB, and anywhere from 3½ to 11 minutes depending on the link to Sydney.
Prints the dump path on stdout; diagnostics go to stderr.

| | |
|---|---|
| Location | `.collection/backups/hosted/` (gitignored) |
| Weekly copies | `.collection/backups/hosted/weekly/` |
| Retention | 7 daily + 4 weekly — manual runs count toward the 7 |
| Format | pg_dump custom (`-Fc`), compression level 6 |
| Schemas | `public`, `auth`, `storage` |
| Attempts | 3, waiting 60 s and then 120 s between them |

Weekly copies are **hard links**, so they cost no extra disk while the daily
still exists and keep the data alive after the daily rotates out.

Each dump gets a `.json` manifest beside it: project ref, server version,
sha256, which attempt succeeded, and **exact** row counts for every table,
counted from the archive itself — so they describe precisely what the dump
holds. Manifests written before 2026-09-16 hold planner estimates instead; the
restore plan says which kind it is reading.

### Safety properties

- The dump is written to `*.partial` and only renamed once it has passed
  verification, so a killed run never leaves a file that looks like a backup.
  Partials older than 12 hours are swept at the start of the next run.
- **Every dump is verified end to end.** `pg_restore -l` reads its table of
  contents, then the whole archive is streamed through `pg_restore`, which
  decompresses every block. That takes ~6 seconds, and the same pass produces
  the exact row counts.
- A failed attempt is retried from scratch — the connection dropping mid-dump,
  as it did 7 minutes in on 2026-09-12, or an archive that does not verify.
- The connection is validated as remote Supabase before anything runs (see
  *Production guards*).
- The password never appears in `argv`; it travels in `PGPASSWORD`.

## Restoring

```bash
npm run db:restore:hosted -- <dump-file> [options]
```

**With no `--confirm` it is a plan and changes nothing.** Always start there.
The plan shows:

- the target project and where the dump came from
- **schema drift**: every table in scope compared, column by column, with the
  live database
- functions that will be **kept live** instead of recreated (see Scenario 2)
- row counts live now beside the counts in the dump — what the restore would
  roll back

A restore that cannot work is **refused at plan time** (exit 65), with the reason.

Every restore runs as **one transaction** by default: it commits whole or
changes nothing. The script builds the complete SQL first and only then runs
it, so a failure anywhere rolls everything back. `--no-single-transaction`
carries on past errors instead — only for a restore you have already watched
fail and understand.

Afterwards it counts every table in scope exactly and compares with the dump:
`Restore verified: all N tables in scope hold exactly the dump's row counts`
(exit 0), or a list of the tables that differ (exit 3).

`DB_RESTORE_KEEP_WORKDIR=1` keeps the script's working directory (the TOC list
it restores from) so you can inspect it.

### Scenario 1 — rows lost from one table (most common)

This is the case Supabase's own backups cannot help with: their restore is
whole-project, at any price tier. A local dump gives table-level recovery.

```bash
# See what the dump holds
npm run db:restore:hosted -- <dump> --list

# Plan, then do it
npm run db:restore:hosted -- <dump> --table link_transcripts
npm run db:restore:hosted -- <dump> --table link_transcripts --confirm vqxsaabskkkjdljxiyqi
```

A table restore loads the dump's rows into the table as it exists live. If the
table still holds rows that would collide on the primary key, add
`--truncate-first`: it empties the table inside the **same** transaction and
without `CASCADE`. A table that other tables reference cannot be emptied on its
own — Postgres refuses rather than silently emptying those tables too.

Row triggers fire while rows load (on `link_skill_relations` that is
`trg_lsr_revalidate`).

### Scenario 2 — the public schema is wrecked

```bash
npm run db:restore:hosted -- <dump> --confirm vqxsaabskkkjdljxiyqi
```

Restores `public` with `--clean --if-exists`, so each object is dropped and
recreated. A safety dump of the current state is taken first; if that dump
fails, the restore aborts (override with `--no-pre-dump`, accepting the loss).

**Kept live.** `--clean` drops every public function before recreating it, and
Postgres will not drop a function that something outside the restore depends
on. Today that is `create_contributor_profile_for_user()`, called by the
`auth.users` trigger from migration 0008 — and, once 0062 is applied,
`enable_rls_on_new_public_tables()` for its event trigger. The script finds
these at restore time and leaves them out, so they keep their live definition.

`auth` and `storage` are in the dump but **not** restored by default. They are
owned by `supabase_auth_admin` / `supabase_storage_admin`, and dropping and
recreating them as `postgres` can break GoTrue or the storage API. Opt in with
`--include-auth` / `--include-storage` only when you specifically need them —
and note `storage.objects` rows are metadata; the files themselves are not in
any database backup.

### Schema drift — restoring from before a migration

A dump holds the schema from the night it was taken. Migration 0061
(2026-09-13) moved `user_watched` onto `link_id`, so every dump from before it
has the old shape:

| Restore | Plan result |
|---|---|
| `--table user_watched` from a pre-0061 dump | **Refused** — live requires `link_id`, which those rows lack |
| full restore from a pre-0061 dump | **Refused** — it would put `user_watched` back to its old shape, undoing 0061 while the app still calls its functions |
| the same with `--allow-schema-rollback` | Proceeds; re-apply every migration newer than the dump afterwards |
| any restore from a dump taken after the change | Proceeds |

So prefer the newest dump that predates the damage. Rows that exist only in an
older dump have to go through a scratch database and be moved across by hand.

### Scenario 3 — the whole project is gone

**Not rehearsed.** Worked out from what the dump contains; walk it through on a
throwaway local Postgres (see *Rehearsing*) before relying on it.

1. Create a new Supabase project. Enable **pg_net** and **pg_cron**: three public
   functions call `net.http_post` (`notify_revalidation`,
   `enqueue_link_checker_jobs`, `enqueue_link_searcher_jobs`), and the scheduled
   jobs live in pg_cron.
2. Update `.env.hosted` with the new `SUPABASE_URL`, `SUPABASE_DB_PASSWORD`,
   keys, and `COLLECT_DB_URL`.
3. **Restore the users first.** These public tables have foreign keys to
   `auth.users`: `app_events`, `contributor_profiles`, `link_skill_relations`, `suggestions`, `user_actions`, `user_bookmarks`, `user_relation_votes`, `user_watched`. Their constraints cannot be built against an
   empty user table, so load just the user rows into the tables the new
   project's auth service already created (password in `PGPASSWORD`, not the URL):
   ```bash
   pg_restore --data-only --schema=auth --table=users --table=identities -f - <dump> \
     | psql "<new-db-url-without-password>" --single-transaction -v ON_ERROR_STOP=1
   ```
   `identities` is what links those users to Google sign-in. This assumes the
   new project's auth tables still have the dump's columns — the step most
   likely to need adjusting.
4. Restore the public schema. The dump carries the DDL, so no migrations first:
   ```bash
   npm run db:restore:hosted -- <dump> --allow-different-project --confirm <new-ref>
   ```
5. Recreate what lives outside `public` — the next table.

## What a database backup does not cover

| Thing | Current state | How to get it back |
|---|---|---|
| Storage API files | 1,453 objects in buckets `link-thumbnails`, `thumbnails` (both public) | Not in any DB backup. Re-fetch or re-upload. |
| Edge functions | 9 in `supabase/functions/` | `supabase functions deploy` |
| `pg_cron` jobs | `cleanup_failed_runs` (`0 3 * * *`), `cleanup_suggest_rate_limits` (`0 3 * * *`), `relation_publish_gate_15min` (`*/15 * * * *`) | Re-apply the migrations that create them |
| Trigger on `auth.users` | `on_auth_user_create_contributor_profile` | Re-run it from migration 0008 |
| Event trigger | `enable_rls_on_new_public_tables`, once 0062 is applied | Re-apply 0062 |
| Vault secrets | **0** rows, so `notify_revalidation` currently never posts | Re-enter by hand if revalidation is revived |
| Custom role passwords | — | Supabase's own daily backups do not store these either; reset after a restore |
| Auth config (providers, redirect URLs) | Google OAuth, anonymous sign-ins | Dashboard / `supabase/config.toml` |

## Rehearsing a restore safely

Do **not** rehearse by restoring a copy into the hosted project: at ~270 MB, a
second copy would push it past the Free plan's 500 MB limit and force the
project into read-only mode.

Do not use `npm run db:restore` against the local dev stack for this either:
that restores with `--clean` into the dev database and replaces its data.

Rehearse in a throwaway container instead, from the `supabase/postgres` image
matching production (17.6.1.x), on a spare port — it has Supabase's roles and
`auth` schema, and it is deleted afterwards. Docker Desktop is installed on the
collection Mac but not normally running. The hosted scripts refuse local targets
by design, so a rehearsal drives `pg_restore` directly with the same order as
Scenario 3.

Checks that need no server at all:

```bash
pg_restore -l <dump> | head                                     # table of contents
pg_restore -f /dev/null <dump>                                  # every block decompresses
pg_restore -t link_transcripts --data-only -f - <dump> | head   # one table's rows
```

## Production guards

Both scripts resolve the connection through `scripts/_lib/hosted-db-env.sh`,
which refuses to run unless the target really is remote Supabase. It rejects:

- loopback hosts (`localhost`, `127.0.0.1`, `::1`, `0.0.0.0`)
- port `54322` (the local Supabase Postgres port from `supabase/config.toml`)
- hosts that are not `*.supabase.co` / `*.supabase.com`
  (override with `HOSTED_DB_ALLOW_ANY_HOST=1` only if the project moves off Supabase)
- a pooler user ref (`postgres.<ref>`) that disagrees with the ref in `SUPABASE_URL`

The helper is bash-only — source it from `bash`, not zsh.

The restore script adds:

- the dump's manifest sha256 must match the file
- the dump's project ref must match the target, unless `--allow-different-project`
- tables must match the live schema (see *Schema drift*)
- `--confirm <project-ref>` must equal the resolved target, or nothing is written
- a pre-restore safety dump, unless `--no-pre-dump`
- one transaction, unless `--no-single-transaction`

## Known gaps

- Backups live on the same Mac that runs collection, so one disk failure loses
  both. The dump contains `auth.users`, so any off-machine copy must stay
  private; the GitHub repo is public and Actions artifacts on public repos are
  world-readable.
- Only table-level plans, drift refusals and the generated restore SQL have been
  exercised against production. A full restore and Scenario 3 have not been run
  end to end — rehearse them.
- `supabase_migrations.schema_migrations` has no rows for 0055–0060 although
  those migrations are live, so it cannot tell you which migrations a database
  has; check the objects themselves.
