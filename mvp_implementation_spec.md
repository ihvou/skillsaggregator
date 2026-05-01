# Skills Aggregator — MVP Implementation Spec

> **Audience**: this document is intended to be sufficient input for Codex (or another coding agent) to produce the first working end-to-end version of the project.
>
> **Style note**: scenarios and tables are preferred over prose. Where a section is short it is intentionally short.

---

## 0. Document scope

This spec covers the first complete version of the Skills Aggregator showcase MVP. It is the merge of `skills_aggregator_summary.md` (high-level concept) and `automated_content_collection_moderation_spec.md` (moderation architecture), constrained to:

- one vertical: **badminton** (see §3 for rationale and taxonomy)
- one mobile platform target: **iOS + Android via Expo**
- one web target: **SEO-optimized public skill pages + admin moderation route**, both Next.js
- no paid servers, VPS, or self-managed cloud hosting; everything runs on Supabase + free static-site hosting + Expo Application Services free tier
- automated content collection as the technical centerpiece
- monetization, growth tactics, multi-vertical management, and cross-device user accounts are explicitly out of scope

---

## 1. Goals

| # | Goal | Acceptance criterion |
|---|---|---|
| G1 | Demonstrate end-to-end working app suitable as a vibe-coding portfolio piece | Live Expo app + live web app + recorded demo video showing all main scenarios (§4) |
| G2 | Show automated content quality and density | At least **15 sub-skills × ≥5 vetted resources each** populated by the agent pipeline before any manual moderation |
| G3 | Showcase multi-agent technique | Cross-AI triangulation visibly drives auto-approval decisions; admin queue shows individual model votes |
| G4 | Provide passive traffic via SEO | Sitemap + indexable SSR/SSG pages for every category and skill; valid Schema.org structured data |
| G5 | Stay within constraints | No paid servers; deploy diagram identifies every runtime piece and confirms it is Supabase-managed or free static |

---

## 2. Constraints and stack

| Constraint | Resolution |
|---|---|
| No managed servers, VPS, or paid cloud hosting | All runtime logic runs on Supabase (DB, Edge Functions, pg_cron, Realtime, Storage, Auth). Static web hosted on Vercel hobby tier (preferred) or Cloudflare Pages free tier or GitHub Pages (SSG fallback). |
| SSR/SEO required for public web | Next.js 15 with `generateStaticParams` (SSG) plus on-demand revalidation triggered by Supabase webhook on content change. ISR (`revalidate`) acts as a fallback. |
| Background jobs without external queue | `pg_cron` schedules Edge Function calls via `pg_net.http_post`. Job state lives in `agent_runs` and `suggestions` tables. |
| Mobile cross-platform | Expo SDK 50+, no native modules beyond what Expo Go supports. |

### 2.1 Stack table

| Layer | Tech | Notes |
|---|---|---|
| Database | Supabase Postgres 15 | Use uuid PKs, timestamptz timestamps, Row Level Security on every public table |
| Auth | Supabase Auth | Magic link only; one allowlisted moderator email for v1 |
| Storage | Supabase Storage | Bucket `link-thumbnails` (public read) for cached preview images |
| Realtime | Supabase Realtime | Channel `moderation_queue` for live updates of new pending suggestions |
| Edge Functions | Deno + TypeScript | All listed in §6 |
| Cron | pg_cron + pg_net | See §7 |
| Mobile | Expo SDK 50+, React Native, Expo Router, React Query (TanStack), `@supabase/supabase-js`, FlashList, MMKV (`react-native-mmkv`), Expo Image | |
| Web | Next.js 15 App Router, TypeScript, Tailwind, `@supabase/supabase-js`, `next-sitemap` | Deployed to Vercel hobby tier |
| LLMs | Anthropic SDK (Claude Haiku 4.5) primary; OpenAI SDK (gpt-4o-mini) and Perplexity API for triangulation | Called from Edge Functions |
| External APIs | YouTube Data API v3, `youtube-transcript` (npm) ported to Deno via `npm:` specifier | Daily quota 10,000 units; `search.list` costs 100 units, so ~100 search calls/day max — see §12.1 hypothesis check |
| Tests | Vitest (unit), Playwright (web E2E), Maestro (mobile E2E), Supabase test SQL files | See §13 |

### 2.2 Why these choices

- **Supabase over alternatives**: meets the no-servers constraint, ships pg_cron + pg_net + Realtime + Auth + Storage from one vendor, has a usable free tier, and is interview-recognizable.
- **Vercel hobby tier**: not a "server" in the user's sense — no SSH, no maintenance — and Next.js ISR on Vercel handles the SEO + content-update problem cleanly. If excluded, fall back to pure SSG on GitHub Pages with a rebuild on every approval.
- **Claude Haiku as primary scorer**: low cost ($0.005-0.02 per video including transcripts), structured outputs are reliable, prompt caching reduces cost on shared sub-skill descriptions.
- **Expo over bare React Native**: faster iteration, OTA updates via EAS, no native build complexity.

---

## 3. Vertical: badminton

### 3.1 Rationale

