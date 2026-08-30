# Growth plan — traffic, discovery and installs

Last updated: 2026-08-14

Answers one question: **how does a 10-week-old domain with no audience and ~$200 get found by
search engines, LLMs and app-store search?**

Every number marked ✅ was verified directly against the live site, the hosted database, or the
platform's own documentation during research. Numbers marked ⚠️ come from vendor blogs with a
commercial interest and should be treated as directional only. Research method: 12 independent
research + adversarial-verification agents, plus direct verification of every load-bearing claim.

---

## 0. The checklist

Work top to bottom. Development items carry a `tasks.md` ID; everything else is a console or
account action with no code. Section references point at the reasoning further down this file.

**Effort marked in hours is the work itself, not calendar time.** Two items (the closed test, and
Reddit account age) are clocks that run in the background — start them early and do other work while
they tick.

### P0 — this week · ~6h · $0 · every item is free, and three are time-critical

- [ ] **Cloudflare: make an explicit AI-crawler choice. Never block "Training".** — `M18(b)` · 0.5h · §3.6

  **Nothing is blocked today and you have not enabled anything — there is nothing to undo.** Verified
  2026-08-14: ClaudeBot, GPTBot, PerplexityBot, OAI-SearchBot, ChatGPT-User, Googlebot and bingbot all
  return HTTP 200. The old `M18(b)` text was a *suggestion* written in a previous session to relieve
  bandwidth. It was never acted on, and acting on it now would be a serious mistake.

  **Why you still have to touch it:** on **15 Sept 2026** Cloudflare's new AI-crawler defaults apply to
  Free-tier zones *that have not changed their settings*. Leaving it untouched means inheriting whatever
  the default becomes. Making any explicit choice takes you out of that bucket.

  **Do this:**
  1. Cloudflare dashboard → select the `subskills.xyz` zone → **Security → Bots**.
  2. Find **"Block AI Scrapers and Crawlers"** (older UI) / **AI Crawl Control** (newer). Confirm it is
     **OFF**. If your dashboard shows per-category controls, set them **explicitly**: Search = Allow,
     Training = Allow. Do not leave them on "Default".
  3. **Never set Training to Block.** Cloudflare: *"Mixed-purpose crawlers that combine Search and
     Training will also be blocked by all configurations to block AI training, including the legacy
     'Block AI bots' option."* Googlebot, Bingbot and Applebot are mixed-purpose — blocking Training
     403s Googlebot on your sitemap and removes you from Google Search.
  4. Verify from the terminal, which is authoritative regardless of what the UI looks like:
     ```bash
     for UA in ClaudeBot GPTBot PerplexityBot OAI-SearchBot ChatGPT-User Googlebot bingbot; do
       printf "%-16s " "$UA"
       curl -s -o /dev/null -w "%{http_code}\n" -A "Mozilla/5.0 (compatible; $UA/1.0)" \
         https://subskills.xyz/badminton/backhand-clear
     done
     ```
     Every line must read `200`. Anything else is an emergency. Re-run after **any** Cloudflare change.

  → *Outcome:* avoids being deindexed from Google. Nothing else on this list matters if this goes wrong.

- [ ] **Cloudflare: add the cache rule for bandwidth** — `M18(a)` · 0.3h · §3.6

  **This is the correct fix for the bandwidth problem** that the AI-blocking toggle was wrongly proposed
  for. It is **not done** — verified 2026-08-14, `cf-cache-status: DYNAMIC` on repeated hits, because
  the origin sends `cache-control: public,max-age=0,must-revalidate` and Cloudflare obeys it. So every
  bot hit currently goes through to Netlify and bills against your 100GB.

  **Do this:** Cloudflare → **Caching → Cache Rules → Create rule**.
  - **When incoming requests match:** Hostname equals `subskills.xyz`
  - **AND** URI Path does *not* start with `/admin`, `/api`, `/auth`, `/sign-in`
  - **Then:** Cache eligibility → **Eligible for cache**
  - **Edge TTL:** *Ignore cache-control header and use this TTL* → **2–4 hours**. This override is the
    whole point — without it the origin's `max-age=0` wins and nothing changes.

  **Verify:** `curl -sI https://subskills.xyz/badminton | grep -i cf-cache-status` twice — the second
  should read `HIT`, not `DYNAMIC`.

  → *Outcome:* bot traffic terminates at Cloudflare instead of Netlify. Netlify bandwidth drops to
  near-zero; the site stops being one crawler queue away from another paused deploy.
