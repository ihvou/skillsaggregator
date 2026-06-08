# Skills Aggregator

An MVP learning-resource aggregator for sport and training skills. It includes:

- Supabase schema, RLS, multi-sport seed taxonomy, local collection, cron cleanup, and Edge Functions.
- Next.js public SEO pages and an admin moderation queue.
- Expo mobile app with browsing, level filters, saved resources, and completed state.
- Public link suggestions with contributor attribution across web and mobile.
- Shared Zod schemas, prompt templates, and tests for the suggestion pipeline.

## ⚠️ Destructive operations — read before applying migrations

The local Postgres volume carries **all agent-collected content** (currently ~70 links / ~160 link-skill relations across all categories). It is NOT a clean repro from `seed.sql` — that file only seeds categories, skills, and trusted_sources. If you wipe the DB you lose everything the nightly collection has gathered.

**Before running any of the following, dump first:**

- `npx supabase db reset`
- `supabase db reset`
- `docker volume rm supabase_db_skillsaggregator`
- `docker compose down -v` against the supabase stack
- Any new migration that `drop`s tables, columns, or constraints carrying live data

**Backup command** (always safe to run, fast, idempotent):

```bash
scripts/db-backup.sh
```

Use `npm run db:migrate:safe` instead of bare `supabase db reset` when applying local migrations.

**If the catalog gets wiped anyway**, the `.collection/logs/nightly-*.log` files preserve every `candidate_scored` + `suggestion_submitted` event from past nightly runs (R20 design). Run `npm run db:replay-logs` to rebuild — takes ~5 seconds, idempotent, no LLM/YouTube calls needed.

## Architecture

The production collection path is now Option A: the collector still runs on the local machine, but writes directly to hosted Supabase (`vqxsaabskkkjdljxiyqi`) as the single source of truth. Local Supabase remains for development.

- Hosted nightly collection sources local tuning from `apps/web/.env.local`, then hosted credentials from `.env.hosted`.
- Direct SQL reads/writes use hosted Postgres through `COLLECT_DB_URL` (Supabase session pooler) when set; otherwise the collector falls back to the local `supabase_db_skillsaggregator` container.
- Hosted runs default `COLLECT_SKIP_EVENT_PERSIST=1`: full JSON logs stay in `.collection/logs`, small `agent_runs` rows remain in Postgres, and the noisy `agent_run_events` table stays empty.
- Collection scripts gather resources and POST them to `submit-suggestion` with `requested_status: "auto_approved"` when the internal score passes.
- `submit-suggestion` stores public and unauthenticated requests as `pending`; `auto_approved` is honored only for internal requests carrying `x-internal-token` that matches `INTERNAL_FUNCTION_TOKEN`.
- Moderators apply accepted suggestions through `apply-suggestion`, which writes links and relations in Postgres. Hosted `apply-suggestion` is deployed with gateway JWT verification disabled and protected by the same internal-token guard.
- The `notify_revalidation()` trigger posts directly to the Vercel `/api/revalidate` route using Vault `revalidate_url` and `revalidate_secret`; there is no separate `revalidate-web` Edge Function.
- Cloud collection functions `link-searcher`, `link-checker`, and `triangulate` are dormant for this phase. They stay in the repo for a future deployed-agent mode, but migration `0006_disable_cron.sql` unschedules their automatic cron jobs.

To switch back to deployed-agent collection later, re-enable the cron jobs, deploy the dormant functions, configure live model/API secrets, and keep the server-side moderation policy explicit.

Collection rate-limit tuning + escalation playbook lives at [`docs/collection-tuning.md`](docs/collection-tuning.md). `apps/web/.env.local` is gitignored, so that doc is the canonical record of what's currently configured and why.

## Apps

```bash
npm install
npm run dev:web
npm run dev:mobile
```

## Prerequisites

