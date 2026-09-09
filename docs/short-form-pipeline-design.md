# Short-form content — unified pipeline design

TikTok and Instagram Reels join the YouTube pipeline instead of running beside it.
**One candidate model, one submission path, one coach rubric — acquisition is the only
platform-specific part.** Settled over testing on 2026-09-06..08; the measurements are
recorded here because most of them are expensive to rediscover.

## Why this replaces what TikTok does today

TikTok never shared the pipeline:

```
YouTube:  scoring_strategy = transcript_llm        18,644 links · 24,016 transcripts
TikTok:   scoring_strategy = engagement_authority     141 links ·      0 transcripts
```

It has its own submission function (`postTikTokSuggestion`), its own rubric
(`scoreTikTokCandidate` — likes/comments/shares plus creator authority), its own verdict
shape, and no transcript. That was not a design preference. **It was a workaround for not
being able to get transcripts.** We can now, so the workaround goes.

`engagement_authority` is retired as a *rubric*. It is not replaced by a local gate either —
see "No pre-download gate" below.

## The pipeline

```
discover ──► filter ──► fetch video ──► whisper ──► submit ──► coach ──► publish
   │           │            │              │           │
   │           │            │              │           └─ existing submit-suggestion,
   │           │            │              │              transcript in evidence_json,
   │           │            │              │              exactly like YouTube
   │           │            │              └─ large-v3-turbo, local, ~10x real-time
   │           │            └─ instaloader (IG) / yt-dlp -f download (TikTok)
   │           └─ reject doorway pages, keep /@handle/video/<id> and /reel/<code>
   └─ ONE search query per sub-skill, both platforms
```

Everything after `submit` is unchanged. That is the point.

### Discovery — search engine, not platform APIs

One query per sub-skill, both domains at once:

```
<category> <skill name> technique (site:tiktok.com OR site:instagram.com)
```

The category prefix is not optional. Without it "heel hook" returns BJJ leg locks beside
climbing, "chipping" returns a Wikipedia page about climbing, and "tubeless tyre" returns
Royal Enfield motorcycles. `run-collection.mjs` already prefixes category on open search
(`${category}${skill.name}`); the same rule applies here.

**Why not browse the platforms directly.** Instagram closed anonymous enumeration: a single
anonymous request to `web_profile_info` — the first one, to Instagram's own account —
returns 401. Browser-based enumeration works inconsistently and degrades: Nike's reels page
handed over URLs, and twenty requests later every account including our own trusted coaches
returned a login wall. TikTok tolerates browsing but the CDP search is the component that
produced the blank-render bug, so search removes a fragility rather than working around it.

**Why one query and not two.** The `OR` filter works, but the engine still returns ~10
results and the split between platforms is decided by its ranking, not by us — one
badminton test came back 8 TikTok : 1 Instagram. Two queries would return more. We do not
want more; see the goal below.

**Budget.** 492 skills = 492 queries per pass. Brave Search API's free tier (2,000/month)
covers four passes, so weekly is comfortable. Free key-less scraping is not an option:
DuckDuckGo returns HTTP 202 with anti-bot markers, public SearxNG instances captcha or 429,
and Mojeek permits scraping but its independent index returned 2 results and no Instagram.

### Filter — doorway pages are the dominant noise

Both platforms generate SEO landing pages that are not posts:

```
instagram.com/popular/<slug>     tiktok.com/discover/<slug>
```

They took BJJ from a plausible query to **zero** usable results (8 of 10) and dominated the
weak TikTok queries (6 of 7 for shin splints). Accept only `/@handle/video/<id>` and
`/reel/<code>`; drop everything else, including profile links and Wikipedia. No retries —
"easily discoverable" is the specification.

### No pre-download gate

Considered and rejected. A gate would filter candidates before spending a 7–28MB download,
and TikTok search results do carry full captions inline, so it is buildable there. Instagram
cannot support it: **the meta tags contain no caption** (see below), so the only gate input
would be the search-result title.