| Criterion | Why badminton works |
|---|---|
| Bounded technique tree | ~20 distinct teachable sub-skills; finite |
| Existing creator ecosystem | Strong YouTube channels (Badminton Insight, Badminton Famly, Coach Lee, BWF official, Mix Badminton, ShuttleAmp) |
| Visual content | Demonstrations work well in mobile cards |
| Niche but recognizable | Distinctive for portfolio without being obscure |
| Manageable transcript volume | Most candidate videos are 5-20 min; transcripts cheap to score |

### 3.2 Seed taxonomy

The seed taxonomy is hand-defined in the migration; the Skill Searcher agent is **out of scope for v1**.

| Category | Skills (sub-skills) |
|---|---|
| Badminton | Forehand clear, Backhand clear, Forehand smash, Backhand smash, Drop shot, Net shot, Drive, Lift, Push, Serve (high), Serve (low), Footwork (front court), Footwork (rear court), Footwork (split step), Defense (block), Defense (lift), Singles strategy, Doubles rotation, Grip technique, Wrist rotation, Stringing and tension |

### 3.3 Trusted source whitelist (seed data)

| Source type | Channel/Domain | Notes |
|---|---|---|
| YouTube | UC2cKr3rQwlR2Z6CSNa3Lqlw (Badminton Insight) | High teaching density |
| YouTube | UCkzL9CwOJ4ZDSkpb2rj_RIw (Badminton Famly) | Drill-focused |
| YouTube | UCtuSKlYXWXwlu6_3OYDjVTQ (Coach Lee) | Technical |
| YouTube | UCWHtFQg1mOHLXLqM_GFaXgw (BWF) | Pro footage |
| YouTube | UC_kCu9-TFC4jPQXNvmsMcUw (Mix Badminton) | Player-style |
| YouTube | UCvxrFGFY-w5p_Z4OS7yyEhA (ShuttleAmp) | Equipment-focused (limit to relevant skills) |
| Article | badmintonbites.com | Long-form articles |
| Article | badmintonpassion.com | Strategy content |
| Article | badmintonfamly.com (blog) | Drill writeups |

> Channel IDs above are placeholders — verify and update during §12.1 hypothesis validation before running ingestion.

---

## 4. Main scenarios

This section enumerates every user-visible and system-visible scenario the v1 must support. Each scenario is referenced by ID in later sections.

### 4.1 Backend pipeline scenarios

| ID | Scenario | Trigger | Output |
|---|---|---|---|
| BP1 | **Discover candidate links per skill** | pg_cron daily, or admin "Run Now" button | `LINK_ADD` suggestions in `pending` or `auto_approved` |
| BP2 | **Score candidate via transcript** | Sub-step of BP1 | Inline scoring inside BP1; not a separate suggestion |
| BP3 | **Cross-AI triangulation** | Sub-step of BP1 when transcript score ≥ threshold | Auto-approval if ≥2 of 3 models endorse; otherwise `pending` |
| BP4 | **Re-check existing link-skill relations** | pg_cron weekly | `LINK_UPVOTE_SKILL`, `LINK_ATTACH_SKILL`, `LINK_DETACH_SKILL` suggestions |
| BP5 | **Apply approved suggestion** | Moderator approval, or auto-approval from BP3 | Mutation in `links`, `link_skill_relations` |
| BP6 | **Trigger ISR revalidation on content change** | DB trigger after BP5 mutation | Webhook fires Vercel revalidation endpoint for affected skill page |
| BP7 | **Cache thumbnail to Supabase Storage** | Sub-step of BP5 for `LINK_ADD` | `links.thumbnail_url` set to public Supabase Storage URL |

### 4.2 Mobile app scenarios

| ID | Scenario | User action | Result |
|---|---|---|---|
| M1 | **Browse home / categories** | Open app | Single-category landing for v1 (Badminton); list of skill groupings |
| M2 | **Skill list within category** | Tap category | List of skills with resource counts |
| M3 | **Skill detail page** | Tap skill | Resources grouped by `skill_level`; show `public_note`, thumbnail, source domain, upvote count |
| M4 | **Open external resource** | Tap resource card | System browser or in-app webview |
| M5 | **Save resource** | Long-press or tap bookmark icon | Persisted in MMKV; visible on Saved tab |
| M6 | **Mark resource completed** | Tap check icon | Persisted in MMKV; resource shown muted |
| M7 | **Saved tab** | Tap tab | List of all saved resources across skills |
| M8 | **Filter skill detail by level** | Segmented control: All / Beginner / Intermediate / Advanced | Filtered list |

### 4.3 Public web (SEO) scenarios

| ID | Scenario | URL | Result |
|---|---|---|---|
| W1 | **Site root** | `/` | Hero + list of skills; sitemap link |
| W2 | **Category page** | `/badminton` | Lists all skills in category with resource counts and brief descriptions |
| W3 | **Skill page** | `/badminton/forehand-smash` | Full skill page: description, resources by level, related skills, JSON-LD `LearningResource` markup |
| W4 | **Sitemap** | `/sitemap.xml` | Generated from DB at build + on revalidation |
| W5 | **robots.txt** | `/robots.txt` | Allows all; references sitemap |