- Node.js 20.11+ and npm 10+.
- Docker Desktop running before `supabase start`.
- Supabase CLI: `brew install supabase/tap/supabase`.
- Hosted collection direct SQL: `brew install libpq` (`scripts/nightly-collect.sh` adds Homebrew's keg-only `libpq/bin` path).
- `yt-dlp`: `brew install yt-dlp` for the video collector workstream.
- Ollama with a local scoring model: `ollama pull qwen2.5:7b`.

## Required Environment

Copy `.env.example` values into the relevant app and Supabase environments.

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `INTERNAL_FUNCTION_TOKEN` (required for hosted/admin `apply-suggestion` and internal `auto_approved` submit-suggestion calls)
- `COLLECT_TARGET` (`hosted` for nightly production, `local` for local Supabase dev)
- `COLLECT_DB_URL` (hosted Postgres/session-pooler URL; for this project the working host is `aws-1-ap-southeast-2.pooler.supabase.com`)
- `SUPABASE_DB_PASSWORD` (optional fallback; collector can derive `COLLECT_DB_URL` from it plus hosted `SUPABASE_URL`)
- `COLLECT_SKIP_EVENT_PERSIST` (defaults to `1` for hosted, `0` for local)
- `NEXT_PUBLIC_BASE_URL`
- `BASE_URL`
- `ALLOWED_ORIGINS`
- `SUGGEST_TURNSTILE_SITE_KEY` (optional public flag for the suggest form)
- `SUGGEST_TURNSTILE_SECRET_KEY` (required by the Edge Function when Turnstile is enabled)
- `SUPABASE_AUTH_GOOGLE_CLIENT_ID` / `SUPABASE_AUTH_GOOGLE_SECRET` for local Google OAuth
- `EXPO_PUBLIC_WEB_BASE_URL` for mobile profile links
- `DEMO_MODE` (set to `1` only for local demo without Supabase)
- `REVALIDATE_SECRET`
- `SUPABASE_FUNCTIONS_URL`
- `OLLAMA_BASE_URL`
- `OLLAMA_MODEL`
- `ANTHROPIC_API_KEY`
- `OPENAI_API_KEY`
- `PERPLEXITY_API_KEY`
- `YOUTUBE_API_KEY`

## Setup

1. Create a Supabase project, copy the URL, anon key, and service role key into `.env.local`, and keep `DEMO_MODE` unset for any real environment.
2. Run the migrations and seed locally with `npm run db:migrate:safe`.
3. Add moderators in both Supabase Auth and `public.moderators`; admin access is fail-closed and no longer trusts `MODERATOR_EMAILS` or user-editable auth metadata. Public signup is enabled for contributor profiles, but moderator access still requires the allowlist row. The helper does both:

```bash
npm run add:moderator -- --email you@example.com
```

Manual equivalent:

```sql
insert into public.moderators (email)
values ('you@example.com')
on conflict (email) do update set is_active = true;
```

Also create the matching Auth user with `email_confirm: true` through the Admin API:

```bash
curl -X POST "$SUPABASE_URL/auth/v1/admin/users" \
  -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json" \
  -d '{"email":"you@example.com","email_confirm":true}'
```

4. Store cron and webhook secrets in Supabase Vault, not database GUCs:

```sql
select vault.create_secret('https://YOUR-PROJECT.supabase.co/functions/v1', 'supabase_functions_url');
select vault.create_secret('YOUR_SERVICE_ROLE_KEY', 'service_role_key');
select vault.create_secret('https://YOUR_WEB_ORIGIN/api/revalidate', 'revalidate_url');
select vault.create_secret('YOUR_REVALIDATE_SECRET', 'revalidate_secret');
```

5. Configure public auth providers when using contributor login outside the local email flow. Google OAuth needs matching redirect URLs in Google Cloud and Supabase:

```text
http://localhost:3000/auth/callback
skillsaggregator://auth/callback
https://YOUR-WEB-ORIGIN/auth/callback
```

6. For future deployed-agent mode, set Edge Function secrets:

```bash
supabase secrets set \
  ANTHROPIC_API_KEY=... \
  OPENAI_API_KEY=... \
  PERPLEXITY_API_KEY=... \
  YOUTUBE_API_KEY=...
```

## Supabase

```bash
supabase start
npm run db:migrate:safe
supabase functions serve
```

Deploy functions after configuring secrets:

```bash
supabase functions deploy link-searcher
supabase functions deploy link-checker
supabase functions deploy submit-suggestion
supabase functions deploy apply-suggestion
supabase functions deploy triangulate
```

`link-searcher`, `link-checker`, and `triangulate` are dormant in the local-first mode; deploying them is only needed when testing the future cloud-agent path.

## Local Development Workflow

1. Start Docker Desktop.
2. Install tools if needed:

```bash
brew install supabase/tap/supabase
brew install yt-dlp
```

3. Start and seed local Supabase:

```bash
supabase start
npm run db:migrate:safe
```

4. Copy the local keys printed by `supabase start` into `.env.local`:

```bash
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
NEXT_PUBLIC_SUPABASE_ANON_KEY=<local anon key>
SUPABASE_URL=http://127.0.0.1:54321
SUPABASE_SERVICE_ROLE_KEY=<local service role key>
SUPABASE_FUNCTIONS_URL=http://127.0.0.1:54321/functions/v1
NEXT_PUBLIC_BASE_URL=http://localhost:3000
BASE_URL=http://localhost:3000
ALLOWED_ORIGINS=http://localhost:3000
REVALIDATE_SECRET=local-dev-secret
EXPO_PUBLIC_WEB_BASE_URL=http://localhost:3000
```

5. Add a moderator in Auth and the moderator table:

```bash
npm run add:moderator -- --email you@example.com
```

The SQL-only table row is not enough for admin access; the matching `auth.users` row must exist before magic-link OTP can be sent.

```sql
insert into public.moderators (email)
values ('you@example.com')
on conflict (email) do update set is_active = true;
```

6. Serve local functions and the web app:

```bash
supabase functions serve --env-file .env.local
npm run dev:web
```

7. Run article collection against local Supabase:

```bash
ollama pull qwen2.5:7b
npm run collect:articles -- --dry-run --max-per-domain 2 --skill forehand-clear
npm run collect:articles
```

Video collection can target one category across the seeded taxonomy:

```bash
node scripts/run-collection.mjs --category padel --all
node scripts/run-collection.mjs --category surfing --skill pop-up
```

Hosted nightly collection is wrapped by target-specific aliases:

```bash
npm run collect:hosted:smoke
npm run collect:hosted
npm run collect:local
```

`scripts/nightly-collect.sh` defaults to `COLLECT_TARGET=hosted`. It sources `apps/web/.env.local` first for tuning and `INTERNAL_FUNCTION_TOKEN`, then `.env.hosted` so hosted `SUPABASE_URL`, service role, and `COLLECT_DB_URL` win. Use `COLLECT_TARGET=local` when you intentionally want the old local-container path.

Weekly source discovery expands the trusted source graph before nightly collection:

```bash
npm run discover:sources -- --category padel
npm run discover:sources
```

It uses `PERPLEXITY_API_KEY` for candidate discovery, validates YouTube channels with
`yt-dlp`, auto-trusts high-confidence sources, and sends borderline `SOURCE_ADD`
suggestions to the moderation queue.

## Demo Flow

1. Open `/admin/login` and authenticate with an allowlisted moderator email.
2. Run local collection, then open the admin moderation queue.
3. Approve a pending suggestion and confirm the public skill page updates.
4. Open the Expo app, browse the same skill, save a resource, and mark it completed.

## Known MVP Gates

The external hypothesis checks in `docs/hypothesis_validation.md` require live API keys and network access. Run:

```bash
npm run h1
npm run h2
npm run h3
npm run h4
```

Each command writes structured artifacts under `.validation/` and appends a row to `docs/hypothesis_validation.md`.

Deferred coverage still includes browser E2E for the admin queue, Maestro mobile flows, and live LLM regression checks; the database tests now cover RLS, dedupe, and apply-suggestion link add/detach behavior.
