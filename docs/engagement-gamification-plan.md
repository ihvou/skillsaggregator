# Engagement & Retention — Implementation Plan (v2)

> Status: proposed (2026-06-18), amended 2026-08-29 for the closed-testing identity batch. **v2 supersedes v1** — rebased after discovering the parallel thread shipped the save/watched/vote data layer in migration `0025_community_actions_and_coach_security.sql`.
> Goal: engagement and **retention** (in scope; new tables / complexity acceptable when effective).
> Tracking tasks: `M54`–`M63`, `MI24`–`MI31`, `N7` (revised for v2) + new rows in [`tasks.md`](../tasks.md).

## 0. Read first — what changed since v1

The engagement **data spine already exists** (migration `0025`, plus app wiring by the parallel thread). v2 builds the progress/badge/notification layer as **derived state on top of it**, and does **not** introduce the `user_actions`-based tables v1 proposed.

Shipped and in use:
- Tables (all **auth-only**, RLS own-read, keyed by `link_skill_relation_id` where applicable): `user_bookmarks` (Watch later), `user_watched` (Watched, has `watched_at`), `user_relation_votes` (votes).
- RPCs: `set_user_bookmark(relation_id, saved)`, `set_user_watched(relation_id, watched)`, `set_user_vote(relation_id, vote)` — auth required, published+active relations only. `set_user_watched` preserves earliest `watched_at`.
- Ranking: `link_skill_relations.combined_score` + best-first index `(skill_id, combined_score desc …) where is_active and published`. Publish gate (15-min cron) controls which relations are visible/actionable.
- `get_skill_resource_counts(uuid[])` → per-skill total of active+published relations (anon-callable) = the progress **denominator source**.
- UI: both apps have a **Library** with `Watch later | Watched` tabs and a `ResourceCard` (watch-later/watch/vote + coach's take). Web: `apps/web/app/saved/page.tsx` → `SavedResourceBrowser`, `useResourceActions`, `NavLinks` "My library". Mobile: `apps/mobile/app/(tabs)/library/index.tsx` → `getUserLibraryResources`, `ResourceCard`.

## 1. Confirmed decisions (this session)

- **D1 — Real anonymous identity, not local-first.** Save/Watch/Vote/Suggest create a Supabase anonymous user lazily on the first write action. Anonymous users still use a real JWT and the `authenticated` Postgres role, so the existing own-row RLS/RPC model remains the boundary. Registration is an upgrade path: email uses `updateUser`, OAuth uses `linkIdentity`, and rows keyed by `auth.uid()` stay attached when the anonymous user becomes permanent. No client-supplied device id, no local-first persistence, and no anon→server reconciliation queue.
- **D2 — Watch later is a derived list that empties as you watch.** Watch later = bookmarked **minus** watched (non-destructive; the bookmark row is kept). Watched list = everything in `user_watched` (including items never bookmarked). No destructive move. *(This also fixes confirmed bug B-1, §5.)*
- **D3 — The web personal hub is the existing Library** (`/saved`), augmented in place. **No new `/me` route.**
- **D4 — Skill completion = watched a fixed TARGET of a skill's resources.** Default target = `least(3, published_resource_count)` so skills with <3 resources can still complete. Best-first ordering (`combined_score`) means "watch any 3" ≈ "watch the 3 best." Optional `skills.completion_target` override later.
- **D5 — Badges are DERIVED** (skill badge ⇔ watched ≥ target; category badge ⇔ category complete). No points/XP economy. Optional slim `user_category_badges(earned_at)` only if we want prestige timestamps / confetti-once semantics.
- **Category progress = a single bar** per category (completed skills / total or category target). **Level = a filter lens** (reuse the existing level filter / Learning Path), **not** three per-level bars.
- **Category badge homes: primary = category page header** (bar→badge transform); **secondary = Library header.** (Skill badges, by contrast, are functional **filter chips** on Watch later/Watched/Skill pages.)

## 2. Behavioural goal (north star)

Bring identified learners back a few times a week to work through their **Watch later queue** and make **visible progress** toward completable skills. The identity may start anonymous and later be upgraded. Content is **evergreen**, so retention comes from the user's own list + progress, **not** content freshness. We reward honest forward motion; we do not manufacture streak-guilt.

## 3. Model & definitions (mapped to shipped tables)

| Concept | Definition | Source |
|---|---|---|
| Watch later | bookmarked and **not yet** watched | `user_bookmarks` − `user_watched` |
| Watched (archive) | marked watched (saved earlier or not) | `user_watched` |
| Skill progress | `min(watched_in_skill, target) / target` | `user_watched` ⨝ `link_skill_relations` by `skill_id` |
| Skill complete / badge | `watched_in_skill ≥ target` (target = `least(3, published_count)`) | derived |
| Category progress | `skills_completed / skills_in_category` (or category target) | derived from skill completion |
| Category badge | category complete (all / target skills) | derived (+ optional `earned_at` table) |
| Level | a **filter lens** over resources/skills | `link_skill_relations.skill_level` / `skills.learning_order` |

## 4. Already-built inventory (do not rebuild)

| Capability | Where | Status |
|---|---|---|
| Save/Watch/Vote tables + RPCs (auth-only, relation-keyed) | `0025` | ✅ done |
| Best-first ordering + publish gate | `0025`, `0023` | ✅ done |
| Per-skill total count RPC | `get_skill_resource_counts` (`0023`) | ✅ done |
| Library (Watch later / Watched tabs) | web `SavedResourceBrowser`, mobile `getUserLibraryResources` | ✅ done |
| ResourceCard save/watch/vote + coach's take | web + mobile `ResourceCard` | ✅ done |
| Level filter / Learning Path lens | web `SortFilterMenu`/`CategoryResourceBrowser`, mobile `LevelFilter` | ✅ reusable |
| Web auth (magic-link/Google), signed-in nav | `supabase.ts`, `browserSupabase.ts`, `NavLinks` | ✅ done |

Everything below (progress, badges, category rollup, stats, notifications, onboarding win, confetti, weekly ring, external share-in) is **greenfield**.

## 5. Bugs found (in shipped Library)

- **B-1 (fixed in migration `0054`).** Watch later used to include already-watched items because `get_user_library_resources('saved')` did not subtract watched links. The saved branch now excludes any bookmarked link that also appears in the user's watched history, while preserving the bookmark row for order/history. (Task M56.)
- **B-2 (needs data confirmation).** User reports Library items with **no** saved/watched mark. Not reproducible from code — list and card marks are keyed identically to `link_skill_relation_id`, and hydration already filters `is_active+published`. Most likely **pre-v2 data** (bookmarks made under the old link-keyed model) or a relation since unpublished. Diagnostic: list the user's `user_bookmarks`/`user_watched` rows left-joined to `link_skill_relations` and look for `published/is_active = f/null`. **Fix if confirmed:** a one-off cleanup of orphaned rows + ensure both the Library list *and* the card read apply the same published+active filter. (Task M97.)

## 6. Data model & backend (the delta)

Conventions: `security definer set search_path=public`, `auth.uid()` null-check, `revoke from public/anon`, `grant execute to authenticated` (matches `0025`/`0027`). **Next free migration: `0038`.**

### 6.1 `0038_engagement_progress_rpcs.sql` — the key missing piece
```sql
-- watched-count vs target per skill for the current user (drives bars, badges, chips)
create function public.get_user_skill_progress(p_skill_ids uuid[])
returns table (skill_id uuid, total_count int, watched_count int, target int, completed boolean)
language sql security definer set search_path = public as $$
  with tot as (
    select r.skill_id, count(*)::int total
    from link_skill_relations r
    where r.skill_id = any(p_skill_ids) and r.is_active and r.published
    group by r.skill_id
  ),
  w as (
    select r.skill_id, count(distinct r.id)::int watched
    from user_watched uw
    join link_skill_relations r on r.id = uw.link_skill_relation_id
    where uw.user_id = auth.uid() and r.skill_id = any(p_skill_ids) and r.is_active and r.published
    group by r.skill_id
  )
  select s as skill_id,
         coalesce(tot.total,0),
         coalesce(w.watched,0),
         least(3, coalesce(tot.total,0)) as target,
         coalesce(w.watched,0) >= least(3, coalesce(tot.total,0)) and coalesce(tot.total,0) > 0
  from unnest(p_skill_ids) s
  left join tot on tot.skill_id = s
  left join w on w.skill_id = s;
$$;
grant execute on function public.get_user_skill_progress(uuid[]) to authenticated;
```
- **Category rollup:** compute client-side from `get_user_skill_progress` over a category's skills (cheaper than a second RPC); add a dedicated rollup RPC only if a category page needs it without loading all skills.
- **Completion target:** v1 uses `least(3, total)` inline (above). If per-skill overrides are wanted later, add `skills.completion_target int not null default 3` and swap `least(3,total)` → `least(completion_target, total)`.

### 6.2 Watch-later-minus-watched (B-1 fix) — migration `0054`
`get_user_library_resources('saved')` owns the set difference. Its saved branch excludes links already represented in `user_watched`, so both web and mobile get the same Watch later behavior through the shared RPC. Watched tab unchanged.

### 6.3 Badges — derived (D5)
Skill/category badges are computed from `get_user_skill_progress` (skill: `completed=true`; category: all/target skills completed). No table for v1. **Optional** `0039_category_badge_earned.sql` → `user_category_badges(user_id, category_id, earned_at)` only if we want prestige timestamps and confetti-once.

### 6.4 Deferred (Phase 2) — notifications
`user_follows`, `notification_queue`, `user_push_tokens`, enqueue/worker — migrations `0040+`, built only when we start §10. Not part of the first ship.

## 7. Shared package (`packages/shared/src`)

Pure, no I/O, consumed by both apps:
- `engagement-types.ts` — `SkillProgress { skillId, total, watched, target, percent, completed }`, `CategoryProgress`, `BadgeState`.
- `progress.ts` — `computeSkillProgress(row)`, `computeCategoryProgress(skillProgress[])`, `percentFor(row)` (endowed floor when `watched>0`), `remainingToComplete(row)`.
- `badges.ts` — `isSkillComplete(row)`, `isCategoryComplete(rows, target?)`, badge metadata (name/icon/tier per category).
Both apps feed rows from `get_user_skill_progress` into these so bar/badge math is identical.

## 8. Mobile implementation (delta)

Deps to install (missing): `react-native-reanimated`, `react-native-confetti-cannon`. (`react-native-svg` present for bars/rings.) Notifications deps deferred to §10.

- **Watch-later-minus-watched (B-1):** read `getUserLibraryResources('saved')` through the RPC fixed in migration `0054`.
- **Progress bars:** new `SkillProgressBar.tsx` (svg), fed by `get_user_skill_progress`. Placement: skill detail header (`(home)/[category]/[skill].tsx`), and as **skill filter chips carrying the bar** on the Library (Watch later/Watched).
- **Skill badge:** bar transforms into badge at `completed`; badges act as **filter chips** on Library + skill screens.
- **Category:** single progress bar + level lens on `(home)/[category]/index.tsx`; **category badge in the category page header** (bar→badge) and **Library header** (secondary).
- **Stats + weekly ring:** `StatsPanel.tsx` + forgiving `WeeklyRing.tsx` (from `user_watched.watched_at`) on the Library/Account surface.
- **Milestone confetti:** `MilestoneConfetti.tsx`, fires only on a new skill/category completion (not per watch).
- **Onboarding early win:** after the first identity-creating action, seed the picked interest's first skill toward its first step and route to a great first resource with a clear Save.
- **External share-in:** share-sheet/paste a URL → save to the user's list + submit as a suggestion to moderation (reuses the suggest pipeline; needs a "save an external link to my list" path).

## 9. Web implementation (delta — augment Library)

No onboarding, no notifications, no confetti on web. Anonymous users can save/watch/vote/suggest because they have a real Supabase Auth identity. Show upgrade nudges only when the user has personal state worth preserving.

- **Watch-later-minus-watched (B-1):** read `SavedResourceBrowser` through the RPC fixed in migration `0054`.
- **Progress bars:** new `PerSkillProgress.tsx` on the skill page (`app/[category]/[skill]`, inside `SkillResourceBrowser` after the description) + as **skill filter chips** on the Library.
- **Skill badges:** bar→badge + badge-as-filter chips on Library/Skill pages.
- **Category:** single progress bar + level lens on `app/[category]/page.tsx`; **category badge in the category page header** and **Library header** (secondary) — per D3/decision.
- **Stats + weekly ring:** add a stats/progress header and SVG weekly ring to the **Library** page (the hub). No new `/me` route.
- Data: server aggregates via `get_user_skill_progress` using `getAuthSupabase` in server components where possible; per-card widgets stay client (`getBrowserSupabase`) to preserve ISR on catalog pages.

## 10. Notifications (Phase 2, mobile only) — reframed

Primary logic is about the **user's own list/progress**, not content freshness (evergreen catalog):
1. **Playlist resurfacing** — "You have N videos waiting." (primary)
2. **Open-loop** — "One more video to complete <skill>." (goal-gradient)
3. **Stale-save** — "Still want to watch <title> from your list?"
4. **New content** — secondary, opt-in, only for users who completed a skill's target and chose to follow it.
Infra (deferred): `user_follows`, `notification_queue`, `user_push_tokens`, `expo-notifications`, a worker (host TBD). Because 1–3 depend only on the user's own data, notifications keep working even if content supply slows.

## 11. Testing

- **Shared unit (Vitest):** `progress.test.ts` (target = least(3,total), never-0% floor, mastery boundary, total=0), `badges.test.ts` (skill/category completion, category target).
- **SQL/RLS:** `get_user_skill_progress` returns `auth.uid()`-scoped counts; respects publish gate; Watch-later-minus-watched difference correct.
- **Mobile Maestro:** watch to target → bar fills → badge + confetti; Watch later item disappears from Watch later after watched, appears in Watched; category badge on category header.
- **Web Playwright:** anon sees catalog and can create personal state; identified Library shows progress/badges/stats; skill page bar appears when user state exists.

## 12. Rollout sequencing

1. `M55` shared package (progress/badges math).
2. `M54` `get_user_skill_progress` RPC (`0038`).
3. `M56` Watch-later-minus-watched (B-1 fix) + `M97` B-2 data cleanup.
4. `M57` completion-target model → `M58` skill progress bars (mobile + web) → `MI31` skill filter chips.
5. `M60` skill badges (bar→badge + filter) → `M59` category progress (bar + level lens) → `M61` category badges (header + Library header).
6. `M62` stats + weekly ring; `M63` onboarding win + confetti (mobile).
7. `MI24` external share-in.
8. Phase 2 (`MI29`/`MI30`): follows + notifications.

## 13. Task index

See [`tasks.md`](../tasks.md): `M54`–`M63`, `MI24`–`MI31`, `N7` (revised for v2) and `M97` (B-2 cleanup). New Phase-2 rows for follows/notifications are `MI29`/`MI30`.

## 14. Open questions

- **B-2 platform:** web, mobile, or both? Determines whether the fix is data-only or also client.
- **Category "complete":** all sub-skills, or a category target (e.g. 6 core skills) so it stays achievable as the taxonomy grows (`0037` expanded it)?
- **Onboarding early win under anonymous identity:** seed progress after the first identity-creating action, or show a pre-action teaser that converts on Save?
- **Confetti-once / prestige timestamps:** add the slim `user_category_badges` table, or keep purely derived + a local "celebrated" flag?
- **Notification worker host** (Phase 2): Supabase Edge cron, the nightly script, or Vercel cron.
