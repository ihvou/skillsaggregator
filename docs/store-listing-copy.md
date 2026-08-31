# Store listing copy

Last updated: 2026-08-17

Paste-ready text for both stores. Field limits are the store's own; the counts in
brackets are what the text below actually uses.

Assets live in `store-assets/`. The composed upload artifacts are committed; the raw
device captures they are built from (`store-assets/ios/`, `store-assets/android/`) are
gitignored for size. Rebuild with `scripts/make-store-assets.py [graphics|ios|android]`.

**Rule: floors, never exact counts.** The catalogue grows continuously, so any exact number in
store copy becomes false without anyone touching it — and every number here is a claim a moderator
can challenge. A floor ("2,000+") stays true forever as the catalogue grows and needs no
maintenance; an exact count ("13 sports") is a scheduled bug.

The same applies to *enumerating* the sports. Listing all of them by name is a promise to edit the
listing every time a category launches. Name several as examples instead — the ASO value is in the
sport words being present, not in the list being exhaustive.

Live numbers on 2026-08-17: **20 categories (13 published, 7 staged — golf, table tennis, climbing,
pickleball, skiing, snowboarding, BJJ), 298 published sub-skills, 2,000+ distinct tutorials.**
Copy below uses floors well under these, so it survives growth without edits.

---

## Google Play

**App name** [9/30]
```
Subskills
```

**Short description** [74/80]
```
Reviewed video tutorials for badminton, tennis, padel, gym, yoga and more.
```

**Full description** [1646/4000]
```
Getting better at a sport is not a search problem. It is a "what should I work on next, and which video actually teaches it" problem.

Subskills breaks every sport into its sub-skills and gives each one a short, reviewed list of free tutorials.

Badminton is not one topic. It is the backhand clear, the low serve, defence, footwork, net play — separate things to learn, each with its own best explanation. Subskills is organised that way.

WHAT'S INSIDE
• Sports including badminton, tennis, padel, boxing, cycling, gym, pilates, running, soccer, surfing, swimming and yoga — with more added regularly
• 250+ sub-skills, each with its own shortlist
• 2,000+ free tutorials, every one reviewed before it appears

HOW YOU USE IT
• Discover — browse by sport, or search across every sport at once
• Learning Path — sub-skills grouped beginner to advanced, so you always know what comes next
• Levels — every tutorial tagged beginner, intermediate or advanced
• Watch later — keep the ones worth returning to
• Watched — mark off what you have already done
• Vote — thumbs up or down; votes decide what stays near the top
• Suggest — send a link you rate. Suggestions are reviewed, not auto-published.

WHY IT IS DIFFERENT
Nothing is auto-published. Every tutorial is scored for relevance and teaching quality against the specific sub-skill it is filed under, and weak content is left out rather than buried on page four. You get a shortlist, not an endless feed.

No ads. No third-party trackers. Nothing about you is sold or shared. Everything is free to watch.

Browsing needs no account. Saving, marking watched, voting or suggesting creates a private library automatically. Add email, Google or Apple later to keep it across devices.
```

**Category** Education (alternative: Sports)
**Tags** learning, sports, video, fitness, tutorials
**Contact email** serhii.knyr@gmail.com
**Website** https://subskills.xyz
**Privacy policy** https://subskills.xyz/privacy

---

## App Store

**App name** [9/30]
```
Subskills
```

**Subtitle** [23/30]
```
Curated sport tutorials
```

**Promotional text** [141/170] — editable without a new build, so use it for news
```
Every sport broken into sub-skills, each with a reviewed shortlist of free tutorials. Follow a beginner-to-advanced path and queue what works.
```

**Keywords** [94/100] — comma-separated, no spaces (spaces are billed as characters)
```
badminton,tennis,padel,boxing,cycling,running,swimming,yoga,pilates,gym,technique,drills,coach
```
Do not repeat the app name or the subtitle words here; Apple already indexes those.

**Description** — same body as Play, minus the bullet glyphs Apple renders inconsistently
```
Getting better at a sport is not a search problem. It is a "what should I work on next, and which video actually teaches it" problem.

Subskills breaks every sport into its sub-skills and gives each one a short, reviewed list of free tutorials.

Badminton is not one topic. It is the backhand clear, the low serve, defence, footwork, net play — separate things to learn, each with its own best explanation. Subskills is organised that way.

WHAT'S INSIDE
- Sports including badminton, tennis, padel, boxing, cycling, gym, pilates, running, soccer, surfing, swimming and yoga - with more added regularly
- 250+ sub-skills, each with its own shortlist
- 2,000+ free tutorials, every one reviewed before it appears

HOW YOU USE IT
- Discover: browse by sport, or search across every sport at once
- Learning Path: sub-skills grouped beginner to advanced, so you always know what comes next
- Levels: every tutorial tagged beginner, intermediate or advanced
- Watch later: keep the ones worth returning to
- Watched: mark off what you have already done
- Vote: thumbs up or down; votes decide what stays near the top
- Suggest: send a link you rate. Suggestions are reviewed, not auto-published.

WHY IT IS DIFFERENT
Nothing is auto-published. Every tutorial is scored for relevance and teaching quality against the specific sub-skill it is filed under, and weak content is left out rather than buried on page four. You get a shortlist, not an endless feed.

No ads. No third-party trackers. Nothing about you is sold or shared. Everything is free to watch.

Browsing needs no account. Saving, marking watched, voting or suggesting creates a private library automatically. Add email, Google or Apple later to keep it across devices.
```

