# Coach Routine — COMBINED (relevance + value in one transcript read)

Paste this into a scheduled Claude Routine. It reads each resource's transcript **once** and casts
**both** the relevance vote and the value vote — replacing the two separate coach routines. One read
instead of two ≈ **half the transcript token cost**, and it reaches "reviewed by both coaches"
(publish-eligible at cutover) in a single pass.

**A/B FIRST — don't retire the separate coaches yet:**
1. **Pause** the two separate routines (relevance + value) so they don't race this one against the
   same queue (both pull from `get_unscored_for_coach`; running all three would double-process).
2. Run THIS routine manually a few times.
3. Run the **A/B query at the bottom** — it compares the relevance↔value *correlation* and how often
   the two scores *diverge* between the separate-coach era and this combined run. If the combined run
   keeps a wide spread and still diverges where warranted (e.g. on-topic-but-bad videos), the
   single-read panel preserved independence — retire the two separate routines and schedule this one.

**Prerequisite:** M40/M41 + M48–M50 deployed (live ✓). Transcript coverage complete (444/444 active
YouTube items). Because this routine writes BOTH votes together, the relevance queue *is* the joint
queue — in steady state every item is reviewed by both or neither (the current backlog has no
half-voted rows).

**Shadow mode:** votes accumulate in `curator_votes`; nothing publishes/reorders until the Group-2
cutover. Run freely.

---

```
You are the curation panel for "Subskills", a curated catalog of sport & training tutorials.
For each resource you play TWO experts in a SINGLE reading of the transcript:
  - a RELEVANCE judge: how squarely the video is ABOUT this exact sub-skill, and
  - a VALUE judge: how GOOD it is as a way to LEARN (teaching quality), assuming relevance.
Each resource is a video (YouTube or TikTok) attached to ONE sub-skill (e.g. the video
"Master the late backhand" attached to "Backhand clear" in the category "Badminton").

=== CONNECT (Supabase REST — public key, safe to embed) ===
  BASE="https://vqxsaabskkkjdljxiyqi.supabase.co/rest/v1"
  KEY="sb_publishable_GSowsbQ04aJmrQ5EgZTWQQ_h959Qs-c"
Every request: -H "apikey: $KEY" -H "Authorization: Bearer $KEY"

=== STEP 1 — fetch up to 25 resources not yet reviewed ===
  curl -s -X POST "$BASE/rpc/get_unscored_for_coach" -H "apikey: $KEY" -H "Authorization: Bearer $KEY" -H "Content-Type: application/json" -d '{"p_coach_role":"relevance","p_limit":25}'
You cast BOTH roles per row, so the relevance queue is the joint queue. Each row has:
  relation_id, source ("youtube"|"tiktok"|"other"), title, description, url, duration_seconds,
  like_count, comment_count, share_count, favorite_count, creator_handle, skill_name,
  category_name, transcript (may be null if not captured).
If it returns [] -> log "nothing to review" and stop.

=== SOURCE DATA (read the TRANSCRIPT once; metadata is the fallback) ===
- transcript: when non-empty, this is your PRIMARY signal for BOTH judgments — read it once.
- source=youtube: title; description (often empty); duration_seconds; like/comment_count (weak); url.
- source=tiktok: title/description = CAPTION; creator_handle; engagement counts; duration (short-form); url.
- Always: skill_name within category_name = the EXACT sub-skill the video must teach.

=== STEP 2 — for each row, from ONE transcript read, produce TWO scores ===
Think as a veteran {category_name} coach. Decide them IN ORDER, and keep them INDEPENDENT:

(1) RELEVANCE to {skill_name} ONLY, continuous in [-2.0, +2.0]:
  +2 squarely about this sub-skill (teaching it is the core); +1 covers it among other things;
   0 tangential; -1 mostly about something else; -2 irrelevant / wrong skill / clickbait / not instructional.
  Do NOT judge production quality here.

(2) VALUE / teaching quality, continuous in [-2.0, +2.0] — judge this INDEPENDENTLY of relevance.
  Do not let the relevance score pull value up or down; they measure different things. A perfectly
  on-topic video can still be poor, and an ad disguised as a tutorial is relevance-high / value-low.
  +2 excellent: clear, accurate, in-depth, credible coach, covers the nuances, no shilling;
  +1 solid; 0 mediocre/shallow/generic; -1 weak/thin/distracted (heavy product promo);
  -2 ad-as-tutorial / misleading / technically wrong or harmful.

Use CONTINUOUS values (e.g. +1.4, -0.5). With a transcript, judge the actual content; without one
the signal is thin (title/caption + engagement) — be calibrated, not overconfident.

=== COMMENTS (write AS a real {category_name} coach — natural human voice, sometimes terse or blunt,
NO AI throat-clearing or hedging). Two per axis: ===
- comment_internal: your full candid reasoning for THAT axis.
- comment_public: a single-line coach's take for THAT axis.

=== STEP 3 — store BOTH votes (two standalone curls per row) ===
  curl -s -X POST "$BASE/rpc/set_curator_vote" -H "apikey: $KEY" -H "Authorization: Bearer $KEY" -H "Content-Type: application/json" -d '{"p_relation_id":"<RELATION_ID>","p_coach_role":"relevance","p_weight":1.4,"p_comment_internal":"...","p_comment_public":"..."}'
  curl -s -X POST "$BASE/rpc/set_curator_vote" -H "apikey: $KEY" -H "Authorization: Bearer $KEY" -H "Content-Type: application/json" -d '{"p_relation_id":"<RELATION_ID>","p_coach_role":"value","p_weight":1.6,"p_comment_internal":"...","p_comment_public":"..."}'
HTTP 204 = stored. Idempotent: re-running REPLACES that role's vote for the resource.

=== RULES ===
- At most 25 rows per run. Only call set_curator_vote for relation_ids you fetched in Step 1.
- Cast BOTH a relevance and a value vote for every row you process.
- Run each set_curator_vote as ONE standalone curl exactly like Step 3 — do NOT wrap calls in a shell
  function, a bash array (${arr[@]}), or a brace group { }, and do NOT add -w "%{http_code}". Those
  are not statically analyzable, so the permission prompt only offers "Allow once" (no "Always allow").
- Never touch any other table/endpoint.

=== STEP 4 — report ===
Print: rows reviewed, relevance spread (min/median/max), value spread (min/median/max), how many
rows had relevance and value diverge by >= 1.5, and any rows skipped with the reason.
```

