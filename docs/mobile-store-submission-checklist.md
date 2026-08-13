# Mobile Store Submission Checklist

Last updated: 2026-07-31

**Work from the two checklists below.** Everything under "Reference" is background — read it only when a checklist item needs detail.

`docs/mobile-store-readiness-audit.md` is the historical audit (2026-06-23) that produced tasks M89–M96. Its blockers are resolved; it is context, not a to-do list.

Legend: `[x]` done · `[ ]` not started · `[~]` partly done

---

# BLOCKER — fix before either store goes live

- [x] 0. **Redeploy `submit-suggestion`** — done 2026-08-12. Re-verified against production: a POST
  with no `Authorization` header, and one with the anon key as bearer, both now return
  **401 "Sign in to suggest a resource."** and write nothing. A signed-in submission returns
  `approved` with `applied_changes: [link_upserted, relation_upserted]`, so the new inline
  auto-apply works end to end. Original report kept below.

  Production runs version 6 (deployed 2026-06-18); the
  sign-in guard landed in the repo on 2026-06-23 (`14b268a`) and was never shipped. Verified
  2026-08-12 against production: a `POST` to `/functions/v1/submit-suggestion` with **no
  `Authorization` header at all** returns `200` and inserts a `pending`, `origin_type=human`
  suggestion with `submitted_by_user_id = null`. The anon key is publishable and sits in the web
  bundle, so anyone can flood the moderation queue — and the deployed version predates the
  per-IP rate limit too. Publishing the apps advertises the endpoint.

  ```bash
  supabase functions deploy submit-suggestion --project-ref vqxsaabskkkjdljxiyqi
  ```
  Re-verify after deploying: the same unauthenticated POST must return **401 "Sign in to suggest
  a resource."**

  **Deploy diff reviewed 2026-08-12** — exactly one commit (`14b268a`), 38 lines, nothing else:
  1. the 401 guard, and the auth lookup moved earlier so it can run before the dedupe early-returns;
  2. **signed-in `LINK_ADD` is auto-applied** — `apply-suggestion` is called inline, the suggestion
     returns `approved`, and the relation is created straight away (unpublished). Human moderation
     of user links effectively goes away; the coach gate becomes the only filter. **Accepted
     deliberately** — the coach is the moderator.
  3. a one-line `_shared/prompts.ts` rubric tweak that `submit-suggestion` does not import; it
     reaches only `coach-curation`, which already runs it.

  Checked and safe: `INTERNAL_FUNCTION_TOKEN` is set (the auto-apply call needs it, and the agent
  `auto_approved` path already proves that hop works); no Turnstile secrets exist, so the deploy
  will not start demanding a token neither client sends; the auth lookup swallows its own errors,
  so agent submissions cannot 500 on it.

  Two costs, both accepted: every request now pays one `auth.getUser()` even when it would have
  short-circuited on dedupe (the collector generates many such duplicates nightly), and a user's
  submission now waits on `apply-suggestion` before responding.

- [ ] 0b. **Enrich user-submitted links, or they arrive blank.** Independent of the deploy, and
  the more serious of the two. Both clients send only `url`, `canonical_url`, `target_skill_id`,
  `public_note`, `skill_level`, `language` — no title, description or thumbnail. For a URL already
  in the catalogue the RPC's `on conflict … coalesce` keeps the existing metadata, which is why the
  2026-08-12 test looked clean: every URL tried was already known. A **genuinely new** URL creates
  a `links` row with `title`, `description`, `thumbnail_url` all NULL and `preview_status='pending'`,
  and nothing backfills it — no job scans for `pending` (there are 0 such rows today), and
  `link-checker` has never been deployed. `apply-suggestion` does enrich, but only TikTok
  (thumbnail) and only from `evidence_json` (transcript), which a human submission never has.

  Downstream: `get_unscored_for_coach` hands the coach `l.title`, `l.description` and
  `lt.transcript_text` — all NULL — so the coach judges a resource it cannot see, and the card
  renders with no title or thumbnail.

  **Confirmed live, then half fixed (2026-08-12).** Submitting a real new URL produced exactly
  that row: every metadata column NULL, `preview_status='pending'`, no transcript.
  `apply-suggestion` now calls YouTube **oEmbed** (no API key) before the transaction and fills
  `title`, `thumbnail_url` and `content_type` into the payload, which the RPC's own insert
  consumes — and its existing CASE flips `preview_status` to `fetched`. Verified: a second new
  URL landed with title and an `i.ytimg.com/.../hqdefault.jpg` thumbnail, matching what the
  collector stores. Best-effort — a failing oEmbed is logged and never blocks the suggestion.

  ⚠️ **Still open: `description`, `duration_seconds` and the transcript.** oEmbed does not carry
  them; they need the yt-dlp path the nightly collector already owns. Until then a user-suggested
  link reaches the coach with a title but no transcript, which is the coach's main signal. The
  natural home is a backfill pass over `preview_status`/missing-transcript links in
  `scripts/run-collection.mjs` — **not touched here on purpose**, because another agent has
  uncommitted work in that file (a `skill_source_searches` / migration 0034 change).
  Note `creator_handle` is set on the payload but the apply RPC's insert column list has no
  creator columns, so it does not reach `links`; harmless, and true of collected links too.

