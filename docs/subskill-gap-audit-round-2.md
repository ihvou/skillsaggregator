# Sub-skill gap audit — round 2

**Date:** 2026-08-19
**Scope:** all 13 active categories, 261 active sub-skills
**Method:** taxonomy read from `COLLECT_DB_URL` (categories × skills × published `link_skill_relations`),
compared against governing-body / certification curricula, then every candidate probed through
`yt-dlp ytsearch` — the same YouTube search path the collector uses. Availability ratings below come
from real result sets, not intuition. Several "obvious" topics failed that test and are marked LOW.

New-category recommendations are deliberately **out of scope** here — separate research.

---

## Badminton — well covered, 3 gaps

*Source: BWF Coaches' Manual L1 + BWF Laws of Badminton*

### MUST-HAVE

**Badminton rules explained**
Every governing-body pathway opens with the Laws (service height, court, rally scoring); no rules page exists.
Availability **HIGH** — "The Rules of Badminton - EXPLAINED!" (2.6M), "Badminton Service Rules - A quick and
simple explanation of the 4 service rules" (1.2M), "Rules of Badminton : How To PLAY Badminton" (536k).
Overlap: none.

### SHOULD-HAVE

**How to choose a badminton racket**
Equipment counterpart to Stringing and tension (21).
Availability **HIGH** — "How to Choose a Badminton Racket - The Ultimate Guide" (1.8M), "How To Choose The
BEST BADMINTON RACKET For You - The 4 Step Framework" (592k).
Overlap: adjacent to stringing, but distinct — frame/balance/flex vs string/tension.

**Badminton warm up**
BWF L1 physical-prep module; no warm-up or injury page anywhere in a lunging, jumping sport.
Availability **HIGH** — "PROPER BADMINTON WARMUP" (1.15M), "Badminton Specific Warm Up In 10 MINUTES!" (600k).
Overlap: none.

### NICE-TO-HAVE

**Cross court net shot**
BWF treats straight and cross-court net as separate teaching points.
Availability **HIGH** — "How To Play A Cross-Court Net Shot - Step-By-Step Badminton Tutorial" (417k),
"How to Master the Cross Court Net Shot" (337k).
Overlap: moderate with Net shot (20) — survives, but expect shared candidates.

### Rejected after probing

- **Backhand drop shot** — tutorials are combined "backhand clear, drop and smash" videos already feeding
  Backhand clear (25) and Backhand smash (21).
- **Smash defence positioning** — Defense (block) 24 + Defense (lift) 25 already own it.

---

## Boxing — solid on technique, 4 gaps in the apparatus half

*Source: England Boxing Coach Award / IBA handbooks — technique block, then the apparatus rotation:
skipping, heavy bag, pads, speedball, double-end ball*

### MUST-HAVE

**Boxer skip**
Skipping opens virtually every session in the syllabus; shadow boxing, heavy bag and pads exist but no rope.
Use "boxer skip", not "jump rope" — it retrieves boxing-specific content instead of general fitness.
Availability **HIGH** — "Learn The Jump Rope Boxer Skip In 5 Easy Steps" (1.06M), "How to Jump Rope Like a
BOXER Step by Step | Tony Jeffries" (1.14M).
Overlap: none.

### SHOULD-HAVE

**Double end bag**
Separate apparatus, separate tutorials.
Availability **HIGH** — "How to Use Double End Bag | Beginners Tutorial" (706k), "Complete Guide to the
Double End Bag | Boxing Tutorial" (54k).
Overlap: none with Heavy Bag Technique (64).

**How to cut off the ring**
Ring generalship is explicit coaching-award content; footwork and distance exist but nothing on herding.
Availability **MEDIUM-HIGH** — "How to cut off the Ring | Full Detailed Explanation" (46k), "Step By Step
For Cutting Off The Ring" (93k), "Ring Generalship: How to cut the ring" (69k). Modest views, all dedicated.
Overlap: low vs Footwork (65).

**How to beat a southpaw**
Standard tactical module.
Availability **HIGH** — "How to FIGHT and BEAT a SOUTHPAW in Boxing" (173k), "Southpaw Fighting Strategies
for Boxing, Muay Thai & MMA" (321k).
Overlap: none.

### NICE-TO-HAVE

**Feinting**
Availability **MEDIUM-HIGH** — "How to Use Feints to Land More Punches in Boxing" (108k), "How to Feint,
Fake, Strike & Evade" (89k).
Overlap: partly served by Counter-punching (19).

**How to choose boxing gloves**
Availability **HIGH** — "What oz gloves should I use?" (396k), "How to Choose Boxing Gloves" (357k).

### Flagged LOW — do not build

- **Clinching** — real in the rulebook, thin on YouTube: best on-topic result "The Clinch In Boxing" (9k),
  rest drifted to MMA.
