# Mobile Store Submission Checklist

Last updated: 2026-08-29

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
- [ ] 10. Upload the AAB to **Closed testing** — *not* Internal testing. See *The 12-tester / 14-day gate* below before you create the track; getting this wrong costs 14 days.
- [ ] 10b. **Recruit 15–20 testers and start the 14-day clock as early as possible.** It runs in the background while you do steps 6–9, so start it first if the build is ready. Not from r/badminton or r/padel — see `docs/growth-plan.md` §5.
- [~] 11. **Smoke test the release build.** The minified code has now been run (2026-08-09) — see *Release build, exercised early*. Still required from Play itself: real device, Play-signed, split APKs.
- [ ] 12. **Apply for production access** (the Dashboard questionnaire), then promote to production.

## The 12-tester / 14-day gate

Applies to **personal** developer accounts created after **2023-11-13**. This account was approved
**2026-08-13**, so unless it is an organization account, it applies. Google's requirement, verbatim:

> "run a closed test for your app with a minimum of 12 testers who have been opted-in for at least the
> last 14 days continuously"

**Internal testing does not satisfy this.** Google is explicit that you *"must run a closed test before
you can apply to publish your app to production"*; internal testing is optional and only for finding
issues early. This is the one thing on this page that silently costs two weeks.

Mechanics that decide how you run it:

| Question | Answer |
|---|---|
| What is a "closed test"? | A Play track with a controlled tester list (email list or Google Group, max 100 per list). Testers accept an opt-in link and install from Play. Distinct from Internal (up to 100, no gate satisfied) and Open (public). |
| When does the countdown start? | Per tester, from the moment **that tester opts in** — not from when you create the track or upload a build. |
| How is it measured? | Google counts testers **currently opted in**, continuously, for the last 14 days. The requirement is met when **12 testers have each been continuously opted in for ≥14 days**. |
| What if a tester opts out? | Their time is void. Google: *"we won't count testers who opted in, tested for less than 14 days, and then opted out. Even if they opt back in … these 14 days must be consecutive to count."* A replacement recruited on day 7 finishes on day 21, not day 14. |
| **Can I ship new builds mid-test?** | **Yes.** The clock tracks tester opt-in, not the build. Push as many releases to the closed track as you like — it does not reset anything. This is the intended way to use the 14 days. |
| So what actually resets it? | Testers dropping below 12 opted-in. Nothing else. |

**Practical consequence:** recruit **15–20**, not 12, so two dropouts don't cost you a fortnight — and
treat the 14 days as free iteration time rather than a freeze. The build you eventually promote does not
have to be the build you started the test with.

