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
     - `INTERNAL_TOKEN=<the coach-curation internal token>` — the same literal in
       `~/.claude/scheduled-tasks/combined-coach/SKILL.md`. ⚠️ Plaintext, visible to anyone who can
       edit the environment — fine for a personal account.
     - `CLAUDE_CODE_EFFORT_LEVEL=max` — see [Effort](#effort) below. The routine form has a model
       selector but **no effort selector**, so a run would otherwise take the model default (`high`).
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

## Effort

The routine form has a **model** selector and no **effort** selector, so a run takes the model
default — `high` on every model that supports effort. An interactive session set to `max` is
therefore reasoning harder than the routine on the identical model and prompt, which is enough to
explain why the same model produces flabbier output unattended. It showed up first in the summary
routine: both of its first two skills came in at the 4-consensus + 3-mistakes ceiling, one of them
storing a point backed by 2 of 40 videos. Those are self-review failures (rank the candidates, drop
the weak ones, notice the duplicate) rather than knowledge failures, and self-review is what effort
buys.

Set it per environment, not per routine:

```
CLAUDE_CODE_EFFORT_LEVEL=max
```

Three things make this the right lever rather than the `effortLevel` settings key:

- The env var takes **precedence over every other method** (settings, `--effort`, `/effort`).
- `max` is **session-only** everywhere else. `effortLevel` in a settings file accepts only
  `low`/`medium`/`high`/`xhigh` — this variable is the one path that makes `max` stick.
- Repo `.claude/settings.json` is only documented to carry **hooks** into a cloud session, so
  committing an effort key there is not a reliable substitute.

**Verify it applied** rather than assuming: open a run's session and read the header next to the
model name — it states the active effort ("with max effort"). Env vars set here are shared by every
routine on the environment, so this raises effort for the coach routines too, which is intended.

Costs more per run, and `max` on a 234k-character summary payload is the expensive end of that. If
usage becomes the binding constraint, drop to `xhigh` before dropping the transcript cap.

---

## Pointing a routine at the repo

A routine's Instructions box holds a **copy** of its prompt, and nothing syncs that copy to this
repository. Three prompt fixes were committed here in one day while the routine kept running the
old text, and the drift is invisible: the routine succeeds, it just obeys instructions you have
already replaced.

Every routine clones `ihvou/skillsaggregator` at the start of every run, from the default branch.
So put the pointer in the box and the prompt in git. Paste this as the routine's **entire**
Instructions, substituting the one filename:

```
Your task specification lives in this repository, which is cloned for you at the
start of every run. Read it and carry it out:

  docs/routine-prompts/<NAME>.txt

That file contains your prompt and nothing else. It is version-controlled and is the
authoritative instruction for this routine — treat it exactly as if it were pasted
here, and follow it to the letter, including the CONNECT section and every rule.

If the file is missing or empty, do NOT improvise: stop and report that the
specification could not be read.
```

| Routine | `<NAME>` |
| --- | --- |
| `combined-coach` | `combined-coach` |
| `difficulty-recheck` | `difficulty-recheck` |
| skill summaries | `skill-summary` |

Each prompt is a **whole file** rather than a fenced block inside a document. Fence-counting is
what makes this fragile — `cloud-routines.md` grew a `CLAUDE_CODE_EFFORT_LEVEL` code block, which
silently changed which fence was "the first one".

**The repository must actually be attached to the routine.** All three only call `curl`, so a
routine created without selecting `ihvou/skillsaggregator` has no clone and the pointer fails with
nothing to read. Check that first if a run reports it cannot find the file.

**The trade:** after this, a commit here changes the routine's behaviour on its next run with no
review in the UI. That is the whole benefit and the whole risk.

---

## Routine A — combined-coach (relevance + value + difficulty)

The prompt is [`routine-prompts/combined-coach.txt`](routine-prompts/combined-coach.txt).
Paste the pointer from [Pointing a routine at the repo](#pointing-a-routine-at-the-repo) into
the routine, not the prompt itself.

---

## Routine B — difficulty-recheck (difficulty only; re-judges the old rubric's mistakes)

The prompt is [`routine-prompts/difficulty-recheck.txt`](routine-prompts/difficulty-recheck.txt).
Paste the pointer from [Pointing a routine at the repo](#pointing-a-routine-at-the-repo) into
the routine, not the prompt itself.

**Expected outcome:** ~1,628 published rows are queued. At 30/run hourly that is ~54 runs (~2.3 days).
A large share should move intermediate → beginner; if a run reports almost no changes, the rubric
isn't landing and the prompt needs another pass. Pause the routine once it reports "nothing to judge".

---

## Notes

- **Throughput:** coach inflow is ~317–525/day; at 30 rows/run hourly = 720/day, which keeps up and
  drains the ~641 coach backlog over a couple of days.
- **difficulty-recheck is NOT drained** (checked 2026-08-20), despite what this note used to claim:
  47 published rows carry no `skill_level` at all and 841 more were tagged under the old rubric and
  never re-reviewed (`skill_level_reviewed_at is null`) — 888 rows of real work. Keep it running and
  re-check before pausing, rather than assuming it finished.
- **Daily run cap:** two routines × hourly = 48 runs/day. If you hit the account run cap, drop
  difficulty-backfill to every few hours (or run it manually until drained) and keep coach hourly.
- **Edge-function drift (separate cleanup):** the hosted `coach-curation` function supports
  `queue`/`vote`/`difficulty_queue`/`tag`, but the repo's `supabase/functions/coach-curation/index.ts`
  only has `queue`/`vote` — the difficulty actions were deployed but never committed. Redeploying the
  function from the repo right now would silently break difficulty tagging. Reconcile the source before
  any future deploy (see the task I flagged).