- **Shoulder roll** — returns Mayweather film-study and raw footage; Head Movement & Slipping (65) absorbs it.

---

## Cycling — significant gaps, 5 — including the first rung of the ladder

*Source: UK National Standard for Cycle Training / Bikeability Levels 1–3*

### MUST-HAVE

**How to ride a bike for adults**
Bikeability Level 1 *assumes* balance, starting and stopping. The catalogue begins at "Choosing your first
bike"; the rung below it is empty.
Availability **HIGH** — "How to teach an adult to ride a bike quickly and simply | Cycling UK" (3.1M),
"How To Ride A Bike From Scratch! | A Beginners Guide" (924k), "How To Ride a Bike, For Adults" (460k).
Overlap: none.

### SHOULD-HAVE

**Tubeless tyre setup**
Modern counterpart to Fixing a Puncture (25); different procedure.
Availability **HIGH** — "Tubeless Made Easy! | How To Set Up Tubeless Road Tyres" (423k), "How To Setup
Tubeless Road Bike Tyres" (47k).

**How to replace a bike chain**
Next maintenance job after cleaning and indexing.
Availability **HIGH** — "How To Replace A Bicycle Chain" (4.5M), "How to Replace a Chain on a Bike -
Sizing & Installation" (2.9M).
Overlap: low vs Chain cleaning and lubrication (22).

**Strength training for cyclists**
Parallel to Running's equivalent.
Availability **MEDIUM-HIGH** — "6 Beginner Strength Training Exercises For Cyclists" (966k), "5 Gym
Exercises Proven To Make You A Faster Cyclist" (348k). Caveat: a chunk of results are follow-along workouts.

**Cleat position**
Availability **HIGH** — "Finding The Perfect Cleat Position For Cycling" (240k), "HOW TO: set up your road
bike cleats" (163k).
**Overlap warning:** sits between Bike Fit Basics (33) and Using Clipless Pedals (25). May be better as a
merge into one of those than as a new page.

### NICE-TO-HAVE

**Cycling sprint technique**
Availability **HIGH** — "How To Sprint Faster On A Road Bike" (359k), "3 Steps to Improve your Sprint" (538k).

**Cycling in the rain**
Bikeability L3 adverse conditions.
Availability **HIGH** — "Top 10 Tips For Cycling In The Rain" (444k), "8 Hacks For Riding In The Rain And
Wet Weather" (168k).

---

## Gym (men) — well covered on the big lifts, 4 gaps against the movement framework

*Source: NSCA fundamental movement patterns — squat, hinge, lunge, horizontal/vertical push,
horizontal/vertical pull, carry, rotation. Six of seven are covered; **carry and rotation are entirely
absent**, and vertical push has no bodyweight entry.*

### MUST-HAVE

**Dips**
The missing bodyweight push, counterpart to Pull-up progression (39).
Availability **HIGH** — "The Perfect Dip - Do it right" (3.6M), "How To Do Dips For A Bigger Chest and
Shoulders (Fix Mistakes!)" (2.2M).
Overlap: none.

**Front squat**
Second squat pattern, and the gateway to cleans.
Availability **HIGH** — "HOW TO FRONT SQUAT: Build Bigger Quads & A Stronger Squat" (1.9M), "The Front
Squat" (2.0M).
Overlap: low vs Barbell squat (36) — different rack position and cues.

### SHOULD-HAVE

**Power clean**
No explosive / triple-extension lift exists in the category.
Availability **HIGH** — "The Power Clean" (4.1M), "How to Power Clean [From Olympic Weightlifter Darren
Barnes]" (1.6M).
Overlap: none.

**Kettlebell swing**
Ballistic hinge.
Availability **HIGH** — "How Kettlebell Swings Completely Change Your Body" (1.3M), "The Kettlebell Swing
Technique Everyone Gets WRONG!" (610k).
Overlap: low vs Deadlift (22).

**Farmer's walk**
The NSCA carry pattern, unrepresented.
Availability **MEDIUM** — "How Farmers Walks Completely Change The Human Body" (1.8M), "How to Perform the
Farmer's Carry" (151k), "Single Arm Farmers Walk (How To, Common Mistakes & Benefits)" (11k).
Honest: one huge video, thin tail — expect 12–15 published, not 30.

**Pallof press**
The NSCA rotation pattern.
Availability **MEDIUM** — "How to Do the Pallof Press (Perfect Form for a Stronger Core)" (211k), "How To
Do A Pallof Press" (274k).
Overlap: distinct from Core bracing (22), which is intra-abdominal pressure.

### NICE-TO-HAVE