### 4.4 Admin moderation scenarios

| ID | Scenario | Actor | Result |
|---|---|---|---|
| A1 | **Login** | Allowlisted email | Magic link → admin dashboard |
| A2 | **View pending queue** | Moderator | List of `pending` suggestions, type-specific cards (per `automated_content_collection_moderation_spec.md` §17) |
| A3 | **Live updates** | Moderator | New pending items appear via Realtime subscription without refresh |
| A4 | **Approve suggestion** | Moderator | Server applies per §16 below; UI removes card |
| A5 | **Decline suggestion** | Moderator | Sets `status='declined'`; UI removes card |
| A6 | **Trigger Link Searcher run** | Moderator | Selects skill from dropdown; clicks Run; SSE-style log stream of agent progress |
| A7 | **View agent run history** | Moderator | List from `agent_runs` with status, suggestion counts, durations |

---

## 5. Data model (Postgres DDL)

All tables live in schema `public`. Every table has RLS enabled. UUIDs use `gen_random_uuid()`.

### 5.1 DDL

```sql
-- Extensions
create extension if not exists pgcrypto;
create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Categories
create table categories (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  name text not null,
  description text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Skills
create table skills (
  id uuid primary key default gen_random_uuid(),
  category_id uuid not null references categories(id),
  slug text not null,
  name text not null,
  description text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (category_id, slug)
);
create index on skills (category_id) where is_active;

-- Trusted sources whitelist
create table trusted_sources (
  id uuid primary key default gen_random_uuid(),
  source_type text not null check (source_type in ('youtube_channel', 'domain', 'rss')),
  identifier text not null,        -- channel ID, domain, or feed URL
  display_name text not null,
  category_id uuid references categories(id),  -- optional category restriction
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (source_type, identifier)
);

-- Links
create table links (
  id uuid primary key default gen_random_uuid(),
  url text not null,
  canonical_url text not null,
  domain text not null,
  title text,
  description text,
  thumbnail_url text,
  content_type text check (content_type in ('video','article','podcast','course')),
  language text default 'en',
  preview_status text not null default 'pending' check (preview_status in ('pending','fetched','failed')),
  fetched_at timestamptz,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (canonical_url)
);
create index on links (domain);

-- Link <-> skill relations
create table link_skill_relations (
  id uuid primary key default gen_random_uuid(),
  link_id uuid not null references links(id),
  skill_id uuid not null references skills(id),
  public_note text,
  skill_level text check (skill_level in ('beginner','intermediate','advanced')),
  upvote_count integer not null default 0,
  is_active boolean not null default true,
  last_checked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (link_id, skill_id)
);
create index on link_skill_relations (skill_id) where is_active;
create index on link_skill_relations (last_checked_at) where is_active;

-- Internal users (agents are authored by these)
create table internal_users (
  id uuid primary key default gen_random_uuid(),
  display_name text not null,
  is_agent_actor boolean not null default true,
  created_at timestamptz not null default now()
);

-- Suggestions (the moderation queue)
create type suggestion_type as enum (
  'LINK_ADD','LINK_ATTACH_SKILL','LINK_DETACH_SKILL','LINK_UPVOTE_SKILL'
);
create type suggestion_status as enum ('pending','approved','declined','auto_approved');

create table suggestions (
  id uuid primary key default gen_random_uuid(),
  type suggestion_type not null,
  status suggestion_status not null default 'pending',
  origin_type text not null check (origin_type in ('agent','admin')),
  origin_name text,
  author_internal_user_id uuid references internal_users(id),
  category_id uuid references categories(id),
  skill_id uuid references skills(id),
  link_id uuid references links(id),
  payload_json jsonb not null,
  evidence_json jsonb,
  triangulation_json jsonb,                  -- per-model votes when applicable
  confidence numeric(4,3),                    -- 0..1
  dedupe_key text not null,
  created_at timestamptz not null default now(),
  decided_at timestamptz,
  moderator_user_id uuid,                     -- references auth.users(id) once Auth set up
  unique (dedupe_key, status) where status in ('pending','approved','auto_approved')
);
create index on suggestions (status, created_at desc);
create index on suggestions (skill_id) where status = 'pending';

-- Agent run history
create table agent_runs (
  id uuid primary key default gen_random_uuid(),
  agent_type text not null check (agent_type in ('link_searcher','link_checker')),
  agent_version text not null default 'v1',
  target_type text check (target_type in ('skill','link_skill_relation')),
  target_id uuid,
  status text not null default 'started' check (status in ('started','completed','failed')),
  suggestions_created integer not null default 0,
  triangulation_calls integer not null default 0,
  cost_usd numeric(8,4) not null default 0,
  error_message text,
  started_at timestamptz not null default now(),
  completed_at timestamptz
);
create index on agent_runs (started_at desc);
```

### 5.2 RLS policies (summary)

