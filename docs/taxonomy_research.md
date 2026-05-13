# Taxonomy Research — Single-Axis Skills vs Multi-Axis Tags

**Question:** is "skill" the best primary unit, or should skills become tags that a single video can hold many of, along multiple axes (movement / muscle group / equipment / context)?

**Short answer:** the current schema already supports many-to-many between videos and skills — the constraint isn't structural, it's that the agent only assigns one skill per video and the seed taxonomy mixes axes inconsistently. Adopting an explicit multi-axis tag model would materially improve discovery, but the move is best done in two phases: (1) start exploiting the existing M:N relation (multi-skill per video) within today's flat skill list, then (2) introduce explicit axes / facets only after we've seen how much overlap the agent actually finds.

---

## 1. Current state

### 1.1 Schema (already M:N)

`link_skill_relations` is many-to-many — one link can already attach to multiple skills. The `LINK_ATTACH_SKILL` suggestion type from the cloud spec exists specifically for this. **No schema migration needed** to support multi-tag per video.

```text
links ─┬─< link_skill_relations >─┬─ skills
       │                          │
       │ (one row per attach)     │
```

### 1.2 What's actually limiting

Three concrete gaps in the pipeline today:

| Layer | Current behaviour | What multi-tag would need |
|---|---|---|
| **Agent (`run-collection.mjs`)** | One score → one `LINK_ADD` payload with one `target_skill_id` | Score the candidate against multiple plausible skills and emit one `LINK_ADD` plus extra `LINK_ATTACH_SKILL` payloads (or a fan-out at apply time) |
| **Seed taxonomy** | All 21 badminton skills are mostly "shots" with footwork mixed in. Gym taxonomy mixes specific exercises (barbell-squat, bench-press) with programming concepts (hypertrophy-programming, fat-loss-nutrition). | Explicit axes: shot / court area / game phase (badminton); exercise / muscle group / equipment (gym); manoeuvre / wave phase (surfing) |
| **Web UI** | Skill filter chips are a flat list per category | Facet chips, one row per axis. Each row toggles independently |

### 1.3 Why the existing taxonomy already breaks down

Real examples from data collected this week:

- **"Hip Thrust vs. Glute Bridge: What's the Difference?"** → currently only attached to `glute-bridge-hip-thrust`. Actually relevant to both `glute-bridge-hip-thrust` and `lower-body-hypertrophy`, and probably `core-bracing` too.
- **"How to PROPERLY Squat for Growth (4 Easy Steps)"** → attached to `barbell-squat`. Equally relevant to `mobility-warm-up` (the first 90 seconds), `hypertrophy-programming` (the "for growth" angle).
- **"3 Common Smash Mistakes That Kill Your Power"** (badminton) → attached to `forehand-smash`. Also covers `wrist-rotation` and `grip-technique` material.
- **"Footwork (split step) — timing"** → attached to `footwork-split-step`. Also relevant for `defense-block` (since defending starts at the split step) and `singles-strategy` (positioning context).

These are not edge cases. **A meaningful fraction of every well-made teaching video covers more than one skill** because the underlying movements/concepts are connected.

---

## 2. Proposed axes per category

Drafted by inspecting the seed taxonomy + a few hours of real content. Each axis is a set of tags that compose freely.

### 2.1 Badminton

| Axis | Example tags | Notes |
|---|---|---|
| **Shot type** | smash, clear, drop, drive, push, lift, serve, block | The dominant axis of current skills |
| **Hand / grip** | forehand, backhand | Currently encoded into shot names (forehand-smash). Better as its own axis. |
| **Court area** | front-court, mid-court, rear-court, net | Already partly there for footwork but not for shots |
| **Game phase** | offense, defense, transition, serve-return | Strategic axis |
| **Game type** | singles, doubles, mixed | Light but useful filter |
| **Concept** | grip-technique, wrist-rotation, footwork, anticipation | The "non-shot" skills currently live here |

A "Backhand clear from rear court" video tags: `clear`, `backhand`, `rear-court`. "Doubles rotation drills" tags: `doubles`, `defense`+`offense`, plus maybe `footwork`.

### 2.2 Padel

| Axis | Example tags |
|---|---|
| **Shot** | bandeja, vibora, smash, volley, lob, chiquita, return |
| **Hand / grip** | forehand, backhand, continental |
| **Court area** | net, mid, baseline, back-glass, side-glass |
| **Game phase** | offense, defense, transition |
| **Context** | doubles, mixed, beginner-tactics, advanced-tactics |

### 2.3 Gym (men + women — same axes; tags differ in proportion)

| Axis | Example tags |
|---|---|
| **Exercise** | barbell-squat, bench-press, deadlift, hip-thrust, pull-up, overhead-press |
| **Muscle group** | quads, hamstrings, glutes, chest, back, shoulders, biceps, triceps, core |
| **Equipment** | barbell, dumbbell, machine, cable, bodyweight, kettlebell, smith |
| **Movement pattern** | squat, hinge, push, pull, carry, brace, rotate |
| **Goal** | hypertrophy, strength, fat-loss, mobility, conditioning, rehab |
| **Phase** | warm-up, working-sets, accessory, cool-down, programming |

A "How to barbell squat for quad hypertrophy" video tags: `barbell-squat`, `quads`, `barbell`, `squat-pattern`, `hypertrophy`. "Hip thrust vs glute bridge" tags: `hip-thrust`, `glute-bridge`, `glutes`, `barbell`, `hinge`.

This is where multi-axis pays off most — gym content rarely covers one isolated skill.

### 2.4 Surfing

