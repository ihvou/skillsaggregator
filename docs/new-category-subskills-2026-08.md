# Sub-skill research — the 7 new categories

**Date:** 2026-08-19
**Applies to:** Golf, Table tennis, Climbing, Pickleball, Skiing, Snowboarding, Brazilian jiu-jitsu
**Shipped as:** `supabase/migrations/0043_new_categories.sql` — 7 categories, 160 sub-skills.

## Method

Each category's sub-skill list was derived from a real teaching progression, then **every candidate
name was probed through `yt-dlp ytsearch`** — the same path `scripts/run-collection.mjs` uses to build
queries. A name was kept only if the query retrieved dedicated single-topic tutorials. Names that
retrieved the wrong thing were renamed; names with no real supply were dropped.

Curricula used: PGA/R&A teaching model and the Rules of Golf (golf) · ITTF coaching progression
(table tennis) · indoor-climbing instructor progressions and BMC rope-skills sequence (climbing) ·
USA Pickleball rules and PPR coaching order (pickleball) · PSIA Level 1–2 alpine progression —
stance, rotary, edging, pressure, wedge, wedge-christie, parallel (skiing) · AASI snowboard
progression (snowboarding) · standard white-to-blue-belt syllabus, position-before-submission
(BJJ).

## Two traps worth recording

**1. Follow-along content.** The gate that killed meditation as a category applies inside these too.
Anything returning "20 MIN … WORKOUT" or "Guided …" was excluded.

**2. Auto-translated titles are not a naming signal.** Several probes returned Indonesian titles
(pickleball lob, BJJ kimura, americana, omoplata). Resolving the video IDs showed English-language
channels — Selkirk TV, ThatPickleballGuy, Gordon Ryan, Matt Arroyo — with YouTube serving translated
title metadata. **Always confirm against `%(uploader)s` before concluding a query is off-idiom.**
This also invalidated an earlier rename recommendation in the round-2 audit, now corrected there.

---

## Golf — 24 sub-skills

Order: grip and setup, full swing, fault fixing, long clubs, short game, putting, then strategy,
rules and equipment.

Strongest supply of any category tested. Every name probed HIGH except two, noted below.

| Sub-skill | Supply | Evidence |
|---|---|---|
| Golf grip | HIGH | "How to Grip the Club Correctly \| Golf Channel" (1.25M), "How to Hold and Grip the Golf Club" (625k) |
| Setup and posture | MEDIUM-HIGH | "How To Create The Perfect Posture \| Good Good Labs" (192k), "How to SETUP before you SWING \| Tom Watson" (171k) |
| Golf swing basics | HIGH | "How to Swing a Golf Club (The EASY way)" (4.3M) |
| How to stop slicing | HIGH | "5 Easy ways to STOP your Golf Slice (FOREVER)" (4.3M) |
| How to stop hooking | HIGH | "5 SIMPLE WAYS TO FIX YOUR GOLF HOOK" (1.3M) |
| Iron shots | HIGH | "How to hit irons Consistently" (3.3M), "HOW TO HIT IRONS FOR BEGINNERS" (1.9M) |
| How to hit a driver | HIGH | "TOP 5 DRIVER GOLF TIPS" (3.6M) |
| Fairway woods | HIGH | "CRUSH YOUR 3 WOOD FROM THE FAIRWAY EVERY TIME!" (2.2M) |
| Chipping | HIGH | "The SECRET Chipping Technique" (3.1M) |
| Pitching | HIGH | "What Nobody Tells You About Pitching Onto The Green" (2.7M) |
| Bunker shots | HIGH | "This Bunker Shot Technique is SO EASY" (1.7M) |
| Wedge distance control | **MEDIUM** | "Wedge Week: Dave Pelz swing tips for distance control" (304k) — thin tail, expect a small page |
| Punch shot | **MEDIUM** | "How to Master the Low Punch Shot with David Leadbetter" (144k) |
| How to hit a draw | HIGH | "How to DRAW & FADE your golf driver" (1.04M) |
| Uneven lies | HIGH | "SLOPING LIES: The ultimate guide" (1.9M) |
| Putting stroke | HIGH | "The LAST Putting Lesson You Will Ever Need" (1.05M) |
| Reading greens | HIGH | "How to Read Greens with Brad Faxon \| Titleist" (349k) |
| Course management | HIGH | "5 Strategies Pros Use To Avoid Double Bogeys" (644k) |
| Golf rules for beginners | HIGH | "Rules of GOLF : How To PLAY GOLF" (1.28M), "The Rules of Golf - EXPLAINED!" (591k) |
| Golf etiquette | HIGH | "7 ETIQUETTE MISTAKES NEW GOLFERS SHOULD AVOID" (319k) |
| How to choose golf clubs | HIGH | "What GOLF CLUBS do beginners need??" (899k) |
| Driving range practice | MEDIUM-HIGH | "How To Practice, FOR ALL GOLFERS!" (459k) |
| Golf warm up | HIGH | "How to warm up before PLAYING GOLF" (651k) |
| Golf mental game | MEDIUM-HIGH | "The Mental Trap Every Golfer Falls Into" (258k) |

