# Channel discovery research prompt

Copy-paste the block below into Codex / ChatGPT / Claude / Perplexity for parallel research on under-covered categories. The biggest gaps right now are **badminton** and **padel** — my yt-dlp handle guesses didn't resolve and I couldn't add candidates without verification.

---

```
You're researching reputable YouTube channels and blogs for a skills-aggregator project. We want 5–8 new sources per category that teach the actual skills (not vlogs, not entertainment, not tournament reproductions). The audience is learners ranging from beginner to advanced.

For each candidate return JSON with these fields:
- name (string)
- url (full channel/blog URL, including @handle for YouTube)
- source_type ("youtube_channel" | "domain")
- audience_tier ("micro <10k" | "mid 10k-100k" | "large 100k-1M" | "huge >1M")
- last_active_year (yyyy)
- why_reputable (one sentence — credentials, signal, format, quality)
- niche_match (true if >70% of content teaches the specific category, false otherwise)

EXCLUSION LIST (already in our pool — do NOT propose these or anyone using a different handle for the same brand):

badminton:
- Badminton Famly (@badmintonfamly, UC57H0Kg7TQpc8Na96gfm4kg)
- Badminton Insight (UCk2gRC4RewYvvXXqXZxaTbQ)
- BWF TV (UChh-akEbUM8_6ghGVnJd6cQ)
- Badminton Bites (badmintonbites.com)
- Badminton Passion (badmintonpassion.com)

gym-men:
- Jeff Nippard (UC68TLK0mAEzUyHx5x5k-S1Q, jeffnippard.com)
- Jeremy Ethier (UCERm5yFZ1SptUEU4wZ2vJvw)
- Renaissance Periodization (UCfQgsKhHjSyRLOp9mnffqVg, rpstrength.com)
- Built With Science (builtwithscience.com)
- ATHLEAN-X (UCe0TLA0EsQbE-MjuHXevj2A)
- Squat University (UCyPYQTT20IgzVw92LDvtClw)
- Juggernaut Training Systems (UCxEV58PJpZhoYN3L35_48Pg)

gym-women:
- Caroline Girvan (UCpis3RcTw6t47XO0R_KY4WQ, carolinegirvan.com)
- MegSquats (UCj_GeRF7G4NEpvQ5_A1wSvg, megsquats.com)
- SoheeFit (UCf2HPiMK_PAESm_yFbm2CKw, soheefit.com)
- Stephanie Sanzo (UCb1To8rv8G4CelTlHuHbjSg)
- Stefi Cohen (UCMoe2ZnSFIFcayGVv__xFEA)
- Bret Contreras Glute Guy (UCRx0HAyAfmcqtrQYK3IITBA)

padel:
- EverythingPadel (UCH6Y34ndSHpQ5chh0bk6Iqg, everythingpadel.co.uk)
- The Padel School (UCmswycX_XINvjrPX0i_17rg, thepadelschool.com)
- Padel Alto (padelalto.com)

surfing:
- Barefoot Surf (UCvOh9i-BOFzu51rpj33fGag, barefootsurftravel.com)
- How to Rip (UCuZSTHZf3vd7eVehhnotcsg, howtorip.com)
- Surf Simply (UC8bEqBo6HUYBETZZS2AsMlg, surfsimply.com)
- World Surf League (UChuLeaTGRcfzo0UjL-2qSbQ)
- Stab Magazine (UCsG5dkqFUHZO6eY9uOzQqow)

REQUIREMENTS for any candidate you propose:
1. Channel handle / domain currently resolves (not deleted, not renamed)
2. Posted in the last 12 months
3. Audience >= 10k subscribers OR demonstrably authoritative (e.g. published by a national federation, certified pro coach, accredited training body)
4. Content is primarily INSTRUCTIONAL — drills, technique breakdowns, tutorials — not match highlights, vlogs, or product reviews

PRIORITIES (in order):
1. badminton — we currently have 6 sources, want 8–10
2. padel — we currently have 5 sources, want 8–10
3. surfing — 8 sources, want 10+
4. gym-men / gym-women — 9 each, lower priority

Return the JSON array directly. No prose.
```

---

After you get the JSON back from Codex/ChatGPT, paste it here and I'll:
1. Verify each candidate's `channel_id` + follower count via `yt-dlp --print "%(channel_id)s|%(channel)s|%(channel_follower_count)s" --playlist-end 1 https://www.youtube.com/<handle>/videos`
2. Drop any that fail validation
3. Insert the survivors into `trusted_sources` with `origin_type='admin'` (or `'agent'` if you used the R25 path)
4. Run a `nightly-report.mjs` the morning after to see how much they widened the catalog

Or — once you have a `PERPLEXITY_API_KEY` set in `apps/web/.env.local`, run `node scripts/discover-sources.mjs` and it automates this entire flow.