The reason to skip it is better than the reason to build it. **A reel that ranks for
"muay thai teep technique" has already been filtered for relevance and engagement by a
system with far more signal than we have.** Re-filtering on a title string adds noise to a
decision already made upstream. Combined with the goal — a handful of clips per skill, not a
maximal harvest — downloading 3–5 candidates unfiltered is cheaper than the machinery to
avoid it.

### Transcription — local whisper

`whisper.cpp` with **`ggml-large-v3-turbo`**, not `base.en`. Counterintuitively turbo is both
faster and more accurate on an M3: 14.7s vs 30.4s on the same 143s clip, and it hears
"surfskate" where base.en gives "surfkit". The shallower decoder benefits more from Metal.

Roughly **10x real-time**. The full existing TikTok backlog — 141 clips, 1.36 hours — is
about eight minutes of one-off compute, free.

Run it out-of-band, not inline in the nightly candidate loop.
`scripts/fetch-missing-transcripts.mjs` already establishes the pattern for YouTube:
"selects active YouTube links that do not have a `link_transcripts` row, scrapes via the
same browser/CDP fetcher used by collection, and upserts idempotently." Generalise the
selector to *any* link missing a transcript and branch on platform for acquisition.
Share-in, TikTok and Reels then all inherit it with no new mechanism, and with the same
latency already accepted for YouTube.

### Quality gate — after transcription, not before

Measured yield: **Instagram 6/6 usable, TikTok ~2/3.** TikTok's failures are music-over-
demonstration, and one of them is dangerous rather than obviously broken:

```
usable clips        13-20 chars/sec
yoga (marginal)      9.5
surf (SONG LYRICS)   5.7   "¿qué será? …canta el poeta"
badminton (music)    0.8   "*Dramatic music*"
```

The lyrics case produced 241 characters of fluent Spanish that would be stored as a
transcript and fed to the coach and the summary routine as technique instruction. A
chars/sec floor around 8–10 separates them cleanly; whisper's language detection catches the
Spanish independently.

A clip that fails the gate is not discarded — it stores no transcript and degrades to the
existing `metadata_fallback` scoring mode, which already applies a reduced relevance
threshold for caption-less YouTube videos. No new handling needed.

## Share-in must converge too — it has the same workaround

A shared link does NOT currently reach the coach unless it is YouTube.
`submit-suggestion` routes by platform:

```ts
function reviewLaneForSource(source: HumanLinkSource): ReviewLane {
  return source === "youtube" ? "coach" : "founder";
}
```

`founder` is the human review queue, and `0057`'s coach queue filters
`coalesce(lsr.review_lane, 'coach') = 'coach'`, so short-form shares are invisible to the
coach by design. That is correct today — they could not be transcribed, so there was nothing
for the coach to judge and a human was the only option. It is the third instance of the same
workaround, after `engagement_authority` and the missing transcript branch.

It collapses to `return "coach";` once transcription exists. A shared reel then follows the
identical path to a shared YouTube link: link row created, gap-filler sees no transcript,
fetches and transcribes by platform, coach scores on content, publish gate decides.

**Order matters.** Do not flip the lane before transcription works. A shared reel reaching
the coach with no transcript gets scored on its title alone — reintroducing the exact
metadata-scoring problem this design removes, through the share-in door. Land them together,
or flip the lane second.

**Also on the path:** `apply-suggestion` hardcodes `source: "youtube"` when it upserts
`link_transcripts`, and derives `video_id` with `youtubeVideoIdFromUrl`. A TikTok or
Instagram transcript would be stored mislabelled with a null video id. The column already
supports other sources; only the writer assumes YouTube.

## Operational findings — the expensive ones

**Instagram serves metadata only to a bot user agent.** This single fact produced two
contradictory commits (`c53c0ae` "provably dead", `4f2a26b` "scraping works"). On the same
live reel, at the same minute:

```
Chrome UA                      620 KB ·  7 meta tags · <title>Instagram</title>
Subskills/1.0 (+subskills.xyz) 930 KB · 31 meta tags · og:image, og:url, twitter:title
```

Instagram serves og: metadata to identifiable crawlers and the JS shell to browsers. Any
test using a browser UA will conclude scraping is dead. It is not.

**But there is no caption in those tags.** `4f2a26b` records "og:title with the full
caption"; on three live reels there is no `og:title` at all. What exists is
`twitter:title`, and it is a template — `"Effortless Swimming (@effortlessswimming) •
Instagram reel"`. Useful for creator identity, useless as caption text.

**A dead reel returns 200 with the app shell**, whose `<title>` is the brand. That is what
`usableTitle()` in `_shared/link-enrichment.ts` rejects. It is also why a bogus reel id
looks identical to a real one — the test that produced the "provably dead" conclusion was
comparing two unavailable pages.

**TikTok's h265 formats lie about carrying audio.** Every `bytevc1_*` row in the format
table advertises `aac`; ffprobe on the delivered file finds one hevc video stream and no
audio at all. Reproduced on three videos. `-f b[acodec!=none]` therefore does not do what it
says — the requirement is evaluated against TikTok's metadata, and that metadata is false —
and because the h265 renditions are the smallest, yt-dlp preferred them. Roughly half the
clips in a nightly run were being discarded as `download_had_no_audio`, recorded as a
property of the clip when it was a property of the format. The `h264_*` rows are honest:
3 of 3 delivered audio, including the two videos that had just failed. Selector is now
`b[vcodec*=264]/download/b[acodec!=none]/bv*+ba/b`. Verified through `nightly-collect.sh`
on `muay-thai/clinch-basics`: 3 TikToks, zero no-audio downloads, 2 transcribed.

**yt-dlp's `-x` flag silently fails on TikTok.** It downloads, fails postprocessing with
`unable to obtain file audio codec with ffprobe`, and leaves a **video-only** file. The
numbered formats (`bytevc1_540p_792787-0`) are split streams despite the format table
listing `aac`. Use `-f download` — the combined format — then strip audio with ffmpeg.

**instaloader is the only downloader that works anonymously for Instagram.** yt-dlp fails
with "login required"; gallery-dl redirects to the login page; instaloader pulls the mp4,
thumbnail and caption with no credentials. Tested on six reels, 6/6 succeeded.

**The download dominates the cost, not the transcription.** 7–28MB of video to obtain a
43-second voice track. Prefer the smallest combined format available.

## Coverage — informational, not a gate

Measured per category, one representative sub-skill each, count of usable results in 10:

```
running 9 · pickleball 9 · gym 9 · badminton ~10 · boxing 8 · swimming 8 · pilates 8
snowboarding 7 · tennis 7 · soccer 7 · muay-thai 6 · golf 6 · surfing 6 · yoga 6
padel 6 · climbing 5 (9 on TikTok) · skiing 5 · cycling 5
table-tennis 2 (5 on TikTok) · chess 1 · bjj 0
```

The platforms are **complementary, not redundant**: climbing is 5/10 on Instagram and 9/10
on TikTok; table tennis doubles on TikTok. Only BJJ and chess fail on both, which is a
finding about where that instruction lives rather than a problem to fix.

**This table does not gate anything.** The goal is content diversity — every skill having
*some* short-form option for users who prefer short clips — not maximal coverage. A category
returning two clips instead of nine is not a failure; those users have two short options
they did not have before. BJJ and chess learners get YouTube, which is where their
instruction actually is.

## Ranking — score everything the same way, and let it rank where it lands

Short-form scores low, and that is allowed to stand. Measured across 24,535 reviewed
YouTube relations, using transcript length as the duration proxy (`duration_seconds` is
null on all 19,127 YouTube links):

```
<1.2k chars (~90s)   n=1731   avg 0.18   45% published
1.2-3k  (~2-4 min)   n=4519   avg 0.85   57%
3-8k    (~4-10 min)  n=9514   avg 1.02   58%   <- peak
8k+     (10 min+)    n=8771   avg 0.63   51%
```