| Table | Anon read | Anon write | Authenticated (moderator) read | Authenticated (moderator) write |
|---|:-:|:-:|:-:|:-:|
| categories | yes (where is_active) | no | yes | yes |
| skills | yes (where is_active) | no | yes | yes |
| links | yes (where is_active) | no | yes | yes |
| link_skill_relations | yes (where is_active) | no | yes | yes |
| trusted_sources | no | no | yes | yes |
| suggestions | no | no | yes | yes |
| agent_runs | no | no | yes | yes |
| internal_users | yes | no | yes | yes |

The mobile app uses the anon key. The admin web uses an authenticated session restricted to allowlisted emails (configured via Supabase Auth user metadata or a `moderators` table).

### 5.3 Database trigger: ISR revalidation

```sql
create or replace function notify_revalidation()
returns trigger language plpgsql security definer as $$
declare
  v_skill_slug text;
  v_category_slug text;
begin
  select s.slug, c.slug into v_skill_slug, v_category_slug
  from skills s join categories c on s.category_id = c.id
  where s.id = coalesce(new.skill_id, old.skill_id);

  perform net.http_post(
    url := current_setting('app.revalidate_url'),  -- set via supabase secret
    headers := jsonb_build_object(
      'Content-Type','application/json',
      'x-revalidate-secret', current_setting('app.revalidate_secret')
    ),
    body := jsonb_build_object('category', v_category_slug, 'skill', v_skill_slug)
  );
  return new;
end$$;

create trigger trg_lsr_revalidate
after insert or update on link_skill_relations
for each row execute function notify_revalidation();
```

---

## 6. Edge Functions

All Edge Functions live under `supabase/functions/`. Each is a Deno + TypeScript module.

| Function | Purpose | Trigger | Inputs | Outputs |
|---|---|---|---|---|
| `link-searcher` | BP1 (full pipeline: discover → score → triangulate → submit) | pg_cron daily; admin "Run Now" | `{ skill_id }` | `{ run_id, suggestions_created }` |
| `link-checker` | BP4 | pg_cron weekly | `{ relation_id }` | `{ run_id, suggestions_created }` |
| `submit-suggestion` | Intake API used by both agent functions | HTTP POST | normalized suggestion payload | `{ suggestion_id, status }` |
| `apply-suggestion` | BP5 | HTTP POST from admin web on approval | `{ suggestion_id }` | `{ ok, applied_changes }` |
| `revalidate-web` | BP6 receiver on the Next.js side | called from `notify_revalidation()` | `{ category, skill }` | revalidates `/[category]` and `/[category]/[skill]` |
| `triangulate` | BP3 helper invoked by `link-searcher` | internal | `{ candidate, skill }` | `{ votes: [{model, approve, reason}], approve_count }` |

### 6.1 `link-searcher` flow

| Step | Detail |
|---|---|
| 1 | Insert `agent_runs` row, `status='started'` |
| 2 | Load skill + category from DB |
| 3 | Generate 3-5 search queries via Claude Haiku (prompt template P1, §11) |
| 4 | For each query: call YouTube Data API `search.list` filtered to whitelisted channels (parameter `channelId` per channel; or use `q + channelType=any` and post-filter); collect candidate video IDs |
| 5 | Dedupe candidates against existing `links.canonical_url` |
| 6 | For each candidate: fetch transcript via `npm:youtube-transcript`; if missing, skip (log to run) |
| 7 | Score candidate with Claude Haiku using prompt template P2 (§11); structured output: `{ relevance, teaching_quality, demo_vs_talk, level, public_note, evidence_quote }` |
| 8 | If `relevance >= 0.7 AND teaching_quality >= 0.6`: invoke `triangulate` |
| 9 | If triangulation `approve_count >= 2`: build `LINK_ADD` payload with `status='auto_approved'` and call `submit-suggestion` |
| 10 | If triangulation < 2 but transcript score passed: build `LINK_ADD` with `status='pending'` |
| 11 | Update `agent_runs` with `status='completed'`, counts, cost |

### 6.2 `submit-suggestion` flow

| Step | Detail |
|---|---|
| 1 | Validate payload via Zod schema matching the suggestion type |
| 2 | Compute `dedupe_key` per type (per `automated_content_collection_moderation_spec.md` §19.1) |
| 3 | Check uniqueness against active suggestions; if duplicate, return existing |
| 4 | Resolve `author_internal_user_id` via category interest (round-robin among active internal users for the category) |
| 5 | If `status='auto_approved'` was requested by caller: insert and immediately call `apply-suggestion` |
| 6 | Otherwise insert with `status='pending'`; the Realtime subscription on the admin web updates the queue |

### 6.3 `apply-suggestion` flow

| Suggestion type | Apply rule |
|---|---|
| `LINK_ADD` | Upsert `links` by `canonical_url`. Insert `link_skill_relations` with the proposed `public_note` and `skill_level`. If `links.preview_status='pending'`, kick off thumbnail fetch + storage upload (BP7). |
| `LINK_ATTACH_SKILL` | Insert (or reactivate) `link_skill_relations` row. |
| `LINK_DETACH_SKILL` | Set `link_skill_relations.is_active=false`. If link has no remaining active relations, set `links.is_active=false`. |
| `LINK_UPVOTE_SKILL` | `update link_skill_relations set upvote_count = upvote_count + 1 where ...` |

