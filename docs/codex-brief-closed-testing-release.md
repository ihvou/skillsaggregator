# Codex brief — the next closed-testing release

Written 2026-08-27. **`tasks.md` is the source of truth for every item below**; this document
only says what is in the release, in what order, and which decisions are already settled.
Every ID here links to a row there — read the row before writing code, because several of them
were rewritten on 2026-08-27 and the old wording is misleading.

## The shape of it

**One build, three review batches.** The batches exist only so the change set can be reviewed
properly — they are NOT separate releases, and they are not a dependency plan. Sequence the work
however suits you; just hand it over in these three groups, in this order.

The grouping is by **how much review attention each needs**, nothing else:

| batch | why it is separate |
|---|---|
| **1. Identity** | Small diff, highest risk. Touches auth, RLS and the publish gate. Needs to be read on its own or a security mistake hides in the noise. |
| **2. Share-in** | Largest diff. Client and server together, because the contract between them is the thing worth checking — reviewing one half in isolation proves nothing. |
| **3. Everything else** | Bug fixes, onboarding, polish. Low risk, self-evident, quick pass. |

Two consequences of it being one build:

- Pushing to the **same** closed track does not restart Google's 14-day / 12-tester clock. What
  restarts it is testers dropping below 12, or a new track. Do not create a new track.
- The onboarding copy may only describe what actually shipped. See the constraint in `M121`.

## Working agreements — read before touching the database or hosted config

These are not style preferences. Each one has already cost real time on this project.

### The database

**Hosted Supabase is production. `supabase/config.toml` is LOCAL ONLY.**

1. **Every schema or data change ships as a committed migration file.** No exceptions. On
   2026-08-29 production was running seven new sports and 243 sub-skills whose migrations existed
   only in one working directory — untracked, unpushed, one disk failure from unrecoverable.
2. **Apply with `supabase db push`**, which records the migration in
   `supabase_migrations.schema_migrations`. If you ever apply SQL to hosted by another route,
   `supabase migration repair --status applied <version>` **in the same sitting** — not later.
3. **Finish by running `supabase migration list --linked` and confirming the Remote column is
   populated for every row.** Twelve migrations (`0039`-`0052`) had been applied to production
   with no history record; the next `db push` would have tried to re-run all of them. This has
   now been repaired twice. There should not be a third time.
4. **Never renumber or rename a migration that has been applied.** Commit `165b095` renamed three
   applied migrations, which is what desynchronised the history in the first place.
5. **A migration must be safe to re-run** (`create or replace`, `if not exists`,
   `on conflict do nothing`), because sooner or later one will be.

### Hosted configuration

6. **Do not run `supabase config push`.** It pushes the whole local `[auth]` block, which sets
   `site_url = "http://localhost:3000"` and an `additional_redirect_urls` list containing the old
   `skillsaggregator://` scheme. Running it would point production magic links at localhost and
   drop `subskills://auth/callback` from the allowlist — breaking sign-in on both web and mobile.
7. **Settings that live only in the dashboard must be called out explicitly in the handover**, not
   just mirrored into `config.toml` and assumed. Anonymous sign-ins and manual identity linking
   are dashboard toggles; setting them locally does nothing for production.
8. **Where a change needs a dashboard toggle, say so in the handover AND state the deploy order.**
   Batch 1 shipped web code that calls `signInAnonymously()` while the provider was still disabled
   on hosted — merging before the toggle would have shown every signed-out visitor a red
   "Anonymous sign-ins are disabled" where the sign-in prompt used to be.

### Verification

9. **"The documentation says so" is not verification.** If a brief says *verify*, run the thing
   and record the observed result. Batch 1 handed over `docs/anonymous-auth-verification.md`
   citing the Supabase docs for id preservation on anonymous → permanent upgrade — a
   load-bearing assumption, asserted rather than tested. Running it afterwards confirmed the
   claim **and** surfaced two things the docs did not say: the account stays anonymous until the
   confirmation link is clicked, and upgrading with an email that already has an account fails
   with `email_exists` (now `M122`). Both were found by running it, neither by reading it.
10. **Prove behaviour against production, not against the repo.** Deployed edge functions have
    silently lagged their source by seven weeks before, and a stale deploy is invisible in a diff.
