# Contributing

## Destructive Operations

The local Supabase database is not disposable. It contains collected links, approved suggestions, pending suggestions, and agent run history that are not restored by `supabase/seed.sql`.

Before any destructive database operation, create a dump and keep the path:

```bash
scripts/db-backup.sh
```

Do this before:

- `supabase db reset`
- `npx supabase db reset`
- removing Supabase Docker volumes
- running migrations that drop live catalog data

The safer reset wrapper is:

```bash
npm run db:migrate:safe
```

Restore a dump with:

```bash
npm run db:restore -- .collection/backups/db-YYYYMMDDTHHMMSSZ.dump
```

Use `--force-no-backup` only for a confirmed empty local database.