---

## Table tennis — 22 sub-skills

Order: grips, stance, drives, pushes, block, topspin, advanced strokes, serves, return, footwork,
equipment.

**Two renames made after probing:**

- *Ready stance* → **Ready position**. The original returned 331-view results; the actual videos are
  titled "Ready Position" ("The Ready Position \| Killerspin", "Ready Position In Table Tennis").
- *Smash* → **Forehand smash**. Bare "smash" drifted into general forehand-topspin content already
  covered by another page.

| Sub-skill | Supply | Evidence |
|---|---|---|
| Shakehand grip | MEDIUM-HIGH | "How to Hold the Racket Like a Pro - Table Tennis Grip" (153k) |
| Penhold grip | HIGH | "4 BASIC PENHOLD GRIP \| MLFM Table Tennis Tutorial" (728k) |
| Ready position | MEDIUM | "Two world champions demonstrate the ready position" (94k) |
| Forehand drive | HIGH | "Learning Forehand Drive & Backhand Drive (Best Tip)" (2.4M) |
| Backhand drive | MEDIUM | "The Secret to a Consistent Backhand Drive" (58k) |
| Forehand push | MEDIUM-HIGH | "How to PUSH Effectively - Professionals Explained" (103k) |
| Backhand push | MEDIUM-HIGH | "Master the Backhand Push in Table Tennis" (85k) |
| Block | HIGH | "Blocking tactics to mess up your opponents" (1.79M) |
| Forehand topspin | HIGH | "Forehand Topspin Like Ma Long \| 5 Tips" (141k) |
| Backhand topspin | HIGH | "How To Backhand Topspin Against Backspin" (311k) |
| Looping against backspin | HIGH | "How to do Advanced Forehand Topspin Against Backspin" (351k) |
| Backhand flick | MEDIUM-HIGH | "The Secret to a Killer Backhand Flick" (185k) |
| Forehand smash | MEDIUM | "Forehand Smash in Table Tennis \| When to Hit for Max" (21k) — thinnest page in the category |
| Chopping | MEDIUM | "How to do a FOREHAND CHOP - tips from a defensive expert" (89k); watch for entertainment drift ("I Challenged the Best Defender of All Time" 2.3M is not a tutorial) |
| Topspin serve | HIGH | "Learn the Fast Topspin Kicker Serve" (108k) |
| Backspin serve | HIGH | "The BEST Backspin Serve Tutorial \| Unbeatable" (176k) |
| Sidespin serve | HIGH | "How to return different types of sidespin serve" (893k) |
| Serve return | HIGH | "HOW TO RETURN ANY SERVE \| STEP-BY-STEP GUIDE" (722k) |
| Reading spin | HIGH | "How To Read Spin Like A Pro" (210k) |
| Table tennis footwork | HIGH | "3 KEY TIPS to improve your FOOTWORK" (155k) |
| Choosing a blade and rubber | HIGH | "Learn to Choose a Racket and Rubber" (255k) |
| Doubles rules and rotation | HIGH | "Doubles Serving Rules \| PingSkills" (329k) |

