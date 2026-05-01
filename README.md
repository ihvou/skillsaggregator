# Skills Aggregator

An MVP learning-resource aggregator for badminton skills. It includes:

- Supabase schema, RLS, seed taxonomy, cron hooks, and Edge Functions.
- Next.js public SEO pages and an admin moderation queue.
- Expo mobile app with browsing, level filters, saved resources, and completed state.
- Shared Zod schemas, prompt templates, and tests for the suggestion pipeline.

## Apps

```bash
npm install
npm run dev:web
npm run dev:mobile
```

## Required Environment

Copy `.env.example` values into the relevant app and Supabase environments.

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `NEXT_PUBLIC_BASE_URL`
- `DEMO_MODE` (set to `1` only for local demo without Supabase)
- `INTERNAL_FUNCTION_TOKEN`
- `REVALIDATE_SECRET`
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

5. Set Edge Function secrets, including the shared internal token used for auto-approval:

```bash
supabase secrets set \
  INTERNAL_FUNCTION_TOKEN=... \
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
supabase functions deploy revalidate-web
```

## Demo Flow

1. Open `/admin/login` and authenticate with an allowlisted moderator email.
2. Run the Link Searcher for a badminton skill.
3. Watch "Run started" appear immediately, then inspect `/admin/runs` and `agent_run_events` for progress.
4. Approve a suggestion and confirm the public skill page updates.
5. Open the Expo app, browse the same skill, save a resource, and mark it completed.

## Known MVP Gates

The external hypothesis checks in `docs/hypothesis_validation.md` require live API keys and network access. Run:

```bash
npm run h1
npm run h2
npm run h3
npm run h4
```

Each command writes structured artifacts under `.validation/` and appends a row to `docs/hypothesis_validation.md`.
