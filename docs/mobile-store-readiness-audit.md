# Mobile Store Readiness Audit

Date: 2026-06-23

Scope: Expo mobile app in `apps/mobile`, covering both iOS App Store and Google Play publishing readiness.

## Verdict

The mobile app is not ready for App Store or Google Play submission yet.

The app typechecks, tests, and exports JS bundles for both iOS and Android, which is a good technical baseline. The remaining risks are mostly store-review and native-release readiness issues: account deletion, privacy/support access, production environment configuration, cleartext/ATS settings, Expo dependency health, and icon/permission cleanup.

## Hard Blockers

### 1. Missing In-App Account Deletion

The app supports account creation/sign-in through email magic links and Google sign-in, but the signed-in Account screen only exposes public profile and sign out actions.

Relevant files:

- `apps/mobile/app/(tabs)/(account)/index.tsx`
- `apps/mobile/lib/auth.tsx`

Why this matters:

- Apple requires apps that support account creation to allow users to initiate account deletion inside the app.
- Google Play requires apps that allow account creation to provide an in-app account deletion path and a web deletion resource.

Required fix:

- Add a visible Account deletion entry in the Account tab.
- Add a real web deletion page or form for users who have uninstalled the app.
- Update the privacy policy to describe the deletion flow and retention behavior.

Sources:

- Apple: https://developer.apple.com/support/offering-account-deletion-in-your-app/
- Google Play: https://support.google.com/googleplay/android-developer/answer/13327111

### 2. Privacy Policy Is Not Easily Accessible Inside Mobile App

A web privacy page exists, but the mobile app does not expose an obvious Privacy, Terms, or Support link in the Account tab.

Relevant files:

- `apps/web/app/privacy/page.tsx`
- `apps/mobile/app/(tabs)/(account)/index.tsx`

Why this matters:

- Apple requires a privacy policy link in App Store Connect metadata and inside the app in an easily accessible manner.
- Google Play requires a privacy policy to complete Data Safety disclosures.

Required fix:

- Add Privacy Policy and Support links to the mobile Account tab.
- Prefer using the production web URL, not the current localhost fallback.

Source:

- Apple App Review Guidelines, Privacy: https://developer.apple.com/app-store/review/guidelines/

### 3. Production EAS Profile Does Not Declare Required Mobile Environment Variables

The preview EAS profile defines Supabase env vars, but the production profile does not.

Relevant file:

- `apps/mobile/eas.json`

Observed behavior:

- `preview.env` includes `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY`.
- `production` only has `autoIncrement` and Android build type.
- `getSupabase()` returns `null` if these values are absent.

Impact:

- Auth, suggestions, account-backed library, votes, saved resources, watched state, thumbnails from Supabase storage, and other Supabase-backed features may silently fail in production builds if EAS secrets are not configured elsewhere.

Required fix:

- Add production EAS env vars or confirm equivalent EAS project secrets are configured.
- Add `EXPO_PUBLIC_WEB_BASE_URL` for production profile links.

### 4. iOS ATS And Android Cleartext Configuration Are Too Permissive

Expo config introspection showed:

- iOS `NSAllowsArbitraryLoads: true`
- Android `android:usesCleartextTraffic="true"`

Relevant file:

- `apps/mobile/app.json`

Impact:

- This weakens transport security posture and can trigger reviewer questions.
- It also complicates privacy/security disclosures.

Required fix:

- Remove `usesCleartextTraffic: true` from production config.
- Ensure generated iOS config does not allow arbitrary HTTP loads.
- Keep any local development exceptions out of production builds.

### 5. `expo-doctor` Fails Release-Readiness Checks

Command run:

```bash
npx expo-doctor
```

Result: 14 of 18 checks passed; 4 failed.

Failures:

- Metro config does not include all Expo default `watchFolders`.
- Missing direct peer dependency: `expo-constants`.
- Duplicate native module dependencies:
  - `react`
  - `react-native-svg`
  - `expo-constants`
- SDK patch mismatches:
  - expected `expo ~54.0.35`, found `54.0.34`
  - expected `expo-router ~6.0.24`, found `6.0.23`

Relevant files:

- `apps/mobile/package.json`
- `apps/mobile/metro.config.js`
- `package-lock.json`

Impact:

- Native builds may fail or behave differently than local Metro export.
- Duplicate React/native modules can produce runtime hook errors or native module conflicts.

Required fix:

- Install missing direct dependency with Expo-compatible version.
- Update Expo and Expo Router patch versions.
- Deduplicate workspace/mobile dependencies.
- Re-run `npx expo-doctor` until clean or document any intentional ignored checks.

## Likely Review Risks

### 1. iOS App Icon Contains Transparency

Assets are valid 1024x1024 PNGs, but the iOS app icon has alpha.

Observed:

- `apps/mobile/assets/icon.png`: alpha range `0-255`, `57,240` non-opaque pixels.
- `apps/mobile/assets/adaptive-icon.png`: alpha range `0-255`, `558,684` non-opaque pixels.
- `apps/mobile/assets/splash-icon.png`: alpha range `0-255`, `752,362` non-opaque pixels.

Required fix:

- Flatten the iOS app icon to an opaque RGB PNG.
- Android adaptive icon foreground can keep transparency if the adaptive icon is designed for it.

### 2. Android Manifest Includes Storage Permissions

Expo introspection showed Android storage permissions:

- `READ_EXTERNAL_STORAGE`
- `WRITE_EXTERNAL_STORAGE`