---

## Climbing — 22 sub-skills

Order: entry and gear, rope skills, falling, then movement technique from footwork outward, then
reading and training.

**Two dropped after probing:**

- *Open hand grip* — returns the same "Crimp Grip vs. Open Grip" video that serves the crimp page;
  the only dedicated result had 459 views. Folded into **Crimp grip**.
- *Down climbing* — no real dedicated supply (26k top result, then drift).

| Sub-skill | Supply | Evidence |
|---|---|---|
| Bouldering for beginners | HIGH | "TOP 10 Tips for Beginner Boulderers" (2.9M) |
| Choosing climbing shoes | HIGH | "Guide to Climbing Shoes \| Louis Parkinson" (339k) |
| How to tie in (figure 8) | HIGH | "How to tie into the harness with Perfect Figure 8 knot" (2.27M) |
| Belaying | HIGH | "Rock Climbing: How to Belay" (1.04M) |
| Lead belaying | HIGH | "Rock Climbing: Lead Belay" (669k) |
| Clipping quickdraws | HIGH | "How to Clip Quickdraws" (196k) |
| How to fall safely | HIGH | "Rock Climbing: Lead Fall" (329k), "How To Fall When Indoor Bouldering" (130k) |
| Climbing footwork | HIGH | "Rock Climbing Footwork Technique" (411k) |
| Flagging | HIGH | "How to Flag - A Climbing Technique for Achieving Balance" (376k) |
| Heel hook | MEDIUM-HIGH | "Heel Hook Training; the key to climbing harder" (94k) |
| Toe hook | MEDIUM-HIGH | "Toe Hook Tips - you didn't know this was a thing" (112k) |
| Crimp grip | HIGH | "Crimp Grip vs. Open Grip - MUST WATCH for Beginners" (126k) |
| Drop knee | MEDIUM-HIGH | "9 Neil Greshams Masterclass - Drop Knee" (199k) |
| Dyno | HIGH | "How to dyno 101 - Climbing for beginners" (699k) |
| Mantle | **MEDIUM** | "How To Mantle (Climbing Technique)" (41k) — thin, expect a small page |
| Slab climbing | HIGH | "Slab Climbing 101: Techniques and Exercises" (240k) |
| Overhangs and body tension | HIGH | "The Reason You Can't Hold Body Tension" (366k) |
| Resting on the wall | MEDIUM | "Lead Climbing 101 - How to Find Rests" (83k) |
| Reading routes | MEDIUM-HIGH | "Route Reading 101 \| Louis Parkinson" (141k) |
| Climbing grades explained | HIGH | "Adam Ondra #78: Climbing Grades" (399k) |
| Hangboard training | HIGH | "Fingerboarding & Hangboarding: A Beginner's Guide" (183k); exclude follow-along routines |
| Climbing warm up | HIGH | "Warm Up for Climbing Like a Pro" (339k) |

---

## Pickleball — 19 sub-skills

Order: rules, serve and return, soft game, hard game, specialty shots, movement, doubles, equipment.

**One dropped:** *Drop shot* returned exactly the same videos as **Third shot drop** — same page,
different name.

**One flagged thin:** *Around the post (ATP)* — real shot, but the query pulls highlight compilations
("Nastiest Points In Pickleball History" 1.03M). Expect a small page and tight moderation.