Short-form clips land in the bottom bucket: the six Instagram reels transcribed at
567-1,745 chars, the TikToks at 241-2,121.

**Do not compensate for this in the ranking.** The obvious worry is that 0.18 is an
artifact — a short transcript gives the coach less to be convinced by, so it hedges. The
curve says otherwise: it is not monotonic. 10-minute-plus content drops back to 0.63, so
the coach is not rewarding length, it is rewarding substance, and it penalises a rambling
long video the same way it penalises a thin short one. That is the rubric working.

A 40-second clip covering one cue genuinely offers less than a good 6-minute breakdown, and
`combined_score` should say so. Boosting short-form to make it visible would misreport
quality to every user in order to serve some users' format preference.

Format preference is a FILTER, not a ranking. `ResourceSourceFilter`
(`"all" | "youtube" | "tiktok" | "instagram"`) already exists in the shared types, which is
the correct mechanism: the ranking answers "which is the better tutorial", the filter
answers "which suits me right now". Those are different questions and should not be
conflated in one ordering.

**A duration filter is explicitly out of scope.** The source filter already separates short
from long in practice, because TikTok and Reels *are* the short ones — a duration control
would only distinguish a 3-minute YouTube tutorial from a 12-minute one, which nobody has
asked for.

Worth knowing if it is ever wanted: `duration_seconds` is null on all 19,127 YouTube links
and set on only 114 of 142 TikToks, so it is not answerable today on any platform. `yt-dlp`
returns the field for free, so **populate it on new links as they are collected** — that
costs nothing now and avoids a backfill over the whole catalogue later. Do not backfill the
existing rows for this; there is no consumer.

## Implemented — verified end to end 2026-09-09

The collector no longer has a TikTok path. `processTikTokCollection` is gone, along with
`postTikTokSuggestion`, the `engagement_authority` rubric it applied, the CDP
`searchTikTok` call, and the `tiktok_search` rows in `trusted_sources` that drove it.
`processShortFormCollection` replaces all of it: per sub-skill it searches, downloads,
transcribes with whisper, and submits through the same `submit-suggestion` call. Nothing
downstream of the submit knows the platform.

**Who scores it: the Routine Coach, not the collector.** `nightly-collect.sh` exports
`COLLECT_SCORING=off`, so the nightly run is a pure collector for every source — candidates
are submitted unscored and the relevance and value coaches are the only things that judge
them. The local Ollama scorer exists but is unwired outside debugging.

That decision is now stated in exactly one place, `scoreCandidate()`, which both
`processSkill` and `processShortFormCollection` call. It was previously written twice and
the copies disagreed: the short-form one called the scorer unconditionally, so under the
real nightly settings it would have invoked a scorer the operator had deliberately unwired
and lost every candidate to a connection error on any night Ollama was not running. Two
implementations of one policy is what made that possible — an earlier revision of this
document claimed short-form "scores the transcript with the same Ollama prompt YouTube
uses", which described a debugging path, not production.

Two scoped runs against hosted, one sub-skill each:

```
muay-thai/switch-kick          6 candidates (3 TikTok, 3 IG)  → 3 submitted
muay-thai/sweeps-trips-...     6 candidates (3 TikTok, 3 IG)  → 1 submitted (Instagram)
```

Transcription: 6 of 12 clips produced usable speech, at 10.1–18.4 chars/sec and 30–79
seconds. The rest were rejected by the density gate, one download carried no audio stream,
and one `/reel/` URL turned out to be a photo post.

Those two runs invoked `run-collection.mjs` directly, which leaves `COLLECT_SCORING`
unset and therefore ON — so their local relevance scores (0.1 to 0.8, six rejections) are
**not** what nightly does. Re-verified through `nightly-collect.sh` on two further
sub-skills: `scoring_enabled: false`, every candidate `unscored`, nothing rejected locally,
everything handed to the coach.

