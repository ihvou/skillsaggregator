# Deep-research prompt — discover missing sub-skills

Run this in a fresh Claude Code thread **in this repo** (it needs DB access). It reads the
live taxonomy itself rather than working from a pasted snapshot, so it never goes stale and
the researcher can see coverage depth per skill.

Context for why this is round two: an earlier audit added 97 sub-skills (152 -> 249) and
deliberately implemented only the MUST-HAVE tier. The SHOULD-HAVE and NICE-TO-HAVE lists
were never written down and are lost. This regenerates them against the *current* taxonomy.

---

```
I run "Subskills", a curated catalogue of sport & training tutorials. Each category is split
into sub-skills; each sub-skill page holds 10-30 curated YouTube tutorials teaching that ONE
specific thing.

FIRST, read my current taxonomy straight from the database. From the repo root:

  export PATH="/opt/homebrew/opt/libpq/bin:$PATH"
  set -a; . ./.env.hosted; set +a
  psql "$COLLECT_DB_URL" -c "
    select c.name category, s.name skill, s.description,
           count(lsr.id) filter (where lsr.is_active and lsr.published) published
    from categories c
    join skills s on s.category_id = c.id and s.is_active
    left join link_skill_relations lsr on lsr.skill_id = s.id
    where c.is_active
    group by c.name, s.name, s.description, s.learning_order
    order by c.name, s.learning_order nulls last;"

That gives you all 13 categories, every sub-skill with its description, and how many videos
each page currently holds. Use the published count as a signal: a page stuck in low single
digits may be a naming or scoping problem rather than a missing-topic problem, and that is
worth telling me about.

THEN go CATEGORY BY CATEGORY and tell me what important sub-skills are still missing. This
is a second pass — the obvious gaps were filled recently — so I want the next tier down:
genuinely useful topics a learner would expect, not padding.

=== METHOD ===
For each category:
1. Find the curriculum a real learner would follow — governing-body syllabi, coaching
   certification content lists, established teaching progressions. Name the source.
   (Sources that worked well in round one: BWF Coaches' Manual L1 for badminton, USTA NTRP
   descriptors for tennis, the FA's ten core skills for football, AIBA and England Boxing
   handbooks, Red Cross / Swim England stages for swimming, ISA Level 1 for surfing,
   UESCA/RRCA/USATF for running, Yoga Alliance RYS standards, the classical Pilates
   repertoire, the UK National Standard for Cycle Training, NSCA movement patterns.)
2. Compare it against what the query returned.
3. Report what is missing — and say so plainly when a category is already complete. I would
   much rather read "Badminton is well covered, 2 real gaps" than get a padded list.

=== FOR EACH MISSING SUB-SKILL ===
- **Name**, phrased the way a tutorial would title it. This matters more than it sounds: the
  collector builds YouTube search queries directly from the sub-skill name, so a name nobody
  uses in a video title retrieves the wrong content. A real failure: a page named "Starting
  to run" collected general running content and published 2 of 16 candidates; renamed to
  "Couch to 5K" it started collecting the right thing. Avoid parentheticals and internal
  jargon. If a technique has a niche name and a common name, give both and say which one
  people actually search.
- **Priority**: MUST-HAVE (a learner would notice its absence) / SHOULD-HAVE / NICE-TO-HAVE
- **Why it is standard** — one line, tied to the curriculum source
- **Tutorial availability**: HIGH / MEDIUM / LOW, judged on whether DEDICATED single-topic
  tutorials exist — not follow-along classes, workout compilations, vlogs or match footage.
  Cite 2-3 real video titles as evidence. Mark LOW honestly: a page I cannot fill is worse
  than no page, and round one was burned by topics that are real in a syllabus but absent
  from YouTube (e.g. kicking out in surfing, several classical Pilates exercises).
- **Overlap check**: does it meaningfully differ from what exists, or would the same videos
  serve both pages?

=== ALSO TELL ME ===
- Any existing sub-skill that looks MISNAMED for search, REDUNDANT with another, or too
  broad/narrow versus how the discipline is actually taught. Cross-reference the published
  counts — a page with very few videos despite an obvious topic is usually a naming problem.
- Any category where the right move is a NEW CATEGORY rather than more sub-skills, and why.

=== OUTPUT ===
Group by category, MUST-HAVE first. Put a one-line verdict at the top of each category
("well covered — 2 gaps" / "significant gaps — 8 missing"). Flag anything you are unsure
about rather than padding. I expect several categories to need almost nothing.
```

---

## After the research comes back

Give me the results and I will add them as a migration — inserting into `skills` with
`learning_order` and `subskill_difficulty` renumbered per category, as
`0037_taxonomy_expansion.sql` did. New sub-skills stay invisible in the UI until they have
3 published resources, and the collector's scarcity-first rotation picks them up first, so
adding them is safe at any time.
