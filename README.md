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
- `MODERATOR_EMAILS`
- `REVALIDATE_SECRET`
- `ANTHROPIC_API_KEY`
- `OPENAI_API_KEY`
- `PERPLEXITY_API_KEY`
- `YOUTUBE_API_KEY`

## Supabase

```bash
supabase start
supabase db reset
supabase functions serve
```

Deploy functions after configuring secrets:

```bash
supabase secrets set ANTHROPIC_API_KEY=... OPENAI_API_KEY=... PERPLEXITY_API_KEY=... YOUTUBE_API_KEY=...
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
3. Watch pending suggestions appear in the moderation queue.
4. Approve a suggestion and confirm the public skill page updates.
5. Open the Expo app, browse the same skill, save a resource, and mark it completed.

## Known MVP Gates

The external hypothesis checks in `docs/hypothesis_validation.md` require live API keys and network access. They are intentionally recorded as pending until the project is connected to YouTube, Anthropic, OpenAI, and Perplexity credentials.