*Source: [Play Console Help — testing requirements](https://support.google.com/googleplay/android-developer/answer/14151465), fetched 2026-08-14. The per-tester wording is Google's own; the "buffer above 12" advice is inference from it plus practitioner reports.*

**Organization accounts** are widely reported to be exempt, but **Google's page does not say so** — it
only ever says "personal accounts". Do not re-create the account on that inference: converting also
needs a registered legal entity and a D-U-N-S number, which is weeks of bureaucracy to dodge 14 days.

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

**Package name IS typed on the Create app form** — corrected 2026-08-15. The old note claiming Play
takes it from the first AAB describes a retired flow. It is the only irreversible field on that
screen, and it is permanent for the life of the listing.

⚠️ **If the package has ever been installed on a real Android device before you create the app on
Play, Create app will reject it as "already in use."** That is documented behaviour, not a bug:

> "If you have already used the package name—for apps distributed outside of Play or if the app was
> installed on a certified Android device prior to creating the app on Google Play—you will be
> required to prove ownership of the private key that was used to sign your app."

This happened here — the preview APK was sideloaded on a Pixel 6a (Android section, item 2) months
before the app existed on Play. **The fix that worked:** Play Console → **Android developer
verification → Package names → Register package name**, register `xyz.subskills.app` there. It sits
in *Draft* asking for a public key, but that alone is enough — Create app then reports "Package name
available". Do **not** guess a fingerprint from a local artifact to clear the Draft; wait until the
first AAB is uploaded and read the real certificates from **Protected with Play → Play Store
distribution → Play app signing**. There is no documented way to undo a key registration.

For any *future* app: create it in Play Console **first**, before sideloading any build, and Play
auto-registers the package name with no key step at all.

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
| App access | All functionality available without special access | Browsing needs no account. Save / watched / vote / suggest lazily create a private anonymous account; email, Google and Apple are optional upgrades for keeping it across devices. |
| Ads | **No ads** | Verified: no ad SDK in `apps/mobile/package.json`. |
| Content rating | Category: *Reference, News, or Educational* | ⚠️ Answer the user-generated-content question **yes** — users submit links and public notes that other users can see. There is no user-to-user messaging. Do not under-declare this; it is the answer most likely to be audited. |
| Target audience | **13+** | Selecting any under-13 band opts you into the Families policy and a much stricter review. Nothing here targets children. |
| News app | No | |
| COVID-19 contact tracing/status | No | |
| Government app | No | |
| Financial features | None | |
| Data safety | See *Privacy disclosures* above | Collected: email/auth id, saved + watched + vote activity, submitted links and public notes, contributor profile. Encrypted in transit ✓. Users can request deletion ✓. |

**Data-safety deletion URL:** `https://subskills.xyz/account/delete`. Play requires this to be
reachable **without signing in**, and it now is — signed out it renders a public explainer (how to
delete, what is removed, what stays, sign-in button); signed in it still shows the confirmation
form. It used to 307 to `/sign-in?next=/account/delete`, which would have failed review. Keep the
copy on that page in step with `/privacy`; a mismatch between the two is what an audit looks for.

### Release

1. Testing → **Closed testing** → Create new release. (**Not** Internal testing — it does not satisfy the
   12-tester / 14-day gate. See *The 12-tester / 14-day gate* above.)
2. Upload `app-release.aab` (the production build, not a preview APK — an AAB cannot be sideloaded).
3. Release name is prefilled as `versionCode (versionName)` from the **first** bundle you upload — e.g.
   `3 (0.1.0)`. It is **cosmetic**, and Play does **not** rename it if you later swap the bundle, so a
   release named `2 (0.1.0)` can legitimately contain versionCode 3. Do not read the version from the
   name: check **App bundles** on the release, or the "message for version code N" line on the
   Preview-and-confirm screen. Release notes: first closed-test build.
4. Testers: create an email list, **max 100**, then share the opt-in link. Each tester must accept it before the Play listing becomes visible to them. **Recruit 15–20** so two dropouts don't reset the 14 days.
5. Countries: all, unless you want to limit it.
6. Note the date each tester accepts — the 14 days is counted per tester from *their* opt-in, and you
   need 12 who have been continuously opted in for the full period.

Then do checklist item 11 — install from Play on a real device. That is the first time the
minified release build runs from a Play-signed, per-device split APK.

### Uploading with `eas submit` instead (optional)

The steps above are a manual upload, which is what the first release needs anyway — Play will not
accept an API upload for a package it has never seen. Once the app exists on Play, later releases
can go with one command, but only after a **Google service account key** exists:

1. Play Console → **Setup → API access** → link (or create) a Google Cloud project.
2. In that project, create a service account, then **Grant access** back in Play Console with the
   *Release manager* role limited to this app.
3. Download its JSON key. It is a credential with upload rights — treat it like the Apple `.p8`.
4. Put it at `apps/mobile/credentials/play-service-account.json` and add
   `"serviceAccountKeyPath": "./credentials/play-service-account.json"` under
   `submit.production.android` in `eas.json`.

`credentials/` holds secrets and nothing in it is committed — `.gitignore` blocks `*.p8`, and the
Play JSON needs its own rule before you save one there. Without the key,
`eas submit --platform android --non-interactive` fails with *"Google Service Account Keys cannot
be set up in --non-interactive mode"*, which is this step missing, not a build problem.

The iOS equivalent is already wired: `submit.production.ios.ascApiKeyPath` points at
`./credentials/asc-api-key.p8`, so `eas submit --platform ios` runs unattended. Only the path is in
the repo; the key itself is ignored.

## App Store Connect — every value you get asked for

The Play Console section above had this; the App Store side did not, which is
why the **New App** dialog came up unanswered. Written down for the same reason:
two of these are permanent.

### The "New App" dialog

| Field | Value | Notes |
|---|---|---|
| **Platforms** | ☑ **iOS** only | Leave macOS / tvOS / visionOS unticked. Adding a platform later is easy; a platform you never ship sits there looking unfinished. |
| **Name** | `Subskills` | 30-char limit, 9 used. This is the App Store display name and must be unique across the whole store. Changeable later, but only between versions. |
| **Primary Language** | **English (U.K.)** | Must match Play's default language, set to English (United Kingdom) for the same reason: the copy is British — `organised` ×2, `catalogue` ×4, `defence` ×2, and no American variants. Mixing en-GB on one store with en-US on the other means one listing reads as a typo to its own audience. |
| **Bundle ID** | `xyz.subskills.app` | Must already be registered — see the trap below. |
| **SKU** | `subskills-ios` | **Permanent, and never shown to anyone.** It is your own reference for reporting. Any stable string is fine; do not put anything secret in it. |
| **User Access** | **Full Access** | Only matters on a team — it controls which members can see the app. On a one-person account either works; Full Access avoids surprises later. |

### The trap: Bundle ID must exist before it appears

The Bundle ID dropdown lists **only identifiers already registered** in
Certificates, Identifiers & Profiles. On a fresh account `xyz.subskills.app`
will not be there, and the dialog gives no hint why.

Register it first — Certificates, Identifiers & Profiles → Identifiers → **+**
→ App IDs → App → Description `Subskills`, Bundle ID **Explicit** =
`xyz.subskills.app` — and **tick the "Sign in with Apple" capability while you
are on that screen.** The app declares `usesAppleSignIn: true` and offers Google
sign-in, which makes Sign in with Apple a hard App Review requirement; adding
the capability afterwards means regenerating provisioning profiles.

EAS can create the identifier itself on the first `eas build --platform ios`,
which is the lower-effort path if you have not made it yet — but it will not
retro-fit the capability onto an identifier you created by hand without it.

### Export compliance, and why the build warned about it

The first `eas build --platform ios` printed:

> `app.json is missing ios.infoPlist.ITSAppUsesNonExemptEncryption boolean.`
> `Manual configuration is required in App Store Connect before the app can be tested.`

Without it, App Store Connect asks the export-compliance question by hand on
**every** upload, and the build sits un-testable until someone answers it.

Set to **`false`** in `app.json`, which is the correct answer here: `false` means
"uses no *non-exempt* encryption". The app makes HTTPS calls to Supabase and
stores local state in MMKV **without an encryption key** (`new MMKV({ id })`,
`lib/localState.ts:9`) — no custom cryptography anywhere in the app code. HTTPS
via the OS is explicitly exempt.

Re-check this if MMKV is ever given an `encryptionKey`, or if any custom crypto
is added; the answer would stop being automatic.

### iOS credentials: use the API key, not an Apple ID

Signing in with an Apple ID needs a 2FA code, which on this account has failed
to arrive on device or by SMS. Skip it entirely — an App Store Connect API key
authenticates non-interactively:

```bash
export EXPO_ASC_API_KEY_PATH=~/.appstoreconnect/private_keys/AuthKey_V6K82APH6K.p8
export EXPO_ASC_KEY_ID=V6K82APH6K
export EXPO_ASC_ISSUER_ID=d4169cf2-b171-4bae-9a3e-c49b88b92ee1
export EXPO_APPLE_TEAM_ID=T3J6K9GV2B
export EXPO_APPLE_TEAM_TYPE=INDIVIDUAL
```

`~/.appstoreconnect/private_keys/` is the conventional location, and the `.p8`
never enters the repo (`.gitignore` blocks `*.p8`). Set `EXPO_APPLE_TEAM_TYPE`
alongside the team id or the CLI stops to ask for it.

Creating a *new* provisioning profile still needs interactive confirmation even
with the key — `--non-interactive` refuses with "Distribution Certificate is not
validated for non-interactive builds". So when a target has no profile yet, run:

```bash
cd apps/mobile && npx eas-cli credentials:configure-build -p ios -e production
```

Answer **yes** to "Reuse this distribution certificate?" — reusing is right, and
generating a second one is how you invalidate the profile that already works.
Then yes to "Generate a new Apple Provisioning Profile?". Once it prints *All
credentials are ready to build*, every later `eas build` runs non-interactively.

Apple's Developer Portal returns a plain 500 on profile creation often enough
that eas-cli's three retries can all miss. It is not a config error. Re-run.

### Every target needs its own provisioning profile

The share extension is a separate bundle id and needs its own profile. EAS only
provisions targets it is told about, via `app.json`:

```json
"extra": { "eas": { "build": { "experimental": { "ios": {
  "appExtensions": [
    { "targetName": "SubskillsShareExtension",
      "bundleIdentifier": "xyz.subskills.app.share" }
  ] } } } } }
```

Without it, EAS silently provisions only the main app and the archive dies with
`Signing for "SubskillsShareExtension" requires a development team`.

### Read the xcodebuild log, not the error code

EAS reported that failure as `XCODE_RESOURCE_BUNDLE_CODE_SIGNING_ERROR`, whose
message tells you to downgrade Xcode or upgrade to SDK 46 — advice that is
irrelevant on SDK 54 and cost three builds. Expo's classifier matches "requires
a development team" to the resource-bundle case. **Treat the error code as a
hint, never as the diagnosis.** Get the real log:

```bash
# builds.byId.logFiles from the GraphQL API; needs the session token from
# ~/.expo/state.json and a CLI user-agent (plain requests get Cloudflare 1010).
# The files are brotli-encoded — decompress them, do not decode as text.
curl -s https://api.expo.dev/graphql -H "expo-session: $TOKEN" \
  -H "User-Agent: eas-cli/16.7.0 darwin-arm64 node-v22" \
  -H "Content-Type: application/json" \
  -d '{"query":"query($id:ID!){builds{byId(buildId:$id){logFiles}}}","variables":{"id":"<BUILD_ID>"}}'
```

Then `zlib.brotliDecompressSync` the result and grep for `error:`. The whole
failure was one line in a 989-line log.

### Capabilities: tick exactly one

The Register-an-App-ID page lists ~150 capabilities. This app needs **one**.

| Capability | Needed | Why |
|---|---|---|
| **Sign in with Apple** | **YES** | `usesAppleSignIn: true` + the `expo-apple-authentication` plugin, and App Review requires it once the app offers Google sign-in. |
| App Groups | No | The iOS share extension builds a `subskills://` URL and opens the app with it (`plugins/withShareTargets.js:194`). It never writes to a shared container, so there is nothing to share a group for. |
| Push Notifications | No | No `expo-notifications`, no push registration anywhere in the app. |
| Associated Domains | No | Deep links use the custom `subskills://` scheme, not universal links. Revisit only if `applinks:` is ever added. |
| everything else | No | Nothing in the config or code touches them. |

Do not tick extras "just in case": several add entitlements that raise review
questions, and a few (HealthKit, CarPlay) require a written justification.

### Two *identifiers*, but only ONE App Store Connect app

"App ID" means two different things on Apple's site, and confusing them is easy:

| Thing | Where it lives | How many we need |
|---|---|---|
| **Identifier** (bundle ID registration) | developer.apple.com → Certificates, Identifiers & Profiles → Identifiers | **two** |
| **App record** (the listing) | App Store Connect → Apps | **one** |

There is exactly **one app** — `xyz.subskills.app`, ASC App ID `6810049311`. One
listing, one price, one review, one `ascAppId`.

The second identifier exists only so the share-extension target can be
code-signed. The extension ships **inside** the main app's binary; it is never a
separate App Store Connect app, never has its own listing, and users never see
it as a separate app.

The share extension is a separate build target with its own identifier
(`withShareTargets.js:288`), and it is easy to miss because the app builds fine
locally without it registered:

| Identifier (NOT an App Store Connect app) | Capabilities |
|---|---|
| `xyz.subskills.app` | Sign in with Apple |
| `xyz.subskills.app.share` | **none** — signing only |

`eas build --platform ios` registers both and enables the capability itself,
which is the lower-effort and less error-prone path. Registering by hand is only
worth it if the records must exist before the first build.

### Identifiers, and which of them are secret

| | Value | Safe to commit? |
|---|---|---|
| Apple Team ID | `T3J6K9GV2B` — already in `eas.json` | Yes — it appears in every provisioning profile. |
| Bundle ID | `xyz.subskills.app` | Yes — user-visible. |
| ASC App ID (`ascAppId`) | `6810049311` — created 2026-09-09, already in `eas.json` | Yes — it is in your public App Store URL. |
| Apple ID (`appleId`) | the account email you enrolled with | **No.** This repo is public; an Apple ID email is half of an account-takeover attempt. Use the `EXPO_APPLE_ID` env var, or let `eas submit` prompt. |

None of these are needed for `eas build --platform ios` — EAS handles
certificates and profiles itself. They are only for `eas submit`.

## Runbook A — Android production AAB → Play

Preview APKs (what we sideload) are **not** what Play accepts. Play requires an **AAB**; it generates per-device APKs from it. The `production` profile builds an AAB (`buildType: "app-bundle"`, `autoIncrement: true`) in *release* configuration — R8 minification, resource shrinking, Play App Signing. Genuinely different from the preview APK, so it must be smoke-tested even though the APK works. An AAB cannot be sideloaded, so building it and closed testing are one workflow.

```bash
cd apps/mobile && npx eas-cli build --platform android --profile production
```
Then Play Console → Testing → **Closed testing** → Create release → upload the `.aab` → add testers → share the opt-in link. You can keep pushing new releases to this track during the 14 days; it does not reset the clock.
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

> Researched and adversarially fact-checked 2026-08-15 against Google's own policy pages.
> Legend: **[V]** verbatim-confirmed on a Google page · **[D]** documented, paraphrased ·
> **[I]** inference, not stated by Google · **[U]** unverified.
> **Every item below is mandatory before a CLOSED TESTING release rolls out**, not just production —
> [V] *"All developers that have an app published on Google Play must complete the Data safety form,
> including apps on closed, open, or production testing tracks."* (Internal testing is exempt; that
> is one more reason Internal is the wrong track.)