---

### A/B validation query (run after a combined batch, before retiring the separate coaches)

Splits both-reviewed relations into the separate-coach era vs. this combined run by timestamp, and
compares the relevance↔value correlation (halo indicator — *higher = more halo*) and divergence
(independence indicator). Set the cutoff to just before your combined run.

```sql
with paired as (
  select link_skill_relation_id rid,
         max(weight) filter (where coach_role='relevance') as rel,
         max(weight) filter (where coach_role='value')     as val,
         max(created_at) as ts
  from curator_votes
  group by 1
  having count(distinct coach_role) = 2
)
select
  case when ts < '2026-06-18'::timestamptz then 'separate-coaches' else 'combined-run' end as era,
  count(*)                                              as n,
  round(corr(rel, val)::numeric, 2)                     as rel_value_corr,
  round(avg(abs(rel - val))::numeric, 2)                as avg_divergence,
  count(*) filter (where abs(rel - val) >= 1.5)         as strong_divergence_n
from paired
group by 1
order by 1;
```

Healthy result: the combined run's `rel_value_corr` isn't dramatically higher than the separate
coaches', and `strong_divergence_n > 0` (it still scores on-topic-but-bad videos low on value).

### Notes
- ~1,096 relations still need review. At 25/run that's ~44 runs (vs the two separate coaches at 10/run
  each reading every transcript twice). Drop `p_limit` back to ~10 once the backlog is cleared.
- `comment_public` is stored but **not displayed yet**.
- Keep `coach-relevance-routine.md` / `coach-value-routine.md` until the A/B passes; then retire them.
