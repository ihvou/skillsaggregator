# Agent Safety Notes

## Destructive Database Operations

The local Supabase Postgres volume contains agent-collected catalog data that is not fully recreated by `supabase/seed.sql`.

Before running any command that can reset, drop, or replace the local database, run:

```bash
scripts/db-backup.sh
```

Show the resulting `.collection/backups/db-*.dump` path to the user and get explicit confirmation before continuing with destructive work.

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