All applies run inside a single transaction that also updates `suggestions.status='approved'` (or stays `auto_approved` if invoked from BP3) and sets `decided_at`.

### 6.4 `triangulate` flow

| Step | Detail |
|---|---|
| 1 | Build identical structured prompt (template P3, §11) for the candidate + skill + transcript snippet |
| 2 | Call in parallel: Claude Haiku, GPT-4o-mini, Perplexity sonar-small. All return `{ approve: bool, confidence: number, reason: string }`. |
| 3 | Aggregate votes: `approve_count = sum(v.approve)`. Persist all three responses to `triangulation_json` on the parent suggestion. |
| 4 | Return `{ votes, approve_count }` to caller. |

Caching: if any model fails (timeout, rate limit), record the failure and treat as a non-approve vote rather than retrying inline. Cost cap per run: $0.50 (configurable env var).

---

## 7. Cron jobs (pg_cron)

| Job | Schedule (UTC) | What it does |
|---|---|---|
| `link_searcher_daily` | `0 4 * * *` | For each active skill, enqueue `link-searcher` run, spaced 60 s apart |
| `link_checker_weekly` | `0 5 * * 0` | For each active `link_skill_relations` with `last_checked_at < now() - interval '30 days'` (limit 50/week), enqueue `link-checker` |
| `cleanup_failed_runs` | `0 3 * * *` | Mark `agent_runs` stuck in `started` for >2 h as `failed` |

Implementation uses `pg_net.http_post` to call Edge Functions with the Supabase service-role key.

---

## 8. Mobile app (Expo)

### 8.1 Routing (Expo Router)

```
app/
  _layout.tsx                 # Root layout, providers
  (tabs)/
    _layout.tsx               # Tab navigator
    index.tsx                 # M1: home (single category)
    saved.tsx                 # M7
  [category]/
    index.tsx                 # M2: skill list
    [skill]/
      index.tsx               # M3, M4, M8
```

### 8.2 Data fetching

| Screen | Query | Caching |
|---|---|---|
| `(tabs)/index.tsx` | `from('skills').select('id,name,slug, count_resources:link_skill_relations(count)')...` | React Query 5 min stale |
| `[category]/index.tsx` | same as home if single-category v1 | 5 min |
| `[category]/[skill]/index.tsx` | `from('link_skill_relations').select('*, links(*)').eq('skill_id', ...).eq('is_active', true).order('upvote_count', desc=true)` | 2 min |
| `saved.tsx` | Read MMKV keys `saved:*`, hydrate via `from('links').in('id', [...])` | local + 10 min |

### 8.3 Local state (MMKV)

| Key | Value |
|---|---|
| `saved:<link_id>` | `1` |
| `completed:<link_id>` | `1` |
| `last_seen_skill` | skill id (for "continue where you left off") |

### 8.4 UI components

| Component | Props | Notes |
|---|---|---|
| `<SkillCard>` | name, count, slug | Used on M1, M2 |
| `<ResourceCard>` | link, public_note, skill_level, isSaved, isCompleted | Used on M3 |
| `<LevelFilter>` | value, onChange | Segmented control (M8) |
| `<ResourceActions>` | linkId, isSaved, isCompleted | Save + complete buttons |

---

## 9. Public web (SEO)

### 9.1 Routing (Next.js App Router)

```
app/
  layout.tsx                                # site shell
  page.tsx                                  # W1
  sitemap.ts                                # W4 (next-sitemap or custom)
  robots.ts                                 # W5
  [category]/
    page.tsx                                # W2
  [category]/[skill]/
    page.tsx                                # W3
  api/revalidate/route.ts                   # POST endpoint hit by Supabase trigger
  admin/
    layout.tsx                              # auth gate
    page.tsx                                # A2: queue
    runs/page.tsx                           # A7
    actions.ts                              # server actions: approve, decline, run-now
```

### 9.2 Static rendering and revalidation

| Path | Strategy |
|---|---|
| `/` | SSG at build, ISR `revalidate: 3600` |
| `/[category]` | `generateStaticParams` from DB at build, ISR `revalidate: 3600` |
| `/[category]/[skill]` | `generateStaticParams` from DB at build; on-demand revalidation via `/api/revalidate` endpoint called from §5.3 trigger |
| `/sitemap.xml` | Regenerated by `sitemap.ts` on every build; ISR for content additions |

### 9.3 SEO requirements per skill page (W3)

| Element | Requirement |
|---|---|
| `<title>` | `"{Skill} — {Category} | Skills Aggregator"` |
| Meta description | First 150 chars of skill description, fallback to template |
| Canonical link | self-referencing absolute URL |
| Open Graph + Twitter Card | title, description, og:image (best resource thumbnail) |
| H1 | Skill name |
| Visible content | Description, resources grouped by level with public_note shown as caption, "Related skills" cross-links |
| JSON-LD | `LearningResource` per resource, plus `BreadcrumbList` |
| Internal links | At least 3 to sibling skills in same category |
| Image alt text | resource title |
| Lighthouse SEO score target | ≥ 95 |

### 9.4 Sitemap