---

# ANDROID — do these in order

**Code / build**
- [x] 1. Store-readiness code landed (M89–M96: account deletion, privacy links, prod env, ATS/cleartext, permissions, icon)
- [x] 2. Preview APK built and exercised on a real device (Pixel 6a) — see *Verified: Android*
- [x] 3. **Google Play Developer account** — approved 2026-08-13.
- [x] 4. **Production AAB built** (2026-07-31, versionCode 2) — first release-config compile; no build errors
- [x] 5. AAB manifest verified: `package=xyz.subskills.app`, `targetSdkVersion=36` (≥35 ✓), `minSdkVersion=24`, `versionCode=2`

**Play Console setup**
- [ ] 6. Create the app in Play Console — every field and the exact answer is in *Play Console — every value you get asked for* below. Two irreversible choices there: **Free**, and the package name Play takes from your first AAB.
- [x] 7. Store listing assets **prepared** — copy in `docs/store-listing-copy.md`, images in `store-assets/`. Still to do: paste them into the console at step 6.
- [ ] 8. App content declarations: privacy policy URL, ads, content rating questionnaire, target audience
- [ ] 9. **Data Safety form** — see *Privacy disclosures* for exactly what to declare

**Test then ship**
- [ ] 10. Upload the AAB to **Internal testing**, add testers (email list, max 100), share the opt-in link
- [~] 11. **Smoke test the release build.** The minified code has now been run (2026-08-09) — see *Release build, exercised early*. Still required from Play itself: real device, Play-signed, split APKs.
- [ ] 12. Promote to production (or closed/open testing first)

---

# iOS — do these in order

**Local (free — no Apple account needed)**
- [x] 1. Xcode + CocoaPods installed; Simulator working
- [x] 2. Simulator build + full UI pass, no bugs found — see *Verified: iOS*
- [x] 3. Signed in on the Simulator; authenticated write path (save / watched / vote) verified **and persists across a full app restart** — server-side, not local

**Apple account setup**
- [ ] 4. **Enrol in the Apple Developer Program** — $99/yr. *Gate for everything below.*
- [ ] 5. Create App ID `xyz.subskills.app` and enable the **Sign in with Apple** capability
- [ ] 6. Enable the Apple provider in Supabase Auth (client ID = `xyz.subskills.app`; native id_token flow, no client secret)
- [ ] 7. Test Sign in with Apple end-to-end on a real device

**Build and ship**
- [ ] 8. `npx eas-cli build --platform ios --profile production` (EAS manages certificates/profiles)
- [ ] 9. Verify the generated `Info.plist` does not allow arbitrary ATS loads
- [ ] 10. Upload to App Store Connect (`eas submit --platform ios`)
- [x] 11. Store listing **prepared** — copy, keywords and 6.9" (1320×2868) screenshots in `docs/store-listing-copy.md` / `store-assets/`. Still to do: paste into App Store Connect, plus the **Apple privacy labels** (see *Privacy disclosures*).
- [ ] 12. Reviewer notes + demo access — draft in `docs/store-listing-copy.md`. **Decide the demo-account answer first**: magic-link sign-in is something a reviewer cannot complete.
- [ ] 13. **TestFlight** build, smoke test on a real iPhone
- [ ] 14. Submit for App Store review

---

# REFERENCE

## Status at a glance

