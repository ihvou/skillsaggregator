# Mobile Store Submission Checklist

Last updated: 2026-07-31

**Work from the two checklists below.** Everything under "Reference" is background — read it only when a checklist item needs detail.

`docs/mobile-store-readiness-audit.md` is the historical audit (2026-06-23) that produced tasks M89–M96. Its blockers are resolved; it is context, not a to-do list.

Legend: `[x]` done · `[ ]` not started · `[~]` partly done

---

# ANDROID — do these in order

**Code / build**
- [x] 1. Store-readiness code landed (M89–M96: account deletion, privacy links, prod env, ATS/cleartext, permissions, icon)
- [x] 2. Preview APK built and exercised on a real device (Pixel 6a) — see *Verified: Android*
- [ ] 3. **Create a Google Play Developer account** — $25 once, ~48h ID verification. *Gate for everything below.*
- [ ] 4. **Build the production AAB** — `npx eas-cli build --platform android --profile production` (see *Runbook A*; an AAB is NOT the preview APK)
- [ ] 5. Verify `targetSdkVersion >= 35` in the generated AAB (Play requirement since Aug 2025)

**Play Console setup**
- [ ] 6. Create the app in Play Console (name, language, free/paid, declarations)
- [ ] 7. Store listing assets: short + full description, screenshots (phone, required), feature graphic, app icon
- [ ] 8. App content declarations: privacy policy URL, ads, content rating questionnaire, target audience
- [ ] 9. **Data Safety form** — see *Privacy disclosures* for exactly what to declare

**Test then ship**
- [ ] 10. Upload the AAB to **Internal testing**, add testers (email list, max 100), share the opt-in link
- [ ] 11. **Smoke test the release build installed from Play** on a real device — first time the release (minified) build is ever exercised
- [ ] 12. Promote to production (or closed/open testing first)

---

# iOS — do these in order

**Local (free — no Apple account needed)**
- [x] 1. Xcode + CocoaPods installed; Simulator working
- [x] 2. Simulator build + full UI pass, no bugs found — see *Verified: iOS*
- [x] 3. Signed in on the Simulator; authenticated write path (save / watched / vote) verified **and persists across a full app restart** — server-side, not local

**Apple account setup**
- [ ] 4. **Enrol in the Apple Developer Program** — $99/yr. *Gate for everything below.*
- [ ] 5. Create App ID `com.skillsaggregator.mobile` and enable the **Sign in with Apple** capability
- [ ] 6. Enable the Apple provider in Supabase Auth (client ID = `com.skillsaggregator.mobile`; native id_token flow, no client secret)
- [ ] 7. Test Sign in with Apple end-to-end on a real device

**Build and ship**
- [ ] 8. `npx eas-cli build --platform ios --profile production` (EAS manages certificates/profiles)
- [ ] 9. Verify the generated `Info.plist` does not allow arbitrary ATS loads
- [ ] 10. Upload to App Store Connect (`eas submit --platform ios`)
- [ ] 11. Store listing: description, screenshots (per required device sizes), **Apple privacy labels**
- [ ] 12. Reviewer notes + demo access (see *Reviewer notes draft*)
- [ ] 13. **TestFlight** build, smoke test on a real iPhone
- [ ] 14. Submit for App Store review

---

# REFERENCE

## Status at a glance

| Area | State |
|---|---|
| Android preview APK | ✅ built, exercised on a real Pixel 6a |
| Android production AAB | ❌ never built or tested |
| iOS Simulator | ✅ builds, runs, full UI pass — no bugs found |
| iOS real device / TestFlight | ❌ needs the Apple Developer account |
| Sign in with Apple | ❌ UI ready; backend needs the paid account |
| Store paperwork | ❌ not started |

## Accounts and costs

| Need | Cost | Required for |
|---|---|---|
| Google Play Developer account | **$25 once** (~48h verification) | Any Play release, *including internal testing* |
| Apple Developer Program | **$99/yr** | Real iPhone, TestFlight, App Store, **and Sign in with Apple** |
| Xcode | free | iOS Simulator development — **no Apple account needed** |
| EAS (Expo) | free tier works | Cloud builds (~4h queue on free tier) |

⚠️ **Do not read "can't build for iOS" as "must pay Apple".** `expo run:ios` fails on Xcode 26 with `CommandError: No code signing certificates are available to use.`, which looks like it demands the $99 account. It doesn't: Expo misidentifies the *simulator* as a physical device (`Unexpected devicectl JSON version output from devicectl`), and simulator builds need no signing. Build with `xcodebuild` directly (Runbook B) — zero certificates required.

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
xcrun simctl launch booted com.skillsaggregator.mobile
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

## Bugs found ONLY by running the app

None of these were caught by typecheck, lint or CI — the argument for staged rollout:
1. **Launch crash** — duplicate `react-native-safe-area-context` registered `RNCSafeAreaProvider` twice.
2. **Metro bundle failure** — a stale root `expo-router` copy had been satisfying `babel-preset-expo`'s plugin check by accident.
3. **All user writes failed** — `set_user_bookmark/watched/vote` raised `column reference "link_skill_relation_id" is ambiguous`; save/watch/vote were broken on web *and* mobile in production.
4. **Wrong launch tab** — route groups all resolved to `/`, so the app opened on Account.

## Local testing setup

- **Android**: JDK 17 (`brew install openjdk@17`) + Android SDK 36 in `~/Library/Android/sdk` (cmdline-tools from Google, no sudo). `JAVA_HOME=/opt/homebrew/opt/openjdk@17`, `ANDROID_HOME=~/Library/Android/sdk`. First `expo run:android` ≈ 6 min.
- Debug builds set `applicationIdSuffix ".dev"` in `android/app/build.gradle` so they install **alongside** the EAS-signed app instead of failing `INSTALL_FAILED_UPDATE_INCOMPATIBLE`. (`android/` is gitignored and regenerated by prebuild — re-apply after a fresh prebuild.)
- **Device**: wireless adb (`adb pair <ip:port> <code>` then `adb connect`). The phone's 30s screen timeout kills automated runs — enable Developer options → **Stay awake**.
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

## Reviewer notes draft

Subskills is a learning-resource discovery app. Signed-in users can save resources, mark resources watched, vote on published resources, and suggest links. Suggested resources are not published directly; they go through the same review/moderation pipeline as collected content. Users can report catalog problems through the Support page at `https://subskills.xyz/support`.
