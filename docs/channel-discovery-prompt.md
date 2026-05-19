# Channel discovery research prompt

Copy-paste the block below into Codex / ChatGPT / Claude / Perplexity for parallel research. I've already done a manual yt-dlp discovery pass (21 channels added across 2 rounds on 2026-05-19) — this prompt is for going **wider** with channels I missed, especially blogs / podcasts / non-English coaching channels for badminton and padel.

---

```
You're researching reputable YouTube channels and blogs for a skills-aggregator project. The audience is learners ranging from beginner to advanced. We want 5–8 new sources per category that teach the actual skills (drills, technique breakdowns, tutorials) — NOT vlogs, tournament reproductions, match highlights, or pure entertainment.

For each candidate return JSON with these fields:
- name (string)
- url (full channel/blog URL, including @handle for YouTube)
- channel_id (if YouTube — the UCxxxx string, run `yt-dlp --print "%(channel_id)s" --playlist-end 1 --skip-download URL` if unsure)
- source_type ("youtube_channel" | "domain")
- audience_tier ("micro <10k" | "mid 10k-100k" | "large 100k-1M" | "huge >1M")
- last_active_year (yyyy)
- why_reputable (one sentence — credentials, signal, format, quality)
- niche_match (true if >70% of content teaches the specific category, false otherwise)
- primary_language (e.g. "en", "es", "id") — we score against English prompts so non-English is OK but lower priority

EXCLUSION LIST (already in our pool — do NOT propose these or anyone using a different handle for the same brand):

badminton (8 youtube + 3 blogs):
- Badminton Famly (@badmintonfamly, UC57H0Kg7TQpc8Na96gfm4kg) + badmintonfamly.com
- Badminton Insight (UCk2gRC4RewYvvXXqXZxaTbQ)
- BWF TV (UChh-akEbUM8_6ghGVnJd6cQ)
- Aylex Badminton Academy (UCnVfEREu3C1_CV_lg3iRAog)
- Shuttle Life (UCXYpDcoYJk8CTGLUscj2Tgg)
- HR Ten (UC9542l2VW6zcH3_BcVc8Pzw)
- Dk Badminton (UCAZb6V_lf6NPGBqWGoZmJJA)
- Jacobs Badminton (UCFhzo4Y1bVE8yczq5OMNo2Q)
- badmintonbites.com
- badmintonpassion.com

gym-men (6 youtube + 3 blogs):
- Jeff Nippard (UC68TLK0mAEzUyHx5x5k-S1Q) + jeffnippard.com
- Jeremy Ethier (UCERm5yFZ1SptUEU4wZ2vJvw)
- Renaissance Periodization (UCfQgsKhHjSyRLOp9mnffqVg) + rpstrength.com
- ATHLEAN-X (UCe0TLA0EsQbE-MjuHXevj2A)
- Squat University (UCyPYQTT20IgzVw92LDvtClw)
- Juggernaut Training Systems (UCxEV58PJpZhoYN3L35_48Pg)
- builtwithscience.com

gym-women (6 youtube + 3 blogs):
- Caroline Girvan (UCpis3RcTw6t47XO0R_KY4WQ) + carolinegirvan.com
- MegSquats (UCj_GeRF7G4NEpvQ5_A1wSvg) + megsquats.com
- SoheeFit (UCf2HPiMK_PAESm_yFbm2CKw) + soheefit.com
- Stephanie Sanzo (UCb1To8rv8G4CelTlHuHbjSg)
- Stefi Cohen (UCMoe2ZnSFIFcayGVv__xFEA)
- Bret Contreras Glute Guy (UCRx0HAyAfmcqtrQYK3IITBA)

padel (7 youtube + 3 blogs):
- EverythingPadel (UCH6Y34ndSHpQ5chh0bk6Iqg) + everythingpadel.co.uk
- The Padel School (UCmswycX_XINvjrPX0i_17rg) + thepadelschool.com
- Mejora tu padel (UCyJ89bNIXthD-Uy_0DUCcrg)
- Dani Hoyo Padel Coach (UCc_8Lyqqr-1rbbwd-1I6w5w)
- the4Set (UCPyl_w1y3UBjX08fMrcYzNA)
- Hello Padel (UCe1q5Jf6zbrE-aTYU53b-XQ)
- Padel Drive (UCpMEQ0SaV58-OCCJPxjSYMQ)
- padelalto.com

surfing (8 youtube + 3 blogs):
- Barefoot Surf (UCvOh9i-BOFzu51rpj33fGag) + barefootsurftravel.com
- How to Rip (UCuZSTHZf3vd7eVehhnotcsg) + howtorip.com
- Surf Simply (UC8bEqBo6HUYBETZZS2AsMlg) + surfsimply.com
- World Surf League (UChuLeaTGRcfzo0UjL-2qSbQ)
- Stab Magazine (UCsG5dkqFUHZO6eY9uOzQqow)
- SurfLab (UCe_ZLwzh-73vuzoZesJJgkw)
- Kale Brock (UCLdPicN16eAKPKir8EY1UXQ)
- SURFER (UCKo-NbWOxnxBnU41b-AoKeA)

REQUIREMENTS for any candidate you propose:
1. Channel handle / domain currently resolves (you can verify with `yt-dlp --print "%(channel_id)s|%(channel)s|%(channel_follower_count)s" --playlist-end 1 --skip-download URL`)
2. Posted in the last 12 months
3. Audience >= 10k subscribers OR demonstrably authoritative (national federation, certified coach, accredited body)
4. Content is primarily INSTRUCTIONAL — drills, technique breakdowns, tutorials

PRIORITIES (where we still want more):
1. badminton — want a few more drill / footwork / pro-analysis sources
2. padel — non-English (Spanish) is fine, scoring will filter
3. blogs / podcasts in all categories — we lean heavy on YouTube

Return the JSON array directly. No prose.
```

---

After you get JSON back, paste it here and I'll:
1. Verify each candidate via `yt-dlp --print "%(channel_id)s|%(channel)s|%(channel_follower_count)s" --playlist-end 1 https://www.youtube.com/<handle>/videos`
2. Drop any that fail validation
3. Insert into `trusted_sources` with `origin_type='admin'`
4. Update this prompt file's exclusion list

Or — once `PERPLEXITY_API_KEY` lands in `apps/web/.env.local`, run `node scripts/discover-sources.mjs` to automate this whole flow.