### Data safety — full answer sheet

**Overview questions**

| Question | Answer | Basis |
|---|---|---|
| Does your app collect or share any of the required user data types? | **Yes** | optional account, server-side state |
| Is all user data encrypted in transit? | **Yes** | `usesCleartextTraffic=false`, iOS `NSAllowsArbitraryLoads=false`, all Supabase traffic HTTPS |
| Can users request that their data is deleted? | **Yes** | in-app + `https://subskills.xyz/account/delete` (reachable signed out) |
| Independently validated against a global security standard (MASA)? | **No** | no MASVS lab audit performed |

**Data types — declare COLLECTED, none SHARED.** Supabase is a processor, and Google's definition
excludes transfers to *"service providers"* from "sharing" [V]. All collected types are **Optional**:
browsing the catalogue collects none of them, and the first save / watched / vote / suggest action
creates a Supabase anonymous Auth user. Adding email, Google or Apple later upgrades that same user.
Purposes: **App functionality** (+ Account management where relevant). None for analytics,
advertising, or personalisation.

| Data type | Collected | Notes |
|---|---|---|
| Personal info → **Name** | **YES** | OAuth `full_name` → `contributor_profiles.display_name`, world-readable, slugified into a public URL after account upgrade |
| Personal info → **Email address** | **YES** | magic-link + OAuth email in `auth.users` after account upgrade |
| Personal info → **User IDs** | **YES** | Supabase `auth.uid()`; anonymous users get one before email/social upgrade, and contributor profiles also expose a public `slug` |
| App activity → **Other user-generated content** | **YES** | [V] *"user bios, notes, or open-ended responses"* — matches `public_note`, `bio`, submitted URL |
| App activity → **Other actions** | **YES** | [V] *"gameplay, likes, and dialog options"* — saved / watched / votes |
| App activity → **App interactions** | **No** | [V] definition targets *"page visits, taps"*; zero passive telemetry, no analytics SDK |
| App activity → **In-app search history** | **No** | search is a local `useMemo` filter over a cached array — **verified, no server search** |
| Health and fitness → **Fitness info** | **No** | judgement call, defensible — we store *which tutorial was opened*, never a workout, rep, distance or biometric. Keep consistent with the Health declaration below. |
| Web browsing → **Web browsing history** | **No** | ⚠️ the weakest "No" on this sheet — we store which of *our own* catalogue pages were opened, not browsing across the web. Defensible, not airtight. |
| Location → Approximate / Precise | **No** | IPs are received but never resolved to location |
| Device or other IDs | **No** | no ad ID, no IMEI/MAC/Widevine/Firebase-installation ID |
| App info → Crash logs / Diagnostics / Other | **No** | no Sentry/Crashlytics/Bugsnag |
| Financial info · Messages · Photos/videos · Audio · Files · Calendar · Contacts · Installed apps · Address · Phone · Race · Beliefs · Sexual orientation | **No** | no permission, no code path |