| Area | State |
|---|---|
| Android preview APK | ✅ built, exercised on a real Pixel 6a |
| Android production AAB | ✅ built (versionCode 2), manifest verified, and the minified code now actually run via a bundletool universal APK. Still needs the Play-delivered artifact on real hardware |
| iOS Simulator | ✅ builds, runs, full UI pass — no bugs found |
| iOS real device / TestFlight | ❌ needs the Apple Developer account |
| Sign in with Apple | ❌ UI ready; backend needs the paid account |
| Store listing copy + images | ✅ written and generated — `docs/store-listing-copy.md`, `store-assets/` |
| Store paperwork (console entry, declarations, privacy labels) | ❌ blocked on both developer accounts |

## App identity (permanent after publish)

| field | value |
|---|---|
| iOS bundle ID / Android package | `xyz.subskills.app` |
| Deep-link scheme | `subskills://` |
| Expo slug | `subskills` |
| Display name | Subskills |

Renamed 2026-07-31 from `com.skillsaggregator.mobile` / `skillsaggregator://` (the old repo name) **before first publish, deliberately** — the bundle ID and package name are immutable once an app ships, and the package is user-visible in the Play Store URL and Android app-info. `xyz.subskills.app` is reverse-DNS of the domain we own.

Because the scheme changed, **one** external record must be updated or mobile auth breaks:
- Supabase → Auth → URL Configuration → Redirect URLs must include `subskills://auth/callback` (keep the old entry until every old build is gone)

Nothing else needs touching:
- **Google Cloud Console needs no change.** Google sign-in uses Supabase's web OAuth flow (`signInWithOAuth`), not a native SDK, so the redirect URI registered with Google is Supabase's own `https://vqxsaabskkkjdljxiyqi.supabase.co/auth/v1/callback` — unaffected by the app rename. (A *native* Google SDK would have been bound to the package name + SHA-1; this app has none.)
- No code change: `redirectTo()` is `ExpoLinking.createURL("auth/callback")`, which derives the scheme from app.json and now emits `subskills://auth/callback` automatically.
- EAS regenerates the Android keystore (per-package) on the next build — harmless pre-launch.

## Accounts and costs

| Need | Cost | Required for |
|---|---|---|
| Google Play Developer account | **$25 once** (~48h verification) | Any Play release, *including internal testing* |
| Apple Developer Program | **$99/yr** | Real iPhone, TestFlight, App Store, **and Sign in with Apple** |
| Xcode | free | iOS Simulator development — **no Apple account needed** |
| EAS (Expo) | free tier works | Cloud builds (~4h queue on free tier) |

⚠️ **Do not read "can't build for iOS" as "must pay Apple".** `expo run:ios` fails on Xcode 26 with `CommandError: No code signing certificates are available to use.`, which looks like it demands the $99 account. It doesn't: Expo misidentifies the *simulator* as a physical device (`Unexpected devicectl JSON version output from devicectl`), and simulator builds need no signing. Build with `xcodebuild` directly (Runbook B) — zero certificates required.

## Release build, exercised early (without Play)

An `.aab` cannot be installed on a device — it is a publishing format Play consumes to
generate per-device APKs. That normally means the R8-minified release build is first
run by *end users*, which is the single riskiest step in the whole list.

It does not have to be. `bundletool` can convert the AAB into an installable universal
APK, signed with any local key:

```bash
java -jar bundletool.jar build-apks --bundle=app.aab --output=app.apks --mode=universal \
  --ks=~/.android/debug.keystore --ks-pass=pass:android --ks-key-alias=androiddebugkey --key-pass=pass:android
unzip -o app.apks -d apks   # -> apks/universal.apk
```

Done 2026-08-09 on the `subskills_pixel` emulator, with **Metro deliberately not
connected** so the app had to run from its own bundled JS. Result: onboarding →
Discover with live data and thumbnails → category → skill page, no crash and no
runtime errors in logcat. So R8 minification and resource shrinking do not break the
app — the failure mode this step exists to catch.

What this still does **not** cover, and why item 11 stays open:
- signed with a debug key, not Play's app-signing key
- one universal APK (~78 MB) rather than the per-device splits Play generates (~30-40 MB)
- an emulator, not real hardware

## Play Console — every value you get asked for

Verified against the repo and the live site on 2026-08-13. Work top to bottom; this is the
order the console asks. Copy for the listing itself lives in `docs/store-listing-copy.md`.

### Create app

