# Routine prompts

One file per cloud routine, containing that routine's prompt and **nothing else** — no
front matter, no fences, no commentary. The routine reads the file from the clone on every
run, so this directory is the live source of truth, not documentation about it.

| File | Routine | Notes |
| --- | --- | --- |
| `combined-coach.txt` | `combined-coach` | relevance + value + difficulty, hourly |
| `difficulty-recheck.txt` | `difficulty-recheck` | difficulty only; **drained** as of 2026-08-20, safe to pause |
| `skill-summary.txt` | skill summaries | one page's transcripts → consensus + mistakes, hourly |

Wiring, the pointer text to paste, and the trade-off are in
[../cloud-routines.md](../cloud-routines.md#pointing-a-routine-at-the-repo).

## Editing these

**A commit here changes what the routine does on its next run.** There is no review step in
the claude.ai UI once a routine is pointed at this directory, so treat an edit as a deploy.

Keep the file self-contained. The routine is handed the file and nothing else, so a prompt
that says "see the section above" or links elsewhere in the repo is a prompt that loses the
thing it referred to.

Do not reintroduce fences. These were extracted out of fenced blocks inside prose documents
precisely because fence-counting broke: `cloud-routines.md` gained a code block for
`CLAUDE_CODE_EFFORT_LEVEL`, which changed which fence was "the first one" and would have
silently handed a routine the wrong text.

## Why these files exist

The prompts used to live in fenced blocks inside `cloud-routines.md` and
`skill-summary-routine.md`, copied by hand into each routine's Instructions box. On
2026-08-20 the summary routine was found running a prompt three fixes out of date — an
anti-padding rule, a rule about which half of a duplicate pair to keep, and a rule against
rewriting mistakes as advice. All three were committed and none were in effect, and the
symptom was silent: runs succeeded and stored summaries with the mistakes section empty on
11 of 26 pages.