| Sub-skill | Supply | Evidence |
|---|---|---|
| Pickleball rules | HIGH | "Pickleball Rules \| The Definitive Beginner's Resource" (6.8M), "How to Play Pickleball: The Ultimate Guide" (5.5M) |
| Kitchen rules | HIGH | "The pickleball kitchen rule (non-volley zone) COMPLETE" (180k) |
| Pickleball serve | HIGH | "How to Serve A Pickleball \| Beginner's Guide" (989k) |
| Return of serve | MEDIUM-HIGH | "The SECRET to Returning Serves in Pickleball" (115k) |
| Dink | HIGH | "Stop Hitting Weak Dinks! Do This Instead" (170k) |
| Third shot drop | HIGH | "How to Hit a 3rd Shot Drop in Pickleball" (1.37M) |
| Third shot drive | MEDIUM-HIGH | "7 Steps to a Deadly 3rd Shot Drive" (128k) |
| Reset | MEDIUM-HIGH | "Mastering The RESET in 3 Simple Steps" (122k) |
| Pickleball volley | HIGH | "How To Volley Like a Pro in Pickleball" (265k) |
| Pickleball backhand | HIGH | "This Technique Makes Hitting Backhands SO EASY!" (247k) |
| Overhead smash | MEDIUM-HIGH | "I Took a Lesson With a Pro to Fix My Crappy Overhead" (122k) |
| Pickleball lob | MEDIUM-HIGH | Selkirk TV and ThatPickleballGuy both rank — see the auto-translation note above |
| Erne | MEDIUM | "Master the Erne: A MUST HAVE WEAPON" (126k) |
| Around the post | **MEDIUM/thin** | "Learn this Pickleball Shot to TRANSFORM Your Game" (37k) |
| Pickleball footwork | MEDIUM-HIGH | "PICKLEBALL FOOTWORK - The ultimate guide + 5 drills" (109k) |
| Doubles positioning | HIGH | "6 Pickleball Doubles Strategies New Players MUST Know" (1.5M) |
| Stacking | HIGH | "What is Stacking? Pickleball Stacking Strategies Explained" (316k) |
| Singles strategy | HIGH | "How to Win in Pickleball Singles (Strategy Masterclass)" (221k) |
| Choosing a pickleball paddle | HIGH | "How to Find the Best Pickleball Paddle" (311k) |

---

## Skiing — 19 sub-skills

Order follows PSIA Level 1–2: first day, stance, stopping, wedge, lifts, parallel, carving, then
terrain, then equipment and safety.

**One dropped:** *Wedge christie* — it is genuine PSIA terminology and the exact rung between wedge
and parallel, but it is instructor jargon that nobody titles a video with. Top result had 3.2k views.
The transition is covered by **Snowplough turns** → **Parallel turns**.

| Sub-skill | Supply | Evidence |
|---|---|---|
| How to ski for beginners | HIGH | "How to Ski \| 10 Beginner Skills for the First Day" (6.1M) |
| Ski stance and body position | MEDIUM-HIGH | "The 2 Biggest Skiing Mistakes (and how to fix them)" (482k) |
| How to stop on skis | HIGH | "How to do The Hockey Stop on Skis" (418k) |
| Snowplough turns | MEDIUM | "SKIING FOR BEGINNERS, LESSON 3.0 - Snowplow, wedge" (94k) |
| Getting up after a fall | HIGH | "Standing Up After A Fall - How To Ski Tips" (841k) |
| How to use a ski lift | HIGH | "How to Use Beginner Lifts" (605k) |
| Parallel turns | HIGH | "How to Ski \| 7 Steps to Parallel Turns" (2.4M) |
| Carving on skis | HIGH | "HOW TO CARVE on Skis - Advanced Ski Lesson" (3.1M) |
| Short turns | HIGH | "Expert Ski Lessons #7.1 - Body Position Short Turns" (1.04M) |
| Pole plant | HIGH | "How to Pole Plant - Advanced Ski Lesson" (774k) |
| Skiing moguls | HIGH | "How To Ski Moguls: Tips & Drills" (343k) |
| Skiing powder | HIGH | "How to Ski Powder \| 10 Tips" (1.03M) |
| Skiing steeps | HIGH | "How to Ski Steeps \|\| REI" (436k) |
| Skiing on ice | HIGH | "HOW TO SKI ON ICE \| 4 tips with Kili Weibel" (1.01M) |
| Jumps and park skiing | HIGH | "Basics Of Jumping On Skis" (302k) |
| Ski boot fitting | HIGH | "Why Custom Ski Boots Are Worth It" (228k) |
| How to choose skis | HIGH | "How to Choose the Right Ski Length" (673k) |
| Avalanche safety | MEDIUM-HIGH | "Basic Avalanche Theory & Identifying Avalanche Terrain" (100k) — genuinely shared with Snowboarding |
| Ski fitness and conditioning | HIGH | "30 Minute Ski Conditioning Workout" (1.17M); watch for follow-along drift |