**Calf raises**
Availability **MEDIUM** — "You're Doing Calf Raises WRONG | The Correct Way Taught By Physical Therapist"
(99k), "Hypertrophy Guide | Calves | JTSstrength" (293k).
Name it for the exercise, not the body part — "calf training" retrieves follow-alongs.

**How to use a lifting belt**
Availability **HIGH** — "Complete Guide to Lifting Belts" (462k), "How To: Use a Lifting Belt" (865k),
"Stop Wearing Your Weightlifting Belt Like THIS" (802k).

**Creatine**
Availability **HIGH** but talking-head heavy — "What Does Creatine Do? | Nutritionist Explains" (2.5M),
"Why Nearly Everyone Should Be Taking Creatine" (403k).

### Flagged LOW

- **Ab training** — probed "how to train abs": "Get Abs In 60 Days" (11.8M), "Do THIS Everyday In 2026 For
  6 PACK ABS" (1.3M). Clickbait and follow-alongs, not technique. If wanted, scope to a movement
  ("Hanging leg raise").
- **Glute training for men** — similarly listicle-heavy.

---

## Gym (women) — well covered, but one page is broken and two asymmetries remain

### Read this first — pipeline bug, not a taxonomy problem

**"Dumbbell bench press" has 3 published.**

> **CORRECTED 2026-08-20 — the diagnosis below was wrong.** This section originally called it a
> pipeline bug and guessed the candidates were being deduped against Gym (men) → Bench press, or that
> the page had never been rotated into review. Neither was true. The page had **68 active relations,
> all reviewed: 3 published, 65 rejected, none pending.** The rejected pool was follow-along workout
> content ("20 Minute Dumbbell Upper Body Circuit Workout | Caroline Girvan") and the coach was
> correctly refusing it — channel search had been mining follow-along channels in the Gym (women)
> source pool for a single-exercise technique page.
>
> The 4.4% publish ratio also tripped the collector's low-publish guard, so the skill had been
> **parked** — dropped from the rotation entirely, including open search, unable to recover on its own.
> It was the only skill in the catalogue in that state.
>
> Fixed in `supabase/migrations/0048_unpark_dumbbell_bench_press.sql` by retiring the 65 rejected
> relations, which drops active below the guard's minimum and returns the page to the rotation. The
> source pool was deliberately left intact: Caroline Girvan measures 9 published of 51 across the
> category, 6 of them on Upper-body hypertrophy (6/8 on that page) where the follow-along format
> genuinely fits, and `trusted_sources` is category-scoped with no per-skill granularity — so dropping
> her to fix one technique page would trade away content that works elsewhere.
>
> **Lesson:** a low published count is not self-explanatory. Check the *review* state (published vs
> rejected vs never-reviewed) before concluding anything, and check whether the low-publish guard has
> already parked the skill.

### MUST-HAVE

**Fat loss nutrition**
Gym (men) has it at 56 — the biggest page in that category. The women's side has only Nutrition for
strength (24). This is the most-searched goal in the category and it is absent.
Availability **MEDIUM** — honest warning: the probe drifted to Huberman / Layne Norton / Mindy Pelz podcast
clips. Use the plain name and let the same pool that filled the men's page fill it.
Overlap: deliberate duplication with the men's page, consistent with Deadlift / Pull-up progression /
Overhead press already duplicated across the two categories.

**Recovery habits**
Men's has it (26); women's has nothing on sleep, deloads or soreness. Same content pool.

### SHOULD-HAVE

**Lifting while pregnant**
The stage before both Postpartum core and diastasis recti (22) and Pelvic floor aware lifting (22).
Availability **MEDIUM** — "LIFTING WHILE PREGNANT? Strength Training Do's + Dont's" (223k), "Exercise During
Pregnancy | Doctors Answer FAQs" (545k), "Safe Lifting During Pregnancy: Top 3 Tips from a Perinatal
Fitness Expert" (1.4k). Thin tail — expect 10–15.

### Flagged LOW — hold off

- **Menopause strength training** — "MENOPAUSE Strength Workout (1/2) | Joe Wicks Workouts" (899k) and
  similar. Almost pure follow-along.
- **Core training for women** — "20 MIN KILLER ABS + CORE - No Equipment" (5.9M) and similar. Same problem.

Both are real topics with the wrong content type for a dedicated-tutorial page.

---

## Padel — shot repertoire is complete, 3 gaps around it

*Source: FIP coaching pathway — rules/court, grip, positioning, footwork, then the shot ladder
(bandeja, víbora, bajada, chiquita, dejada, x3, kick smash — all present)*

### MUST-HAVE

