# Contributing

## Destructive Operations

Neither database is disposable. Both hold collected links, suggestions, and
agent run history that `supabase/seed.sql` does not restore — and **hosted
(`vqxsaabskkkjdljxiyqi`) is production**, with no automated Supabase backups on
the Free plan.

Before any destructive operation on **hosted**, dump and keep the path:

```bash
npm run db:backup:hosted
```

Before any destructive operation on **local**:

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

Restore a local dump with:

```bash
npm run db:restore -- .collection/backups/db-YYYYMMDDTHHMMSSZ.dump
```

Restore hosted with `npm run db:restore:hosted` — it plans by default and writes
only when given `--confirm <project-ref>`. Full runbook:
[docs/db-backup-restore.md](docs/db-backup-restore.md).

Use `--force-no-backup` only for a confirmed empty local database.