---

## Snowboarding — 18 sub-skills

Order follows AASI: first day, stance setup, stopping, falling leaf, single-edge turns, linking,
lifts, then carving, switch, park.

**One dropped:** *Skating and gliding* — a real AASI first-day skill, but no supply (2.6k top result,
then a Point Break movie clip). Covered inside **How to snowboard for beginners**.

**One flagged thin:** *Riding powder* — drifts to board reviews and trip vlogs.

| Sub-skill | Supply | Evidence |
|---|---|---|
| How to snowboard for beginners | HIGH | "How to Snowboard - the basics for your first day \| REI" (2.7M) |
| Snowboard stance and binding angles | HIGH | "Snowboard Bindings Angles and Width Explained" (1.25M) |
| How to stop on a snowboard | HIGH | "How To Stop On A Snowboard - Beginner Tips" (368k) |
| Falling leaf | MEDIUM-HIGH | "Very Beginner Snowboard Steps to Turning" (139k) |
| Heelside turns | HIGH | "Proper Snowboard Heelside and Toeside Turn Technique" (626k) |
| Toeside turns | MEDIUM-HIGH | "3 Beginner Snowboard Tips of Doing Toe Turns" (113k) |
| Linking turns | HIGH | "5 Tips for Linking Beginner Snowboard Turns" (513k) |
| Riding the chairlift | HIGH | "How To Survive the Chairlift" (825k) |
| Snowboard carving | HIGH | "How To Snowboard - 8 STEPS TO CARVING" (727k) |
| Riding switch | HIGH | "How to Ride Switch on a Snowboard" (656k) |
| Ollie on a snowboard | HIGH | "The KEY to Ollie on A Snowboard" (504k) |
| Butters | HIGH | "10 First Butter Snowboard Tricks to Learn" (401k) |
| Frontside 180 | HIGH | "5 Steps to Frontside 180's" (471k) |
| Park jumps | HIGH | "5 Tips for Beginner Snowboard Jumps" (959k) |
| Boxes and rails | MEDIUM-HIGH | "How To Ride Long Boxes & Rails" (160k) |
| Riding powder | **MEDIUM** | "HOW TO RIDE POWDER / HAVE MORE FUN" (140k) |
| How to choose a snowboard | HIGH | "What TYPE of Snowboard Should You Buy?" (1.14M) |
| Avalanche safety | MEDIUM-HIGH | Shared with Skiing — same source videos serve both |

---

## Brazilian jiu-jitsu — 36 sub-skills

Order follows the standard position-before-submission syllabus: orientation, solo movements,
guards, top positions, escapes, sweeps, submissions, passing, takedowns, then rules.

The largest category of the seven, and it earns it — BJJ is the most granularly taught sport tested.