**Padel footwork**
Badminton has three footwork pages, Tennis one, Padel none, despite footwork being the standard third lesson.
Availability **MEDIUM** — "How to MOVE YOUR FEET for padel! Basic to Advanced Padel Tips!" (130k),
"5 Footwork HACKS To Improve Your Padel!" (38k), "5 Padel Drills That Actually Fix Your Footwork And
Movement" (7k). Honest: thin tail, expect 12–18.
Overlap: low vs Court positioning (19) — where to stand vs how to move.

### SHOULD-HAVE

**Padel rules for beginners**
Availability **HIGH**, and the best top-of-funnel page available in the category — "How to play padel?"
(3.7M), "Padel Rules You NEED To Know" (967k), "Padel 101: Everything You Need to Know for Beginners" (556k).

**How to choose a padel racket**
Availability **HIGH** — "How to CHOOSE a Padel Racket? | ThePadelSchool.com" (186k), "7 KEYS TO CHOOSE YOUR
PADEL RACKET IN 2025" (131k).

### NICE-TO-HAVE

**Playing with your partner**
Availability **MEDIUM**, thin — "HELP Your Partner - Padel Tactics!" (49k), "3 TIPS for When Playing With a
NEW PARTNER" (9k).
Overlap: partly served by Court positioning (19).

### Rejected after probing

- **Contrapared** — returns the same back-wall videos already serving Coming off the wall (23) and
  Glass defense (23).
- **Point construction** — returns "WIN POINTS by Having the Correct COURT POSITION!", i.e. the existing
  Court positioning page.

---

## Pilates — well covered for a repertoire YouTube only partly supports, 3 gaps

*Source: the classical Contrology mat order*

Present: Hundred, Roll-Up, Roll-Over, One Leg Circle, Rolling Like a Ball, Single/Double Leg Stretch,
Spine Stretch, Swan, Side Kick series, Swimming, Teaser.
Missing from the classical order: Saw, Criss-Cross, Neck Pull, Corkscrew, Spine Twist, Seal, Boomerang,
Side Bend, Leg Pull. **Only three of those are supported on YouTube** — this is the same trap round one hit.

### SHOULD-HAVE

**Criss-cross**
Best-supplied of the missing classical exercises.
Availability **HIGH** — "How to Do the Criss-Cross | Pilates Workout" (495k), "Pilates Exercise: Criss Cross
| Pilates Anytime" (87k), "How to Do The Pilates Criss Cross | Pilates for Beginners" (6k).
Overlap: none.

**The Saw**
Availability **MEDIUM-HIGH** — "How to Do the Saw | Pilates Workout" (150k), "Pilates Workout Exercise: Saw"
(18k), "Pilates Mat Saw Exercise" (12k). Thin tail, expect ~12–18.

**Neck Pull**
Follows the existing Roll-Up progression.
Availability **MEDIUM** — "How to Do the Neck Pull | Pilates Workout" (72k), "Pilates Exercise: Neck Pull |
Pilates Anytime" (46k).

### Flagged LOW — do not build

- **Pilates for lower back pain** — 100% follow-along in the probe ("Mat Pilates for Back Pain | 20 Min"
  352k, "45 min Lower Back Pain Exercises"). Yoga for back pain (23) works because follow-alongs are the
  norm in yoga; Pilates here is scoped as an exercise-by-exercise repertoire, so it would sit wrong.
- **Pilates for posture** — pure follow-along ("25 MIN PILATES WORKOUT || Pilates For Better Posture" 2.7M).
- **More individual reformer exercises** — probed the Long Stretch series: "Long Stretch Series - Pilates
  Reformer" (12k), "Pilates Reformer Encyclopedia: Long Stretch" (5k). Real but tiny. If one more reformer
  page is added, make it **"Reformer Pilates for beginners"** (MEDIUM: "Reformer Pilates 101: Everything
  Beginners Need to Know" 115k) rather than another individual exercise.

---

## Running — significant gaps on training and injury, 5

*Source: UESCA / RRCA coach certification — intensity distribution, race fuelling, taper, common-injury module*

### MUST-HAVE

**Zone 2 running**
Cycling has "Training zones and FTP"; Running has nothing tying effort to heart rate.
Availability **HIGH** — "Zone 2 Training For Beginners & Advanced Athletes" (1.45M), "I Tried Zone 2
Training for 3 Months. This Happened" (3.9M), "How I Run Fast With A Low Heart Rate (Using Science)" (387k).
Overlap: moderate with Easy runs (22) — but "zone 2" is the search term and it retrieves the physiology
content Easy runs does not. **Do not name it "Heart rate training".**

**Plantar fasciitis**
The third of the big three; Shin splints (24) and Runner's knee / IT band (21) exist.
Availability **HIGH** — "Foot Pain When Running? | What Is Plantar Fasciitis & How To Treat It" (433k),
"SOLVED MY Plantar Fasciitis in 30 Days (For Trail Runners)" (353k).

**Marathon fuelling**
Race pacing (21) exists but nothing on gels or carbs.
Availability **HIGH** — "How To Fuel Your Long Runs & Races Effectively!" (196k), "Fueling Strategy for Best
Marathon Results" (171k), "How to FUEL for the marathon & carb loading" (64k).
Avoid "Running nutrition" — retrieves general diet content.

### SHOULD-HAVE

**How to taper for a marathon**
Availability **HIGH** — "How To Taper For A Marathon" (61k), "MARATHON TAPERING (The Secret to Race Day
Success!)" (72k), "How To Feel Great On Race Day | Your Tapering and Peaking Masterclass" (38k).