| Field | Value | Note |
|---|---|---|
| App name | `Subskills` | 9/30 chars. Changeable later. |
| Default language | **English (United Kingdom)** | Our copy is British — "organised", "catalogue". Pick en-GB, or normalise the copy to en-US first. Do not mix. |
| App or game | App | |
| Free or paid | **Free** | ⚠️ **Irreversible.** A free app can never be switched to paid. Paid → free is allowed. |
| Declarations | Developer Program Policies ✓, US export laws ✓ | |

**Package name is not typed anywhere** — Play takes `xyz.subskills.app` from the first AAB you
upload and it is then permanent for the life of the listing.

### App identity (from `apps/mobile/app.json` + the built AAB)

| | |
|---|---|
| Package | `xyz.subskills.app` |
| versionName | `0.1.0` |
| versionCode | `2` (EAS `autoIncrement` bumps this per production build) |
| minSdk / targetSdk | 24 / 36 (Play requires ≥35) |
| Permissions | `INTERNET`, `VIBRATE` only |
| Orientation | portrait |
| Signing | Play App Signing — accept the default. EAS holds the upload key. |
| Expo slug | `skillsaggregator` (unchanged on purpose; the EAS project is bound to it) |

### Store presence

| Field | Value |
|---|---|
| App category | Education |
| Tags | learning, sports, video, fitness, tutorials |
| Contact email | serhii.knyr@gmail.com |
| Website | https://subskills.xyz |
| Privacy policy | https://subskills.xyz/privacy |

### "Set up your app" declarations

| Question | Answer | Why |
|---|---|---|
| App access | All functionality available without special access | Browsing needs no account, and sign-up is self-serve. Sign-in gates only save / watched / vote / suggest — say exactly that in the notes box. |
| Ads | **No ads** | Verified: no ad SDK in `apps/mobile/package.json`. |
| Content rating | Category: *Reference, News, or Educational* | ⚠️ Answer the user-generated-content question **yes** — users submit links and public notes that other users can see. There is no user-to-user messaging. Do not under-declare this; it is the answer most likely to be audited. |
| Target audience | **13+** | Selecting any under-13 band opts you into the Families policy and a much stricter review. Nothing here targets children. |
| News app | No | |
| COVID-19 contact tracing/status | No | |
| Government app | No | |
| Financial features | None | |
| Data safety | See *Privacy disclosures* above | Collected: email/auth id, saved + watched + vote activity, submitted links and public notes, contributor profile. Encrypted in transit ✓. Users can request deletion ✓. |

⚠️ **Data-safety deletion URL — this one will bite.** Play requires a deletion URL that is
reachable **without signing in**. `https://subskills.xyz/account/delete` returns **307 →
`/sign-in?next=/account/delete`**, so it fails that test. Two options: point Play at
`https://subskills.xyz/privacy`, which is public (200) and already documents both deletion routes;
or make `/account/delete` render a public explainer with a sign-in button and keep the URL. The
second is nicer and is a small web change.

### Release

1. Testing → **Internal testing** → Create new release.
2. Upload `app-release.aab` (the production build, not a preview APK — an AAB cannot be sideloaded).
3. Release name defaults to `2 (0.1.0)`. Release notes: first internal build.
4. Testers: create an email list, **max 100**, then share the opt-in link. Each tester must accept it before the Play listing becomes visible to them.
5. Countries: all, unless you want to limit it.

Then do checklist item 11 — install from Play on a real device. That is the first time the
minified release build runs from a Play-signed, per-device split APK.

## Runbook A — Android production AAB → Play

Preview APKs (what we sideload) are **not** what Play accepts. Play requires an **AAB**; it generates per-device APKs from it. The `production` profile builds an AAB (`buildType: "app-bundle"`, `autoIncrement: true`) in *release* configuration — R8 minification, resource shrinking, Play App Signing. Genuinely different from the preview APK, so it must be smoke-tested even though the APK works. An AAB cannot be sideloaded, so building it and internal testing are one workflow.

```bash
cd apps/mobile && npx eas-cli build --platform android --profile production
```
Then Play Console → Testing → Internal testing → Create release → upload the `.aab` → add testers → share the opt-in link.
Optional: `eas submit --platform android` automates upload but needs a Google service-account JSON; manual upload is simpler the first time.

## Runbook B — iOS Simulator (the working local loop)