| Sub-skill | Supply | Evidence |
|---|---|---|
| BJJ for beginners | HIGH | "Starting Jiu Jitsu? What to Know Before Your 1st Class" (1.41M) |
| BJJ belt system | HIGH | "What Do BJJ Belts Mean?" (660k) |
| Breakfalls | MEDIUM-HIGH | "How To Breakfall Correctly (Ukemi)" (215k) |
| Hip escape (shrimp) | MEDIUM-HIGH | "How to Do the Hip Escape aka Shrimping" (87k) |
| Bridging | MEDIUM | "Brazilian Jiu Jitsu Basics: How to Bridge" (73k) |
| Posture and base | MEDIUM | "BJJ Lesson 1: The Concept of Alignment" (130k) — thinnest of the fundamentals |
| Closed guard | HIGH | "How To Build The Perfect BJJ Closed Guard Game by John Danaher" (468k) |
| Open guard | MEDIUM-HIGH | "Understanding The Open Guard In BJJ by John Danaher" (243k) |
| Half guard | HIGH | "How To Build The Perfect Half Guard Game" (661k) |
| Butterfly guard | HIGH | "Butterfly Guard Guide In Gi & Nogi" (250k) |
| De la Riva guard | HIGH | "Gui Mendes \| De La Riva X-Guard Lapel Variations" (454k) |
| Guard retention | HIGH | "Guard Retention - How To Never Get Your Guard Passed by Gordon Ryan" (1.40M) |
| Side control | HIGH | "ROGER GRACIE Shows How to Maintain and Attack from Side Control" (214k) |
| Mount | HIGH | "Concepts for Maintaining Mount" (455k) |
| Back control | MEDIUM-HIGH | "8 Back Control Tips To DOMINATE" (108k) |
| Turtle position | HIGH | "The 2 Easiest Attacks Against the Turtle Position" (189k) |
| Mount escape | HIGH | "Jiu-Jitsu Escapes \| 5 Ways Out of The Mount" (3.6M) |
| Side control escape | HIGH | "How To Do The Perfect BJJ Side Control Escape by John Danaher" (1.03M) |
| Back escape | HIGH | "How to Escape the Back EVERY TIME" (321k) |
| Scissor sweep | HIGH | "Scissor Sweep for BJJ White Belts" (538k) |
| Hip bump sweep | MEDIUM | "The BJJ Hip Bump Sweep and How to Connect It" (62k) |
| Butterfly sweep | MEDIUM-HIGH | "Adam Wardzinski Teaches The 'Lazy' Butterfly Sweep" (85k) |
| Armbar | HIGH | "BJJ Moves: Arm Bar From Guard by John Danaher" (705k) |
| Triangle choke | HIGH | "Triangle Chokes from Almost Everywhere" (504k) |
| Kimura | HIGH | "Kimura From Closed Guard For White Belts" (807k) |
| Americana | MEDIUM-HIGH | "How to Do the Americana from Mount" (275k) |
| Rear naked choke | HIGH | "How To Perform The Perfect Rear Naked Choke by John Danaher" (445k) |
| Guillotine choke | HIGH | "How To Guillotine ANYONE In BJJ" (367k) |
| Omoplata | MEDIUM | "the OMOPLATA by RAFAEL MENDES" (123k) |
| Knee cut pass | MEDIUM-HIGH | "How to Correctly Set Up The Knee Cut Pass" (51k) |
| Toreando pass | MEDIUM | "Leandro Lo - Toreando Pass Highlight" (77k), "How to Toreando Pass Like Gordon Ryan" (61k) |
| Leg drag pass | MEDIUM-HIGH | "Knee Cut to Leg Drag with Levi Jones Leary and Lachlan Giles" (129k) |
| Double leg takedown | HIGH | "How to Do a Double Leg Takedown for MMA & BJJ" (670k) |
| Single leg takedown | HIGH | "The Best Single Leg Takedown For Brazilian Jiu Jitsu" (365k) |
| Gi vs no-gi | MEDIUM-HIGH | "Should Beginners Focus on Gi or No GI BJJ" (216k) |
| Competition points and rules | MEDIUM | "BJJ Point System: the basics" (93k) |

---

# Rollout notes

**Categories are inactive.** All seven went in with `is_active = false`. Verified in code:

- `apps/web/lib/data.ts` → `getCategories()` filters `is_active = true`, so nothing renders on the
  site.
- `scripts/run-collection.mjs` → the skill rotation query filters `s.is_active` and joins categories
  but **does not** filter `c.is_active`, so the collector picks these up and fills them while hidden.

Flip each category on once its sub-skills clear the 3-published threshold in
`getPublishMinResources()`.