**Support URL** https://subskills.xyz/support
**Marketing URL** https://subskills.xyz
**Privacy policy URL** https://subskills.xyz/privacy
**Primary category** Education · **Secondary** Sports
**Copyright** 2026 Subskills
**Age rating** 4+ expected. The questionnaire asks about *your* content; the catalogue
links to third-party sport videos, which is why the reviewer notes below matter.

---

## Claims in this copy, and what backs them

Written down because a moderator can challenge any of them, and because they stop
being true if the product changes.

| Claim | Backed by |
|---|---|
| "reviewed before it appears" | publish gate: ≥2 coach reviews and `combined_score ≥ 1.3` on `link_skill_relations` |
| "scored for relevance and teaching quality" | those are the literal coach vote dimensions |
| "No ads. No third-party trackers. Nothing about you is sold or shared." | no ad SDK or third-party tracking SDK in `apps/mobile/package.json`; Apple defines tracking as linking app data with other companies' data for advertising/measurement or sharing with data brokers. First-party product analytics still require disclosure, but do not require ATT and do not make this claim false. |
| "free to watch" | every resource links out to a free public video |
| "Browsing needs no account" | catalogue reads are public; write actions lazily create a Supabase anonymous user with a real JWT |
| "sports including …" / 250+ sub-skills / 2,000+ tutorials | Floors, well under the live figures (20 categories, 298 sub-skills). Deliberately **no exact sport count and no exhaustive list** — both go stale as categories launch. |

---

## Screenshots

Captured from the real app on 2026-08-09, both platforms driven live, with the
marketing status bar (9:41, full signal, charged) that each platform provides for
this purpose.

| | source capture | listing image |
|---|---|---|
| iOS | `store-assets/ios/` — iPhone 17 Pro Max, 1320×2868 | `store-assets/ios-listing/` — same size, captioned |
| Android | `store-assets/android/` — Pixel 6a emulator, 1080×2400 | `store-assets/android-listing/` — 1080×1920, captioned |

Five, in upload order: Discover · Learning Path · Skill page · Search · Category.

Two details worth not re-deriving later:

- **1320×2868 is the 6.9" size Apple requires** for new submissions, which is why the
  captures come from a Pro **Max**. The iPhone 17 Pro used for all the earlier
  functional testing produces 1206×2622 and would be rejected.
- **Play listing images are composed onto 1080×1920, not uploaded raw.** Real phone
  captures are 20:9; Play documents 9:16 to 16:9. Compositing onto a 9:16 canvas
  sidesteps the aspect-ratio warning and adds the caption at the same time.

Raw captures sit next to the composed ones on disk but are **not committed**. If a
caption needs rewording, edit `SHOTS` in the generator and recompose from the local
raws. If the raws are gone, re-drive both devices — Runbook B in the submission
checklist for iOS, and for Android the emulator route below, which needs no phone:

```bash
sdkmanager "emulator" "system-images;android-36;google_apis;arm64-v8a"
avdmanager create avd -n subskills_pixel -k "system-images;android-36;google_apis;arm64-v8a" -d pixel_6a
emulator -avd subskills_pixel &
cd apps/mobile && npx expo prebuild --platform android --no-install && (cd android && ./gradlew assembleDebug)
adb install -r apps/mobile/android/app/build/outputs/apk/debug/app-debug.apk && adb reverse tcp:8081 tcp:8081
```

`adb shell am broadcast -a com.android.systemui.demo -e command clock -e hhmm 0941`
(after `settings put global sysui_demo_allowed 1`) gives the clean status bar; on iOS
the equivalent is `xcrun simctl status_bar <udid> override --time "9:41"`.

### Also generated

- `store-assets/graphics/play-feature-graphic-1024x500.png` — required by Play.
  Lockup sits inside the central 80%; Play crops it and overlays install UI on some
  surfaces.
- `store-assets/graphics/play-icon-512.png` — the Play listing icon.
- App Store icon: **not needed as a file.** Apple reads the 1024×1024 icon out of the
  uploaded build.

---

## Reviewer notes

Reuse for both stores; App Store Connect calls this "Notes for Review".

```
Subskills is a learning-resource discovery app for sport technique. It links out to
free, publicly available tutorial videos; it does not host or re-stream any video.

Browsing needs no account. Saving, marking watched, voting or suggesting creates
a private library automatically. Magic link, Google, and Sign in with Apple are
optional upgrades for keeping that library across devices.

User-suggested links are not published directly. They enter the same review pipeline
as collected content and appear only after passing it. Users can report an
inaccurate, unsafe, broken or off-topic resource via https://subskills.xyz/support.

Account deletion is available in-app under Account, and on the web at
https://subskills.xyz/account/delete.
```

**Demo account** — Apple requires working credentials whenever any part of the app is
behind a login. Ours is magic-link, which a reviewer cannot complete. Before
submitting, either provide a demo email/password the reviewer can actually use, or
state in the notes that all content is reachable without signing in and that sign-in
gates only save/watch/vote/suggest. The second is true here and is the simpler path,
but expect it to be the thing that gets questioned.