| Axis | Example tags |
|---|---|
| **Manoeuvre** | pop-up, paddling, duck-dive, turtle-roll, bottom-turn, cutback, stance |
| **Wave phase** | takeoff, drop, riding, kick-out, paddle-out |
| **Wave type** | small, medium, big, point-break, beach-break, reef |
| **Context** | longboard, shortboard, soft-top, lineup, etiquette |
| **Concept** | reading-waves, fitness, board-choice |

### 2.5 Cross-cutting axes (every category)

| Axis | Tags | Why |
|---|---|---|
| **Level** | beginner, intermediate, advanced | Already exists on `link_skill_relations.skill_level` |
| **Format** | drill, lesson, technique-breakdown, vlog-with-tips, pro-analysis | Useful filter when a user wants "drill they can do at home" vs "technique theory" |

---

## 3. Implementation paths

### 3.1 Path A — keep current flat skills, just attach to multiple

**No schema change.** Agent emits one `LINK_ADD` plus N `LINK_ATTACH_SKILL` payloads when the transcript clearly covers more than one current skill.

**Cost:**
- `run-collection.mjs`: ~40 lines added (after Stage 2 score, ask Ollama "what other skills in this category does this video also teach?" with the full skill list — second call per candidate)
- UI: no change to chip layout, but skill filter chips already work as facets if each video has multiple `link_skill_relations` rows
- Moderation: ~2x queue volume per video, but the dedupe key (`link_id + skill_id + attach`) prevents repeats

**Pros:** zero migration risk; works immediately; lets us measure overlap before committing to axes.
**Cons:** still constrained by the current mixed-axes seed; can't really do faceted filters by muscle group until we add explicit axes.

### 3.2 Path B — explicit axes (the user's instinct)

Introduce a `tag` table + `link_tag` join, where tags belong to an axis. Skills become a derived view of "primary-shot-axis tags" for backward compat, or skills are dropped and tags fully replace them.

**Schema sketch:**
```sql
create table tag_axes (
  id uuid primary key, category_id uuid, slug text, name text,
  unique (category_id, slug)
);
create table tags (
  id uuid primary key, axis_id uuid references tag_axes, slug text, name text,
  unique (axis_id, slug)
);
create table link_tags (
  link_id uuid references links, tag_id uuid references tags,
  is_active boolean default true, public_note text, level text,
  primary key (link_id, tag_id)
);
```

**Cost:**
- Migration: ~120 lines DDL + data migration (existing skills → tags, with primary axis = "skill" for back-compat)
- Agent: scores video against tags per axis; potentially 3-6 attach suggestions per candidate
- UI: faceted filter component, one row per axis; URL params per axis
- Skill page rethink: "skill" is now just one tag among many — the SEO page becomes `/[category]/[axis]/[tag]`
- Moderation: 3-6x queue volume per video (each axis attach is one queue item); needs UX to approve a video's whole attach set in one click

**Pros:** clean, scales to many categories, matches how content actually is.
**Cons:** week+ of work; needs UI redesign; moderation throughput becomes a real issue at scale; the "skill" SEO landing page concept gets diluted.

### 3.3 Path C — hybrid: keep "skill" as primary, layer secondary tags on top

Each link has exactly one *primary* skill (the current relation, drives the SEO page and the moderation queue card) plus zero-or-more *secondary* tags (filter facets, not pages).

**Schema delta:** add `tags` and `link_tags` as above; keep `link_skill_relations` as the authoritative primary attachment. Primary skill is still the canonical home; tags are search/filter signal only.

**Cost:** between A and B. Schema migration is smaller; agent emits primary skill + N tag-attach suggestions; UI gets faceted filters but skill pages stay as they are.

**Pros:** preserves the SEO/identity advantage of one canonical page per skill, while gaining multi-axis filtering.
**Cons:** two parallel mechanisms is more conceptual surface; "primary skill" can feel arbitrary for cross-cutting content.

---

## 4. Recommendation

**Start with Path A this month.** It costs ~half a day, uses the existing schema, and produces measurable data on how often the agent actually finds multi-skill content. If overlap is genuinely high (≥30% of approved videos end up attached to 2+ skills), graduate to **Path C** next month for the faceted-filter UX.

Skip Path B for now — explicit axes are right long-term but premature without data showing the current model is the bottleneck.

### Specific next steps if we adopt Path A

1. Add a *second* Ollama call per scored candidate: "Given this transcript and skill list `[s1, s2, ... sN]`, which 2–4 secondary skills does it also teach? Return JSON `{secondary: [{skill_slug, relevance}]}`."
2. For each secondary skill returned with `relevance ≥ 0.6`, emit a `LINK_ATTACH_SKILL` suggestion via the existing intake.
3. Update `ResourceFilters.tsx` skill chips to act as OR-filters: clicking multiple stays in `/[category]?skills=a,b,c` and the list shows union.
4. After ~2 weeks of collection: pull statistics — how many videos got 2+ attaches? Which skill pairs co-occur most? Use that to design Path C axes empirically.

### Open questions (deferred to follow-up tasks)

- Should the moderation queue group all attach suggestions for one link into a single card with N checkboxes (approve any subset)?
- Should `link_skill_relations.public_note` differ per (link, skill) pair, since the same video says different things to different skill audiences? (Schema already supports — agent would need to score per-skill notes.)
- For SEO: should a video appear in the JSON-LD on multiple skill pages, or only its primary? (Probably yes — `LearningResource` is fine to repeat.)
- For surfing/badminton "footwork" specifically: is footwork a skill, a tag axis, or both? Current seed treats it as a skill; the answer probably depends on whether users search for "footwork tutorials" or "the split step specifically".