**Channels.** `loadChannels()` matches trusted sources by category explicitly — an uncategorised
channel is not global. These categories start with zero `trusted_sources`, so first runs depend on
the open-search path, which promotes channels that repeatedly surface accepted candidates. Seeding a
handful of obvious channels per category would accelerate this considerably: Stomp It Tutorials and
Alpine Tutorials with George (skiing); SnowboardProCamp (snowboarding); Rick Shiels and Me And My
Golf (golf); PingSkills and TableTennisDaily (table tennis); Lattice Training and Hooper's Beta
(climbing); The Pickleball Clinic and Selkirk TV (pickleball); Gracie Barra, John Danaher and
Chewjitsu (BJJ).

**Collection order.** Skiing and snowboarding are seasonal — start their collection now so pages are
populated before December. Golf, table tennis, climbing and BJJ are year-round.

---

# Second-pass review — ChatGPT deep research (applied as 0044)

An independent pass using `docs/chatgpt-subskill-research-prompt.md`. **Accepted 16 additions and
5 renames; rejected ~25 renames and 4 additions.** Total: 160 → 176 sub-skills.

## The one big rejection

The report's largest recommendation was to prefix ~25 bare names with their category — *Block* →
*Table tennis block*, *Reset* → *Pickleball reset*, *Mount* → *BJJ mount*, plus *Flagging*, *Dyno*,
*Mantle*, *Heel hook*, *Toe hook*, *Stacking*, *Bridging*, *Americana* and others. The stated premise
was that the collector searches the bare skill string across all of YouTube.

**It does not.** `scripts/run-collection.mjs` has two query builders:

- `searchQueriesForSkill()` (line 1007) uses the bare name — but is only called for **channel-scoped**
  search (line 2655), where the channel already supplies the context.
- `openSearchQueriesForSkill()` (line 1035, called line 2759) **prepends the category to every query
  and drops the bare-name query entirely.** Its comment documents this exact failure and its fix:
  bare "Bandeja" across YouTube returned cumbia music videos, so open search now always carries the
  category.

Production confirms it. Bare-named pages are among the best performers in the whole catalogue:
Surfing **Pop-up** 55 published, Badminton **Drive** 25, Surfing **Cutback** 25, Padel **Lob** 23,
Badminton **Deception** 22, Tennis **Lob** 21, Badminton **Lift** 20, **Push** 19.

Prefixing would also double the token in open search — a skill named "Table tennis block" yields the
query "Table tennis Table tennis block". Probed directly ("Golf Golf grip" vs "Golf Grip",
"Pickleball Pickleball serve" vs "Pickleball Serve"): results are equivalent, YouTube dedupes the
repeated token. So the doubling is **harmless but pointless** — which also means the existing
category-embedded names (Golf grip, Pickleball serve, Climbing footwork) need no change either.

## Accepted additions (16)

