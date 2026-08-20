# Cloud Routine — skill technique summaries

Third routine alongside `combined-coach` and `difficulty-recheck`. It reads every
transcript on a sub-skill page and writes back what the coaches on that page agree on,
plus what they say people get wrong.

Set it up the same way as the others (see [cloud-routines.md](cloud-routines.md)):
repository `ihvou/skillsaggregator`, network access **Custom** allowing
`vqxsaabskkkjdljxiyqi.supabase.co`, environment variables `INTERNAL_TOKEN` and
`CLAUDE_CODE_EFFORT_LEVEL=max`, schedule **hourly**.

This is the routine that most needs the effort setting — see
[Effort](cloud-routines.md#effort). Selecting a strong model in the routine form does
not raise effort; the form has no effort control, so a run defaults to `high` while an
interactive session can be at `max`. Every fault in the first live run was a self-review
failure, which is exactly what the difference costs. The prompt also carries the
`ultrathink` keyword in step 2 as belt-and-braces: it asks for deeper reasoning on that
turn regardless of the session's effort level.

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

252 of the 492 active skills are eligible (>= 6 transcripts); 26 done, 226 to go as of
2026-08-20. The eligible count keeps rising as the seven staged categories fill, so treat
it as a moving target rather than a finish line.

One skill per `queue` call is deliberate — consensus needs the whole page, and a 40-video
skill is ~200 kB. Do **two** skills per run (queue → generate → store, then repeat once);
that is roughly 110k tokens of input and clears the current backlog in about five days.
After that the routine no-ops until a page grows by more than 30%, which is the
regeneration trigger.

Never-summarised skills come biggest-page-first, so the routine works down from ~80
videos toward the 6-video floor. Early output is therefore the hardest case for the
anti-padding rules, not the easiest.

---

The prompt is [`routine-prompts/skill-summary.txt`](routine-prompts/skill-summary.txt). The
routine reads it from the clone on every run — see
[Pointing a routine at the repo](cloud-routines.md#pointing-a-routine-at-the-repo). Edit that
file, not the routine's Instructions box.

---

## Reading the output

`used_count` below `source_count` is a curation signal — the page collected videos that do
not teach the skill — but **only compare it against the cap, not against `source_count`.**

`source_count` is the whole page; the model is handed at most `p_max_videos` (40) of it.
So on a page above 40 the ratio is squeezed under ~51% no matter how clean the curation is.
Serve Technique stored 40 of 78 and looks like half the page is off-topic; it used
everything it was given. Forehand Technique stored 14 of 81 — that one is real.

    used_count < least(source_count, 40)   →   worth looking at
    used_count = 40 on a bigger page       →   says nothing

`source_count` stays uncapped on purpose even though it overstates what was read: it is the
regeneration trigger (`published_count > source_count * 1.3`), and storing the capped 40
instead would make any page over ~52 videos satisfy its own trigger forever.