11. **Run every migration against a real database before handing it over.** Batch 2's `0053` was
    written, committed and handed over having never been executed. It failed on the first real
    apply with `SQLSTATE 42P16`. A migration that has not been run is not finished — it is a
    draft. `supabase db push` against the linked project, or `supabase db reset` locally, either
    proves it; reading it does not.

## Decisions already made — do not re-litigate

**1. Unregistered users get a real identity, not a device id.** Supabase anonymous sign-in
(`M120`). An anonymous user gets a genuine JWT, so edge functions verify identity exactly as
today and nothing is forgeable. Registration becomes an *upgrade*, not a gate. This reverses
plan decision D1 in `docs/engagement-gamification-plan.md` §1 — update that file, do not leave
it contradicting the code.

Rejected alternative: a client-supplied device id. It is a claim, not a credential, and would
reopen the unauthenticated-suggestion hole closed on 2026-08-12.

**2. Share-in creates two entities.** A private entry (always) and a public candidate (only if
the user ticks "Recommend to community", default on, which then requires category + skill).
The public candidate follows the existing pipeline: YouTube → coach → publish; TikTok/Instagram
→ manual review (`M103`'s `review_lane`).

This settles two previously-open questions — see `MI42` (dissolved) and `MI50` (option b). It
also means the personal list needs its **own table keyed on the link, not on
`link_skill_relation_id`** — `M101` was rewritten for this, and its earlier "no new table
needed" conclusion is superseded.

## Batch 1 — identity ✅ DELIVERED, REVIEWED AND SHIPPED (`25b3daf`, 2026-08-29)

`M120` · `M115` · `MI27` · `M109`

Live on hosted: anonymous sign-in and manual linking are enabled, the curation-only publish gate
is in force (zero published rows fail it), and an anonymous session was confirmed writing through
`set_user_bookmark` against production after deploy. Migration history repaired to 52/52.

Follow-up that came out of reviewing it: **`M122`**, scheduled into batch 2. Nothing else here
needs redoing — the notes below are kept only as the record of what was asked for.

- `M120` — enable anonymous sign-in; create the user **lazily on first action**, not on first
  launch. **Verify before building anything on it:** that upgrading anonymous → permanent
  preserves the user id. It is the documented behaviour and the linchpin of the design; if it
  does not hold, share-in's model changes. Write the result down.
- `M115` — user votes can currently publish content the coaches rejected. Must land **with**
  anonymous voting, not after it.
- `MI27` — delete the dead local-first path (`useLocalFlag`, `LocalActionSync`, `user_actions`)
  so two competing notions of "anonymous" never coexist.
- `M109` — re-scoped to almost nothing: anonymous rows *are* the install signal. Drop the
  `app_installs` table, the `track-install` function and the MMKV id.

## Batch 2 — share-in ✅ DELIVERED, REVIEWED AND SHIPPED (`13eedb4`, 2026-08-29)

Migration `0053` applied to hosted (**53/53 recorded**), and all four new RPCs driven end to end
against production with a real anonymous session: `set_user_link_bookmark`, `set_user_bookmark`,
`get_user_library_resources`, `reorder_user_bookmarks`. `user_bookmarks` went 9 → 8 rows — the one
expected `(user, link)` duplicate collapse, no orphans, all relation ids retained.

`user_bookmarks` was reshaped in place rather than replaced by a new table. That was the better
call than what this brief asked for: no data migration, existing bookmarks keep working, one table
instead of two overlapping ones.

**One defect, fixed during review:** `0053` failed on first apply with
`ERROR: column "link_skill_relation_id" is in a primary key (SQLSTATE 42P16)` — `drop not null`
ran while the column was still in the old primary key, which was dropped three statements later.
Reordered, with a comment. It typechecked, passed CI and read correctly; **only running it found
it.** See rule 11 below.

The notes below are kept as the record of what was asked for.

## Batch 2 — the original brief

> **Start with `M101`. It is the keystone of this batch.**
>
> The personal-list table is the decision everything else here rests on. Key it on the **link**
> (`user_id` + `link_id`/`canonical_url`) with a **nullable** `link_skill_relation_id`, and route
> **every** save through it — including saves from Discover, which today create relation-keyed
> `user_bookmarks` rows. One table, one Library query, one order column.
>
> Get this wrong and three other things get harder rather than just later: `MI35`'s status chip
> has nowhere to read publication state from, `MI36`'s ordering has no column to live on, and
> `M122`'s eventual merge has two shapes of saved item to reconcile instead of one. If anything
> about the shape seems off once you are in the code, raise it before building on top of it.

**Client:** `M100` native share target (iOS Share Extension, Android `ACTION_SEND`) ·
`M101` the personal list table · `M102` the Suggest UI with the two checkboxes ·
`MI35` status chip · `M122` anonymous-upgrade collision (**option (a) only** — read the row, the merge is deliberately deferred) · `M116` / `M117` residual scope only — both mostly dissolve once actions
succeed anonymously; re-read those rows before starting.

**Server:** `M103` review lanes and `pending` on human `LINK_ADD` · `M98` TikTok + Instagram
og-scrape enrichment · `M99` transcript backfill for user-submitted links · `M104` human
submissions ahead of agent ones in the coach queue · `MI38` `/suggest` copy · `MI40` optional
title fallback.

Send both halves together. The client half alone cannot be reviewed for correctness — the
question is whether the two agree.

Two orderings that matter regardless of how you sequence the work:

- `M98` gates the onboarding copy in batch 3 — without enrichment an Instagram share is a blank card.
- `M99` must land **before or with** `M104`, or human links get reviewed fast on title alone and
  fail the 1.3 gate. Faster rejection is worse than slow acceptance.

Cheap to include while the table is being built: `MI36` drag-to-reorder (the new table wants a
sort column anyway).

## Batch 3 — bug fixes, onboarding, polish

**`M56` moved.** Both clients now read the list through the `get_user_library_resources` RPC (migration `0053`), so saved-minus-watched is **one predicate in that function's `saved` branch** — which today filters only `ub.user_id` and `l.is_active` — not two client edits. It is a migration, so rule 11 applies: run it.

**Tester-blocking bugs:** `M119` **Blocker** (nested touch targets do not fire on some devices —
gesture arbitration, *not* an Android 9 incompatibility; **verify on a real API 28 device or
emulator**, it is invisible on modern hardware) · `M56` **Blocker** (Saved shows already-watched
items) · `MI51` (no score shown, voting gives no visible feedback) · `MI37` (rename Saved →
**Watch later**).

`M114` is **already fixed** (2026-08-15, versionCode 3, verified from the release artifact) —
listed only so it is not re-done. Confirm the permission set in whatever artifact this release
produces.

**Onboarding:** `M121`. Four screens, three of them reading. **Interests picker moves to screen
1** — already wired (`onboarding_interests` in MMKV → Discover reorders category sections by
pick order), previously buried on the last slide. Add an "edit sports" entry on Account. Inline
SVG schematics via `react-native-svg` (already a dependency), not screenshots. Describe only what
shipped: no Instagram claim unless `M98` landed, no share-in claim unless `M100`-`M102` landed.

**Polish:** `M112` return prompt after watching — **Mark as watched** primary, **Save to Watch
later** secondary; the in-app-browser swap in the original row was rejected, read the rewritten
row · `MI53` per-item report control (Play's UGC requirement, more load-bearing now that
unregistered users can submit).

**Worth adding while a build is being cut** (each is build-gated, so a later separate build is
pure waste): `MI52` skill summaries on mobile · `MI48` rating prompt · `M69` category
over-fetch · `MI24` Library per-skill filter · `M44` rank/ordering fix, which pairs with `MI51`.

## Explicitly NOT in this release

`M106`-`M108` Telegram ops · `M105` publish-gate latency · the engagement/gamification block
(`M55`-`M63`, `MI28`-`MI31`) · store presence (`M118`, `MI46`, `MI47`) · infrastructure
(`M18`, `MI21`-`MI23`, `MI33`, `N8`) · scoring v2 remainder (`M46`, `M47`).

Most of these are server-side and can ship independently at any time without a build — that is
the reason they are out, not lack of value.

## Definition of done

- `M119` verified on a **real API 28 device or emulator**, not only a current one.
- `M120`'s anonymous → permanent id-preservation check written down with its result, before
  anything in batch 2 depends on it.
- Data Safety and `docs/store-listing-copy.md` updated for anonymous accounts — note `M113`
  flags the existing "No tracking" claim as already binding.
- `docs/engagement-gamification-plan.md` §1 (D1) updated to match reality.
- `supabase migration list --linked` shows a populated Remote column for **every** row before
  any batch is called done. Repaired on 2026-08-15 and again on 2026-08-29; do not make it three.
- One build, smoke-tested from the Play closed track on real hardware before it is called done.