```ts
// app/sitemap.ts
export default async function sitemap() {
  const { data: skills } = await supabase
    .from('skills').select('slug, updated_at, categories(slug)').eq('is_active', true);
  return [
    { url: BASE_URL, lastModified: new Date() },
    ...skills.map(s => ({
      url: `${BASE_URL}/${s.categories.slug}/${s.slug}`,
      lastModified: s.updated_at,
      changeFrequency: 'weekly',
      priority: 0.8,
    })),
  ];
}
```

### 9.5 Admin moderation route

| Concern | Approach |
|---|---|
| Auth | Supabase Auth magic link; middleware checks email is in `MODERATOR_EMAILS` env |
| Live updates | Server component fetches initial; client component subscribes to Realtime channel `moderation_queue` |
| Approve/decline | Server actions calling `apply-suggestion` Edge Function |
| Run Link Searcher button | Server action → POST to `link-searcher` Edge Function with `{ skill_id }` |
| Live progress | Edge Function streams via Supabase Realtime channel `agent_runs:<run_id>`; admin page subscribes |

---

## 10. LLM prompts

All prompts use Anthropic's `tool_use` (or OpenAI structured outputs) with explicit JSON schemas. Prompts referenced by ID elsewhere.

### 10.1 P1 — Search query expansion

```
SYSTEM: You are a learning-resource discovery assistant. Given a category and a sub-skill,
produce 3-5 search queries that maximize the chance of finding teaching-quality videos
or articles for that exact sub-skill, at any level (beginner to advanced).

Return tool call `queries` with shape: { queries: string[] }

Rules:
- queries must mention the sub-skill explicitly
- prefer technique-oriented phrasing ("how to", "drill", "tutorial", "footwork")
- avoid product/equipment queries unless the sub-skill is equipment-related

INPUT: category="{category.name}", sub_skill="{skill.name}", description="{skill.description}"
```

### 10.2 P2 — Transcript-based scoring

```
SYSTEM: You evaluate a candidate learning resource against a sub-skill.

Return tool call `score` with schema:
{
  relevance: number (0..1),       // does it teach this sub-skill?
  teaching_quality: number (0..1),// is the explanation clear and actionable?
  demo_vs_talk: number (0..1),    // 1 = mostly demonstration, 0 = mostly talking-head
  level: "beginner"|"intermediate"|"advanced",
  public_note: string (≤ 140 chars), // curator-style annotation
  evidence_quote: string (≤ 200 chars) // the most relevant transcript line
}

Rules:
- if the transcript does not actually teach the sub-skill, set relevance < 0.4
- be strict on teaching_quality; clickbait and rambling = low
- if uncertain, prefer lower scores

INPUT:
sub_skill: "{skill.name}"
sub_skill_description: "{skill.description}"
candidate_title: "{candidate.title}"
candidate_channel: "{candidate.channel}"
transcript_excerpt: "{first_3000_chars_of_transcript}"
```

### 10.3 P3 — Triangulation vote

```
SYSTEM: Decide whether the resource described is a good learning resource for the sub-skill.
Return tool call `vote` with schema:
{ approve: boolean, confidence: number (0..1), reason: string (≤ 200 chars) }

Rules:
- approve only if you would personally recommend it to a learner asking about this exact sub-skill
- be strict; this vote feeds an auto-approval threshold

INPUT:
sub_skill: "{skill.name}"
description: "{skill.description}"
candidate_title: "{candidate.title}"
candidate_url: "{candidate.url}"
candidate_summary: "{candidate.public_note}"  // from P2 output
```

---

## 11. Manual hypothesis validation (do this before writing code)

Each hypothesis has: question, manual procedure, pass criterion, plan B if it fails. Complete all of §11 before starting Phase 2 of the build.

### 11.1 H1 — YouTube Data API returns enough quality candidates per skill

| Field | Value |
|---|---|
| Question | Does `search.list` filtered to whitelisted channels return ≥10 candidate videos for a typical sub-skill query? |
| Procedure | 1. Get a YouTube Data API key. 2. From a terminal, for 3 sub-skills (e.g. `forehand smash`, `drop shot`, `split step`) and 3 channels each, run: <br>`curl "https://www.googleapis.com/youtube/v3/search?part=snippet&channelId=<CHANNEL_ID>&q=<SKILL>&maxResults=20&type=video&key=<KEY>"` <br> 3. Inspect JSON: count results; eyeball 5 results per skill for relevance |
| Pass | ≥10 candidates per skill across the 3 channels combined; ≥3 of 5 spot-checked are relevant |
| Plan B | Drop channel filter and rely on post-filter against trusted-source whitelist. Re-test. |

### 11.2 H2 — Transcripts are available for most candidate videos

| Field | Value |
|---|---|
| Question | What % of the candidates from H1 have transcripts available via `youtube-transcript`? |
| Procedure | For each video ID from H1, run a Node script: <br>`npx -p youtube-transcript node -e 'require("youtube-transcript").YoutubeTranscript.fetchTranscript("<VIDEO_ID>").then(r => console.log(r.length))'` <br> Count successes vs failures. |
| Pass | ≥70% of candidates have transcripts |
| Plan B | (a) Whisper API fallback ($0.006/min) for missing transcripts; (b) lower the bar to title+description scoring with explicit lower confidence cap |

