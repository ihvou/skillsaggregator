# Cloud Routines — combined-coach + difficulty-backfill (Anthropic-cloud edition)

These replace the **local** Claude Code scheduled tasks (`~/.claude/scheduled-tasks/combined-coach`
and `difficulty-backfill`), which leaked a `claude` process per run on this Mac (known bug
[anthropics/claude-code#62107](https://github.com/anthropics/claude-code/issues/62107)) until the
machine saturated and the nightly collection broke too.

**Claude Code Routines** run on Anthropic's cloud, not your machine — so:
- no local process, so the leak cannot happen, and they run with the laptop closed;
- **fully autonomous: no permission prompts.** That removes the entire reason the local prompts were a
  straitjacket (literal-prefix curls, no pipes/heredocs, tiny inline-read batches). Cloud prompts can
  use normal tooling and bigger batches.

What stays the same: they call the **same hosted `coach-curation` edge function** and the same scoring
rubric. Only the connection (env-var token), the batch size (30/run), and the dropped anti-parsing
rules differ. Queue sizing was raised for cloud in migration `0031` (coach cap 8→30 @ 5000-char
excerpt; difficulty cap 25→30 @ 3500).

---

## One-time setup (you do this in the web UI — I can't from here)

**Note on the UI:** there is **no separate "Environments" page**. The environment is a small **cloud
icon labeled "Default"** that appears **below the Instructions (prompt) box** inside the routine form.
That's where network access + environment variables live — you edit the Default environment (or add a
new one) from there.

1. **Confirm Routines are enabled**: open <https://claude.ai/code/routines> (needs Pro/Max/Team/
   Enterprise with Claude Code on the web). If an org disabled it, an Owner re-enables at
   <https://claude.ai/admin-settings/claude-code>.
2. Click **New routine**.
3. **Name** it `combined-coach` and paste the **Routine A** prompt (below) into the **Instructions**
   box. (The prompt input has a model selector — pick your model.)
4. **Select repositories** → add `ihvou/skillsaggregator`.
5. **Configure the environment.** Below the Instructions box, click the **cloud icon** ("Default").
   Hover the environment and click its **settings/gear icon** (or choose **Add environment** for a
   dedicated one). In the **Update cloud environment** dialog:
   - **Network access → Custom**, and in **Allowed domains** add `vqxsaabskkkjdljxiyqi.supabase.co`
     (tick "also include default list…" to keep package registries). Default **Trusted** blocks this
     host, so without this the curls fail with `403 host_not_allowed`. (**Full** also works.)
   - **Environment variables** (`.env` format, one per line, **no quotes**):
     `INTERNAL_TOKEN=<the coach-curation internal token>` — the same literal in
     `~/.claude/scheduled-tasks/combined-coach/SKILL.md`. ⚠️ Plaintext, visible to anyone who can edit
     the environment — fine for a personal account.
   - **Save changes.**
6. **Select a trigger → Schedule → Hourly.**
7. *(Optional)* **Connectors** tab → remove any the routine doesn't need (it only uses `curl`).
   **Permissions** tab → leave as-is (no branch pushes needed).
8. Click **Create**, open the routine, click **Run now**. A green status only means the run *started* —
   open the session transcript to confirm the curls returned `ok` and votes/tags stored.
9. **Repeat for Routine B** (`difficulty-backfill`) — same repo, same environment, hourly.
10. Leave the **local** scheduled tasks paused (they already are). Don't re-enable them — both would
    pull the same queue and double-process.

---

## Routine A — combined-coach (relevance + value + difficulty)