### Health declaration — REQUIRED, and previously missing from this doc

[V] *"Even developers with apps that do not offer any health features must complete this form and
certify that no health features are offered through the app."* It is required on closed, open and
production tracks. Only *system services and private apps* are exempt.

**Answer: select three Health-and-fitness features. ⚠️ CORRECTED 2026-08-17 — an earlier draft of
this doc said "My app doesn't provide any health features." That was wrong.** It reasoned from the
data we *collect* (no biometrics) instead of the features we *provide*. The live taxonomy settles it:

| Checkbox | Answer | Evidence in the catalogue |
|---|---|---|
| Activity and fitness | **✓** | The entire product; plus `beginner-lifting-program`, `hypertrophy-programming`, `training-split-basics`, and the beginner→advanced Learning Path |
| Nutrition and weight management | **✓** | `fat-loss-nutrition` (gym-men **and** gym-women), `bulking-nutrition`, `nutrition-for-strength`, `creatine` |
| Stress management, relaxation, mental acuity | **✓** | `restorative-yoga`, `yin-yoga`, `pranayama-breathing` — restorative and yin yoga are relaxation practices by definition |
| Period tracking · Sleep management | ✗ | No tracking of either. `cycle-aware-training` is *training guidance*, not cycle tracking. |
| Every **Medical** box | ✗ | Nothing manages a diagnosed condition. |

