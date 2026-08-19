# Cloud Routine — skill technique summaries

Third routine alongside `combined-coach` and the (now drained) difficulty re-check. It
reads every transcript on a sub-skill page and writes back what the coaches on that page
agree on, plus what they say people get wrong.

Set it up the same way as the others (see [cloud-routines.md](cloud-routines.md)):
repository `ihvou/skillsaggregator`, network access **Custom** allowing
`vqxsaabskkkjdljxiyqi.supabase.co`, environment variable `INTERNAL_TOKEN`, schedule
**hourly**.

## Why it looks the way it does

The format was settled by generating summaries for nine real skills by hand before any
code was written:

- **Consensus points are declarative only.** A first pass leaked "don't / avoid / never"
  into that half and the two sections blurred together.
- **Mistakes are a separate half**, and they are the more valuable one — no single video
  reliably gives you the set of things people get wrong, but across 20 transcripts the
  same three errors recur verbatim.
- **No padding.** An early draft invented "place your own ball on the spot" for a penalty
  page purely to reach four bullets. Two strong points beat four with filler.
- **Every point carries a support count.** For physical technique an unattributed claim
  is not good enough, and it lets weak points be dropped without regenerating.
- **Below ~6 videos, do not generate.** Tested on a 3-video page and the result was
  fabrication. The queue enforces this, but the prompt repeats it.

## Throughput

248 skills are eligible. One skill per `queue` call is deliberate — consensus needs the
whole page, and a 40-video skill is ~200 kB. Do **two** skills per run (queue → generate →
store, then repeat once); that is roughly 110k tokens of input and clears the backlog in
about five days. After that the routine no-ops until a page grows by more than 30%, which
is the regeneration trigger.

---

```
You write the technique summary that sits above the video list on a sub-skill page of
"Subskills", a curated catalogue of sport & training tutorials. Each page collects
tutorials that teach ONE specific skill. Your job is to read the transcripts of the
videos on a page and say what those coaches AGREE on — the thing no single video gives a
learner.

=== CONNECT ===
Endpoint: https://vqxsaabskkkjdljxiyqi.supabase.co/functions/v1/skill-summary
The token is in the INTERNAL_TOKEN environment variable — send it as the x-internal-token
header. No apikey or Authorization header is needed. You run autonomously with no
permission prompts, so use normal shell tooling. Only ever call THIS endpoint.

Do this TWICE per run (two skills), then stop.

=== STEP 1 — take one skill ===
  curl -s -X POST "https://vqxsaabskkkjdljxiyqi.supabase.co/functions/v1/skill-summary" -H "x-internal-token: $INTERNAL_TOKEN" -H "Content-Type: application/json" -d '{"action":"queue"}'

Response: {"ok":true,"skill":{...}} with skill_id, skill_name, skill_description,
category_name, published_count, previous_source_count, reason, and videos[] — each with
title and transcript.

If "skill" is null, nothing needs generating. Log "nothing to summarise" and stop; once
the backlog is cleared this is the normal state.

=== STEP 2 — read EVERY transcript, then judge ===
First decide which videos actually teach {skill_name}. Pages are collected automatically
and usually contain a few near misses — a general class that only touches the skill, or a
video about a neighbouring technique. Ignore those completely. Count how many you actually
used; that is used_count.

Then write, as a veteran {category_name} coach:

CONSENSUS — 2 to 4 points, DECLARATIVE ONLY.
  * State what to do, never what to avoid. Anything phrased as "don't", "avoid", "never",
    or "the mistake is..." belongs in the mistakes section instead.
  * One idea per point. One sentence, occasionally two. Plain language a beginner follows.
  * Only include a point if MULTIPLE videos support it. This is a consensus summary, not a
    digest of the best video.
  * Write 2 if only 2 are well supported. Do NOT pad to 4. A padded point is worse than a
    missing one.

MISTAKES — 0 to 3 points.
  * Genuine errors learners make, as the coaches describe them — not advice rephrased in
    the negative. "Build tolerance gradually" is advice; "going straight to 120g of carbs
    and wrecking your gut" is a mistake.
  * Same rules: one idea, one sentence, multiple videos behind it, no padding.

For EVERY point, give "support" — how many of the videos you used actually make that
point. Be honest; do not inflate.

=== THREE RULES THE FIRST LIVE RUN BROKE ===
These are not style preferences. The first two skills this routine generated broke all
three, so check your output against them before storing.

1. 4 AND 3 ARE CEILINGS, NOT TARGETS. The first run produced 4 consensus + 3 mistakes for
   BOTH skills. That is the padding failure. Most skills should come in under the maximum.
   If you find yourself reaching for a fourth point, you have already finished at three.

2. A MISTAKE MAY NOT RESTATE A CONSENSUS POINT. The first run wrote consensus "aim for the
   corners rather than blasting for power" AND mistake "trying to smash the ball as hard as
   possible" — one idea billed twice, which is also how a padded fourth point gets
   manufactured. Before storing, read the two lists together and delete either half of any
   pair that says the same thing.

3. DROP THINLY-SUPPORTED POINTS. Cut anything supported by fewer than 3 videos OR fewer
   than 15% of the videos you used, whichever is larger. The first run stored a mistake
   backed by 2 of 40 videos; that is one coach's opinion, not a consensus.

Also: consensus points must be positive statements. If a point contains "rather than",
"instead of", "not", or explains itself by describing what goes wrong, it is a mistake
wearing a consensus costume — either rewrite it as a plain instruction or move it.

Judge only from the transcripts. Do not add technique advice from your own knowledge, even
if you believe it is correct — this text is presented to learners as what these coaches
say, and it concerns physical technique where a confident wrong instruction can injure
someone.

=== STEP 3 — store it ===
  curl -s -X POST "https://vqxsaabskkkjdljxiyqi.supabase.co/functions/v1/skill-summary" -H "x-internal-token: $INTERNAL_TOKEN" -H "Content-Type: application/json" -d '{"action":"store","skill_id":"<SKILL_ID>","consensus":[{"point":"...","support":8},{"point":"...","support":5}],"mistakes":[{"point":"...","support":4}],"source_count":<published_count from step 1>,"used_count":<how many you actually used>}'

Response {"ok":true,...} = stored. The endpoint rejects more than 4 consensus points or
more than 3 mistakes; if you get a validation error, cut the weakest points rather than
rewording to squeeze past it.

If fewer than 2 consensus points are genuinely supported, store what you have (1 is the
minimum the endpoint accepts). If NOTHING is supportable — the page is too incoherent —
skip the store call for that skill and say so in your report.

=== STEP 4 — report (plain text) ===
For each skill: name, videos available vs videos used, number of consensus points and
mistakes, and any point you nearly included but cut for weak support. Flag explicitly if
used_count was far below published_count — that page needs curation attention.
```

---

## Reading the output

`used_count` well below `source_count` is the useful signal: it means the page collected
videos that do not teach the skill. That is a curation problem worth looking at, and the
routine surfaces it for free.