**Achilles tendonitis**
Completes the injury set.
Availability **HIGH** — "Pain When Running? | What Is Achilles Tendonitis & How To Avoid It" (617k),
"Heal Your Achilles Tendonitis At Home!" (1.2M).

### NICE-TO-HAVE

**Trail running**
Availability **MEDIUM-HIGH** — "6 Off-Road Run Skills To Master | Trail Running Tips" (145k), "Trail Running
Tips | How To Handle Steep Terrain" (212k).

**Hill repeats**
Availability **MEDIUM** — "HILL REPEATS RUNNING made EASY" (168k).
**Overlap warning:** this is the *session*, Uphill Running Technique (32) is the *form*. Real distinction,
shared candidates likely.

### Flagged

- **Treadmill running** — drifty probe ("Steal This SKATER TECHNIQUE To Run Faster WITHOUT PAIN" is not
  about treadmills). Skip.

---

## Soccer (Individual Skills) — attacking half complete, defending half nearly empty; only 2 gaps are fillable

*Source: The FA's ten core skills —
https://learn.englandfootball.com/articles-and-resources/coaching/resources/2026/What-are-the-ten-core-skills-in-football*

In-possession: Receiving ✓ (First Touch), Moving with the ball ✓ (Dribbling), Turning ✓, Passing ✓,
Finishing ✓.
Out-of-possession: Intercepting ✗, Pressing ✗, Marking ✗, Challenging ✗, Covering and recovering ✗ —
one page, Defending 1v1 (22), covers all five.

### MUST-HAVE

**How to tackle in football**
The FA's "Challenging". Defending 1v1's description covers approach and jockeying, which is the phase
*before* the tackle.
Availability **HIGH** — "5 WAYS TO WIN EVERY TACKLE - HOW TO TACKLE IN FOOTBALL" (2.3M), "Improve your
tackling with Ruben Dias as your teacher" (2.2M), "How to master the SLIDE TACKLE (without fouling!)" (40k).
Overlap: low — different videos from the jockeying pool.

### SHOULD-HAVE

**How to hit a volley**
The FA lists volleys under Finishing techniques; standard step after ground finishing.
Availability **HIGH** — "Master the VOLLEY shot with this tutorial" (209k), "How to VOLLEY a Soccer Ball |
For Beginners" (157k), "The forgotten Rule of the Volley" (122k).
Overlap: low vs Finishing & Shooting (72).

**How to shield the ball**
Availability **HIGH** — "how to protect the ball so well, defenders hate you" (359k), "Football Skills |
Learn How To Protect The Ball Like A Pro" (364k), "How to Protect the Ball Under Pressure | 3 Shielding
Moves" (104k).
Overlap: none.

### Important negative finding on the rest of the FA defensive list

Pressing, intercepting and marking were probed separately and **the same videos came back for all three** —
"How to STOP fast skillful attackers" (1.5M) and "5 DEFENSE Tips that Stop Forwards" (2.0M) appear in every
result set. Three pages would share one pool of videos. If more defensive coverage is wanted, make it **one**
page ("Defending in football"), not three. "Covering and recovering" is team shape — a different product.

### NICE-TO-HAVE

**Off the ball movement**
Availability **MEDIUM-HIGH** — "7 RULES - OFF THE BALL MOVEMENT | BASICS OF FOOTBALL/SOCCER" (211k),
"The No.1 Drill That Unlocks Perfect OFF The Ball Movement (4 Phases)" (39k).
Overlap: none.

### Rejected after probing

- **Running with the ball** — the FA distinguishes it from dribbling, but the probe returned "How to DRIBBLE
  while SPRINTING" (415k) and "How To Run Faster With The Soccer Ball" (276k) — the same candidates feeding
  Dribbling & Close Control (65). Do not split.

---

## Surfing — well covered on wave riding, 4 gaps on the practical side

*Source: ISA Level 1 Instructor course — weighted toward safety, equipment and beach management alongside
technique*

### MUST-HAVE