- [ ] **Google Search Console** — 0.6h · §4.1

  **Do this:**
  1. [search.google.com/search-console](https://search.google.com/search-console) → **Add property** →
     choose **Domain** (left box), not URL-prefix. Enter `subskills.xyz`.
  2. Google gives you a TXT record. Cloudflare → `subskills.xyz` → **DNS → Records → Add record**:
     Type `TXT`, Name `@`, Content = the string Google gave you. Save, then click Verify in GSC.
     A Domain property covers apex, `www`, and every subdomain in one go.
  3. GSC → **Sitemaps** → enter `sitemap.xml` → Submit.
  4. GSC → **Security & Manual actions → Manual actions**. Confirm "No issues detected".

  → *Outcome:* the only source of impressions, indexing coverage, query data and penalty signals.
  Data starts within days; a useful picture in ~1 week. Value compounds with waiting, so today beats
  next month. This is also what the P4 kill criterion is measured against.

- [ ] **Cloudflare Web Analytics** — 0.2h · §4.1

  **Do this:** Cloudflare dashboard → **Analytics & Logs → Web Analytics** → **Add a site** →
  `subskills.xyz` → choose **Automatic setup** (works because the domain is already proxied through
  Cloudflare — orange cloud). No code change, no npm package, no `<script>` tag to deploy.

  **Verify:** load the site, then check the Web Analytics dashboard for a pageview within ~a minute.

  → *Outcome:* ends the zero-measurement state that makes every other item on this list unevaluable.
  Gives pageviews, path, country, device and **referrer host** — so you can finally see whether a
  Reddit post or a creator link sent anyone. Free, cookieless, no consent banner needed, and it is
  server-side enough to survive ad blockers that would eat a Plausible or GA tag.
  ⚠️ Known limit: it does **not** log query strings, so it cannot show `?utm_source=chatgpt.com`.
  That's acceptable for now; revisit only if AI-referral attribution becomes the deciding question.
- [ ] **Fix the catch-all: unmatched URLs must 404** — `M111` · 2h · §3.1
  → *Outcome:* closes an unbounded duplicate-content surface. Right now `/wp-admin` and `/ads.txt`
  return 200 with the full Badminton page, on a 10-week-old domain in a category Google demotes.
- [ ] **Narrow `Disallow: /*?` to the filter params only** — `MI43` · 0.25h · §3.4
  → *Outcome:* every future inbound link carrying `?fbclid=`/`?ref=`/`?utm_*` becomes crawlable and
  consolidates to the clean URL. Permanent benefit to every channel; do it before earning any links.
- [ ] **Store copy: `No tracking` → `No third-party trackers`** — `M113` · 0.25h · §4.3
  → *Outcome:* permanently unblocks in-app analytics (goal #3) at zero cost. Free today; awkward later,
  when it would ship in the same update that adds the analytics.
- [ ] **Delete `VideoObject`, `educationalLevel`, `SearchAction`; fix the rendered date** — `MI44`, `M70`, `M71` · 1h · §3.5
  → *Outcome:* stops publishing invalid schema.org vocabulary and a wrong upload date. Deleting beats
  repairing — we can't win video rich results for videos we don't host, so it's all downside.
- [ ] **Check the Play account type** — 0.2h · §3.2

  **Do this:** Play Console → **Settings → Developer account → Account details** → look at
  **Account type**: *Personal* or *Organization*.

  → *Outcome:* if Personal (near-certain — account approved 2026-08-13), the 12-tester/14-day closed
  test applies and you plan around it. **Do not re-create the account as an Organization**: Google's
  own page never states that orgs are exempt, and converting needs a registered legal entity plus a
  D-U-N-S number — weeks of paperwork to dodge 14 days that can run in the background anyway.

- [ ] **30-minute incognito SERP check** — 0.5h · §7

  **Do this:** open a private window (logged out). Search these 10 and screenshot the top 10 each:
  `badminton backhand clear technique` · `how to hit a backhand clear badminton` · `padel bandeja
  tutorial` · `how to learn padel bandeja` · `surfing pop up technique` · `how to pop up faster
  surfing` · `freestyle catch phase drill` · `best free badminton tutorials` · `badminton low serve
  mistakes` · `padel drills for beginners`.

  For each, note: how many results are **YouTube itself**, how many are **small independent blogs**,
  and whether any **aggregator** ranks at all.

  → *Outcome:* this **gates the 20-hour content pilot in P3**. The recommendation to write prose for
  every sub-skill rests on a competitor analysis I could not reproduce — two of the three pages it
  measured return 404. If YouTube owns all ten SERPs, writing 149 pages of technique prose is the
  wrong bet and those hours belong in ASO instead. Half an hour now decides how 20 hours get spent.

### P1 — before the first submission · ~14h

- [ ] **Recruit 15–20 testers and start the closed-test clock** — 3h + 14 days · checklist §*The 12-tester / 14-day gate*
  → *Outcome:* unblocks Play production. Start it **first** — it runs in the background. Not 12; the
  clock resets if you drop below 12 opted-in. New builds mid-test do **not** reset it.
- [ ] **`expo-web-browser` instead of `Linking.openURL`** — `M112` · 2h · §3.3
  → *Outcome:* removes the strongest 4.2.2 rejection signal and stops session length collapsing to
  seconds. Fold into the closed-test build with `M109` and `MI48` — it's a native change needing a new EAS build.
- [ ] **In-app review prompt after the 3rd watched tutorial** — `MI48` · 2h · §8
  → *Outcome:* 5–15 ratings in 90 days. Enough to not look abandoned, which is the actual bar.
- [ ] **Rewrite Play title, short + long description, screenshot captions** — 4h · §8
  → *Outcome:* the second-most-weighted ASO field, free and permanent, and it must be right *before*
  first publish. Lead with "3,800 videos scored and excluded" — the one claim no competitor can make.
- [ ] **Privacy page: add the website-analytics paragraph** — `MI45` · 0.3h · §4.1
  → *Outcome:* closes the only thing genuinely required once analytics is live. No cookie banner needed.
- [ ] **Bing Webmaster Tools (import from GSC)** — 0.2h · §4.1
  → *Outcome:* 2 minutes, free, covers Bing + Copilot. Not "the index ChatGPT reads" — that's overstated.

### P2 — weeks 2–4 · ~13h

- [ ] **Play store-listing localizations: Indonesian, Hindi, Spanish** — `MI47` · 4h · §8
  → *Outcome:* full keyword surface in the markets where badminton and padel are mass sports and the
  audience is Android. Higher expected value than any Apple-side work, and needs no Apple account.
- [ ] **Weekly numbers pushed to Telegram** — `M106`/`M107` · 2h · §4.4
  → *Outcome:* the thing that makes any of this still be true in November. A Monday ritual across eight
  browser tabs has about a three-week half-life; four numbers in one message does not.
- [ ] **Two SQL views: coach-vs-human agreement, signups/day** — `MI49` · 0.75h · §4
  → *Outcome:* insight from data already collected, zero new collection. The agreement view is the QA
  loop on the publish gate — the claim the entire product rests on.
- [ ] **Start building Reddit account age and karma — genuine comments only, zero links** — 2h/wk · §5.1
  → *Outcome:* a clock, like the closed test. Most sport subs gate on 30–90 days age plus comment karma,
  so starting now is what makes a post possible in week 6. Never buy an account — §5.1.
- [ ] **Author identity: real name, bio, photo, `Person` schema** — 3h · §7
  → *Outcome:* there is currently no author entity anywhere on the site. Direct E-E-A-T signal, and it
  is the cheapest thing that separates this from a scraped aggregator.

### P3 — weeks 5–8 · ~30h

- [ ] **Play custom store listings for badminton + padel only** — `MI46` · 4h · §8
  → *Outcome:* the only ASO mechanism that works at zero installs, and Play allows a per-listing app
  name and icon. Gate the other 11 sports on these two converting.
- [ ] **Reddit: badminton data post, then padel two weeks later** — §5.2, §5.4
  → *Outcome:* the highest-ceiling free channel. Post findings in full as text, link only in a comment
  or on request, disclose you built it. One removal poisons the sub, so sequence it after P2's karma work.
- [ ] **Content pilot: 15–20 pages, ~900 words, in the 1–2 sports you personally play** — 20h · §7
  → *Outcome:* tests the "thin pages" hypothesis for a fifth of the cost of the full 149. Expand only
  if this and the P0 SERP check both hold. Do **not** write for sports you can't verify — wrong
  technique instruction is worse than no prose.
- [ ] **Tier-1 creator outreach, badminton first, ~25/day** — 8h · §6
  → *Outcome:* 3–6 real backlinks and 15–40 unlinked brand mentions from ~150 emails. Requires a
  postal address and SPF/DKIM/DMARC first (§6.4) or it lands in spam and damages the sending domain.

### P4 — only after the apps are actually live

- [ ] **Product Hunt, once, with both store links on the page** — 4h · §2.1
  → *Outcome:* realistically <500 visitors and <20 signups given the audience mismatch. Do it for the
  permanent listing, which AI assistants scrape — not for launch-day traffic. Links are nofollow.
- [ ] **Read ASC App Analytics + Play acquisition. Write no attribution code.** — 0h · §4
  → *Outcome:* impressions → page views → conversion, free, no SDK, no declaration change. Do this
  before building anything custom (`M109`, `/get/[platform]`).
- [ ] **Mid-November: apply the kill criterion** — §4.6
  → *Outcome:* if GSC shows <200 impressions/month by then, stop writing content and move the hours to
  ASO. Without a checkpoint this becomes a year of writing into a void.

### Not doing, and why — §9

Commission-paid link builder · buying a Reddit account · Apple Developer Program for now · IndexNow ·
llms.txt · Wikipedia links · Wikidata · Pinterest · YouTube Shorts channel · Stack Exchange · Quora ·
directory blasts · any analytics SDK in the mobile app · paid installs.

**Totals: ~63 hours over 8 weeks, $0–150.** The nine P0 items are ~6 hours, cost nothing, and are
worth more than everything below them combined.

---

## 1. Where things actually stand

✅ **Verified 2026-08-14:**

| Fact | Value | Source |
|---|---|---|
| Domain age | Registered **2026-06-08** — 10 weeks old | WHOIS |
| Indexable pages | **165** (sitemap, apex-only) | `curl sitemap.xml` |
| Published catalogue | 3,627 relations / **3,104 distinct videos** | hosted DB |
| Distinct YouTube channels | **195** (189 resolved) | DB + yt-dlp |
| Stored transcripts | **7,775 / 58 MB**, covering 3,037 of 3,104 published links (98%) | DB |
| Original text per skill page | **293 words total**, incl. nav and footer | live page |
| Analytics | **None.** No package in web or mobile, no UTM handling | repo grep |
| Brand search presence | **Zero.** `subskills.xyz` returns dictionary results | WebSearch |
| Crawler access | ClaudeBot, GPTBot, PerplexityBot, OAI-SearchBot, ChatGPT-User, Googlebot, bingbot → all **200** | curl |
| Apps | **Neither store.** Play app not created; Apple Developer Program not joined | checklist |

Two things follow from the domain age that reorder everything below: nothing content-heavy will
rank this quarter, and the free technical + store channels beat anything requiring months of
authority accrual.

---

## 2. Verdict on the original plan

### 2.1 Product Hunt — do it, after the apps ship

Realistic distribution ⚠️: top 3 → 5–15k visitors; top 10 → 1–3k; **outside top 10 → under 500
visitors and fewer than 20 signups.** PH's audience is founders and SaaS buyers, not badminton
players, so expect the low end.

✅ **PH outbound links are nofollow** — there is no domain authority to be had. The two defensible
reasons to launch are the one-day traffic spike and the permanent listing as an LLM-citation
surface (PH is among the platforms AI assistants scrape for recommendations).

**Sequencing matters more than execution.** You get one first launch. Spending it with no App
Store or Play link on the page wastes the half that produces installs. Original plan already had
this right — launch after the apps are live.

### 2.2 The commission-paid link builder — don't

The refined verification protocol ("spreadsheet of every placement, re-check periodically, subtract
from next payment if removed") is **sound for what it measures.** Link survival genuinely is
verifiable that way. The objection is not that it can't be checked.

Five reasons it still fails, in order of severity:

**(a) The measurable criterion and the valuable criterion are different criteria.**
The contract pays for links that *survive* **and** *generate traffic*. Survival is checkable.
Traffic is not — there is no analytics, no UTMs. And they don't correlate: a link on a dead forum
survives forever and sends nothing (full commission, zero value), while ✅ Reddit and essentially
every forum mark outbound links `nofollow`/`ugc`, so a surviving link there passes no ranking
signal either. **Fixable** — put analytics on first and both halves become enforceable.

**(b) Silent filtering defeats the spreadsheet check.** ⚠️ The documented failure mode of purchased
or low-trust Reddit accounts is that *"posts disappear without a removal reason and the operator
never realizes the account is compromised until a launch fails."* A contractor screenshots a live
post; the post is invisible to everyone else. Any survival check must be run logged-out, from a
different IP, and must gate on page *content* rather than HTTP status — Cloudflare-fronted forums
routinely return HTTP 200 interstitials that a naive checker reads as either success or false
deletion.

**(c) The pricing model selects for the supplier you don't want.** Competent link builders charge
$100–500/link or retainers ⚠️. Nobody good accepts pay-per-surviving-link. The people who do run
blog comments, forum profiles and directory blasts — precisely what Google's October 2025 spam
update targeted. This is adverse selection, structural, not a matter of finding the right freelancer.

**(d) The Reddit downside is asymmetric and hard to reverse.** ⚠️ Domain bans operate at two
independent levels: per-subreddit AutoModerator domain filters, and Reddit's sitewide spam system.
The sitewide system flags on *"the same URL posted rapidly across many subreddits, links from new
or low-reputation domains"* — which is the exact signature of your plan (10-week-old domain +
contractor posting across subs). Reversal for a sitewide ban runs through admin appeals and is
*"slower and less certain."* The cost of being wrong is not $200; it's permanent loss of your
best-matched channel.

**(e) Paying for undisclosed recommendations is an FTC problem, and the compliant version breaks
the economics.** Paying per placement plus a traffic bonus creates a "material connection" under
the FTC Endorsement Guides (16 CFR Part 255); the **advertiser** carries liability, and hiring
offshore doesn't transfer it. Penalties run to ~$53,088 per knowing violation ⚠️. Reddit's own
Content Policy independently prohibits undisclosed paid posting. So: undisclosed violates both;
disclosed ("Disclosure: I'm paid by Subskills") gets removed as promotion and won't be upvoted.
**There is no compliant configuration in which the plan works as designed.** Not legal advice —
and note FTC reach is US-directed marketing, so weigh by target market.

**If you run it anyway:** analytics and per-placement attribution first; contractually exclude
Reddit, blog comments and anything with "SEO" in the domain; restrict to sport-specific forums and
resource pages; one named account with real history and disclosed affiliation; $50–100 trial for
5 placements; stop if the first 5 are junk. Skip the "what's the difference between a deleted and
a removed post" screening question — shadowban mechanics are a professional spammer's core
competency and a real badminton player's blind spot, so it filters *in* exactly the wrong hire.

**Better use of the same $200–300:** one niche sport-newsletter classified placement (~$150,
produces a followed editorial link plus a matched audience), or Reddit ads at $25/day × 6 days
(~75–200 clicks ⚠️, zero policy risk). Note $10/day is below the level at which Reddit's optimizer
functions ⚠️.

---

## 3. Fix now — blocking or free, ~6 hours total

### 3.1 🔴 Every unmatched URL returns 200 with the Badminton page

```
/llms.txt  /ads.txt  /wp-admin  /this-path-does-not-exist-12345   → 200, full Badminton page
/badminton/no-such-skill-xyz                                       → 404 (correct)
```

**Root cause:** [`lib/data.ts:113`](../apps/web/lib/data.ts) ends `getCatalog` with
`category: category ?? badmintonCategory` (line 98 does the same for skills). `getCatalog` can
therefore never return a missing category, so the `if (!category) notFound()` guard at
[`app/[category]/page.tsx:82`](../apps/web/app/[category]/page.tsx) can never fire. The bogus path
renders the complete real page and gets edge-cached 24h.

**Why it matters:** unbounded duplicate-content surface on a site already in a category Google
demotes, plus a cost risk — ClaudeBot previously burned 370K requests and 22.5 CPU-hours here, and
every bot probing `/.env`, `/wp-login.php`, `/ads.txt` now gets 200 + ~850KB.

**Fix:** remove the fallback so unknown slugs 404. Ship `X-Robots-Tag: noindex` on unmatched paths
as a same-day stopgap. **~2h.**

### 3.2 🟠 Play checklist points at the wrong test track — launch-blocking

[`docs/mobile-store-submission-checklist.md:102`](mobile-store-submission-checklist.md) says
*"Upload the AAB to **Internal testing**"*, repeated at lines 265 and 281. ✅ Google's own doc:
*"You **must** run a closed test before you can apply to publish your app to production"* —
**12 testers, opted in 14 continuous days**, and **internal testing does not count.**

Applies to *personal* accounts created after 2023-11-13. Yours was approved 2026-08-13. Following
the checklist as written costs two weeks and ends in rejection.

- **Check account type first.** ✅ Organization accounts are exempt. A D-U-N-S-verified org account
  deletes the gate entirely (D-U-N-S is free, up to ~30 days). Worth 30 minutes before spending
  three weeks on the tester path.
- **Don't recruit testers from r/badminton.** A zero-karma account posting a tester link burns the
  single best community you have, and §5 needs it. Use tester-swap communities, your club, or a
  $30–80 paid tester service.
- The engagement questionnaire is a **reviewer-judgement question, not an automated threshold** ✅ —
  every source claiming a hard April 2026 gate is a commercial tester-recruitment service. But
  testers must genuinely use the app, because you have to describe their usage truthfully.

### 3.3 🟠 Every tutorial tap ejects the user out of the app

[`apps/mobile/components/ResourceCard.tsx:247`](../apps/mobile/components/ResourceCard.tsx) is
`onPress={() => Linking.openURL(resource.link.url)}`. ✅ Neither `expo-web-browser` nor
`expo-store-review` is installed.

Three problems at once: it's the classic shape for an **App Store 4.2.2 rejection** (*"not
sufficiently different from a mobile browsing experience"*), it collapses session length — now a
bigger store-ranking input than keywords — and it makes the Play engagement questionnaire hard to
answer honestly. `expo-web-browser` (SFSafariViewController / Chrome Custom Tabs) is **~1–2h.**

### 3.4 Narrow `Disallow: /*?` instead of deleting it

✅ Verified: arbitrary query strings collapse to a **single** cached render (`netlify-vary` keys only
on Next internals — `?skills=a&level=beginner` and `?utm_source=reddit` return the same cached
entry), and the canonical on a `?utm_` URL already points to the clean path. So the original
12M-permutation trap is closed by the *caching*, not by robots.txt.

But the blanket disallow means Google cannot crawl any inbound link carrying `?fbclid=`, `?ref=` or
`?utm_*` — and platforms append those outside your control. That's a standing tax on all future
distribution.

**Fix:** disallow only the filter params (`/*?*skills=`, `/*?*level=`, `/*?*sort=`) and leave
tracking params crawlable. **~15 min.** Deleting the line outright reopens the enumeration surface;
don't.

### 3.5 Structured data — delete, don't repair

✅ Live on `/badminton/backhand-clear`:

```
educationalLevel → "https://schema.org/Beginner", "https://schema.org/Intermediate"   ← not real terms
uploadDate       → 3 distinct batch timestamps = DB insert times, not YouTube upload dates
isPartOf         → bare string (should be an object)
@types           → ItemList, ListItem, VideoObject, BreadcrumbList   (no Person, no author)
```

✅ Google's structured-data policy: a manual action *"means that a page loses eligibility for
appearance as a rich result; it doesn't affect how the page ranks in Google web search."* You
cannot win video rich results for videos you don't host, so the only exposure is downside.
**Delete the `VideoObject` block (1h) rather than fix it (4h).** Also drop the inert `SearchAction`
(tasks.md M71) and the invalid `educationalLevel`. The page also *renders* `18.05.2026` to users as
if it were the video's date — fix that separately (tasks.md M70).

### 3.6 Don't pull the Cloudflare AI-block lever

✅ Cloudflare's own post: *"For all new domains onboarding to Cloudflare, the categories of Training
and Agent will be blocked by default on the pages that display ads, while Search will remain
allowed by default."* subskills.xyz is already onboarded, shows no ads, and Search stays allowed —
**the 15 Sept 2026 default change does not apply to you.**

But the same post says: *"multi-purpose crawlers such as Googlebot, Applebot, and BingBot will be
blocked by customers who have selected to block Training."* [tasks.md M18(b)](../tasks.md)
recommends enabling that toggle for bandwidth relief. **Doing so would deindex you from Google.**
Use the M18(a) cache rule instead. Re-run the crawler check after any Cloudflare change:

```bash
for UA in ClaudeBot GPTBot PerplexityBot OAI-SearchBot ChatGPT-User Googlebot bingbot; do
  printf "%-16s " "$UA"
  curl -s -o /dev/null -w "%{http_code}\n" -A "Mozilla/5.0 (compatible; $UA/1.0)" https://subskills.xyz/
done
```

---

## 4. Measurement — and resolving the "No tracking" tension

**Do this before anything else, weeks before launch.** With zero analytics today and a Product Hunt
launch planned, instrumenting in the same week as the launch means never learning what normal was.

### 4.1 Week one — ~2 hours, $0

| # | Action | h |
|---|---|---|
| 1 | **GSC domain property** → DNS TXT at Cloudflare → submit sitemap → check Manual Actions | 0.6 |
| 2 | **Cloudflare Web Analytics** (automatic setup; already proxying, no CSP, no `no-transform` ✅) | 0.2 |
| 3 | **Bing Webmaster Tools** via GSC import — 2 min | 0.2 |
| 4 | **Store copy wording change** (§4.3) | 0.25 |
| 5 | **Privacy page:** add a website-analytics paragraph — currently says nothing about the site | 0.3 |

GSC is the only source of impressions, indexation coverage and manual actions, and the only one
whose value compounds with waiting. Cloudflare Web Analytics is cookieless, needs **no cookie
banner**, and survives default uBlock Origin — where a third-party script would not.

Caveat ✅: **Cloudflare Web Analytics does not log query strings**, so it cannot see
`?utm_source=chatgpt.com` — the ChatGPT citation signal. If per-placement attribution matters
later, either use distinct landing paths instead of UTMs (recommended — no robots conflict) or add
Umami with a first-party-proxied script.

### 4.2 In-app stats are achievable — first-party logging is not "tracking"

✅ Apple's definition, verbatim:

> "Tracking refers to the act of linking user or device data collected from your app with user or
> device data collected from other companies' apps, websites, or offline properties for targeted
> advertising or advertising measurement purposes. Tracking also refers to sharing user or device
> data with data brokers."

Every example Apple gives involves a third party. Logging "user opened skill page X" to your own
Supabase is **not tracking**. Two things not to get wrong:

- **Do not show an ATT prompt.** Prompting for permission you don't need is itself a review problem.
- **"Tracking" ≠ "collection."** It is not tracking, but it *is* collection and must be declared.

✅ **Neither store form covers your website** — Apple's and Play's declarations scope to the app and
third-party code within it. Adding web analytics requires **zero** change to the Data Safety form
or the privacy labels.

And you already declare `App activity → App interactions` (saves/watched/votes), so the marginal
cost of first-party product analytics is **one extra purpose checkbox plus one Apple label row.**
Declare `Shared = No` — Supabase is a processor. Also update `PrivacyInfo.xcprivacy`, not just the
web form.

### 4.3 The wording change — ship it with the launch build, not later

- Current: `No ads. No tracking. Everything is free to watch.`
- **Replace with: `No ads. No third-party trackers. Nothing about you is sold or shared. Everything is free to watch.`**

`No third-party trackers` is precise and verifiable. `No tracking` is a vibe that constrains you
forever. Your privacy policy already says the accurate version (*"does not include third-party
advertising SDKs or cross-app tracking"*) — make the listing match the policy, not the reverse.
Changing it later, in the same update that adds analytics, looks far worse than doing it now for free.

### 4.4 Push the numbers to yourself

Week one is otherwise 5 dashboards + Supabase + 2 store consoles. A Monday ritual across eight
tabs has a ~three-week half-life. Reuse the existing nightly cron and
[`docs/telegram-ops-bot-plan.md`](telegram-ops-bot-plan.md) to push four numbers in one message.
**~2h, and it's what makes any of the above still true in November.**

### 4.5 The only measure of the actual goal

A **manual prompt panel**: 15–20 buyer-intent prompts ("best free videos to learn a badminton
backhand clear", "how do I learn the padel bandeja"), run in ChatGPT / Perplexity / Google AI Mode
once a month, recording Y/N for whether subskills.xyz appears. Same prompts, same day. 30 min/month,
$0. It's the only method that catches citations nobody clicked — which is most of them.

Server-side proxy, cheaper: watch the **user-agent mix, not volume.** A `ChatGPT-User` or
`Claude-User` hit on a specific path means a human asked a question and the assistant went and read
that page. `GPTBot`/`ClaudeBot` volume tells you nothing.

### 4.6 Kill criterion

Set one now: **if GSC shows fewer than ~200 impressions/month by mid-November 2026, stop investing
in content and move the hours to store channels.** Every recommendation here is otherwise a 6–12
month bet with no checkpoint.

---

## 5. Reddit — answering the two questions directly

### 5.1 "How do I post with no karma? Do I need to pay someone with an account?"

**No — and paying someone is the worst available option.**

⚠️ Buying, selling or transferring accounts directly violates Reddit's User Agreement: *"You may
not sell, transfer, or license your account or any account credentials to another person without
Reddit's approval."* Detection triggers on IP/device/behaviour shifts; a farmed account logged in
from a new region has its trust score reset and is flagged. The characteristic failure is **silent**
— posts vanish with no removal notice, and you only discover it when the launch flops. And the
downside lands on your **domain**, not the account (§2.2d).

**Build your own instead.** ⚠️ Typical thresholds: hobby/niche subs 0–50 comment karma + ~7-day
account; mid-size 50–200 + 30 days; large/strict 200–2,000 + 30–90 days. Comment karma is weighted
far more heavily than post karma, because it proves engagement rather than link-drop upvotes.

For your sports that means **~3–4 weeks of genuine commenting gets you posting rights in most of
them** — badminton, padel, surfing, swimming subs are small and not strict. That's the whole cost.
There is no shortcut worth its risk, and the honest version is cheap.

Find each sub's actual requirement by reading its rules/wiki, or by posting and reading the
AutoModerator reply, which usually states the threshold explicitly.

### 5.2 "How do I make it not look self-promoting?"

Stop making the product the subject. **Make the data the subject.**

You have something no one else in these communities has: LLM-coach relevance and teaching-quality
scores on ~6,000 sport tutorials, of which ~3,800 failed the bar, plus 58 MB of transcripts. That
is a finding, and findings get upvoted. "I built a site" does not.

The mechanics that keep it clean:

- **Post the findings in full as a text post.** ⚠️ Text posts with links in the body get far less
  spam-filter scrutiny than link submissions; a post with no link at all gets none. Put the link in
  a comment, or only when asked. Never cross-post the same content to 10+ subs — that alone trips
  the sitewide filter within minutes.
- **Disclose that you built it.** You are the founder posting about your own free product: that's a
  material connection. It also *helps* — ⚠️ communities reward honesty about where a project is,
  and the disclosure is what separates you from the contractor in §2.2.
- **Observe 90/10.** Mods click your username and scan recent activity. If it's all promotion,
  everything future is flagged regardless of quality.
- **Don't post-and-ghost.** Answer every reply. Post-and-ghost is itself a removal trigger.
- **One sport at a time.** Badminton is your deepest catalogue and the sport with essentially one
  English-language hub. Winning badminton completely beats spreading thin across 13 sports.
- **Once per sub per month, max**, and only with a real update.

### 5.3 What a Reddit link is actually worth

✅ nofollow — no ranking equity, ever. The value is elsewhere and it's real: ⚠️ Google's reported
~$60M/yr licensing deal means Reddit content is indexed more aggressively than any other UGC
platform and feeds AI training and retrieval, so **a well-received thread can influence Google AI
Overviews, Perplexity and ChatGPT answers at once.** Treat Reddit as an **AI-citation and
branded-search surface**, not a link source.

Be sceptical of the circulating citation-share statistics — the "Reddit is 40% of LLM citations"
figure is a June 2025 pooled number dominated by Perplexity (ChatGPT was 11.3%), and a May 2026
tracker puts YouTube #1 at 26% with Reddit #2 at 17% ⚠️. Directionally Reddit matters; no exact
percentage is trustworthy.

**Strategic note nobody made:** YouTube is consistently the #1 or #2 most-cited domain in LLM
answers, and you are a curated, quality-scored index *of YouTube*. Being the entity that structures
and rates YouTube sport tutorials is itself an LLM-visibility asset. Nothing in the current plan
exploits that.

### 5.4 Eight-week sequence

| Week | Action | h/wk |
|---|---|---|
| 1–3 | Comment genuinely in r/badminton and r/padel. Answer technique questions from what you've learned reading 3,000 tutorials. **No links, no mentions.** Build comment karma | 2 |
| 4 | Read both subs' rules and wikis. Message mods of r/badminton: describe the data post, ask whether it's welcome and in what form | 1 |
| 5 | Post the badminton data finding as a **text post, full findings, no link.** Disclose you built it. Answer every comment for 48h | 3 |
| 6–7 | Stay active. If week 5 went well, repeat for padel — different framing, not a copy-paste | 2 |
| 8 | Only now, and only if invited: the product itself, in whichever sub's rules permit it | 1 |

**~15 hours over 8 weeks.** Expect 30–120 installs per genuinely well-received post ⚠️, plus
durable AI-citation surface. Non-repeatable — you get one first impression per community.

---

## 6. Creators — the real list and the real ask

### 6.1 Yes, you have small creators — but they're the tail

✅ Resolved subscriber counts for all 195 channels behind published links (189 resolved):

| Subscribers | Channels | Published videos | % of catalogue |
|---|---|---|---|
| under 10k | 34 | 49 | 1.8% |
| 10k–50k | 33 | 59 | 2.2% |
| 50k–200k | 41 | 366 | 13.5% |
| 200k–1M | 42 | 1,228 | 45.2% |
| 1M+ | 39 | 1,016 | 37.4% |

**82% of the catalogue comes from channels with 200k+ subscribers** — 2MinuteTennis (242k, 194
videos), 7mlc (2.02M, 115), Essential Tennis (334k, 98), expertboxing (269k, 94), Badminton Insight
(719k, 88), Jeremy Ethier (7.87M, 76), GCN (3.62M, 74). Those won't answer cold email.

**Tier 1 = under 200k subs with 3+ videos in the catalogue — 23 channels.** Big enough to own a
website worth linking from, small enough to reply, enough presence that the compliment is real:

```
SWIMVICE (97k, 86 videos) · How to Rip (142k, 52) · Surf Simply (63.5k, 37)
EverythingPadel (122k, 30) · Basicfeather (76k, 25) · PILATESOLOGY (78.1k, 24)
Stronger By Science (96.7k, 16) · SoheeFit (198k, 14) · Girls Gone Strong (11)
Hello Padel (63.3k, 9) · Alto Padel (44.7k, 9) · Swim Smooth (58.9k, 8)
Glenn Holmes Boxing (58.8k, 8) · Tony Marchand (39.8k, 8) · Colossus Fitness (182k, 7)
MyBoxingCoach (199k, 6) · Core Exercise Solutions (46.7k, 5) · Badminton Coach Kennie (141k, 4)
Floris Gierman (125k, 4) · DIY Mountain Bike (16.9k, 4) · Otro Nivel Padel (77.4k, 3)
The Badminton Zone (57.1k, 3) · Modu Badminton (2.83k, 3)
```

SWIMVICE is the standout: 86 videos through your quality gate, under 100k subs. That's a
conversation, not a pitch.

### 6.2 What they can actually do — the ask ladder

✅ Measured, not assumed:

- **YouTube description links are not links.** The description is injected client-side; there is no
  `<a>` element in the served HTML. Pure referral traffic, zero SEO value — but referral traffic is
  the *highest* of any ask.
- **Channel links** are wrapped as `youtube.com/redirect?…&redir_token=…` behind an expiring token.
  Zero equity, not stably crawlable.
- **Linktree is `noindex, nofollow`.** Worth literally nothing. Never ask.
- **7 of 10 sampled sport creators have their own website.** That is the only place a followable
  backlink exists.

**The operational rule:**

> Has a website → ask for a link from their site. Fallback: pinned comment.
> No website → ask for a description link (traffic, not SEO). Fallback: community-tab post.
> **One ask per email. One easier fallback in the last line. Never two asks.**

Never ask for: a video mention (<2% and it only happens spontaneously), or "become a curator"
(asks for work before trust exists).

### 6.3 Expected return, honestly

⚠️ Cold-email reply rates have fallen to ~3.4% average in 2026; >5% is good. The often-cited 17.55%
Ahrefs campaign was **Ahrefs emailing people** — a brand everyone knows — and inherits that bias.
Your personalisation is unusually strong (you can name their exact video and sub-skill), so 9–12%
is defensible for a hand-picked list.

For ~100 hand-picked emails with 3 touches: **~12 replies → ~5 real actions → 3–6 backlinks**, plus
1–3 description links and 15–40 unlinked brand mentions. The mentions may matter more than the
links for LLM discovery.

**Follow-ups are the dominant lever** ✅: one follow-up = **+65.8%** replies (Backlinko, 12M emails).
Not "doubles" — that figure is often misquoted. Budget 3 touches: day 0, +4, +11. Subject lines of
**36–50 characters** beat short ones by 32.7%.

### 6.4 Compliance, before sending anything

- **A valid physical postal address is legally required** in the footer under CAN-SPAM. "City,
  Country" is not an address — use a mailbox, not your home.
- **Configure SPF/DKIM/DMARC first**, or mail lands in spam *and* damages the domain reputation your
  transactional app mail depends on.
- **Pace at ~20–40/day** from a warmed domain. 100 emails is ~1 week of calendar time, not an evening.
- **Drop Canada from the first campaign.** CASL is opt-in with penalties to CAD $1M for an
  individual; the "conspicuous publication" implied-consent path plausibly covers published
  business addresses but is a specific legal test, not a blanket. Many badminton and tennis
  creators are Canadian.
- **EU:** for individual creators the binding rule is ePrivacy Art. 13 (generally opt-in), not
  GDPR legitimate interest — that reading applies to *corporate* addresses, i.e. clubs and
  academies, not solo YouTubers.

### 6.5 Handling the downside

- **Lead with the removal offer.** "If you'd rather not be listed, reply 'remove' and it's gone the
  same day." It raises reply rates because it proves you're not extracting from them. **You must be
  able to honour it — build the removal path before you send.**
- **Never publish a named list of the ~3,800 videos that failed.** Aggregate statistics only. A
  permanently citable list of named creators judged low-quality by an unaudited LLM invites
  complaints and destroys goodwill with exactly the creators you're emailing.
- **Badge tactic:** build it as a *reason to email*, not a link play. A badge you supply must be
  nofollow to stay clear of Google's link-scheme line, and mid-size creators read badge attachments
  as an SEO scheme instantly. Don't attach one.
- ⚠️ Note the collection pipeline uses yt-dlp, not the YouTube Data API — so the binding constraint
  is YouTube's general ToS on automated access, which has **no 30-day retention cure**. Worth a
  separate look before publishing anything derived from transcripts at scale.

### 6.6 The offer, and the actual emails

**What you are offering them** — state it plainly, because it is real and it is not money:

1. **Recognition that is specific and verifiable.** Not "we love your channel" — *"your video ranked
   highest of 2,047 badminton tutorials we scored for the sub-skill 'low serve'."* Nobody else is
   telling them that, because nobody else has scored the field.
2. **Traffic to them.** The sub-skill page sends viewers to their video. You are not competing with
   them; you are a shortlist that points at them.
3. **A permanent, free listing** in a curated index, with no requirement to link back, no affiliate
   terms, and no cost.

That last clause matters: **never make the listing conditional on a link.** Requiring one is what
turns this into a link scheme under Google's own definition. Say explicitly that the listing stands
either way — it is both true and the reason the email reads as non-predatory.

**Before sending anything:** a real postal address in the footer (CAN-SPAM requires a street address,
PO box or private mailbox — "Kyiv, Ukraine" does not qualify), SPF/DKIM/DMARC configured, and pacing
of ~25/day. See §6.4.

---

#### Template A — creator with **no** website (goal: description link)

> **Subject:** `Your low serve video ranked #1 of 2,047`  *(43 chars — inside the 36–50 optimum)*

```
Hi [Name],

I run Subskills, a free site that collects the best free YouTube
tutorials for sport technique. No ads, no paywall.

I built an AI reviewer that reads the transcript of a tutorial and
scores two things: how well it matches ONE specific technique, and how
well it actually teaches. I ran it over [N] badminton videos.

Your video "[exact title]" scored highest of all of them for the
sub-skill "[sub-skill]". [M] of those [N] scored below our bar and are
not published at all.

It is live here, with your video first:
https://subskills.xyz/badminton/low-serve

I am not selling anything, and the listing stays either way. Two small
things, if you want:

1. If you ever add links under a badminton video, a link to that page
   sends your viewers a short list of drills that go with your lesson.
2. If that is too much, a pinned comment works too. Ten seconds.

And if you would rather not be listed at all, reply "remove" and I will
take it down the same day. No questions.

Thanks for making that video — [one real, specific detail].

Serhii
subskills.xyz
[postal address]
Reply "stop" and I will not email you again.
```

⚠️ **The closing detail must be real and different in every email** — a specific moment, an
explanation you actually found clearest. If you cannot write it honestly, do not send that email.
It is the single line that proves a human watched, and it is what separates this from mail-merge.

---

#### Template B — creator **with** a website (goal: link from their site)

Mid-size creators get 50+ pitches a week. Be shorter than everyone else — this is ~160 words.

> **Subject:** `SWIMVICE ranked top for catch and pull`  *(38 chars)*

```
Hi [Name],

Short version: your video "[exact title]" came out top of [N] swimming
tutorials we scored for the sub-skill "[sub-skill]". It is now the first
video here:

https://subskills.xyz/swimming/catch-and-pull

Subskills is a free, ad-free index of free YouTube sport tutorials,
broken into sub-skills. An AI reviewer reads the transcript and scores
each video for relevance and teaching quality against one technique.
[M] videos scored below the bar and never got published.

The only thing I would ask: if you keep a resources or links page on
[their-domain.com], a link to the sub-skill page would help people find
the drill order. Entirely your call, link it however you want - I have
no tracking parameters and no requirements, and the listing stays
either way.

If you would prefer not to be listed, reply "remove" and it is gone the
same day.

Serhii
subskills.xyz
[postal address]
Reply "stop" to receive nothing further.
```

**Do not attach a badge to this one.** Mid-size creators read badge attachments as an SEO scheme
instantly (§6.5).

---

#### Template C — coach or club with a website (your best backlink segment)

Different pitch entirely: they care about their members, not their ego.

> **Subject:** `Free drill index for your junior squad`  *(38 chars)*

```
Hi [Name],

I saw [club] runs a junior programme on [day].

I run Subskills - a free, ad-free index of free YouTube coaching videos,
split by technique rather than by channel. Every video is scored for how
well it teaches one specific skill before it is published; most are
rejected.

The badminton section is here, grouped beginner to advanced:
https://subskills.xyz/badminton

If it is useful to your beginners, you are welcome to link it from your
resources page or just send it round on WhatsApp. No account needed to
browse, nothing to buy.

Happy to add any technique you think is missing.

Serhii
subskills.xyz
[postal address]
```

---

#### The follow-ups — worth more than the copy

One follow-up is **+65.8% replies** (§6.3). Send at **day 0, +4, +11**. They take almost no writing:

```
+4:   Hi [Name] - just checking this reached you. Happy to take the
      listing down if you would rather not be included.

+11:  Last note from me. The page is live either way and needs nothing
      from you. If you ever want it removed, one word does it.
```

Both keep the removal offer in front of them, which is what makes three touches read as courteous
rather than persistent.

---

## 7. The content play — what makes you not-an-aggregator

Google's December 2025 core update demoted *"aggregator sites that added no additional context
beyond the source data they scraped."* You add real context — but at **293 words per page**, the
page answers *"which video should I watch"* and never answers *"how do I hit a backhand clear."*
There is nothing for an LLM to cite.

You already own the fix: **7,775 transcripts / 58 MB, covering 98% of published links.** Nine
expert coaches explaining the backhand clear, in text, in your database.

Two constraints that reshape this:

**Don't write 149 pages.** Realistically 80–110 hours at 15–20 min human editing per page — 8 to 22
months at 5–10 h/week. And nobody has expert judgment across 13 sports; unverified AI technique
instruction is a genuine user-harm risk and far harder to retract than to never publish.

**Pilot 15–20 pages, in the one or two sports you personally play.** ~20h. Two things to add per
page: a genuine technique explainer synthesised from the transcripts, and a **"which video covers
what" comparison table** encoding your coach scores — that table is unique to you and cannot be
scraped.

**Verify the premise first, in 30 minutes.** Open an incognito window, run 10 technique-intent
queries across 3 sports, screenshot the top 10. If YouTube owns those SERPs outright, this whole
section dies and the hours go to store channels instead. Do this before writing anything.

**Also free, high value:** author identity. There is currently **no `Person` or `author` schema
anywhere** on the site ✅. Real name, bio, photo, `Person` schema, `author` sitewide,
`Organization.sameAs` — 3h, direct E-E-A-T signal, and it's the cheapest credibility fix available.

---

## 8. ASO — the channel that was missing entirely

⚠️ Store search is roughly 41% of app installs and has the highest install conversion. For a niche
free app it is where installs come from — not Product Hunt.

- **Play title:** `Subskills: Sport Skill Drills` (29/30). A made-up brand name alone wastes your
  highest-weighted field when nobody searches for it.
- **Drop "Free"** — low-search-volume word occupying premium space. (Not a policy violation; Play
  prohibits *promotional* price language like "free for a limited time," not a permanent "Free" ✅.)
- **Drop head terms** `yoga`, `running`, `gym`, `fitness`. ✅ Apple ranks on text relevance **plus**
  user behaviour — ranking for a head term and converting near-zero teaches the algorithm you are
  not that app. Target `badminton training`, `padel drills`, `swim technique`.
- **Play custom store listings for badminton + padel only** — with per-listing **app name and icon**
  ("Subskills: Badminton Drills"), linked from `/badminton` and `/padel`. Play allows 50; this
  per-listing app-name change is genuinely better than anything Apple offers, and it works at zero
  installs. Build 2, measure, then decide about 11. **4h.**
- **Play localisations: Indonesian, Hindi, Spanish.** Play indexes each locale's full 30/80/4000
  semantically. These are the markets where badminton and padel are mass sports and the audience is
  Android. **4h, $0.**
- **Rewrite the 5 screenshot captions** with sport + technique vocabulary via
  `scripts/make-store-assets.py`. ✅ Apple generates LLM app tags from ASC metadata. **1h.**
- **In-app review prompt** via `expo-store-review` after a positive action (3rd tutorial watched).
  Never behind a button. **2h.**
- **Android-first.** Defer Apple's $99 until Play shows real sport-term volume. The reviewer
  demo-account problem has a free answer: ✅ App Store Connect has a **"Sign-in required" checkbox** —
  uncheck it, since browsing needs no account and save/watch/vote/suggest create a private
  anonymous account automatically. Explain that in the Review Notes. Build a password path only if
  you actually get a 2.1 rejection.
- **EU DSA trader status** is not optional: verified traders' legal name and address are shown
  publicly on the listing. For a solo founder with no company that means publishing a home address.
  Denmark, Spain and Sweden are your badminton and padel markets — decide before launch.

---

## 9. Cut, with reasons

| Cut | Why |
|---|---|
| Commission link builder | §2.2 — five independent reasons, one of them irreversible |
| Buying/renting a Reddit account | Violates the User Agreement; silent-filter failure mode; the ban taints your domain |
| Pinterest | ⚠️ Second outbound-click collapse ~1 Aug 2026, and the failure mode is precisely the click-out rate any forecast depends on; June–Aug is the seasonal trough |
| YouTube Shorts channel | 80–150h for 50–300 visits |
| 13 screen-capture videos | Justified only by a PR-firm citation statistic contradicted by independent aggregation |
| Facebook Groups as a channel | 30–45 min/day forever, zero compounding, dies the day you stop. Keep as a 6-week, 2-group **research** exercise (~12h) to learn what learners ask |
| Forums beyond BadmintonCentral | 8-week English warm-up in hostile communities for nofollow scraps; traffic stats unverified and likely stale |
| Wikipedia external links | nofollow + COI + revert risk. (Note: `WP:ELNO` #20 names *"aggregators of celebrities' personal data… which primarily exists to show ads"* — it likely doesn't apply to you. Skip anyway, because there's no equity to gain.) |
| Wikidata item | No measurable payoff at this stage |
| llms.txt | ✅ Google: *"You don't need to create new machine readable files, AI text files, or markup."* No major AI company has confirmed reading it |
| IndexNow | ✅ Google is not a participant; a 165-URL sitemap has no crawl-latency problem |
| Stack Exchange | ✅ Verified via live API: fitness SE 10,384 questions *ever*, 0.0/min. Dead |
| Quora, AI-tool directories, Lobsters, Discord/Telegram/WhatsApp | No discovery surface or wrong audience |
| Paid app install campaigns | ⚠️ $300 in India/Indonesia buys 500–1,500 installs at $0.15–0.60 CPI — and they won't retain, which poisons the ranking signal that matters. Refuse on quality, not arithmetic |
| Writing all 149 pages | §7 — 8–22 months at your capacity, and unsafe across 13 sports |

---

## 10. Sequence

**Moved to [§0 The checklist](#0-the-checklist)** at the top of this file, where it is a working
checklist with expected outcomes and `tasks.md` IDs rather than a bare ordering.

Two items in it are **clocks, not tasks** — they consume calendar time regardless of effort, so start
both as early as possible and do the other work while they run:

| Clock | Length | Starts when | Notes |
|---|---|---|---|
| Play closed test | 14 days | each tester opts in | Needs 12 continuously opted in. Shipping new builds mid-test does **not** reset it. Recruit 15–20 for buffer. |
| Reddit account age | 30–90 days | account created | Most sport subs gate on age **and** comment karma. Nothing else unblocks §5.4. |

---

## 11. The three things that matter

1. **Your differentiator is invisible where it counts.** "3,800 videos scored and excluded" is the
   number no competitor can say. It belongs in the Play short description, the first line of the
   long description, the Reddit posts and the creator emails — and it is the thing that earns links
   instead of buying them.
2. **You are trying to buy distribution and framing it as buying links.** The link is the least
   valuable part of every channel here: Reddit is nofollow, YouTube descriptions aren't links at
   all, Linktree is noindexed, Product Hunt is nofollow. What actually compounds is brand mentions,
   store search, and being the structured index of the most-cited domain in LLM answers.
3. **Measure before you spend.** Not one recommendation in this document can be evaluated today,
   because there is no analytics. Two hours fixes that, and it gates everything else.