**Health-adjacent sub-skills to be aware of**, because a reviewer may find them: `yoga-for-back-pain`
(closest to a health claim), `lifting-while-pregnant`, `postpartum-core`, `pelvic-floor-aware-lifting`,
`cycle-aware-training`. None makes this a Medical app — they are general wellness content, not
condition management — but know they exist before being asked.

**Consequence: the Health apps policy now applies.** It prohibits unsubstantiated health claims. The
catalogue is third-party YouTube video we do not control, and `creatine` / `fat-loss-nutrition` /
`yoga-for-back-pain` are exactly where creators tend to make claims. Answer the follow-up screens
about *this app* — a curated index that hosts no video and makes no claims of its own.

**This does NOT contradict `Fitness info = No` on Data safety.** Different questions: this form asks
whether the app *provides* health features (yes — instructional content); Data safety asks whether it
*collects* health data (no — we store which tutorial was opened, never a rep, distance, weight or
biometric). Keep both answers, and keep the distinction crisp.

### The other App content items

| Item | Answer | Notes |
|---|---|---|
| **Sign in details** (formerly App access) | **All functionality available without special access** | Browsing needs no account; save / watched / vote / suggest lazily create an anonymous account with no reviewer credentials needed. Email, Google and Apple are optional upgrades for keeping the library across devices. Say exactly that in the notes box. |
| **Target audience** | **13+** | Prerequisites: ads, app access and privacy policy must be answered first. [V] 13-15 **and** 16-17 *"may be considered to include children in some locales"*. Any under-13 band triggers the Families policy. |
| **Ads** | **No ads** | No ad SDK in `apps/mobile/package.json`. Google's definition is about ads *your app displays*; YouTube showing ads on its own site after a link-out is not your app containing ads. |
| **Government apps** | **No** | |
| **Financial features** | **My app doesn't provide any financial features** | no billing library |
| **Content ratings** | see below | |
| **News app / COVID-19** | retired / folded into other policies | COVID-19 no longer a separate item |