**How to catch a green wave**
The single biggest milestone in surfing (whitewater → unbroken wave), taught as its own step; the catalogue
jumps from Pop-up (55) straight to Takeoff timing (22).
Availability **HIGH** — "How to Catch an Unbroken Wave | How to Surf - Paddling into Green Waves" (2.9M),
"How To Catch A Green Wave?" (144k), "5 Essential Tips For Surfing Unbroken Waves" (6k).
Overlap: moderate with Takeoff timing, but "green wave" is the learner's search term and carries the
beginner-milestone framing.

### SHOULD-HAVE

**How to wax a surfboard**
ISA equipment module; most basic board-care skill.
Availability **HIGH** — "THE ULTIMATE GUIDE TO WAX YOUR SURFBOARD! (PERFECT BUMPS)" (140k), "How To Wax Your
Surfboard Perfectly EVERYTIME" (178k), "How to wax a surfboard" (165k).

**Surfboard ding repair**
Cycling has four maintenance pages; Surfing has zero.
Availability **HIGH** — "How to Repair a Surfboard Ding with Keith Malloy | YETI" (71k), "Professional
surfboard DING REPAIR" (76k), "Surfboard Ding Repairs [PU Foam + Polyester Resin]" (92k).

**Cross stepping**
The longboard progression; no longboard technique exists despite Board choice covering longboards.
Availability **MEDIUM-HIGH** — "How to Cross Step on a Longboard? Step by Step Tutorial by Dana" (44k),
"I wish I knew this cross stepping tip ages ago" (68k), "TSBW - Learn To Surf - Cross Step" (72k).
Overlap: none.

### NICE-TO-HAVE

**How to fall off safely**
ISA safety module.
Availability **MEDIUM** — "How To Surf | Fall Off Safely Without Hurting Yourself" (145k) is strong, but the
tail is 1–4k views. Small page.

**Floater**
The manoeuvre between Top turn and Cutback.
Availability **MEDIUM** — "Surf Simply Tutorials: Floaters" (90k), "WSL Surf 101: The Floater" (15k),
"Surfing Trick Tip - Frontside Floater" (5k). Thin but genuinely dedicated.

### Flagged

- **Choosing a wetsuit** — drifts to triathlon / open-water wetsuits. If built, name it
  **"Choosing a surf wetsuit"**.

---

## Swimming — strokes complete, water-skills gaps — 4

*Source: Swim England Learn to Swim Programme —
https://www.swimming.org/learntoswim/swim-england-learn-to-swim-awards-1-7/ and
https://www.swimming.org/learntoswim/swim-england-learn-to-swim-awards-8-10/*

### MUST-HAVE

**How to tread water**
Stage 5 requires treading water for 30 seconds; Stages 8–10 require vertical eggbeater. It is a core
water-safety competency and the catalogue has Breath control (21) and Front and back float (22) but nothing
vertical.
Availability **HIGH** — "How to Tread Water For Complete Beginners | 3 Steps" (765k), "How to Tread Water
for Beginners in 10 Minutes" (630k), "Master Treading Water with these simple steps" (324k).
Overlap: none — Sculling Drills (21) is the horizontal hand skill, not the vertical position.

### SHOULD-HAVE

**Open water sighting**
Nothing outside the pool exists, and the triathlon audience is large.
Availability **HIGH** — "How To Sight In Open Water" (244k), "How To Sight Whilst Open Water Swimming"
(74k), "Open Water Sighting Techniques" (28k).

**How to swim without getting tired**
The most-searched beginner problem in the sport; the technique pages do not answer the endurance question.
Availability **HIGH** — "How To Swim Without Getting Tired" (2.3M), "How To Swim Without Getting Tired |
Essential Tips" (1.2M), "HOW TO SWIM LONG DISTANCE WITHOUT GETTING TIRED" (582k).

**Open turn**
Swim England teaches it *before* the tumble turn; Freestyle Flip Turn (34) exists but not its predecessor,
nor the breaststroke / butterfly turn.
Availability **MEDIUM-HIGH** — "Breaststroke Turn Advice" (518k), "Open turn technique | Breastroke turn |
Butterfly turn | IM turns" (388k), "Beginner Swimmers: Stop Pausing at the Wall (How to do an open turn)"
(47k).

### NICE-TO-HAVE

**Backstroke kick**
Freestyle Flutter Kick (44) and Breaststroke kick (24) exist; backstroke's does not.
Availability **MEDIUM-HIGH** — "Backstroke Swimming Technique | Kick" (237k), "Backstroke Swimming Kick"
(144k).

**How to use a pull buoy**
Availability **MEDIUM-HIGH** — "How To Swim With A Pull Buoy | Improve Your Freestyle Swimming" (508k),
"Improve Your Swim Power: How & Why To Use Hand Paddles" (126k).

### Flagged LOW