### 11.3 H3 — Claude Haiku reliably scores relevance from transcripts

| Field | Value |
|---|---|
| Question | When run on hand-picked good and bad examples, does P2 produce sensible scores? |
| Procedure | 1. Hand-pick 10 videos: 5 you judge as great for a specific skill, 5 as off-topic but in the same channel. 2. Pull transcripts. 3. Run P2 (manually via curl to Anthropic API or via Anthropic Workbench) for each. 4. Compare LLM scores to your judgment. |
| Pass | Spearman correlation ≥ 0.7 between human and LLM relevance scores; no false-positive (relevance ≥ 0.7 on an off-topic video) more than 1 in 10 |
| Plan B | Tighten the prompt; add few-shot examples; lower auto-approval threshold; require 3/3 in triangulation |

### 11.4 H4 — Cross-AI triangulation produces meaningful agreement

| Field | Value |
|---|---|
| Question | When asked the same vote on the same candidate, do Claude / GPT / Perplexity actually disagree enough for triangulation to add signal — and do they agree often enough on good candidates that auto-approval volume is non-trivial? |
| Procedure | 1. Take the 10 H3 examples. 2. Run P3 against each model. 3. Compare votes. |
| Pass | (a) On the 5 good examples, ≥2 of 3 models approve in ≥4 cases. (b) On the 5 bad examples, ≥2 of 3 models approve in ≤1 case. |
| Plan B | If models always agree (no signal): drop triangulation, rely on Stage 2 only with stricter thresholds. If models always disagree (no auto-approvals): lower threshold to 1/3, treat as a tiebreaker rather than gate. |

### 11.5 H5 — Density of acceptable content is enough to populate G2

| Field | Value |
|---|---|
| Question | After running the full pipeline once across the seed taxonomy, do we get ≥5 vetted resources for ≥15 of the 20 skills? |
| Procedure | After Phase 2-3 of the build, run `link-searcher` once for each skill. Count `LINK_ADD` suggestions in `auto_approved` or `pending` per skill. |
| Pass | ≥15 skills have ≥5 candidates entering the pipeline; ≥10 of those have ≥3 auto-approved |
| Plan B | (a) Expand whitelist; (b) lower scoring thresholds; (c) accept lower density and document as a known limitation in the demo |

### 11.6 H6 — Google indexes the SSR pages reasonably

| Field | Value |
|---|---|
| Question | Does Google index `/[category]/[skill]` pages within 14 days of publishing the sitemap? |
| Procedure | After Phase 6 ships: 1. Submit sitemap via Search Console. 2. Use `site:` operator weekly. |
| Pass | ≥50% of skill pages indexed within 14 days |
| Plan B | Showcase doesn't depend on indexing rate; acceptable to ship as-is and note "designed for SEO indexing, real ranking out of scope." |

> **Build gate**: H1, H2, H3 must pass before writing the `link-searcher` Edge Function. H4 must pass before enabling auto-approval logic. H5 is a checkpoint after Phase 3. H6 is post-launch and informational.

---

## 12. Automation test requirements

Tests live alongside their code. CI runs all of them on every PR.

### 12.1 Coverage targets

| Layer | Tool | Min coverage |
|---|---|---|
| Edge Functions (TypeScript) | Vitest | 70% line coverage; 100% on apply rules and dedupe key generators |
| Web (Next.js) | Vitest + React Testing Library | 60% on data-shaping helpers |
| Web E2E | Playwright | every public route + admin happy paths |
| Mobile | Vitest + React Native Testing Library + Maestro | smoke tests for each screen |
| Database | SQL test files run with `supabase test db` | RLS for every table; trigger fires |

### 12.2 Required test cases

#### Edge Functions

| Test | What it asserts |
|---|---|
| `link-searcher.flow.test.ts` | Full pipeline against a fixture: stubbed YouTube API + stubbed Anthropic + stubbed OpenAI/Perplexity → expected suggestions inserted |
| `apply-suggestion.LINK_ADD.test.ts` | Approving creates `links` and `link_skill_relations` rows in one tx |
| `apply-suggestion.LINK_DETACH.test.ts` | Detaching last skill flips both relation and link to inactive |
| `submit-suggestion.dedupe.test.ts` | Submitting same canonical_url + skill_id twice returns existing pending suggestion |
| `triangulate.failure.test.ts` | One model failing counts as a non-approve, not an exception |

#### LLM regression (snapshot tests)

| Test | What it asserts |
|---|---|
| `prompts.P2.snapshot.test.ts` | Given fixture transcript X, P2 prompt rendered text matches a stored snapshot (catches accidental prompt edits) |
| `prompts.P2.score.fixtures.test.ts` | Run P2 against 5 stored transcripts; assert each returns a relevance within ±0.15 of the recorded baseline. Marked as `slow`; runs only in nightly CI to manage cost. |

#### Web E2E (Playwright)

