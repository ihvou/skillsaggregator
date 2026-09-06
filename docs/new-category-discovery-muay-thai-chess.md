# Discovery prompts — Muay Thai and Chess

Two categories from Tier 3 of [new-category-research-2026-08.md](new-category-research-2026-08.md),
neither of which exists yet: no category row, no sub-skills, no trusted sources. Verified
2026-09-06.

Run the two fenced prompts below in a fresh thread with **deep research / web browsing** enabled —
prompt A for sub-skills, prompt B for channels. Each is self-contained and needs no repo context.
Both cover the two categories together; drop a category from either if you only build one.

Target shape, from the 20 live categories: **20–39 sub-skills** (mean 24.6) and **11–25 trusted
channels** per category.

## Before you run these

**Muay Thai is the cheap one.** The research doc calls it the "cheapest bolt-on" — it shares the
Boxing audience and cross-links to it. That overlap is also the risk, so prompt A carries the full
Boxing sub-skill list and asks explicitly what is *distinct*. A Muay Thai category that re-lists
jab, cross, hook and footwork is a duplicate of a category you already have.

**Chess is a positioning decision, not a supply decision.** Supply and demand are not in doubt —
the doc records "Basic Chess Openings Explained" at 4.8M and "How To Learn & Study Chess Openings"
at 7.7M, it decomposes beautifully, and it has zero access barrier. What it is not is a sport. Every
other category on the site is physical technique, the site describes itself as "sport & training",
and the technique summaries are written in a veteran-coach voice about bodies. Decide whether you
want that boundary crossed before spending research on it. The prompt is here either way.

**The gate differs by category.** For physical categories the enemy is follow-along content. For
chess the equivalent is *game commentary* — speedruns, tournament recaps, and "guess the elo" are
enormously popular and teach nothing specific. Prompt A states the gate separately for each.

---

## Prompt A — sub-skill discovery

```
I run "Subskills", a curated catalogue of tutorials. Each category is split into sub-skills, and
each sub-skill page holds 10-30 curated YouTube videos that teach that ONE specific thing. Examples
from live categories: "Backhand clear" (Badminton), "Bajada" (Padel), "Romanian deadlift" (Gym),
"Crimp grip" (Climbing), "Reading spin" (Table tennis).

I am considering two new categories and need a sub-skill taxonomy for each:
  1. MUAY THAI / KICKBOXING
  2. CHESS

For each category, propose 20-30 sub-skills, ordered from beginner to advanced.

=== THE GATE: does a page of TUTORIALS exist for this? ===
A sub-skill only earns a page if YouTube has 10+ videos that TEACH it — "how to do X", one topic
per video, typically 3-15 minutes. Before proposing a sub-skill, satisfy yourself that such videos
exist, and give me the evidence.

For MUAY THAI, the content that does NOT count is:
  - fight footage, highlights, tournament recaps, promotions
  - full pad rounds or full sparring sessions filmed end to end
  - conditioning/follow-along workouts ("30 min Muay Thai cardio burner")
  - vlogs, gym tours, fighter interviews, reaction content

For CHESS, the content that does NOT count is:
  - game commentary, tournament recaps, "guess the elo", speedruns, rating climbs
  - full-length streams or blitz sessions with running commentary
  - pure entertainment, drama, or cheating-scandal content
A chess sub-skill must name a CONCEPT that can be taught in one video — "back rank mate", "the
Lucena position", "how to calculate candidate moves" — not "watch me play the London".

This gate is the single most important thing in this task. I would rather have 18 sub-skills that
each have a real page of tutorials than 30 where a third of them return commentary.

=== MUAY THAI: WHAT MUST BE DISTINCT ===
I already run a BOXING category with these 23 sub-skills:

  Blocking & Parrying, Body punching, Boxer skip, Counter-punching, Distance and range management,
  Double end bag, Feinting, Footwork, Hand wrapping, Head Movement & Slipping, Heavy Bag Technique,
  How to beat a southpaw, How to choose boxing gloves, How to cut off the ring, Pad work, Punch
  Combinations, Shadow Boxing, Sparring fundamentals, Stance & Guard, The Cross (Straight Right),
  The Hook, The Jab, The Uppercut

Do NOT propose sub-skills that would duplicate those. Muay Thai has to earn its own category on what
boxing does not cover: kicks, knees, elbows, the clinch, checking and catching, teeps, and the
stance and footwork differences that follow from defending low kicks. Where a Muay Thai page would
genuinely differ from its boxing namesake despite a similar title (Muay Thai stance is not a boxing
stance), propose it and say in one line why it is a different page rather than a duplicate.

Mark each Muay Thai sub-skill as DISTINCT or OVERLAPS-BOXING so I can see the true size of the
category.

=== CHESS: STRUCTURE ===
Chess decomposes along several axes at once (openings, tactics, endgames, strategy, calculation,
study method). Cover all of them rather than producing 25 openings. Bias toward what a beginner or
improving club player actually searches for. Where an "opening" page is warranted, prefer the
teachable principle over exhaustive theory.

=== FORMAT ===
For each sub-skill:
  - Name, phrased the way a learner would search for it, not as jargon
  - One sentence describing what the page teaches
  - Evidence: 1-2 real video titles that would belong on it, with approximate view counts
  - For Muay Thai only: DISTINCT or OVERLAPS-BOXING

Then, for each category, tell me:
  - Which 5 sub-skills you are most confident about, and why
  - Which ones you are least sure pass the gate, and what you would check
  - Any sub-skill a beginner would expect to find that you deliberately left out, and why

Do not pad the lists. If a category genuinely supports only 18 pages, say 18.
```