- **Fear of water / adult learn to swim** — mostly sub-2k-view videos plus one outlier. Breath control and
  Front and back float already cover the practical content.

---

## Tennis — the most complete category, 2 gaps

*Source: USTA NTRP descriptors 1.5–4.5. Everything the descriptors list is present: grips, split step, both
groundstrokes, both backhands, topspin, slice, volley, half volley, overhead, lob, drop shot, approach, all
three serve types, return, singles and doubles.*

### SHOULD-HAVE

**Tennis scoring explained**
The only genuine beginner-entry gap; the same one Badminton and Padel have.
Availability **HIGH** — "The Rules of Tennis EXPLAINED (scoring, terms and more)" (1.4M), "How Tennis
Scoring Works | Beginners" (522k), "Tennis for dummies video | Tennis Scoring Explained" (277k).

**Tennis elbow**
The sport's defining injury; no injury page in a category of 20.
Availability **HIGH** — "7 Best Tennis Elbow Pain Relief Treatments (Lateral Epicondylitis)" (3.2M),
"3 Home Exercises for Tennis Elbow" (1.2M), "STOP Elbow Pain! How To Fix Tennis Elbow" (1.1M).

### NICE-TO-HAVE

**How to choose a tennis racket**
Availability **HIGH** — "How to Choose the Perfect Tennis Racket for You" (406k), "How to Pick a Tennis
Racquet -- Racquet Terms & Specs Explained" (430k).

### Flagged — would not build

- **Passing shot** — dedicated but low-view; best result 24k.
- **Serve and volley** — drifts to highlights and "Why Is Serve Volley Tennis Dead?".
- **Inside-out forehand** — drifts to Alcaraz highlight reels.

All three are legitimate NTRP-level topics with weak dedicated-tutorial supply.

---

## Yoga — one whole asana category is missing, 3 gaps

*Source: Yoga Alliance RYS 200 standards —
https://yogaalliance.org/wp-content/uploads/2025/05/Standards-for-RYS-Credentials_NB22my-.pdf — which
require trainees to learn key poses in five asana categories: standing, forward bends, backbends, twists,
inversions. Four are covered. **Twists are entirely absent** — no seated twist, no revolved standing pose.*

### MUST-HAVE

**Seated spinal twist**
The missing fifth asana category. Title it in English; that is what videos use (Ardha Matsyendrasana is the
niche name).
Availability **MEDIUM-HIGH** — "Yoga: How To Do Seated Spinal Twist" (147k), "Seated Spinal Twist" (75k),
"Seated Half Spinal Twist | Ardha Matsyendrasana | Yoga Pose" (12k).
Overlap: none.

**Triangle pose**
The standing family is warriors + tree; Trikonasana is the other pose every RYS 200 teaches and the
canonical alignment lesson.
Availability **HIGH** — "Triangle Pose | Trikonasana | Foundations of Yoga" (366k), "Triangle Pose Alignment
& Tips - Yoga for Beginners" (44k), "Where Should Your Hips Go in Triangle Pose?" (24k).
Overlap: none.

### SHOULD-HAVE

**Shoulderstand**
Four inversions exist (down dog, headstand, forearm stand, handstand) but not the one classically taught
first.
Availability **HIGH** — "How to do Sarvangasana - Shoulder Stand" (686k), "Foundations Of Shoulder Stand |
Candle Pose" (485k), "Shoulderstand Tutorial, Yoga" (76k).

### NICE-TO-HAVE

**Camel pose**
The accessible backbend between Bridge and Wheel.
Availability **HIGH** — "How to do Camel Pose - Ustrasana - BackBend Asanas" (536k), "Foundations Of Yoga -
Camel Pose - Ustrasana" (375k).

**How to do the splits**
The flexibility goal Hip-Opening Poses (58, the biggest yoga page) implies. General-flexibility rather than
strictly yoga.
Availability **HIGH** — "How to do a Split Fast! Stretches for Splits Flexibility" (20.2M), "How to do the
Splits Fast -- This Technique Changed Everything!" (1.7M).

### Flagged LOW

- **Prenatal yoga** — pure follow-along ("10 minute PRENATAL YOGA for Beginners" 1.9M).
- **Yoga for runners** — pure follow-along ("Runner's Yoga - Yoga With Adriene" 4.9M).

Yin (23) and Restorative (23) already absorb that format; more class-format pages dilute rather than add.

---

# Naming, redundancy, structure

## Renames, ranked by cost