The app does not appear to need direct media/file storage access.

Impact:

- Google Play Data Safety asks developers to review declared permissions and APIs.
- Unnecessary permissions increase review and privacy disclosure risk.

Required fix:

- Configure Android permissions explicitly in `app.json`.
- Keep only permissions the app actually needs, likely `INTERNET` plus any Expo-required minimal permissions.

Source:

- Google Data Safety guidance: https://support.google.com/googleplay/android-developer/answer/10787469

### 3. Data Safety And Privacy Labels Need Careful Disclosure

The app collects or transmits:

- Email address for authentication.
- User ID/session/auth tokens.
- Saved resources.
- Watched state.
- Resource votes.
- Submitted links and public notes.
- Contributor profile data such as display name, slug, accepted suggestions.
- Network requests to Supabase and linked external resources.

Likely not present today:

- Third-party ad SDKs.
- Cross-app tracking.
- Location access.
- Contacts, photos, microphone, camera access.

Required fix:

- Complete Apple privacy nutrition labels and Google Data Safety forms consistently with the actual app behavior.
- Keep the privacy policy aligned with both store disclosures.

### 4. Account Review Access Needs Preparation

Apple asks developers to provide full access to account-based features during review, including demo credentials or a fully featured demo mode.

Required fix:

- Provide a reviewer account, or ensure magic-link/Google auth can be completed by reviewers.
- Keep Supabase/Auth backend enabled during review.
- Add review notes explaining account-backed library, suggestions, and external resource links.

Source:

- Apple App Review “Before You Submit”: https://developer.apple.com/app-store/review/guidelines/

### 5. External Content And User Suggestions Need Review Notes

The app links out to YouTube, TikTok, and other tutorial resources. Users can suggest links and write public notes, which makes moderation and UGC handling relevant.

Current mitigation:

- Suggestions are queued for moderation/coach review.
- Public catalog relations are filtered through active/published flags.

Review risk:

- Apple UGC guidance expects filtering, reporting, blocking, and published contact info when apps host user-generated content.
- This app is lighter than a social network, but user-submitted public notes and links still deserve clear moderation explanation in review notes.

Required fix:

- Add a report/problem link for resources, or document why the current moderation queue is sufficient.
- Ensure support/contact info is visible.
- Explain moderation in App Review notes.

Source:

- Apple UGC guideline: https://developer.apple.com/app-store/review/guidelines/

### 6. Google Target API Must Be Verified From The Final AAB

Google Play requires new apps and updates to target Android 15/API 35 or higher as of August 31, 2025.

Required fix:

- Build the production AAB.
- Verify the generated `targetSdkVersion`.
- If needed, configure Expo/Android build properties to meet the current Play requirement.

Source:

- Google target API requirement: https://developer.android.com/google/play/requirements/target-sdk

## Checks That Passed

### Typecheck

```bash
npm run typecheck --workspace @skillsaggregator/mobile
```

Passed.

### Unit Tests

```bash
npm run test --workspace @skillsaggregator/mobile
```

Passed.

### Expo Dependency Check

```bash
npx expo install --check
```

Passed in offline mode using the local Expo dependency map. This is less authoritative than `expo-doctor`, which still failed release checks.

### iOS JS Bundle Export

```bash
npx expo export --platform ios --output-dir /private/tmp/subskills-export-ios
```

Passed.

### Android JS Bundle Export

```bash
npx expo export --platform android --output-dir /private/tmp/subskills-export-android
```

Passed.

### Asset Dimensions

The mobile image assets are 1024x1024 PNGs:

- `apps/mobile/assets/icon.png`
- `apps/mobile/assets/adaptive-icon.png`
- `apps/mobile/assets/splash-icon.png`

## Recommended Fix Order

1. Add account deletion flow.
2. Add mobile Privacy, Support, and deletion web links.
3. Fix production EAS env vars and remove localhost fallbacks from release behavior.
4. Remove cleartext/ATS arbitrary loads from production config.
5. Fix `expo-doctor` failures.
6. Flatten iOS app icon alpha.
7. Remove unnecessary Android storage permissions.
8. Prepare store privacy disclosures and review notes.
9. Run a real EAS production build for iOS and Android.
10. Inspect generated IPA/AAB manifests and permissions.
11. Smoke test on real iOS and Android devices.
12. Submit first to TestFlight/internal testing before public review.

## Final Pre-Submit Checklist

- [ ] Account deletion is visible inside Account settings.
- [ ] Web deletion resource is live and linked from mobile/store metadata.
- [ ] Privacy policy is linked inside mobile app.
- [ ] Support/contact link is visible inside mobile app.
- [ ] Production Supabase env vars are configured for EAS.
- [ ] `EXPO_PUBLIC_WEB_BASE_URL` points to production web app.
- [ ] iOS ATS arbitrary loads are disabled.
- [ ] Android cleartext traffic is disabled.
- [ ] Android storage permissions are removed unless truly needed.
- [ ] `npx expo-doctor` passes or intentional exceptions are documented.
- [ ] iOS app icon is opaque.
- [ ] Google Play Data Safety is completed accurately.
- [ ] Apple privacy labels are completed accurately.
- [ ] Reviewer account or demo access is prepared.
- [ ] Review notes explain moderation, external links, and account-backed features.
- [ ] Production iOS build has been installed and smoke tested.
- [ ] Production Android build has been installed and smoke tested.
- [ ] Final AAB target SDK meets Google Play current requirement.