---

## Prompt B — trusted channel discovery

```
I run "Subskills", a curated catalogue of tutorials. An automated collector searches YouTube for
each sub-skill and proposes videos, which an AI coach reviews and publishes. The collector searches
two ways: across all of YouTube, and inside a list of trusted channels held per category.

I need 12-15 trusted YouTube channels for each of two new categories:
  1. MUAY THAI / KICKBOXING
  2. CHESS

=== THE SINGLE MOST IMPORTANT SELECTION CRITERION ===
I need channels whose OUTPUT IS DEDICATED SINGLE-TOPIC TECHNIQUE TUTORIALS — "how to do X", one
thing per video, typically 3-15 minutes.

I do NOT want channels that mainly publish:
  - MUAY THAI: fight footage, highlights, promotions, full sparring or pad rounds, conditioning
    follow-alongs, vlogs, gym tours, interviews, reaction content
  - CHESS: game commentary, speedruns, rating climbs, tournament recaps, "guess the elo",
    full-length streams, drama or scandal coverage

This distinction matters more than subscriber count, and it is where my existing lists have gone
wrong before. A very large channel that only publishes follow-alongs is useless to me; a 20k-sub
channel that systematically breaks down one technique per video is exactly what I want.

Some of the biggest chess channels are hybrids — they publish both instructional series and hours
of commentary. Include one only if the instructional output is substantial and findable as its own
series, and say which series.

VERIFY BY LOOKING AT RECENT UPLOADS. Judge each channel on the titles of its last ~20 videos, not
on reputation or subscriber count. If you cannot check the uploads, do not include the channel.

=== FOR EACH CHANNEL, GIVE ME ===
  - Channel name
  - Channel URL (the /@handle or /channel/UC... form — I need to resolve the real channel id)
  - Approximate subscriber count
  - 3 real video titles from it that show the single-topic tutorial pattern
  - One line: who it is for (absolute beginner / improving / advanced) and what it is best at
  - Your confidence that its output is mostly tutorials rather than the excluded types

=== ALSO TELL ME ===
  - Which channels cover the widest span of the category, and which are narrow specialists
  - Any well-known channel in this space you deliberately EXCLUDED, and the reason. This is as
    useful to me as the inclusions.
  - For Muay Thai: any channel that also covers boxing well. I already run a boxing category with
    its own list (ExpertBoxing, Precision Striking, fightTIPS, Tony Jeffries, Keppner Boxing and
    others), and a channel can only be assigned to ONE category in my system, so I need to know
    where the overlap sits before I assign it.

Real, verifiable channels only. Do not invent names or URLs — I will check every one.
```

---

## What to do with the results

Sub-skills go in as a migration, same shape as `0043_new_categories.sql` and
`0045_round2_gap_fill.sql`. Create the category **staged** (`is_active = false`) so it does not
render while empty — but note that a DB flag alone is not enough to publish it later:
`generateStaticParams` runs with `publicOnly: true`, so the routes are not prerendered and the 404
rendered while staged sits in the ISR cache. Publishing needs the flag flip **and** a rebuild.

Channels need their real `UC...` ids harvested and verified before insert — identify by id, never by
name. `trusted_sources` has `UNIQUE (source_type, identifier)`, so each channel binds to exactly one
category; for anything that covers both Muay Thai and Boxing, pick the category where it is
stronger and let open search reach it in the other.

Seed trusted sources **before** the first nightly touches the category. Migration `0046` records
what happens otherwise: seven categories were created with zero trusted sources and ran open-search
only, with no channel pass at all.