| Page | Published | Rename to | Evidence |
|---|---|---|---|
| ~~Running alongside lifting~~ | 13 | **CORRECTED — not a naming problem, see below** | |
| Around the head shot | 12 | **Round the head shot** | Current name returns 1–2 on-topic results then drifts to jump-smash / footwork; top hit is "How to Hit a Forehand **Round** the Head Shot" |
| Penalty technique | 12 | **How to take a penalty** | Current query pulls compilations ("Most Humiliating Penalty Kicks" 12.1M) that moderation correctly rejects |
| Fuelling and hydration on the bike | 11 | **Cycling nutrition** | Supply is fine ("How To Fuel For A Long Bike Ride" 447k) — the British "fuelling" spelling and the four-concept name are the problem |
| Turning with the ball | 14 | **Turns to beat a defender** | Probe drifted to a children's TV episode; "4 essential turns to BEAT defenders with ease" (283k) is the real content |
| Trimming down the line | 18 | **Riding down the line** | "Trimming" is surfer jargon; top result under the current name is literally "How to Surf **Down the Line**" |

## Correction — "Running alongside lifting" (13)

An earlier version of this document recommended renaming this page to "Hybrid training: running and
lifting", on the evidence that the probe returned Indonesian-language videos in its top results.
**That evidence was wrong and the rename is not needed.**

Re-checking the video IDs and channels shows the results are English-language videos from exactly the
right channels — Natacha Océane's "How to Balance Running + Gym Workouts" and Alan Thrall (Untamed
Strength)'s "Adding Running to Your Lifting Routine". YouTube was serving **auto-translated title
metadata**; resolving the same video ID directly returns the original English title. The query
retrieves on-topic content and the name works.

The 13 published count therefore has some other cause — treat it like the Dumbbell bench press case
below and check the pipeline rather than the name. Renaming to "Hybrid training" remains defensible
purely because it is a larger search term, but it is optional, not a fix.

**General lesson for future audits:** foreign-language titles in a `yt-dlp` probe are not evidence of
a bad skill name. Always confirm against `%(uploader)s` or resolve the video ID before concluding a
query is off-idiom.

## Not a naming problem — check the pipeline

- **Gym (women) → Dumbbell bench press (3)**. Supply is enormous. Investigate dedup against Gym (men) →
  Bench press (27), or whether the page has ever been rotated into review.

## Genuinely thin — leave alone

- **Soccer → Heading (16)**. Supply is moderate and view counts sit well below other soccer pages; youth
  heading restrictions have suppressed tutorial production. 16 may be the ceiling.

## Parentheticals

Mostly harmless — Serve (low) 25, Serve (flick) 21, Footwork (front court) 23 all perform fine. Only
**Serve (high) at 14** underperforms, and supply exists ("5 Easy Tips to Improve Your High Serve" 171k), so
try **"High serve"** before writing the topic off.

## Too broad

- **Defending 1v1** (Soccer) carries five FA core skills alone.
- **Board choice** (Surfing) bundles volume, shape, fins and length — four buying decisions in one page,
  though at 24 published it is working.

## Cross-category asymmetry (Gym)

The duplication between Gym (men) and Gym (women) reads intentional. The *asymmetries* are the actionable
part — men's has Fat-loss nutrition, Recovery habits, Core bracing, Cardio for lifters and Training split
basics with no women's equivalent. That list is worth closing. The reverse (Gym confidence, Beginner lifting
program, the three life-stage pages) is correctly women's-only.

---

# Totals

11 MUST-HAVE · 24 SHOULD-HAVE · 16 NICE-TO-HAVE · 6 renames · 1 pipeline bug.

Tennis, Padel, Badminton and Pilates need almost nothing. Cycling, Running and Soccer have the real gaps.

# Sources

- The FA's ten core skills — https://learn.englandfootball.com/articles-and-resources/coaching/resources/2026/What-are-the-ten-core-skills-in-football
- Swim England Learn to Swim Stages 1–7 — https://www.swimming.org/learntoswim/swim-england-learn-to-swim-awards-1-7/
- Swim England Learn to Swim Stages 8–10 — https://www.swimming.org/learntoswim/swim-england-learn-to-swim-awards-8-10/
- Yoga Alliance Standards for Registered Yoga Schools — https://yogaalliance.org/wp-content/uploads/2025/05/Standards-for-RYS-Credentials_NB22my-.pdf
- NSCA, Progressive Strategies for Teaching Fundamental Resistance Training Movement Patterns (PTQ 10.2) — https://www.nsca.com/contentassets/3d09f06f0b4c4f6fbd8cc382ed1f3d4a/ptq-10.2.1-progressive-strategies-for-teaching-fundamental-resistance-training-movement-patterns.pdf
- BWF Coaches' Manual Level 1 and BWF Laws of Badminton; England Boxing / IBA coaching handbooks;
  UK National Standard for Cycle Training (Bikeability); ISA Level 1 Instructor course; USTA NTRP
  descriptors; UESCA / RRCA running coach certifications; FIP padel coaching pathway; classical Contrology
  mat order.
