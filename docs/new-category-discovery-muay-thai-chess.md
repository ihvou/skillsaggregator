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

**Muay Thai is the cheap one**, and it should stand alone rather than lean on Boxing. Someone
learning Muay Thai gets everything on the Muay Thai pages — including punches — instead of bouncing
between two categories guessing which technique lives where. Prompt A still carries the full Boxing
sub-skill list, but as a *differentiation* reference, not an exclusion list: where a name is shared,
the page must teach the Muay Thai version and say what differs.

That is not a fudge, it is the sport. Muay Thai punching is genuinely its own thing — a squarer
stance because you have to check kicks, a higher and wider guard against elbows and knees, markedly
less head movement because slipping into a knee is how people get hurt, and punches often thrown to
set up a kick rather than as the primary weapon. Different coaches teach it, so it should pull
different videos.

The catalogue already works this way and the schema is built for it: `skills` is
`UNIQUE (category_id, slug)` rather than globally unique, and **"Lob"** already lives in Padel,
Table tennis and Tennis, **"Drop shot"** in Badminton, Padel and Tennis, **"Deadlift"** in both
gyms. Retrieval stays separate because open search prepends the category —
`` `${category}${skill.name}` `` — so a Muay Thai jab page searches "Muay Thai The Jab", never the
bare term.

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

=== MUAY THAI: THE CATEGORY MUST STAND ALONE ===
Build the taxonomy a Muay Thai learner actually needs, END TO END. They should find everything on
the Muay Thai pages — punches included — and never have to jump to another category to learn a
basic weapon. So DO propose punching, stance, footwork and defence pages even though a boxing
category exists.

For reference, my BOXING category has these 23 sub-skills:

  Blocking & Parrying, Body punching, Boxer skip, Counter-punching, Distance and range management,
  Double end bag, Feinting, Footwork, Hand wrapping, Head Movement & Slipping, Heavy Bag Technique,
  How to beat a southpaw, How to choose boxing gloves, How to cut off the ring, Pad work, Punch
  Combinations, Shadow Boxing, Sparring fundamentals, Stance & Guard, The Cross (Straight Right),
  The Hook, The Jab, The Uppercut

That list is here so you can DIFFERENTIATE, not avoid. Muay Thai punching is its own craft — a
squarer stance because you must check kicks, a higher wider guard against elbows and knees, much
less head movement because slipping into a knee is a knockout, and punches thrown to set up kicks.
Those are different pages taught by different coaches, and they should pull different videos.

Mark each Muay Thai sub-skill:
  MT-ONLY  — no boxing equivalent (teep, checking kicks, clinch, elbows, knees, ...)
  SHARED   — a boxing category also has it; add ONE line on what the Muay Thai page teaches
             differently and, where you can, a video title that shows the Muay Thai treatment

If a SHARED page would teach literally the same content with no Muay Thai specificity at all, say
so plainly — that is the only case I would consider dropping, and I would rather know than have you
quietly omit it.

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
  - For Muay Thai: I need coaches who teach MUAY THAI PUNCHING too, not only kicks and clinch —
    the Muay Thai jab, cross and hook are thrown from a different stance and guard than the boxing
    versions, and I want channels that teach them that way. A boxing channel that occasionally
    mentions Muay Thai is not what I am after.
  - Also for Muay Thai: flag any channel that is really a boxing channel. I run a separate boxing
    category (ExpertBoxing, Precision Striking, fightTIPS, Tony Jeffries, Keppner Boxing and
    others) and a channel can be assigned to only ONE category in my system, so I need to know
    which side a genuine hybrid belongs on.

Real, verifiable channels only. Do not invent names or URLs — I will check every one.
```

---

## What to do with the results

Sub-skills go in as a migration, same shape as `0043_new_categories.sql` and
`0045_round2_gap_fill.sql`. Create the category **staged** (`is_active = false`) so it does not
render while empty — but note that a DB flag alone is not enough to publish it later:
`generateStaticParams` runs with `publicOnly: true`, so the routes are not prerendered and the 404
rendered while staged sits in the ISR cache. Publishing needs the flag flip **and** a rebuild.

Sub-skill names may repeat across categories — `skills` is `UNIQUE (category_id, slug)`, and Lob,
Drop shot and Deadlift already live in two or three categories each. Retrieval stays separate
because open search prepends the category name to every query, so a shared name costs nothing.

Channels are the opposite: `trusted_sources` is `UNIQUE (source_type, identifier)`, so a channel
binds to exactly ONE category. Harvest and verify real `UC...` ids before insert — identify by id,
never by name. For a genuine Muay Thai/Boxing hybrid, assign it where it is stronger and let open
search reach it from the other side. This is the one place the two categories actually compete, and
it is why prompt B asks which side a hybrid belongs on.

Seed trusted sources **before** the first nightly touches the category. Migration `0046` records
what happens otherwise: seven categories were created with zero trusted sources and ran open-search
only, with no channel pass at all.