```bash
cd apps/mobile
npx expo prebuild --platform ios          # generates ios/ (gitignored)
brew install cocoapods                     # once
xcrun simctl boot "<simulator udid>"
cd ios && xcodebuild -workspace Subskills.xcworkspace -scheme Subskills \
  -configuration Debug -sdk iphonesimulator \
  -destination 'platform=iOS Simulator,id=<udid>' \
  -derivedDataPath ./build CODE_SIGNING_ALLOWED=NO
xcrun simctl install booted ios/build/Build/Products/Debug-iphonesimulator/Subskills.app
xcrun simctl launch booted xyz.subskills.app
```
Metro must be running (`npx expo start`). Use `xcodebuild` directly — **not** `expo run:ios`. The Claude Simulator panel needs `sudo xcode-select -s /Applications/Xcode.app/Contents/Developer` once.

## Privacy disclosures (Data Safety + Apple labels)

Declare: email/auth identifiers, saved resources, watched state, votes, submitted links and public notes, contributor profile data, and network requests to Supabase / external resources.
Do **not** declare advertising, cross-app tracking, precise location, contacts, photos, microphone or camera unless new SDKs are added.

## Verified: Android (Pixel 6a, 2026-07-29/31)

Driven on-device, not inspected: cold launch opens **Discover**; catalog and category → skill navigation; card layout (170×96 thumbnails, level badge, no rating pill); link-out to YouTube; tab switching; **save + watched + vote write to the DB and read back in Library**; Account screen with deletion and Privacy/Terms/Support links; `Permissions: No permissions requested`; red launcher icon.

## Verified: iOS Simulator (iPhone 17 Pro, 2026-07-31)

First run on iOS ever. Builds and launches with no crash; onboarding with correct safe-area around the Dynamic Island; **lands on Discover**; catalog, skill pages, level badges, action icons; native auth-gate alert; Library and Suggest screens; **Sign in with Apple renders via Apple's native `AppleAuthenticationButton`** (CONTINUE/BLACK — HIG-compliant). No layout regressions.
Authenticated write path verified 2026-07-31 (magic-link sign-in; save/watched/vote persist across a full terminate+relaunch). Still untested on iOS: Apple sign-in backend (needs the paid account).

## Edge functions: deployed vs repo (checked 2026-08-12)

Nothing warns when a function's source moves ahead of what is deployed, and the CLI does not
report it either — you have to compare `supabase functions list` timestamps against `git log`.
That gap hid the auth bug above for seven weeks.

Compare in **UTC**. `git log --date=short` prints the *author* date in local time; this repo's
commits carry `+08:00`, so a commit made at 19:44 UTC shows as the 19th and looks newer than a
20:10 UTC deploy on the 18th. That artifact made `apply-suggestion` look stale when it is not.

| function | last commit (UTC) | deployed (UTC) | |
|---|---|---|---|
| `submit-suggestion` | 2026-06-22 16:36 | 2026-06-18 10:31 (v6) | **stale — one commit behind, auth guard missing in prod** |
| `apply-suggestion` | 2026-06-18 19:44 | 2026-06-18 20:10 (v8) | current |
| `coach-curation` | 2026-06-22 16:36 | 2026-06-23 18:56 (v2) | current |

Also in the repo but **never deployed**: `health`, `link-checker`, `link-searcher`,
`revalidate-web`, `triangulate`. Some may be deliberately local-only — worth confirming, because
`revalidate-web` sounds like something the web cache depends on.

```bash
supabase functions list --project-ref vqxsaabskkkjdljxiyqi   # compare against: git log -1 --date=short --format=%ad -- supabase/functions/<name>/
```

## Suggestion flow: verified 2026-08-12

Driven end-to-end, both clients, against production.

- **Mobile (iOS Simulator, signed in):** Suggest form → real submission → alert "queued for coach
  review" → row lands `pending`, `origin_type=human`, `origin_name=mobile_<slug>`, correct
  `submitted_by_user_id`, target skill, normalised `canonical_url`, extracted `domain`, level and
  public note. Nothing auto-publishes. ✅
- **Web (signed out):** form renders the full catalogue; submit is refused client-side with
  "Sign in to suggest a resource." and no request is sent. ✅
- **Web (authenticated payload, replayed against the API):** accepted; dedupe and validation
  behave as below. The one hop not exercised in a real browser is the cookie session feeding
  `SuggestForm`'s `getSession()` — signing in needs a PKCE flow that a server-minted link cannot
  complete.
