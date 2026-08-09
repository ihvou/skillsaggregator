# Taxonomy & Coverage Audit — pre-launch, 2026-08

Audit of all 13 categories / 152 sub-skills against real coaching curricula, plus verified YouTube
supply. Triggered by the observation that Padel lacks *positioning, tactics, bajada* — which turned
out to be a systematic pattern, not a one-off.

**Evidence strength varies by category and is marked per section.** Primary-source-backed:
Badminton (BWF Coaches' Manual L1), Tennis (USTA NTRP + ITF), Padel (RPP Level-1 syllabus + The
Padel School + Padelguru), Soccer (FA ten core skills), Boxing (AIBA/IBA + England Boxing),
Swimming (Red Cross / Swim England / USMS), Surfing (ISA L1), Running (UESCA/RRCA/USATF/NHS),
Yoga (Yoga Alliance RYS standards), Pilates (Return to Life + STOTT/BASI/Polestar/Balanced Body),
Cycling (UK National Standard for Cycle Training / Bikeability / PMBIA / BICP),
Gym (NSCA movement patterns / NASM CPT blueprint / ACE Exam Content Outline / mainstream beginner
programs). **All 13 categories reviewed.**

---

## 1. Headline

Coverage is **good enough to launch**: 152/152 sub-skills have published content, zero dead ends,
73% have 11+ items, median `combined_score` 2.70 against a 1.30 gate.

Three real problems, in priority order:

1. **§5 — Supply-shape mismatch.** In fitness/movement categories the dominant YouTube format is the
   *full class/workout*, not the single-move tutorial. Our taxonomy is built on single moves, so the
   coach correctly rejects 90–98% of what collection finds. This is why Gym (women) is thinnest.
2. **§2 — Missing tactical/decision axis.** 8 of 13 categories have *zero* strategy/positioning
   sub-skills, and their category descriptions actively instruct the collector to reject such content.
3. **§6 — Difficulty mislabelling.** ~450 beginner-appropriate videos are tagged `intermediate`, so
   the Beginner filter shows an empty shelf on 19 sub-skills.

---

## 2. Root cause: the catalog has two eras

| Origin | Categories | Tactical sub-skills | Category description |
|---|---|---|---|
| Hand-authored (`0001_initial_schema`) | Badminton, Padel, Surfing, Gym (men), Gym (women) | ✅ present | broad — "strategy", "tactics", "ocean reading", "nutrition", "confidence-building" |
| AI bulk-seeded (`0011_catalog_expansion`) | Boxing, Cycling, Pilates, Running, Soccer, Swimming, Tennis, Yoga | ❌ **zero, in all eight** | *"Scoped to teachable technique…"* |

Every `0011` category has **exactly 10 sub-skills** — a round-number template artifact, not a
curriculum.

> ⚠️ **CORRECTION (verified in code 2026-08).** An earlier draft of this document claimed the
> category descriptions are injected into the relevance prompt and must be widened before tactical
> sub-skills will fill. **That is false.** Verified:
> - `loadSkills()` selects `c.slug, c.name` — it **never selects `c.description`**, and
>   `category_description` / `categoryDescription` appear nowhere in `run-collection.mjs`.
> - `skill.description` is used only at lines 1584/1632 (`sub_skill_description`) and 1812
>   (secondary-skill matching) — all inside the **Ollama scorer**, which is **dormant**:
>   `nightly-collect.sh:76` exports `COLLECT_SCORING=off`, and the scoring path returns `[]`.
> - The live relevance judge is the **AI coach**, and `get_unscored_for_coach` returns
>   `skill_name` and `category_name` — **no descriptions of either kind**.
>
> **Consequence: adding tactical sub-skills needs NO prerequisite.** What governs retrieval is the
> sub-skill **name** (queries are built from `skill.name`) and what governs publication is the coach
> judging that name against the transcript. This makes §3 (names are load-bearing) the *only* thing
> that matters, and removes a whole blocking step from §7.
>
> Editing category descriptions is still worth doing for **user-facing accuracy** — Pilates promises
> "mat and reformer" and ships only mat — but it is cosmetic, not functional.

---

## 3. Names and descriptions are load-bearing for retrieval

In `scripts/run-collection.mjs`:
- **Lines 823–834** build YouTube queries directly from `skill.name`, including `` `how to ${skill.name} technique` ``
- **Lines 1584 / 1632** inject `skill.description` into the LLM relevance prompt as `sub_skill_description`

So renames below are **retrieval fixes, not cosmetics**:

| Current | Rename to | Why |
|---|---|---|
| `The Cross (Straight Right)` | **The Cross (Rear-Hand Straight)** | Generates *"how to The Cross (Straight Right) technique"*; "Straight Right" biases retrieval to orthodox-only and excludes southpaw content |
| `Wrist rotation` | **Forearm rotation (pronation)** | BWF L1 manual uses "forearm rotation"/"pronation"/"supination" 12+ times and **never** "wrist rotation" |
| `Lift` + `Defense (lift)` | **Lift (net)** + **Lift (defensive)** | Same stroke family named twice; users cannot tell them apart |
| `Head Movement & Slipping` | **Head Movement (Slip, Roll & Weave)** | Tautological — slipping *is* head movement |
| `Smash and x3` | **Smash** + **Smash out of the court (x3/x4)** | Merges a beginner fundamental with an advanced trick shot |
| `hill-running` slug | `uphill-running` | Slug/name mismatch beside a separate `downhill-running` |

Also: **Tennis uses Title Case + arbitrary "Technique" suffixes**; every other category uses sentence
case. The suffix carries zero information. Normalise.

---

## 4. Missing sub-skills — MUST-HAVE only, high supply only

Ranked within category. Full SHOULD/NICE lists are in the agent transcripts.

**Padel** — *Return of serve* (the only shot played on 100% of points that we lack), *Bajada*,
*Court positioning*, *Transition to the net*, *Defending from the back*, *Coming off the wall*.
Second tranche: *Kick smash* (name it this, **not "Rulo"** — same shot, 10 tutorials vs 4), *Drop shot*,
*Gancho*. `Glass defense` is far too broad — RPP L1 splits it into five wall shots.