| Test | What it asserts |
|---|---|
| `home.spec.ts` | `/` renders, has H1, has skill list |
| `skill-page.spec.ts` | `/badminton/forehand-smash` renders, has JSON-LD, has resource cards |
| `sitemap.spec.ts` | `/sitemap.xml` lists all active skills |
| `admin.queue.spec.ts` | Authenticated moderator sees pending items; can approve; new item appears via Realtime |

#### Mobile (Maestro)

| Flow | Steps |
|---|---|
| Browse and save | Open app → tap category → tap skill → tap save → open Saved tab → see resource |
| Filter by level | Open skill page → tap Beginner filter → list updates |

#### Database (SQL)

| Test | What it asserts |
|---|---|
| `rls.suggestions.test.sql` | Anon cannot select from `suggestions`; authenticated moderator can |
| `trg.revalidate.test.sql` | Inserting a row into `link_skill_relations` calls `net.http_post` once |
| `unique.dedupe.test.sql` | Conflicting `dedupe_key` insert raises unique violation |

### 12.3 CI

| Stage | What runs |
|---|---|
| Pre-commit | `lint` + `typecheck` + `vitest --run` |
| PR | the above + `playwright test` against a Supabase preview branch + `supabase test db` |
| Nightly | LLM regression suite + cost budget check (fails if total LLM cost in last run > $5) |

---

## 13. Build phases

| Phase | Deliverable | Done when |
|---|---|---|
| 0 | Hypothesis validation §11.1–§11.4 | All four pass; results captured in `docs/hypothesis_validation.md` |
| 1 | Supabase project + schema migration + seed data + RLS + auth allowlist | `supabase db push` produces working DB; mod login works |
| 2 | `link-searcher` Edge Function + Stage 2 scoring + manual API trigger | Running it for one skill produces ≥1 `pending` suggestion |
| 3 | `triangulate` + auto-approval path + `submit-suggestion` + `apply-suggestion` | An auto-approved suggestion creates link rows end-to-end |
| 4 | Admin web (Next.js) with moderation queue, login, approve/decline, Realtime, Run-now | Moderator can approve a pending suggestion and see it apply |
| 5 | Mobile app: home, skill list, skill detail with level filter, save/completed | All M-scenarios pass Maestro flows |
| 6 | Public web SEO pages: `/`, `/[category]`, `/[category]/[skill]`, sitemap, robots | Lighthouse SEO ≥ 95 on a sample skill page; sitemap valid |
| 7 | Revalidation trigger wired; ISR confirmed on content change | Approving a suggestion in admin updates the skill page within 30 s |
| 8 | `link-checker` Edge Function + weekly cron | One run produces at least one upvote/attach/detach suggestion |
| 9 | Tests to coverage targets §12.1; nightly CI | All tests pass; CI green |
| 10 | Hypothesis validation §11.5 (density check) | Results recorded; if fail, run mitigations from Plan B |
| 11 | Demo polish: agent run progress streaming, sample data screenshots, README | README has setup + demo recording link |

---

## 14. Open parameters / config

| Param | Default | Where set |
|---|---|---|
| `STAGE2_RELEVANCE_THRESHOLD` | 0.7 | Edge Function env |
| `STAGE2_QUALITY_THRESHOLD` | 0.6 | Edge Function env |
| `TRIANGULATION_APPROVE_COUNT` | 2 | Edge Function env |
| `LINK_SEARCHER_MAX_CANDIDATES_PER_RUN` | 30 | Edge Function env |
| `RUN_COST_CAP_USD` | 0.50 | Edge Function env |
| `MODERATOR_EMAILS` | comma-separated list | Vercel + Supabase env |
| `REVALIDATE_SECRET` | random 32 bytes | Vercel + Supabase secrets |
| `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `PERPLEXITY_API_KEY` | — | Supabase secrets (function env) |
| `YOUTUBE_API_KEY` | — | Supabase secrets |
| `BASE_URL` | `https://<vercel-project>.vercel.app` | Web env |

---

## 15. Repository layout

```
.
├── apps/
│   ├── mobile/                  # Expo
│   └── web/                     # Next.js (public + admin)
├── supabase/
│   ├── migrations/              # SQL migrations
│   ├── functions/
│   │   ├── link-searcher/
│   │   ├── link-checker/
│   │   ├── submit-suggestion/
│   │   ├── apply-suggestion/
│   │   ├── triangulate/
│   │   └── revalidate-web/
│   ├── seed.sql
│   └── tests/
├── packages/
│   └── shared/                  # Zod schemas, prompt templates, types shared between web and edge
├── docs/
│   ├── hypothesis_validation.md # results from §11
│   └── demo_script.md
├── .github/workflows/
│   ├── ci.yml
│   └── nightly.yml
└── README.md
```

---

## 16. Definition of done (for v1)

- [ ] All scenarios in §4 work end-to-end
- [ ] Hypothesis validation §11.1–§11.5 results recorded; G2 density target met or limitation documented
- [ ] Test coverage targets §12.1 met
- [ ] Lighthouse SEO ≥ 95 on a representative skill page
- [ ] Demo recording shows: agent run from admin → moderator approval → mobile app refresh → web page revalidation, all visible in one cut
- [ ] README documents setup, env vars, demo run instructions
