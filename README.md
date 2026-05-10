# Skills Aggregator

An MVP learning-resource aggregator for badminton skills. It includes:

- Supabase schema, RLS, seed taxonomy, local collection, cron cleanup, and Edge Functions.
- Next.js public SEO pages and an admin moderation queue.
- Expo mobile app with browsing, level filters, saved resources, and completed state.
- Shared Zod schemas, prompt templates, and tests for the suggestion pipeline.

## Architecture

The default MVP workflow is local collection plus human moderation:

- Local collection scripts gather resources and POST them to `submit-suggestion` with `requested_status: "pending"`.
- `submit-suggestion` stores every suggestion as `pending`, even if a caller asks for `auto_approved`.
- Moderators apply accepted suggestions through `apply-suggestion`, which writes links and relations in Postgres.
- The `notify_revalidation()` trigger posts directly to the Vercel `/api/revalidate` route using Vault `revalidate_url` and `revalidate_secret`; there is no separate `revalidate-web` Edge Function.
- Cloud collection functions `link-searcher`, `link-checker`, and `triangulate` are dormant for this phase. They stay in the repo for a future deployed-agent mode, but migration `0006_disable_cron.sql` unschedules their automatic cron jobs.

To switch back to deployed-agent collection later, re-enable the cron jobs, deploy the dormant functions, configure live model/API secrets, and keep the server-side moderation policy explicit.

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
- `yt-dlp`: `brew install yt-dlp` for the video collector workstream.
- Ollama with a local scoring model: `ollama pull qwen2.5:7b`.

## Required Environment

Copy `.env.example` values into the relevant app and Supabase environments.

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `NEXT_PUBLIC_BASE_URL`
- `BASE_URL`
- `ALLOWED_ORIGINS`
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
2. Run the migrations and seed locally with `supabase db reset`.
3. Add moderator rows in `public.moderators`; admin access is fail-closed and no longer trusts `MODERATOR_EMAILS` or user-editable auth metadata:

```sql
insert into public.moderators (email)
values ('you@example.com')
on conflict (email) do update set is_active = true;
```

4. Store cron and webhook secrets in Supabase Vault, not database GUCs:

```sql
select vault.create_secret('https://YOUR-PROJECT.supabase.co/functions/v1', 'supabase_functions_url');
select vault.create_secret('YOUR_SERVICE_ROLE_KEY', 'service_role_key');
select vault.create_secret('https://YOUR_WEB_ORIGIN/api/revalidate', 'revalidate_url');
select vault.create_secret('YOUR_REVALIDATE_SECRET', 'revalidate_secret');
```

5. For future deployed-agent mode, set Edge Function secrets:

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
supabase db reset
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
supabase db reset
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
```

5. Add a moderator in Studio at `http://localhost:54323` or through SQL:

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