**Tennis** — the 11 sub-skills describe an NTRP 3.0–3.5 player and no higher; NTRP defines 3.5→5.0
almost entirely in terms of shots we lack. *Singles strategy*, *Doubles strategy* (NTRP names doubles
at **every** level from 3.0), *Grip fundamentals* (padel has a grip page, tennis doesn't), *Drop shot*,
*Approach shot*, *Second serve*, *Slice serve* (we have Kick Serve but not the more common variant —
inverted difficulty order), *Lob*, *Half volley*. The net game is a stub.

**Badminton** (most complete at 21) — *Net kill* (BWF teaches it as two named strokes), *Serve (flick)*,
*Return of serve*, *Mixed doubles tactics* (BWF §09, a 10-page section; an Olympic discipline we don't
cover), *Deception* (BWF elevates it to principle §A).

**Soccer** — measured against the FA's ten core skills: **5/5 attacking covered, 0/5 defending.**
*Defending 1v1* (HIGH supply — the "defending isn't on YouTube" assumption is false), *Turning with the
Ball* (an FA core skill), *Heading*, *Crossing*, *Long passing & switching play*, *Penalty technique*
(we have free kicks but not penalties). `Finishing & Shooting` is the most overloaded page in the
catalog. `La Croqueta` — niche and advanced — occupies 1 of only 11 slots.

**Boxing** — all four punch pages are implicitly *head* shots; AIBA teaches every punch in head **and**
body versions. *Body punching*, *Counter-punching* (AIBA teaches it immediately after defense),
*Hand wrapping*, *Pad work*, *Sparring fundamentals* (England Boxing lists four technical pillars; we
have two), *Distance & range management*.

**Swimming** — strokes get **4 / 1 / 1 / 1** pages, and breaststroke/butterfly have only *Timing*,
which every curriculum teaches **last**. We published the capstone and skipped the foundation.
*Breaststroke kick*, *Breaststroke pull*, *Butterfly undulation*, *Breath control*, *Floating*
(no entry point exists for someone who can't yet swim a length), *Racing dive* (zero starts).

**Surfing** — the ride progression jumps Pop-up → Bottom turn → Cutback, missing the rungs on either
side. *Trimming down the line*, *Top turn*, *Generating speed*, *Rip currents*, *Paddling out*,
*Reading the surf forecast*.

**Running** — 6 of 10 slots are form micro-components; **zero** training, injury, fuelling, gear or
recovery. All verified HIGH supply: *Starting to run (C25K)*, *Easy runs* (⚠️ **do not name this page
"Zone 2"** — see §5a), *Interval & tempo*,
*The long run*, *Race pacing*, *Strength training for runners*, *Shin splints*, *Runner's knee & IT
band*, *Choosing running shoes*, *Post-run stretching* (we have a warm-up page with no cool-down).
Consider consolidating form from 6 pages to ~3 — one form video legitimately matches 4–6 of them today.

**Cycling** — *Riding in traffic & road positioning* (Roles 3–4 of the UK National Standard, and the
real barrier to entry), *Chain cleaning*, *Brake adjustment*, *Adjusting gears*, *Fuelling &
hydration*, *Training zones & FTP*, *Indoor training*, *Choosing your first bike*. Do **not** split
standing climbing — the existing `Climbing Technique` description already covers seated and standing.

Three cycling-specific cautions:
- **Catalogue the safety check as "Pre-ride check", not "M-check"** — as a named term "M check" is
  thin (15k-view shop clips), while generic pre-ride checks are well served (GCN 208k). Another
  instance of §3: the name determines what we retrieve.
- **Road-skill supply is dangerously GCN-concentrated.** Out-of-saddle climbing, night riding, track
  stand, traffic riding and cadence would each be near single-source on GCN. Reinforces the
  per-channel cap in §5. (MTB is healthier — GMBN + Berm Peak; maintenance is anchored by Park Tool.)
- **The National Standard's core is what YouTube covers worst.** Junction negotiation, signalling
  routines and hazard response are formally specified but no channel teaches them as a progression,
  while YouTube over-supplies equipment/buying content that appears nowhere in Bikeability.

**Gym (men) / Gym (women)** — two structural findings, both canonical.

**(i) Neither category has a horizontal pull (row). Not one, across all 24 sub-skills.** NSCA names
horizontal pull as one of six fundamental movement patterns with its own progression, distinct from
vertical pull; 4 of 5 mainstream beginner programs (StrongLifts, r/Fitness BBR, GZCLP, 5/3/1) make a
row core. Pull-up progression and Lat pulldown cover the *vertical* pull; nothing covers the horizontal.
Add **Barbell row** + **Dumbbell row** to both.

**(ii) Gym (women) is thin because the barbell went to the other category.** Mapped against the six
canonical patterns:

| Pattern | Gym (men) | Gym (women) |
|---|---|---|
| Squat | Barbell squat | Goblet squat *only* |
| Hinge | Deadlift | RDL *only* |
| Horizontal push | Bench press | DB bench press |
| **Horizontal pull** | **missing** | **missing** |
| Vertical push | Overhead press | **missing** |
| Vertical pull | Pull-up progression | Lat pulldown *only* |
| Single-leg | **missing** | **missing** |

Women's is missing or downgraded on **five of seven**. The barbell lifts, the pull-up, arms and
programming landed in men's; dumbbells, machines, glutes and body-management landed in women's.
Nobody decided this — but it is the curriculum a learner sees, and it is the real answer to
"the catalog skews male."

**Fix:** define a shared core of pattern pages both categories carry, and reserve genuinely
sex-specific pages as the women's differentiators (cycle-aware, pelvic floor, postpartum, pregnancy,
menopause, bone density). Crucially the women-creator supply *exists* for exactly those pages —
megsquats on squat (390K), deadlift (1.19M) and pull-ups (3.3M); Kelly Matthews squat (402K) /
deadlift (791K); Naomi Kong squat (1.26M). Several are bigger than their general-audience equivalents.
Alternative to duplicate curation: a shared-skill mechanism linking one page into both categories
(schema change, but removes the duplication permanently).

Gym (women) MUST-HAVEs beyond the pattern fix: *Beginner lifting program* (the best-supplied gap in
the entire audit — Naomi Kong 3.3M, Natacha Océane 2.2M), *Postpartum core & diastasis recti*
(a genuine differentiator with no men's analog), *Bulgarian split squat & lunges*, *Running alongside
lifting*. Gym (men): *Lunge & split squat*, *Training split basics*, *Bulking nutrition* (we have
fat-loss but not muscle-gain), *Hamstring training*.

**Do NOT build** (verified thin): standalone *Sleep*, *Gym etiquette*, *Tracking progress*,
*"Will lifting make me bulky"*, *Core/abs for women* (Chloe Ting 607M views — but a follow-along
wasteland with near-zero teaching; build "Core bracing for lifting" instead), *Resistance bands*.

⚠️ **Collection bug to pre-empt:** "machine row" / "row machine" collides with the cardio rowing
**ergometer** — searches return Concept2 (1.43M) and Olympic rowers. Any row page *will* be poisoned.
Use explicit terms ("seated cable row", "chest-supported row", "T-bar row") plus negative keywords for
erg/Concept2/stroke-rate. Hamstring searches similarly flood with flexibility/rehab content.

⚠️ **Source-seeding trap:** the most *famous* women's-fitness names — Natacha Océane, Whitney Simmons,
Krissy Cela, Caroline Girvan, Growingannanas — produce essentially **no** per-exercise tutorials and
never surfaced in ~20 exercise-level queries. They make follow-alongs. Seed instead with **Colossus
Fitness** (appeared in every exercise query), Physique Development, Kelly Matthews, Naomi Kong,
Vivian Ngo, Courtneyofitness. This is §5 in miniature.

Granularity is also inconsistent — four tiers are mixed without distinction: single exercise (8),
muscle group (1: `Arm training`), programming domain (3), lifestyle/meta (5). Specific fixes:
collapse women's `Upper-body hypertrophy` + `Lower-body hypertrophy` into one `Hypertrophy
programming` mirroring men's (they currently collide with Goblet squat / RDL / Hip thrust);
align `Mobility and stability` (women) with `Mobility warm-up` (men) — same thing, two names;
narrow `Gym confidence`, whose description spans "equipment, etiquette, and progression" — three
pages of scope in one.

The cardio/sleep curriculum check (NASM CPT blueprint, ACE Exam Content Outline, ACSM position stand,
HHS Physical Activity Guidelines) settles two more:
- **ADD cardio.** It is a required competency in both certifications — NASM Domain 4 Task 1 lists
  `Cardiorespiratory training` verbatim; ACE's Program Design domain is 31% and names ventilatory
  thresholds explicitly. **Neither Gym category has any cardio/conditioning sub-skill.** A validated
  MUST-HAVE for both.
- **Do NOT add sleep as its own page.** Sleep appears **zero** times in the ACE CPT outline, twice
  incidentally in NASM's (nutrition + intake questionnaire), has **no NSCA position statement**, and
  has **no chapter in the CSCS textbook** — it sits inside "Overreaching, Overtraining, and Recovery".
  Our existing `Recovery habits` page is the correct home. (Sleep is real at the CEU/elective tier —
  ACE launched a Sleep & Recovery Coach course in Dec 2025 — but that is not core curriculum.)

**Yoga** — see §5; the pose axis is mostly fine, the gap is *shape*. Genuinely fillable pose additions
are inversions/arm balances (*Headstand*, **Handstand**, **Forearm stand** — "the strongest single-pose
tutorial niche in yoga", and we have none). Yoga Alliance mandates only **two** poses in the entire
standard (sukhasana, savasana), so our pose list is a convention claim, not a standards claim.
**Do not add** Child's Pose (LOW — ~5 substantive tutorials), Cat-Cow, Props, or Twists.

**Pilates** — the category description promises *"mat and reformer"* and **all 10 sub-skills are mat**;
sharpest promise/delivery mismatch in the catalog. *Pilates breathing* (a named core principle; yoga
has Pranayama, running has Breathing Rhythm, Pilates has nothing), *Neutral spine vs imprint*,
*Double Leg Stretch*, *Rolling Like a Ball*, *Roll-Over*, *Swimming*, *Reformer basics: footwork*.
Avoid the thin tail: Double Straight Leg Stretch, Seal, Corkscrew, Saw, Criss-Cross, six principles.

---

## 5. The supply-shape mismatch (highest-impact finding)

Verified three ways — independently by the yoga and Pilates specialists, and directly from our own
production data.

**Publish pass rate** (`published / active`) for the worst pages:

| Category | Sub-skill | active | published | pass |
|---|---|---|---|---|
| Gym (women) | Dumbbell bench press | 68 | 1 | **1.5%** |
| Pilates | Single-Leg Stretch | 84 | 2 | 2.4% |
| Gym (women) | Gym confidence | 64 | 3 | 4.7% |
| Pilates | Spine Stretch Forward | 72 | 4 | 5.6% |
| Gym (women) | Lat pulldown | 47 | 3 | 6.4% |
| Gym (women) | Lower-body hypertrophy | 83 | 6 | 7.2% |
| Cycling | Pedaling Efficiency | 79 | 5 | 6.3% |

**Independent corroboration:** the cycling audit found — without seeing our data — that
pedalling-technique videos "mostly *debate whether* pedalling technique is trainable rather than
teaching drills; drill-specific supply is thin." That is exactly why `Pedaling Efficiency` publishes
5 of 79. A low pass rate is therefore a reliable detector of *a page whose topic YouTube does not
actually teach* — worth monitoring as a standing metric, not just a one-off audit output.

5 of the 16 worst are **Gym (women)** — which is exactly why it is the thinnest category. Collection
is working; the coach is rejecting what it finds. And the coach is **right** — its own comments:

> "Press is one of six moves here, and on the floor — only glancingly on-topic."
> "DB chest press is in here, alongside flyes and pullovers."
> "Generic warm-up, not the dumbbell bench press itself."

Those are **follow-along workout videos**. In fitness, yoga and Pilates the dominant format is the
full class/workout; single-move tutorials are supplied by a much smaller, older, long-tail set of
channels (Howcast's 2012 playlist is still the highest-view single-exercise source for most Pilates
mat exercises; Adriene's "Foundations of Yoga" pose library is frozen at 2012–2015).

**Two possible fixes — this is a product decision:**

- **(a) Match the taxonomy to the supply.** Add class-type/goal sub-skills where supply is abundant
  and fresh: Yoga → *Yin, Restorative, Yoga for back pain, Morning yoga, Yoga for beginners*;
  Pilates → *Beginner mat class, Wall Pilates, Pilates for back pain, Prenatal/Postnatal, Props*;
  Gym (women) → *Full-body dumbbell workout, Home workouts, Beginner gym programme*. All verified HIGH.
- **(b) Relax the relevance rubric** to accept a workout/class video when the target movement is a
  substantial, well-cued component — rather than requiring the whole video be about it.

(a) is safer and needs no re-scoring. (b) is cheaper but risks diluting the strong pages.

### 5a. Terminology traps — names that would collect contradictory content

Verified against NASM/ACE/ACSM primary sources. These are **not** style notes; each would actively
poison a page:

- 🚨 **Never create a page called "Zone 2".** The term means three materially different intensities:
  NASM Zone 2 = 76–85% HRmax (moderate-hard); ACE IFT Zone 2 = between VT1 and VT2 (and ACE says
  spend **<10%** of training time there); Attia/San-Millán/popular Zone 2 = at or below VT1
  (≈ *Zone 1* in both cert models). A "Zone 2" page would collect three mutually contradictory
  prescriptions. **Name it "Easy runs" or "Aerobic base training" instead.**
- **"Zone 2" is also not cert curriculum at all** — zero curriculum URLs across the full NASM (918),
  acefitness.org (5,849) and acsm.org (1,701) sitemaps. It is podcast/longevity-media vocabulary.
- **"10,000 steps" is folk wisdom** — in no federal guideline and neither exam outline. The mortality
  benefit plateaus at 6,000–8,000 steps (≥60y) / 8,000–10,000 (<60y) per Paluch et al.
- **"HIIT"** appears 0× in both exam blueprints (they say `interval training`), and ACSM has **no HIIT
  position stand** — only a hedged 2019 blog post.
- **"M-check"** → use **"Pre-ride check"** (§4, Cycling).
- **"Rulo"** → use **"Kick smash"** (§4, Padel).

Same root cause as §3: the sub-skill name *is* the search query.

**Correction — the duration floor and per-channel cap already exist.** An earlier draft recommended
adding them. Verified in `scripts/run-collection.mjs`: `COLLECT_MIN_DURATION_SEC` defaults to **60**
and is enforced at line 1218 (`duration_too_short`), and `COLLECT_MAX_VIDEOS_PER_CHANNEL` defaults to
**25**. The agents' shorts/single-channel warnings describe **YouTube's supply when estimating
fillability**, not what we ingest — our pipeline is already protected. No action needed.

### 5b. The rotation optimises a number users never see (real bug)

`scripts/run-collection.mjs:695` orders the nightly skill rotation by:

```sql
count(lsr.id) filter (where lsr.is_active and l.is_active) as link_count
...
order by coalesce(rc.link_count, 0) asc
```

That counts **active** relations. Users only see **published** ones (`get_skill_resource_counts`
filters `published = true`). The two diverge badly wherever the coach rejects most candidates:

| Sub-skill | active (what the rotation sees) | published (what users see) |
|---|---|---|
| Gym (women) · Dumbbell bench press | **68** | **1** |
| Pilates · Single-Leg Stretch | 84 | 2 |
| Cycling · Pedaling Efficiency | 79 | 5 |

So `Dumbbell bench press` looks like one of the *best-covered* pages in the catalog to the rotation,
gets deprioritised, and never improves — while the user sees a one-item shelf. **This is a starvation
loop, and it is the mechanical reason Gym (women) stays thin despite "fewest-links-first" rotation.**

**Fix:** order by a published count instead (add `and lsr.published` to the `link_count` filter, or
carry both and sort on published).

⚠️ **But don't ship that alone.** The existing `recent_zero_yield` cooldown only skips skills whose
runs produce *no suggestions* — these skills produce plenty (68!), they just don't publish. So a
published-count sort would grind forever on pages whose topic YouTube genuinely doesn't teach
(§5, `Pedaling Efficiency`). Pair the sort change with a **low-publish-ratio guard**: if a skill has
many active relations and a persistently low publish rate, stop collecting and flag it for taxonomy
review instead — that ratio is the §5 detector.

---

## 6. Difficulty re-tag (independent of everything above)

Published mix is **64.7% intermediate / 23.0% beginner / 10.4% advanced**. 19 sub-skills have **zero**
beginner-labelled items and 66 have fewer than 3 — while both apps ship a Beginner filter
(`LevelFilter.tsx`, `SortFilterMenu.tsx`). A beginner filtering to "Beginner" hits an empty shelf.

It is largely a **tagging artifact**: skills with zero beginner content are full of
*"How to PROPERLY Deadlift for Growth (5 Easy Steps)"*, *"How To: Deep Barbell Back Squat"*,
*"How To Defend In Doubles — The Fundamentals"*. **448 of 1,629** published intermediate items have
intro-style titles. Cause: the rubric says *"intermediate = the DEFAULT tutorial"* and *"when unsure,
use intermediate."*

**Fix requires a new routine, not a prompt edit** — the existing queue filters `skill_level is null`,
so already-tagged rows are invisible, and simply flipping the filter to `= 'intermediate'` loops
forever with no progress marker. Needs:

1. Migration: `skill_level_reviewed_at timestamptz` on `link_skill_relations`
2. RPC `get_for_difficulty_recheck(p_limit)` — published + `skill_level='intermediate'` + `reviewed_at is null`
3. Edge action `recheck_queue`; extend `tag` to stamp `skill_level_reviewed_at = now()` (this is what advances the cursor)
4. Cloud routine `difficulty-recheck` with a corrected rubric — drop "default to intermediate";
   state that content teaching the movement from scratch is **beginner**

Scope to published intermediate rows (~1,629) ≈ 2 days at 30/run hourly. Idempotent, resumable,
terminates.

---

## 7. Recommended sequencing

**Before launch (~2 days, no new collection needed):**
- The difficulty re-tag (§6) — fixes the most visible beginner-facing problem
- The retrieval-fix renames (§3) and the terminology traps (§5a)
- The rotation published-count fix + low-publish-ratio guard (§5b)

**Adding sub-skills is SAFE to do at any time — including before launch.** Verified: the UI hides a
sub-skill until it has **3 published resources** (`getPublishMinResources()` in `apps/web/lib/data.ts`,
default 3, overridable via `COLLECT_PUBLISH_MIN_RESOURCES`; `isPublishedSkill` gates on
`resource_count >= 3`, and `get_skill_resource_counts` counts `published = true AND is_active`).
New sub-skills are therefore invisible until genuinely populated — they cannot create empty shelves.
The only real cost is collection time, so **add them early and let the nightly fill them** rather than
treating it as a post-launch project. (Add them *after* §5b, so the rotation actually prioritises them.)

**Do not do before launch:** articles, TikTok expansion, new categories. The catalog is coherent as a
video-first product; opening a new pipeline now adds failure modes when you want stability.

**Order of operations for the taxonomy work:**
1. ~~Widen the category descriptions~~ — **not required**; see the correction in §2. Descriptions
   never reach the collector or the coach. Do it only for user-facing accuracy.
2. Fix the rotation (§5b) — **DONE 2026-08.** Otherwise new sub-skills compete against inflated
   `link_count`s. Verified against production: the old ordering was spending nights on Padel pages
   with 15–18 published items, while Gym (women) pages with 2–4 published sorted last.
3. Add sub-skills, highest-confidence first: Padel *Bajada, Court positioning, Return of serve*;
   Tennis *Singles strategy, Doubles strategy, Grip fundamentals*; Badminton *Net kill, Serve (flick),
   Deception*; plus the Gym pattern fix (§4) — rows and single-leg for both, barbell lifts for women's

**Then:** resolve the §5 product decision, and fill Gym (women) — the thinnest category, and the one
most relevant to the concern that the catalog skews male.

Each new sub-skill touches: the `skills` table, `packages/shared/src/catalog.ts`
(skill rows + `fallbackLearningOrders`), and the learning-order migration `0024`.
