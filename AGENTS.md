# Agent Safety Notes

## Destructive Database Operations

Production is the **hosted** project `vqxsaabskkkjdljxiyqi`; the local Supabase
Postgres volume is dev. Both hold agent-collected catalog data that
`supabase/seed.sql` does not recreate. Establish which one a command targets
before running it.

Before anything that can reset, drop, or replace the **hosted** database — a
migration that drops live data, a manual `delete`/`truncate`, a restore — run:

```bash
npm run db:backup:hosted
```

Before the same against the **local** database, run:

```bash
scripts/db-backup.sh
```

Show the resulting dump path to the user and get explicit confirmation before
continuing with destructive work. `scripts/db-restore-hosted.sh` writes to
production: it plans by default and requires `--confirm <project-ref>`. Never
pass `--confirm` or `--no-pre-dump` on the user's behalf without them asking.

See [docs/db-backup-restore.md](docs/db-backup-restore.md).

Protected commands include:

- `supabase db reset`
- `npx supabase db reset`
- `docker volume rm supabase_db_skillsaggregator`
- `docker compose down -v` for the Supabase stack
- Migrations that drop tables, columns, or constraints carrying live catalog data

Prefer:

```bash
npm run db:migrate:safe
```

Use `--force-no-backup` only on a deliberately empty local database.