| Category | Sub-skill | Priority | Supply on re-probe |
|---|---|---|---|
| Golf | **Alignment** | MUST | HIGH — "THE PERFECT GOLF ALIGNMENT ROUTINE" (912k), "The 5 Worst Alignment Mistakes in Golf" (376k) |
| Golf | **Ball position** | MUST | HIGH — "Get the CORRECT BALL POSITION with Every Golf Club!" (211k), "The Key To Having Perfect Ball Position" (208k) |
| Golf | **Putting distance control** | SHOULD | MEDIUM-HIGH — "How to Control Distance on Long Putts with Brad Faxon" (149k); mild overlap with Putting stroke |
| Table tennis | **Forehand flick** | MUST | HIGH — "Forehand Flick \| PingSkills" (1.01M), "How to play forehand flick" (289k). Genuine asymmetry with the existing Backhand flick |
| Table tennis | **Lob** | NICE | MEDIUM — "Lob \| PingSkills" (69k); watch for drift into rally footage ("Michael Maze - Master Of Lob" 1.45M is not a tutorial) |
| Climbing | **How to put on a harness** | SHOULD | MEDIUM — "How to Put on a Climbing Harness \|\| REI" (150k) is strong, tail is thin. Mountain Training puts harness fitting at the same level as tying in and belaying |
| Climbing | **Rockover** | SHOULD | MEDIUM — "Rock Climbing Tips: How to Rock Over using your Heel" (107k), "EVERYTHING you need to know about the ROCKOVER technique" (63k). Distinct pools from Mantle and Heel hook |
| Pickleball | **Pickleball forehand drive** | MUST | HIGH — "COMPLETE Forehand Drive Tutorial" (210k), "Hit the Forehand Like a Pro in 4 Easy Steps" (123k). Clear asymmetry with the existing backhand page |
| Pickleball | **Speed-ups** | SHOULD | HIGH — "Everything to Know About 'Speed Ups' In Pickleball" (201k), "MASTER Your Speedups With World #3 James Ignatowich!" (53k) |
| Skiing | **Side slipping** | SHOULD | MEDIUM — "STEEP SESSIONS - Side Slipping + Skidding" (59k), "Side Slipping..an essential tool to have!" (25k) |
| Skiing | **Hockey stop** | SHOULD | **HIGH — stronger than the report judged.** "Foot Rotation / Hockey Stop - Intermediate Skiing Lesson" (1.14M), "How to do The Hockey Stop on Skis" (418k). Kept **How to stop on skis** as the beginner umbrella; hockey stop is the intermediate rung |
| Snowboarding | **Backside 180** | SHOULD | HIGH — "5 Steps to Learning Backside 180's" (144k), "How to Backside 180 on a snowboard" (85k) |
| Snowboarding | **Riding moguls** | SHOULD | **MEDIUM — downgraded from the report's HIGH.** "How To Survive Big Mogul Snowboarding" (95k), "RIDE BUMPS AND MOGULS" (73k). The 699k video it cited did not surface on re-probe |
| BJJ | **Breaking closed guard** | MUST | HIGH — "Breaking Closed Guard For White Belts" (810k), "Marcelo Garcia on Breaking the Closed Guard" (237k). Real gap: every existing pass assumed the guard was already open |
| BJJ | **Arm triangle** | SHOULD | HIGH — "How to Do Arm Triangle Choke from Mount" (1.49M), "7 Ways to Finish Arm Triangle Chokes Like a Black Belt" (35k) |
| BJJ | **Knee on belly** | NICE | **MEDIUM-LOW — weaker than the report judged.** Every result under 20k ("Knee On Stomach - Concepts & Principles" 19k, "Surviving Knee On Belly" 14k). Standard position, thin pool — expect ~10 published. The weakest of the sixteen |

## Accepted renames (5)

All five were accepted on **scope** grounds, not disambiguation:

- Golf **Setup and posture** → **Posture** — it was an umbrella occupying the search space that
  Alignment and Ball position now need.
- Climbing **Belaying** → **Top rope belaying** — gives it a clean boundary against Lead belaying.
- Climbing **How to tie in (figure 8)** → **How to tie a figure 8** — drops a parenthetical, per the
  round-2 naming rule.
- Climbing **Overhangs and body tension** → **Body tension** — it named a terrain *and* a concept.
- Skiing **Jumps and park skiing** → **How to jump on skis** — too broad for the one-thing rule;
  rails and spins can come later if their pools justify it.

## Rejected additions (4)

Agreeing with the report's own reservations in each case: **counterloop** (re-probed at 16k/18k/8k —
thin), **poaching** (bleeds into Doubles positioning), **nollie** (tutorial pool combines it with
Ollie), **downclimbing** (mixes indoor bouldering with mountain scrambling).

## Kept despite criticism

- **Gi vs no-gi** — flagged as "a comparison, not a sub-skill". True, but the catalogue already
  carries explainers that work (BJJ belt system, Climbing grades explained, Golf rules for
  beginners). Keeping it.
- **Ski fitness and conditioning** and **Golf warm up** — flagged for follow-along drift. This is the
  same concern already recorded above. Both stay, but check published/candidate yield after the
  first collection runs; these are the two most likely to underperform.