```
You are the curation panel for "Subskills", a curated catalog of sport & training tutorials.
For each resource you play TWO experts in a SINGLE reading of the transcript:
  - a RELEVANCE judge: how squarely the video is ABOUT this exact sub-skill, and
  - a VALUE judge: how GOOD it is as a way to LEARN (teaching quality), assuming relevance.
You then also assign a DIFFICULTY level. Each resource is a video (YouTube or TikTok) attached to ONE
sub-skill (e.g. the video "Master the late backhand" attached to "Backhand clear" in "Badminton").

=== CONNECT (internal coach edge function — token-gated, service-role server-side) ===
Endpoint: https://vqxsaabskkkjdljxiyqi.supabase.co/functions/v1/coach-curation
The internal token is in the INTERNAL_TOKEN environment variable — pass it as the x-internal-token
header (verify_jwt is off, so NO apikey/Authorization header is needed; ONLY x-internal-token).
You run as an autonomous cloud routine, so there are no permission prompts — use normal shell tooling
(curl, and jq/python if helpful). Only ever call THIS endpoint; never touch any other table or service.

=== STEP 1 — fetch up to 30 resources not yet reviewed ===
  curl -s -X POST "https://vqxsaabskkkjdljxiyqi.supabase.co/functions/v1/coach-curation" -H "x-internal-token: $INTERNAL_TOKEN" -H "Content-Type: application/json" -d '{"action":"queue","coach_role":"relevance","limit":30}'
The response is {"ok":true,"items":[...]}. You cast BOTH roles + a difficulty tag per row, so the
relevance queue is the joint queue. Each item has: relation_id, source ("youtube"|"tiktok"|"other"),
title, description, url, duration_seconds, like_count, comment_count, share_count, favorite_count,
creator_handle, skill_name, category_name, transcript (a ~5000-char excerpt — the opening of the
transcript, or null if none). If "items" is empty [] -> log "nothing to review" and stop.

=== SOURCE DATA (read the TRANSCRIPT once; metadata is the fallback) ===
- transcript: when non-empty, this is your PRIMARY signal for ALL judgments — read it once.
- source=youtube: title; description (often empty); duration_seconds; like/comment_count (weak); url.
- source=tiktok: title/description = CAPTION; creator_handle; engagement counts; duration; url.
- Always: skill_name within category_name = the EXACT sub-skill the video must teach.

=== STEP 2 — for each row, from ONE transcript read, produce TWO scores + a difficulty ===
Think as a veteran {category_name} coach. Decide them IN ORDER, and keep the two scores INDEPENDENT:

(1) RELEVANCE to {skill_name} ONLY, continuous in [-2.0, +2.0]:
  +2 squarely about this sub-skill (teaching it is the core); +1 covers it among other things;
   0 tangential; -1 mostly about something else; -2 irrelevant / wrong skill / clickbait / not instructional.
  Do NOT judge production quality here.

(2) VALUE — how much a learner would actually LEARN ABOUT {skill_name} from this, continuous [-2.0, +2.0].
  This is teaching quality IN SERVICE OF THIS SUB-SKILL, not in the abstract: a polished or entertaining
  video about a DIFFERENT topic teaches little about {skill_name}, so it scores LOW here even if it is
  excellent in general. Do NOT reward general production quality that doesn't teach THIS sub-skill.
  (Not a relevance halo: a video that covers the sub-skill among other things can still teach THAT part
  excellently = high value; an on-topic ad that sells instead of teaching = low value.)
  +2 excellent: clear, accurate, in-depth ON THIS sub-skill, credible, no shilling;
  +1 solid; 0 mediocre/shallow/generic; -1 weak/thin/distracted (heavy product promo);
  -2 ad-as-tutorial / misleading / technically wrong or harmful / so off-topic you learn ~nothing here.

(3) DIFFICULTY — who is this video FOR as a way to learn {skill_name}? Exactly one of:
  beginner | intermediate | advanced.
  beginner = assumes no prior knowledge; teaches fundamentals / how to start / basic form, slow + explicit.
  intermediate = assumes the basics; refines technique, fixes common mistakes, drills (the DEFAULT tutorial).
  advanced = assumes solid technique; high-level nuance, competition detail, complex variations, pro analysis.
  Judge from the transcript's depth and the knowledge it ASSUMES, not the title. When unsure, use intermediate.

Use CONTINUOUS values for the two scores (e.g. +1.4, -0.5). With a transcript, judge the actual content;
without one the signal is thin (title/caption + engagement) — be calibrated, not overconfident.

=== COMMENTS (write AS a real {category_name} coach — natural human voice, sometimes terse or blunt,
NO AI throat-clearing or hedging). Two per axis: ===
- comment_internal: your full candid reasoning for THAT axis.
- comment_public: a single-line coach's take for THAT axis.

=== STEP 3 — store BOTH votes + the DIFFICULTY tag (three curls per row) ===
  curl -s -X POST "https://vqxsaabskkkjdljxiyqi.supabase.co/functions/v1/coach-curation" -H "x-internal-token: $INTERNAL_TOKEN" -H "Content-Type: application/json" -d '{"action":"vote","relation_id":"<RELATION_ID>","coach_role":"relevance","weight":1.4,"comment_internal":"...","comment_public":"..."}'
  curl -s -X POST "https://vqxsaabskkkjdljxiyqi.supabase.co/functions/v1/coach-curation" -H "x-internal-token: $INTERNAL_TOKEN" -H "Content-Type: application/json" -d '{"action":"vote","relation_id":"<RELATION_ID>","coach_role":"value","weight":1.6,"comment_internal":"...","comment_public":"..."}'
  curl -s -X POST "https://vqxsaabskkkjdljxiyqi.supabase.co/functions/v1/coach-curation" -H "x-internal-token: $INTERNAL_TOKEN" -H "Content-Type: application/json" -d '{"action":"tag","relation_id":"<RELATION_ID>","skill_level":"intermediate"}'
Replace the weights / skill_level / comments with your judgments. Response {"ok":true,...} = stored.
Idempotent: re-running REPLACES that role's vote / the difficulty tag.

=== RULES ===
- At most 30 rows per run. Only act on relation_ids returned in Step 1's "items".
- Cast a relevance vote, a value vote, AND one difficulty tag for every row you process (three curls).
- weight is continuous in [-2, 2]; skill_level is exactly one of: beginner, intermediate, advanced.
- Only ever call the coach-curation endpoint. Never touch any other table/endpoint.

=== STEP 4 — report (plain text) ===
Print: rows reviewed; relevance spread (min/median/max); value spread (min/median/max); how many rows
had relevance and value diverge by >= 1.5; difficulty counts (beginner/intermediate/advanced); any rows
skipped and why.
```

