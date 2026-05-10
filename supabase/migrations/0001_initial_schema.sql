create extension if not exists pgcrypto;
create extension if not exists pg_cron;
create extension if not exists pg_net;
create extension if not exists supabase_vault with schema vault;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table public.categories (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  name text not null,
  description text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.skills (
  id uuid primary key default gen_random_uuid(),
  category_id uuid not null references public.categories(id),
  slug text not null,
  name text not null,
  description text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (category_id, slug)
);
create index skills_active_category_idx on public.skills (category_id) where is_active;

create table public.trusted_sources (
  id uuid primary key default gen_random_uuid(),
  source_type text not null check (source_type in ('youtube_channel', 'domain', 'rss')),
  identifier text not null,
  display_name text not null,
  category_id uuid references public.categories(id),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (source_type, identifier)
);

create table public.links (
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
create index links_domain_idx on public.links (domain);

create table public.link_skill_relations (
  id uuid primary key default gen_random_uuid(),
  link_id uuid not null references public.links(id),
  skill_id uuid not null references public.skills(id),
  public_note text,
  skill_level text check (skill_level in ('beginner','intermediate','advanced')),
  upvote_count integer not null default 0,
  is_active boolean not null default true,
  last_checked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (link_id, skill_id)
);
create index link_skill_relations_active_skill_idx on public.link_skill_relations (skill_id) where is_active;
create index link_skill_relations_last_checked_idx on public.link_skill_relations (last_checked_at) where is_active;

create table public.internal_users (
  id uuid primary key default gen_random_uuid(),
  display_name text not null,
  is_agent_actor boolean not null default true,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.internal_user_category_interests (
  id uuid primary key default gen_random_uuid(),
  internal_user_id uuid not null references public.internal_users(id),
  category_id uuid not null references public.categories(id),
  weight integer not null default 1 check (weight > 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (internal_user_id, category_id)
);

create table public.moderators (
  id uuid primary key default gen_random_uuid(),
  email text unique not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create type public.suggestion_type as enum (
  'LINK_ADD',
  'LINK_ATTACH_SKILL',
  'LINK_DETACH_SKILL',
  'LINK_UPVOTE_SKILL',
  'SKILL_CREATE',
  'SKILL_DELETE'
);
create type public.suggestion_status as enum ('pending','approved','declined','auto_approved');

create table public.suggestions (
  id uuid primary key default gen_random_uuid(),
  type public.suggestion_type not null,
  status public.suggestion_status not null default 'pending',
  origin_type text not null check (origin_type in ('agent','admin','human','import')),
  origin_name text,
  author_internal_user_id uuid references public.internal_users(id),
  category_id uuid references public.categories(id),
  skill_id uuid references public.skills(id),
  link_id uuid references public.links(id),
  payload_json jsonb not null,
  evidence_json jsonb,
  triangulation_json jsonb,
  confidence numeric(4,3),
  dedupe_key text not null,
  created_at timestamptz not null default now(),
  decided_at timestamptz,
  moderator_user_id uuid
);
create index suggestions_status_created_idx on public.suggestions (status, created_at desc);
create index suggestions_pending_skill_idx on public.suggestions (skill_id) where status = 'pending';
create unique index suggestions_active_dedupe_key_idx
on public.suggestions (dedupe_key)
where status in ('pending','approved','auto_approved');

create table public.agent_runs (
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
create index agent_runs_started_idx on public.agent_runs (started_at desc);

create table public.agent_run_events (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.agent_runs(id) on delete cascade,
  level text not null check (level in ('debug','info','warn','error')),
  event_type text not null,
  message text not null,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index agent_run_events_run_created_idx on public.agent_run_events (run_id, created_at);

create trigger categories_set_updated_at
before update on public.categories
for each row execute function public.set_updated_at();

create trigger skills_set_updated_at
before update on public.skills
for each row execute function public.set_updated_at();

create trigger links_set_updated_at
before update on public.links
for each row execute function public.set_updated_at();

create trigger link_skill_relations_set_updated_at
before update on public.link_skill_relations
for each row execute function public.set_updated_at();

create trigger internal_user_category_interests_set_updated_at
before update on public.internal_user_category_interests
for each row execute function public.set_updated_at();

alter table public.categories enable row level security;
alter table public.skills enable row level security;
alter table public.trusted_sources enable row level security;
alter table public.links enable row level security;
alter table public.link_skill_relations enable row level security;
alter table public.internal_users enable row level security;
alter table public.internal_user_category_interests enable row level security;
alter table public.moderators enable row level security;
alter table public.suggestions enable row level security;
alter table public.agent_runs enable row level security;
alter table public.agent_run_events enable row level security;

create or replace function public.is_moderator()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.moderators
    where lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
      and is_active = true
  );
$$;

create or replace function public.get_vault_secret(secret_name text)
returns text
language sql
stable
security definer
set search_path = public, vault
as $$
  select decrypted_secret
  from vault.decrypted_secrets
  where name = secret_name
  limit 1;
$$;

revoke execute on function public.get_vault_secret(text) from public, anon, authenticated;
grant execute on function public.get_vault_secret(text) to service_role;

create policy "active categories are public"
on public.categories for select
to anon, authenticated
using (is_active = true);

create policy "moderators manage categories"
on public.categories for all
to authenticated
using (public.is_moderator())
with check (public.is_moderator());

create policy "active skills are public"
on public.skills for select
to anon, authenticated
using (is_active = true);

create policy "moderators manage skills"
on public.skills for all
to authenticated
using (public.is_moderator())
with check (public.is_moderator());

create policy "active links are public"
on public.links for select
to anon, authenticated
using (is_active = true);

create policy "moderators manage links"
on public.links for all
to authenticated
using (public.is_moderator())
with check (public.is_moderator());

create policy "active link skill relations are public"
on public.link_skill_relations for select
to anon, authenticated
using (is_active = true);

create policy "moderators manage link skill relations"
on public.link_skill_relations for all
to authenticated
using (public.is_moderator())
with check (public.is_moderator());

create policy "internal users are public"
on public.internal_users for select
to anon, authenticated
using (is_active = true);

create policy "moderators manage internal users"
on public.internal_users for all
to authenticated
using (public.is_moderator())
with check (public.is_moderator());

create policy "moderators read trusted sources"
on public.trusted_sources for select
to authenticated
using (public.is_moderator());

create policy "moderators manage trusted sources"
on public.trusted_sources for all
to authenticated
using (public.is_moderator())
with check (public.is_moderator());

create policy "moderators manage interests"
on public.internal_user_category_interests for all
to authenticated
using (public.is_moderator())
with check (public.is_moderator());

create policy "moderators read moderator allowlist"
on public.moderators for select
to authenticated
using (public.is_moderator());

create policy "moderators manage suggestions"
on public.suggestions for all
to authenticated
using (public.is_moderator())
with check (public.is_moderator());

create policy "moderators manage agent runs"
on public.agent_runs for all
to authenticated
using (public.is_moderator())
with check (public.is_moderator());

create policy "moderators manage agent run events"
on public.agent_run_events for all
to authenticated
using (public.is_moderator())
with check (public.is_moderator());

create or replace function public.get_skill_resource_counts(p_skill_ids uuid[])
returns table(skill_id uuid, resource_count bigint)
language sql
stable
security definer
set search_path = public
as $$
  select lsr.skill_id, count(*)::bigint
  from public.link_skill_relations lsr
  where lsr.is_active
    and lsr.skill_id = any(p_skill_ids)
  group by lsr.skill_id;
$$;

grant execute on function public.get_skill_resource_counts(uuid[]) to anon, authenticated;

insert into public.categories (id, slug, name, description)
values (
  '00000000-0000-4000-8000-000000000001',
  'badminton',
  'Badminton',
  'A focused library of technique, movement, strategy, and equipment resources for badminton learners.'
)
on conflict (slug) do nothing;

insert into public.skills (id, category_id, slug, name, description)
values
  ('00000000-0000-4000-8000-000000000101', '00000000-0000-4000-8000-000000000001', 'forehand-clear', 'Forehand clear', 'Send the shuttle deep from the rear court with a relaxed overhead action.'),
  ('00000000-0000-4000-8000-000000000102', '00000000-0000-4000-8000-000000000001', 'backhand-clear', 'Backhand clear', 'Recover from pressure with a compact backhand clear toward the rear court.'),
  ('00000000-0000-4000-8000-000000000103', '00000000-0000-4000-8000-000000000001', 'forehand-smash', 'Forehand smash', 'Generate steep power from rotation, timing, contact point, and follow-through.'),
  ('00000000-0000-4000-8000-000000000104', '00000000-0000-4000-8000-000000000001', 'backhand-smash', 'Backhand smash', 'Use a short backhand action to attack from awkward rear-court positions.'),
  ('00000000-0000-4000-8000-000000000105', '00000000-0000-4000-8000-000000000001', 'drop-shot', 'Drop shot', 'Disguise soft overhead shots that pull opponents into the front court.'),
  ('00000000-0000-4000-8000-000000000106', '00000000-0000-4000-8000-000000000001', 'net-shot', 'Net shot', 'Control tight spinning replies close to the tape.'),
  ('00000000-0000-4000-8000-000000000107', '00000000-0000-4000-8000-000000000001', 'drive', 'Drive', 'Play fast flat exchanges through the mid-court with compact preparation.'),
  ('00000000-0000-4000-8000-000000000108', '00000000-0000-4000-8000-000000000001', 'lift', 'Lift', 'Lift from the front court to reset rallies or move opponents backward.'),
  ('00000000-0000-4000-8000-000000000109', '00000000-0000-4000-8000-000000000001', 'push', 'Push the shuttle into open mid-court spaces with quick racket preparation.'),
  ('00000000-0000-4000-8000-000000000110', '00000000-0000-4000-8000-000000000001', 'serve-high', 'Serve (high)', 'Use a high serve to start singles rallies with depth and height.'),
  ('00000000-0000-4000-8000-000000000111', '00000000-0000-4000-8000-000000000001', 'serve-low', 'Serve (low)', 'Keep low serves tight and legal for doubles and singles pressure.'),
  ('00000000-0000-4000-8000-000000000112', '00000000-0000-4000-8000-000000000001', 'footwork-front-court', 'Footwork (front court)', 'Move efficiently into lunges and recover from front-court shots.'),
  ('00000000-0000-4000-8000-000000000113', '00000000-0000-4000-8000-000000000001', 'footwork-rear-court', 'Footwork (rear court)', 'Reach rear-court corners with chasse, scissor, and recovery steps.'),
  ('00000000-0000-4000-8000-000000000114', '00000000-0000-4000-8000-000000000001', 'footwork-split-step', 'Footwork (split step)', 'Time the split step to react explosively to the opponent''s hit.'),
  ('00000000-0000-4000-8000-000000000115', '00000000-0000-4000-8000-000000000001', 'defense-block', 'Defense (block)', 'Absorb smashes and guide controlled blocks into the front court.'),
  ('00000000-0000-4000-8000-000000000116', '00000000-0000-4000-8000-000000000001', 'defense-lift', 'Defense (lift)', 'Defend hard attacks by lifting high and deep under pressure.'),
  ('00000000-0000-4000-8000-000000000117', '00000000-0000-4000-8000-000000000001', 'singles-strategy', 'Singles strategy', 'Construct rallies with space, patience, tempo, and recovery position.'),
  ('00000000-0000-4000-8000-000000000118', '00000000-0000-4000-8000-000000000001', 'doubles-rotation', 'Doubles rotation', 'Coordinate attack, defense, and side-by-side rotations with a partner.'),
  ('00000000-0000-4000-8000-000000000119', '00000000-0000-4000-8000-000000000001', 'grip-technique', 'Grip technique', 'Switch between forehand, backhand, bevel, and panhandle grips cleanly.'),
  ('00000000-0000-4000-8000-000000000120', '00000000-0000-4000-8000-000000000001', 'wrist-rotation', 'Wrist rotation', 'Use forearm and wrist rotation for deception, speed, and control.'),
  ('00000000-0000-4000-8000-000000000121', '00000000-0000-4000-8000-000000000001', 'stringing-and-tension', 'Stringing and tension', 'Understand string choice and tension tradeoffs for feel, control, and power.')
on conflict (category_id, slug) do nothing;

insert into public.trusted_sources (source_type, identifier, display_name, category_id)
values
  ('youtube_channel', 'UC2cKr3rQwlR2Z6CSNa3Lqlw', 'Badminton Insight', '00000000-0000-4000-8000-000000000001'),
  ('youtube_channel', 'UCkzL9CwOJ4ZDSkpb2rj_RIw', 'Badminton Famly', '00000000-0000-4000-8000-000000000001'),
  ('youtube_channel', 'UCtuSKlYXWXwlu6_3OYDjVTQ', 'Coach Lee', '00000000-0000-4000-8000-000000000001'),
  ('youtube_channel', 'UCWHtFQg1mOHLXLqM_GFaXgw', 'BWF', '00000000-0000-4000-8000-000000000001'),
  ('youtube_channel', 'UC_kCu9-TFC4jPQXNvmsMcUw', 'Mix Badminton', '00000000-0000-4000-8000-000000000001'),
  ('youtube_channel', 'UCvxrFGFY-w5p_Z4OS7yyEhA', 'ShuttleAmp', '00000000-0000-4000-8000-000000000001'),
  ('domain', 'badmintonbites.com', 'Badminton Bites', '00000000-0000-4000-8000-000000000001'),
  ('domain', 'badmintonpassion.com', 'Badminton Passion', '00000000-0000-4000-8000-000000000001'),
  ('domain', 'badmintonfamly.com', 'Badminton Famly Blog', '00000000-0000-4000-8000-000000000001')
on conflict (source_type, identifier) do nothing;

insert into public.internal_users (id, display_name, is_agent_actor)
values
  ('00000000-0000-4000-8000-000000000201', 'AI Scout', true),
  ('00000000-0000-4000-8000-000000000202', 'System Curator', true),
  ('00000000-0000-4000-8000-000000000203', 'Quality Checker', true)
on conflict (id) do nothing;

insert into public.internal_user_category_interests (internal_user_id, category_id, weight)
values
  ('00000000-0000-4000-8000-000000000201', '00000000-0000-4000-8000-000000000001', 3),
  ('00000000-0000-4000-8000-000000000202', '00000000-0000-4000-8000-000000000001', 2),
  ('00000000-0000-4000-8000-000000000203', '00000000-0000-4000-8000-000000000001', 1)
on conflict (internal_user_id, category_id) do nothing;