- **Dedupe is URL-scoped for humans, skill-scoped for agents — deliberate.** The code says so:
  the collector legitimately multi-tags one video across sub-skills, so it dedupes on
  (URL, target skill); human submissions keep a broad 24h URL-level guard as anti-abuse. Two
  consequences worth knowing rather than fixing: a user who suggests a video for a *second*
  sub-skill gets "already submitted, thanks" with no hint their skill choice was dropped, and
  because the nightly collector submits heavily, a user suggesting anything it touched in the
  last 24 hours collides with it and gets no credit.
- **URL validation returns HTTP 500.** `validateHumanLinkUrl` throws without a `status`, so
  "Public links only, please." surfaces as a server error rather than a 400. The user sees the
  right message, but every rejected paste is logged as a 5xx.

## Bugs found ONLY by running the app

None of these were caught by typecheck, lint or CI — the argument for staged rollout:
1. **Launch crash** — duplicate `react-native-safe-area-context` registered `RNCSafeAreaProvider` twice.
2. **Metro bundle failure** — a stale root `expo-router` copy had been satisfying `babel-preset-expo`'s plugin check by accident.
3. **All user writes failed** — `set_user_bookmark/watched/vote` raised `column reference "link_skill_relation_id" is ambiguous`; save/watch/vote were broken on web *and* mobile in production.
4. **Wrong launch tab** — route groups all resolved to `/`, so the app opened on Account.

## Local testing setup

- **Android**: JDK 17 (`brew install openjdk@17`) + Android SDK 36 in `~/Library/Android/sdk` (cmdline-tools from Google, no sudo). `JAVA_HOME=/opt/homebrew/opt/openjdk@17`, `ANDROID_HOME=~/Library/Android/sdk`. First `expo run:android` ≈ 6 min.
- Debug builds set `applicationIdSuffix ".dev"` in `android/app/build.gradle` so they install **alongside** the EAS-signed app instead of failing `INSTALL_FAILED_UPDATE_INCOMPATIBLE`. (`android/` is gitignored and regenerated by prebuild — re-apply after a fresh prebuild.)
- **Device**: wireless adb (`adb pair <ip:port> <code>` then `adb connect`). The phone's 30s screen timeout kills automated runs — enable Developer options → **Stay awake**. The pairing drops after a few hours and has to be redone by hand.
- **Emulator** (added 2026-08-09, avoids that re-pairing entirely): AVD `subskills_pixel`, a Pixel 6a on `system-images;android-36;google_apis;arm64-v8a` — same 1080×2400 as the physical test device. Setup commands are in `docs/store-listing-copy.md`. Good enough for UI work and screenshots; a **real device is still required** for the Play internal-testing smoke test, since that is the first run of the minified release build.
- **iOS**: Xcode 26.6, CocoaPods via brew. Simulator needs **no** Apple account.

## Implemented in repo

- Sign in with Apple: `expo-apple-authentication`, `ios.usesAppleSignIn`, native Apple button in the Account screen.
- Account screen exposes production Privacy, Terms, Support and web account-deletion links.
- Account deletion in-app and on the web at `/account/delete`; privileged deletion runs in the web API route with the service role.
- Production EAS profile carries the Supabase URL, publishable key, and `EXPO_PUBLIC_WEB_BASE_URL=https://subskills.xyz`.
- Android cleartext disabled; permissions allowlisted to `INTERNET` + `VIBRATE`.
- iOS app icon is an opaque RGB PNG.
- Support page documents how to report inaccurate/unsafe/broken/off-topic resources.

## Release check results

- `npx expo-doctor`: **16/18** (2026-07-31). Two accepted failures:
  1. **Duplicate dependencies** — `react@19.1.0` (mobile) vs `19.2.5` (root, for web); `react-native-svg@15.12.1` vs `15.15.4` (root, for `lucide-react-native`); nested `expo-constants` copies. Confirmed unflattenable: root `overrides` + `npm dedupe` fails with ERESOLVE because web resolves React 19.2.x while Expo 54 pins 19.1.0. Mitigated by `apps/mobile/metro.config.js` forcing a singleton React/React Native in the bundle; web typechecks on 19.1.0, so neither app is harmed.
  2. **Patch drift** — `expo 54.0.35` vs upstream `~54.0.36`. Deliberately not bumped mid-debugging; safe to update.
- If a clean 18/18 ever becomes mandatory: split the mobile install from the web workspace.

## Reviewer notes

Moved to `docs/store-listing-copy.md` (paste-ready, alongside the demo-account
decision) so there is one copy to keep current rather than two that drift.