A clip with no usable speech is still capped per sub-skill (`COLLECT_SHORTFORM_FALLBACK_CANDIDATES`,
default 2) in both modes. Verified: of 6 candidates for `muay-thai/elbow-strikes`, 2 with
transcripts (19.8 and 23.6 chars/sec) and 2 without were submitted, and 2 more without were
skipped once the budget was spent.

### Three bugs the runs exposed, all now fixed

**`link_transcripts` could not physically hold a short-form transcript.** Two check
constraints from when YouTube was the only source: `CHECK (source = 'youtube')` and a
provider list without `whisper`. `apply-suggestion` wraps its transcript persist in
try/catch, so the violation surfaced as a warning in a log nobody reads and the result
looked completely normal — link created, relation created, suggestion `auto_approved`,
`link_transcripts` empty. Indistinguishable from a clip with no speech. Migration `0059`
widens both. `scripts/fetch-shortform-transcripts.mjs` writes the same two values, so the
141-clip backfill could never have landed either; that was read as TikTok throttling.

**`whisper` was being recorded as `ytdlp`.** Both provider mappers tested only for
`"browser"` and defaulted everything else to `ytdlp`, so a locally transcribed clip would
have claimed the platform supplied captions — which TikTok and Instagram do not do at all.
Now a distinct provider in both writers.

**Instagram canonical URLs never matched on dedupe.** `classifyResultUrl` emitted
`/reel/<code>/` while `_shared/normalization.ts` strips trailing slashes, so a reel already
in the catalogue was invisible to `loadKnownCanonicalUrls` and would be re-downloaded and
re-transcribed on every pass. The two duplicate rows the catalogue already holds for one
reel, differing only by that slash, are the same mismatch reaching the database.

### Instagram's caption comes from the download, not the search result

The first run rejected a reel at relevance 0 with nothing to judge it on: no speech, and
Instagram's only metadata is a templated `twitter:title` that the search engine echoes back
as its description. But instaloader writes the caption to a `.txt` beside the mp4 as a side
effect of the download already being paid for. `transcribeShortForm` now returns it, on
every outcome including the failures — a clip with no usable speech is precisely the one
whose caller needs something to score against. TikTok needs none of this; its caption
arrives in the search result.

### Serplify cannot be used — it returns the domain, not the post

Tested against the live API. It is DataForSEO-shaped (`POST /v3/serp/google/organic/live/advanced`,
tasks envelope, $0.005/query) and it answers, but every organic result carries
`"url": "https://www.tiktok.com"` — the domain alone, with the path only hinted at in a
`breadcrumb` field (`https://www.tiktok.com › video`). Its `short_videos` block gives a
`/goto?url=<opaque>` redirect rather than a link. Without a post URL there is no video id,
so nothing downstream can act on it. **Tavily is the working provider** and is what both
verified runs used. The key stays in `.env.hosted` and is simply unread.

### Still open

- **A rejected clip leaves no trace, so it is retried forever.** The gap-filler
  re-downloaded and re-transcribed the same two music-only TikToks on two consecutive runs.
  Over ~150 short-form links with no usable speech that is roughly 12 minutes of wasted
  download every night, and it never converges. This needs recording before
  `fetch-shortform-transcripts.mjs` is put on a cron, not after. A zero-length row is not an
  option: `char_count > 0` is enforced, and storing the few characters whisper did return
  would feed the coach a Spanish song as surfing technique, which is the exact harm the
  density gate exists to prevent.
- **Short-form links have no thumbnail.** 135 of 155 TikToks and both Instagram links are
  already missing one, so this predates the new path, but new links inherit it. TikTok's CDN
  thumbnail URLs expire, so the durable answer is the existing `cacheThumbnailIfNeeded`
  storage path rather than storing the remote URL.
- `duration_seconds` is now populated from the decoded audio on every short-form link that
  transcribes — a real measurement rather than a scraped card value. Still null on all
  YouTube links.