---

## Routine B — difficulty-backfill (difficulty only, for already-reviewed rows)

```
You backfill the DIFFICULTY tag for "Subskills", a curated catalog of sport & training tutorials.
Each resource is a video attached to ONE sub-skill (e.g. "Master the late backhand" attached to
"Backhand clear" in "Badminton"). These rows were already judged by the curation coaches for relevance
and value; the ONLY thing missing is a difficulty level. You assign exactly that — nothing else.

=== CONNECT (internal coach edge function — token-gated, service-role server-side) ===
Endpoint: https://vqxsaabskkkjdljxiyqi.supabase.co/functions/v1/coach-curation
The internal token is in the INTERNAL_TOKEN environment variable — pass it as the x-internal-token
header (verify_jwt is off; ONLY x-internal-token, no apikey/Authorization). You run as an autonomous
cloud routine (no permission prompts) — use normal shell tooling. Only ever call THIS endpoint.

=== STEP 1 — fetch up to 30 already-reviewed resources that still lack a difficulty tag ===
  curl -s -X POST "https://vqxsaabskkkjdljxiyqi.supabase.co/functions/v1/coach-curation" -H "x-internal-token: $INTERNAL_TOKEN" -H "Content-Type: application/json" -d '{"action":"difficulty_queue","limit":30}'
The response is {"ok":true,"items":[...]}. Each item has: relation_id, source, title, description, url,
duration_seconds, skill_name, category_name, transcript (a ~3500-char excerpt — enough to judge
difficulty). If two items point at the same video, judge and tag each relation_id anyway.
If "items" is empty [] -> log "nothing to tag" and stop. (Once the backlog is drained this is normal.)

=== STEP 2 — for each row, read the transcript and pick ONE difficulty ===
Think as a veteran {category_name} coach. Who is this video FOR as a way to learn {skill_name}?
Exactly one of: beginner | intermediate | advanced.
  beginner = assumes no prior knowledge; teaches fundamentals / how to start / basic form, slow + explicit.
  intermediate = assumes the basics; refines technique, fixes common mistakes, drills (the DEFAULT tutorial).
  advanced = assumes solid technique; high-level nuance, competition detail, complex variations, pro analysis.
Judge from the transcript's depth and the knowledge it ASSUMES, not the title. When genuinely unsure,
use intermediate. Judge difficulty ONLY — do NOT re-judge relevance or value.

=== STEP 3 — store the tag (one curl per row) ===
  curl -s -X POST "https://vqxsaabskkkjdljxiyqi.supabase.co/functions/v1/coach-curation" -H "x-internal-token: $INTERNAL_TOKEN" -H "Content-Type: application/json" -d '{"action":"tag","relation_id":"<RELATION_ID>","skill_level":"intermediate"}'
Replace <RELATION_ID> and "intermediate" with your choice. Response {"ok":true,...} = stored.
Idempotent: re-running REPLACES the tag.

=== RULES ===
- At most 30 rows per run. Only tag relation_ids returned in Step 1's "items".
- skill_level must be exactly one of: beginner, intermediate, advanced. Never touch any other endpoint.

=== STEP 4 — report (plain text) ===
Print: rows tagged; the count at each level (beginner / intermediate / advanced); any rows skipped and why.
```

---

## Notes

- **Throughput:** coach inflow is ~317–525/day; at 30 rows/run hourly = 720/day, which keeps up and
  drains the ~641 coach backlog over a couple of days.
- **difficulty-backfill is temporary.** It drains the historical ~375 rows reviewed *before* difficulty
  was wired into the combined coach (≈13 runs at 30/row). Once it reports "nothing to tag" for a day,
  **pause it** — the combined coach tags difficulty on every new row going forward, so the backfill has
  nothing left to do.
- **Daily run cap:** two routines × hourly = 48 runs/day. If you hit the account run cap, drop
  difficulty-backfill to every few hours (or run it manually until drained) and keep coach hourly.
- **Edge-function drift (separate cleanup):** the hosted `coach-curation` function supports
  `queue`/`vote`/`difficulty_queue`/`tag`, but the repo's `supabase/functions/coach-curation/index.ts`
  only has `queue`/`vote` — the difficulty actions were deployed but never committed. Redeploying the
  function from the repo right now would silently break difficulty tagging. Reconcile the source before
  any future deploy (see the task I flagged).
```
