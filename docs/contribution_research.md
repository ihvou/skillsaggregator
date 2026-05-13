# Contribution Model Research — Web Form vs. roadmap.sh-Style GitHub PRs

**Question:** can/should we use roadmap.sh's community contribution model — visitors contribute by submitting GitHub PRs to a content repo — instead of (or alongside) a web submission form?

**Short answer:** roadmap.sh's GitHub-PR model is a great fit for their audience (developers contributing developer roadmaps) but wrong for ours (badminton, surf, gym, padel — mostly non-developers). The right call for Skills Aggregator is **a web form as the primary path**, optionally layered with a **GitHub-content-repo path for power contributors** if/when curation scale demands it. Borrow specific conventions from roadmap.sh (resource type prefixes, per-skill cap, single-paragraph notes, English-only) but not the submission mechanism.

---

## 1. How roadmap.sh's model actually works

Verified from [`contributing.md`](https://github.com/kamranahmedse/developer-roadmap/blob/master/contributing.md) on the developer-roadmap repo.

### 1.1 Mechanics

1. Contributor forks the [kamranahmedse/developer-roadmap](https://github.com/kamranahmedse/developer-roadmap) repo on GitHub
2. Navigates to the `content/` directory of the relevant roadmap
3. Edits the **markdown file** for the topic, adding a new resource line:
   ```
   - [@video@How to learn React](https://www.youtube.com/watch?v=...)
   ```
4. Commits, pushes, opens a PR with a meaningful commit message
5. A maintainer reviews and merges (or comments / closes)
6. The Astro-based site rebuilds from the merged content

### 1.2 Resource format (the part worth borrowing)

| Element | Convention |
|---|---|
| Format | Single line: `- [@type@Title](URL)` |
| Type prefixes | `@official@`, `@opensource@`, `@article@`, `@course@`, `@podcast@`, `@video@`, `@book@` |
| Max per topic | **8 links** |
| Language | English only |
| Description | Optional, "a single paragraph or so" above the link list |
| Excluded | GeeksforGeeks links (explicitly banned) |

### 1.3 Review process

> "Find the content directory inside the relevant roadmap" → edit → "create a single PR" → maintainer reviews.

No automated CI checks on resource quality. No bot moderation. Pure human review by maintainers. The markdown format keeps PRs reviewable in a glance.

### 1.4 Why this works for roadmap.sh

- **Their audience is developers.** GitHub PR flow is native.
- **No DB** — the entire site is a static Astro build from markdown. PR == data update == deploy.
- **Quality > volume.** They'd rather have 100 carefully-curated PRs than 1000 form-submission spam.
- **No spam vector** — every PR requires a GitHub account, which is friction enough to deter abuse.
- **Topic graph is bounded** — there are dozens of roadmaps, not thousands. Manual maintenance scales.

### 1.5 Why it would *not* work for Skills Aggregator

| Their context | Our context | Implication |
|---|---|---|
| Developer audience | Badminton coaches, surf instructors, gym lifters | **Most of our users won't have a GitHub account or know what a PR is.** This alone disqualifies it as a primary path. |
| Static markdown content | Postgres `links` + `link_skill_relations` | We'd need a markdown ↔ DB sync layer (PR merge → script writes to suggestions table) — non-trivial. |
| Bounded topic set | 69 skills today, designed to scale to many more verticals | Each new sport adds 12+ skills; maintaining markdown files in a structured tree gets unwieldy fast. |
| One canonical English description | Multi-vertical, eventually multi-language (badminton has French/Spanish/Indonesian audiences) | i18n in markdown is awkward. |
| Reviewers ARE the founders | Founder = single moderator for foreseeable future | Either model has the same review-throughput bottleneck. |

The fundamental friction: **a parent who watched a great kid's badminton video on YouTube has zero path to contribute via a GitHub PR**. They'll bounce. Our web form (W1) accepts that submission in 15 seconds with no signup.

---

## 2. Where roadmap.sh conventions are worth borrowing

These are conventions, not infrastructure — they apply equally well to our web form.

### 2.1 Resource type prefixes → already have

Their `@video@`, `@article@`, `@course@`, `@podcast@`, `@book@` maps directly to our `links.content_type` enum (`video`, `article`, `podcast`, `course`). We could add `book` and `opensource` (e.g. for gym programming where free open-source training programs exist).

### 2.2 Single-paragraph descriptions → mostly already have

Their topic description is "a single paragraph or so" above the link list. We have `public_note` per `link_skill_relations` row (≤140 chars currently). Worth bumping to ~280 chars to allow a real one-paragraph explanation.

### 2.3 Per-skill cap → consider adding

roadmap.sh caps at 8 links per topic. We have no cap, which means a popular skill like `barbell-squat` could accumulate dozens of redundant videos. A soft cap of ~10–15 per skill, with the moderator pruning to keep the page useful, would help.

### 2.4 English-only → implicit, worth stating

Our agent prompt and scoring assume English transcripts. Stating this explicitly in the contribution form ("English-language resources only for now") sets expectations.

### 2.5 Excluded sources → adopt the spirit

roadmap.sh blanket-bans GeeksforGeeks. We should keep a small static blocklist of low-quality / SEO-spam domains, easily extended.

---

## 3. Three architectures, ranked

### 3.1 Path A — Web form only (recommended for MVP)

What W1/W2/W3 already describe in tasks.md.

| Pro | Con |
|---|---|
| Zero new infrastructure | Spam exposure (mitigated by W3) |
| Accessible to non-developers | Sole submission surface |
| Direct path to moderation queue | |
| Same flow on web + mobile (W1 + MO7) | |

### 3.2 Path B — Web form + GitHub content repo (hybrid; consider once scale demands)

Add a public `skillsaggregator-content` repo with markdown files mirroring roadmap.sh's format. A GitHub Action runs on PR merge that calls our `submit-suggestion` Edge Function with `origin_type:"github"`, `origin_name:"<github-username>"`.

| Pro | Con |
|---|---|
| Power-contributors (bloggers, coaches, curators) get a bulk-edit path | Markdown ↔ DB sync layer to build and maintain |
| Attribution via git commit history | Two parallel submission paths to keep aligned |
| Demonstrably open-source-friendly project | Most casual users still use the web form |
| GitHub trust signal (PR from known curator can auto-approve) | Two failure modes (form errors AND PR merge errors) |

Build cost: 2-3 days. Worth it if/when we have ≥5 power contributors regularly submitting batches of resources (currently zero).

### 3.3 Path C — GitHub PRs only (roadmap.sh's exact model)

Drop the web form, route all contributions through GitHub PRs to a content repo. Bad fit for our audience — skip.

---

## 4. Recommendation

**Ship Path A (W1 + W2 + W3 as filed).** Borrow these roadmap.sh conventions:

1. Bump `public_note` max length from 140 → 280 chars in W1's form and in the `link_skill_relations` schema
2. Add a soft cap on `resource_count` per `(skill, level)` — show a yellow flag in moderation UI when the skill already has ≥12 active resources at the same level
3. State "English-language resources only" in the W1 form copy
4. Maintain a `spam_domains` static list (start with 10–20 entries) in shared config; reject submissions whose canonical_url domain matches
5. Extend `content_type` enum to add `book` and (optionally) `opensource` for batched program drops

**Defer Path B** until at least one of:
- Web form submissions exceed 50/week sustained (showing real demand for batch tooling)
- A specific power-curator asks for it
- We open-source the content repo as a marketing channel

**Skip Path C entirely** — wrong fit for our audience.

---

## 5. New tasks (filed)

These are in `tasks.md`:

- **W1** — anonymous web submission form
- **W2** — contributor login + profile + badge
- **W3** — anti-abuse (rate limit, domain blocklist, optional Turnstile)
- **MO7** — mobile parity for W1
- **MO8** — mobile parity for W2

Plus three minor follow-ups suggested by this research (not yet filed; raise them when ready):

- Bump `public_note` max → 280 chars
- Soft per-skill resource cap (UI hint, not hard reject)
- Static `spam_domains` blocklist

---

## Sources

- [kamranahmedse/developer-roadmap on GitHub](https://github.com/kamranahmedse/developer-roadmap)
- [developer-roadmap contributing.md](https://github.com/kamranahmedse/developer-roadmap/blob/master/contributing.md)
- [roadmap.sh About page](https://roadmap.sh/about)
