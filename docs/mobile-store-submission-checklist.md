# Mobile Store Submission Checklist

Date: 2026-06-25

This checklist tracks the release-readiness items that cannot be fully proven by code changes alone. It complements `docs/mobile-store-readiness-audit.md`.

## Implemented In Repo

- Sign in with Apple is enabled for iOS through `expo-apple-authentication`, `ios.usesAppleSignIn`, and the native Apple button in the mobile Account screen.
- The mobile Account screen exposes production Privacy, Terms, Support, and web account-deletion links.
- Account deletion is available in-app and on the web through `/account/delete`; the privileged deletion work happens in the web API route with the Supabase service role.
- The production EAS profile includes the public Supabase URL, publishable anon key, and `EXPO_PUBLIC_WEB_BASE_URL=https://subskills.xyz`.
- Android cleartext traffic is disabled and Android permissions are explicitly allowlisted to `INTERNET` and `VIBRATE`.
- The iOS app icon at `apps/mobile/assets/icon.png` is an opaque RGB PNG.
- The support page documents how to report inaccurate, unsafe, duplicated, broken, or off-topic catalog resources.

## Required External Setup Before Submission

1. Enable the Apple provider in Supabase Auth and Apple Developer Console.
   - App/bundle ID: `com.skillsaggregator.mobile`
   - Supabase project: `https://vqxsaabskkkjdljxiyqi.supabase.co`
   - Confirm Apple Sign In capability is enabled for the bundle ID.

2. Confirm Supabase redirect allowlist includes:
   - `skillsaggregator://auth/callback`
   - `https://subskills.xyz/auth/callback`

3. Complete store privacy disclosures.
   - Apple privacy labels and Google Play Data Safety should disclose email/auth identifiers, saved resources, watched state, votes, submitted links/notes, contributor profile data, and network requests to Supabase/external resources.
   - Do not disclose advertising, cross-app tracking, precise location, contacts, photos, microphone, or camera unless new SDKs/features are added.

4. Prepare reviewer access.
   - Provide either a reviewer account or review notes explaining magic-link/Google/Apple sign-in.
   - Keep Supabase Auth and the production web backend enabled during review.

5. Verify production native builds.
   - Build iOS and Android from the `production` EAS profile.
   - Verify Android target SDK is 35 or newer in the generated AAB.
   - Inspect the generated iOS `Info.plist` and confirm App Transport Security does not allow arbitrary loads.
   - Install and smoke test on real iOS and Android devices.

6. Submit through staged channels first.
   - TestFlight for iOS.
   - Google Play internal testing before public review.

## Release Check Results

- `npx expo-doctor`: 17/18 checks pass after adding direct `expo-constants`, `expo-apple-authentication`, and the SDK patch updates.
- Documented exception: the duplicate-dependency check still flags the workspace layout:
  - `react@19.1.0` in `apps/mobile` and `react@19.2.5` at the monorepo root for the web app.
  - `react-native-svg@15.12.1` as the Expo SDK-compatible mobile dependency and `react-native-svg@15.15.4` installed at the root to satisfy `lucide-react-native`.
  - Nested `expo-constants@18.0.13` copies under Expo packages.
- Current mitigation: `apps/mobile/metro.config.js` resolves React and React Native singleton imports to canonical paths during bundling. The release blocker checks fixed by M94 now pass: direct `expo-constants`, SDK patch drift, and default Metro watch folders.
- Confirmed unavoidable (2026-06-26): forcing a single React via root `overrides` (react/react-dom 19.1.0) + `npm dedupe` fails with ERESOLVE — a web dependency resolves React 19.2.x while Expo 54 pins 19.1.0, so the split cannot be flattened without `--legacy-peer-deps`. It is inherent to a web+mobile monorepo, not a lockfile glitch. The metro singleton resolver above is the accepted mitigation (the bundled app loads ONE React instance regardless of the node_modules layout), and the web typechecks on React 19.1.0, so neither app is harmed.
- Follow-up if a clean 18/18 doctor result becomes mandatory: split the mobile app install from the web workspace, or align the monorepo dependency graph so the root does not install web React/native peer copies while running mobile doctor.

## Reviewer Notes Draft

Subskills is a learning-resource discovery app. Signed-in users can save resources, mark resources watched, vote on published resources, and suggest links. Suggested resources are not published directly; they go through the same review/moderation pipeline as collected content. Users can report catalog problems through the Support page at `https://subskills.xyz/support`.