### Content rating (IARC) — the actual questionnaire, answered

Category **Reference, News, or Educational**. Expect the lowest band (ESRB Everyone / PEGI 3) —
nothing in the catalogue is violent, sexual, or substance-related.

Answers below are against the live questionnaire text as served on 2026-08-17. ⚠️ marks the three
that are judgement calls rather than facts.

**Downloaded App**

| Question | Answer | Why |
|---|---|---|
| Ratings-relevant content (sex, violence, language) shipped in the app package? | **No** | The APK/AAB carries UI assets and code only. Every tutorial is fetched at runtime. |

**User Content Sharing**

| Question | Answer | Why |
|---|---|---|
| Natively allow users to interact or exchange content through voice, text, images or audio? | ⚠️ **Yes** | Judgement call. There is no chat, no DM and no reply thread — but a submitted link carries an optional **public note**, and contributor profiles carry a **public bio and display name**, both of which are text visible to other users. Under-declaring user interaction is the single most-audited answer in this questionnaire, and answering Yes then describing the safeguards produces a better outcome than answering No and being contradicted by the app. |
| Is shared, user-generated content the **primary** source of content? | **No** | The catalogue is agent-collected and LLM-scored; user submissions are a small minority of ~3,100 published videos. |
| Permit public sharing of nudity? | **No** | |
| Permit public sharing of real-world graphic violence outside a newsworthy context? | **No** | Boxing tutorials are sports instruction, not depicted real-world violence. |
| Ability to **block** users or user-generated content? | **No** | Factual — no block feature exists. Do not claim otherwise. |
| Ability to **report** users or user-generated content? | ⚠️ **Yes** | Weakest answer on the sheet. The route exists — Account → **Support** (`apps/mobile/app/(tabs)/account/index.tsx:17`) opens `/support`, whose stated purpose includes *"Reports about inaccurate, unsafe, duplicated, broken, or off-topic"* content. But it is a generic support link, not a per-item "Report this" control. See **the two gaps** below. |
| Chat moderation? | **No** | Factual — there is no chat to moderate. Content moderation is a different thing and is covered by the question above. |
| Can interactions be limited to invited friends only? | **No** | No social graph. |

**Online Content**

| Question | Answer | Why |
|---|---|---|
| Features or promotes content not part of the initial download? | **Yes** | Unambiguous — this is the whole product. Same class as the Netflix/Spotify/Amazon examples in the question. Answering No here would be plainly false. |

**Content categories** — all **No**

| Question | Answer | Why |
|---|---|---|
| Violent material? | **No** | Boxing/martial-technique instruction is sport, not violent content. |
| Sexual material or nudity? | **No** | |
| Potentially offensive language? | **No** | Curated instructional videos; the coach gate scores teaching quality and excludes weak content. |
| References to or depictions of illegal or recreational drugs? | **No** | |
| Focus on promoting or selling age-restricted products or activities? | **No** | Nothing is sold. |

**Miscellaneous**

| Question | Answer | Why |
|---|---|---|
| Shares the user's current and precise physical location with other users? | **No** | No location permission, no location code path. |
| Allows users to purchase digital goods? | **No** | No billing library. |
| Cash rewards, gift cards, play-to-earn, crypto, or transferable digital assets (NFTs)? | **No** | |
| Is the app a web browser or search engine? | ⚠️ **No** | Judgement call worth stating deliberately. Search is a local filter over the loaded catalogue, not a web search engine. `M112` adds an in-app browser (SFSafariViewController / Chrome Custom Tabs), but it opens only curated catalogue URLs — it is not a general-purpose browser with an address bar. Answering Yes would push the rating up hard and would misdescribe the app. |
| Is the app primarily a news or educational product? | **Yes** | Educational. Consistent with the Education store category and the Reference/News/Educational questionnaire category. |

### The UGC moderation story — verified, and it is stronger than it looks

**The listing claim "Suggestions are reviewed, not auto-published" is TRUE.** Verified in code
2026-08-17. An earlier draft of this section claimed it was false; that was wrong and is corrected here.

```
submit-suggestion  → auto-applies → creates link + link_skill_relations
                                     published = false, curator_reviews = 0
coach routine      → scores relevance + teaching quality
publish gate       → curator_reviews >= 2 AND combined_score >= 1.3 → published = true
public reads       → .eq("published", true)     ← 4 call sites in apps/web/lib/data.ts
```

`refresh_relation_publish_gate_one` ([0026:14](supabase/migrations/0026_publish_gate_single_relation.sql))
requires two curator reviews and a combined score of 1.3. A new submission has zero reviews, so it is
created **unpublished and invisible** until the coach passes it. The optional `public_note` rides on
the same gated relation, so it is invisible on the same terms.

**It also fails closed.** A non-YouTube or transcript-less submission cannot be scored, so it never
reaches two reviews and therefore never publishes. The submissions least likely to be good are the
ones most certain to stay invisible.

**What `M103` actually is:** submissions bypass the **human** moderation queue — no moderator ever
sees them — and they are AI-reviewed only. That is worth fixing for oversight, and `M104` (human
submissions sit last in a FIFO coach queue, so they can wait days) is worth fixing for latency. But
neither is a store blocker and neither makes any listing claim false. Do not delete the claim.

This is the answer to give a reviewer weighing UGC risk, and the reviewer notes already say it:
user-suggested links *"enter the same review pipeline as collected content and appear only after
passing it."* That is accurate today.

### ⚠️ The one real gap

**No per-item report control.** Google's UGC policy requires a reporting mechanism for apps carrying
user-generated content. A generic Account → Support link is reachable but weak. Adding a "Report this"
affordance on a resource card and on a contributor profile would turn the ⚠️ Yes above into an
unambiguous one, and it is small work. Tracked as `MI53`.

⚠️ **The Interactive Elements answers are [I], not [D].** Neither Google nor IARC publishes the exact
labelled list, so these are reasoned, not quoted:

- **Users interact or exchange content with other users → YES.** Public notes and submitted links are
  visible to other users. There is no user-to-user messaging, but do not under-declare this — it is
  the single answer most likely to be audited.
- Shares personal info with third parties → No · Shares location → No · Digital purchases → No.
- **Unrestricted internet access → judgement.** Tapping a tutorial opens a third-party URL, and
  `M112` moves this to an in-app browser (SFSafariViewController / Chrome Custom Tabs). An in-app
  browser that can only reach curated YouTube URLs is not a general-purpose browser, but this is the
  answer a reviewer could most reasonably read the other way.

### User Generated Content policy — obligation, not a form

[V] *"User-generated content (UGC) is content that users contribute to an app, and which is visible
to or accessible by at least a subset of the app's users."* Subskills has UGC (submitted links,
public notes, public contributor profiles), so the UGC policy applies: it requires a reporting
mechanism, moderation, and removal of violating content. The report route exists at
`https://subskills.xyz/support` — make sure the reviewer notes point at it, since this is a live
rejection risk that no form on the App content page asks about.

### ⚠️ Permissions: this doc was wrong

The Android section previously claimed *"Permissions: `INTERNET`, `VIBRATE` only"*. The **shipped
production AAB** actually declares five:

```
ACCESS_NETWORK_STATE · DUMP · INTERNET · SYSTEM_ALERT_WINDOW · VIBRATE
```

`SYSTEM_ALERT_WINDOW` (display over other apps) and `DUMP` are React Native dev-support leftovers.
Google cross-references declarations against the binary, and a catalogue app requesting draw-over-
other-apps invites scrutiny it does not need. Fix before submitting: `expo prebuild --clean`, confirm
the production AAB no longer carries them, and re-dump the permissions from the **release** artifact
rather than the gitignored `android/` directory. Tracked as `M114`.

### Store-listing claim consistency

The listing says *"No third-party trackers."* Cloudflare Web Analytics runs on the **website**, which
neither store form covers — but scope the sentence to *"in the app"* so the two can never be read as
contradicting each other. See `M113`.

## Verified: Android (Pixel 6a, 2026-07-29/31)

Driven on-device, not inspected: cold launch opens **Discover**; catalog and category → skill navigation; card layout (170×96 thumbnails, level badge, no rating pill); link-out to YouTube; tab switching; **save + watched + vote write to the DB and read back in Library**; Account screen with deletion and Privacy/Terms/Support links; `Permissions: No permissions requested`; red launcher icon.

## Verified: iOS Simulator (iPhone 17 Pro, 2026-07-31)

First run on iOS ever. Builds and launches with no crash; onboarding with correct safe-area around the Dynamic Island; **lands on Discover**; catalog, skill pages, level badges, action icons; historical native auth-gate alert (superseded 2026-08-29 by lazy anonymous accounts); Library and Suggest screens; **Sign in with Apple renders via Apple's native `AppleAuthenticationButton`** (CONTINUE/BLACK — HIG-compliant). No layout regressions.
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
- **Web (no existing account):** form renders the full catalogue; submit lazily creates a Supabase
  anonymous account, sends a real authenticated JWT to `submit-suggestion`, and queues the link for
  coach review. ✅
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
