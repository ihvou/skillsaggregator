# Mobile Release Notes

Last updated: 2026-05-29

## Build Profiles

Run EAS from `apps/mobile`.

```bash
cd apps/mobile
eas build --profile development --platform ios
eas build --profile development --platform android
eas build --profile preview --platform all
eas build --profile production --platform all
eas submit --profile production --platform all
```

Profiles live in `apps/mobile/eas.json`:

- `development`: internal development-client builds, iOS simulator enabled, Android APK.
- `preview`: internal QA builds for real devices, Android APK.
- `production`: store builds with auto-incremented versions, Android AAB.

Production submit configuration is intentionally empty until Apple App Store Connect and Google Play service-account credentials are attached in EAS.

## App Store Listing Draft

Name: Skills Aggregator

Subtitle: Better sport practice, one skill at a time

Promotional text:
Find high-quality drills, lessons, and explainers organized by sport, skill, and level.

Description:
Skills Aggregator helps athletes and coaches build focused practice sessions from curated learning resources. Browse sports, choose a skill, filter by level, and save the best videos and articles for later.

Start with racket sports, gym training, and surfing content, then keep your own offline library of resources you want to revisit. Each resource is grouped around a concrete skill so practice starts with the movement you want to improve, not a search box.

Keywords:
sports, training, coaching, badminton, padel, gym, surfing, drills, practice, skills

Category:
Sports

Support URL:
https://github.com/ihvou/skillsaggregator/issues

Privacy Policy URL:
Production web domain + `/privacy` (route added in `apps/web/app/privacy/page.tsx`)

## Google Play Listing Draft

Short description:
Curated sport drills and lessons by skill, level, and sport.

Full description:
Skills Aggregator organizes sport learning resources around the skills athletes actually practice. Browse by sport, open a skill, filter resources by level, and save useful videos or articles into your Library.

The saved Library stores resource snapshots on device, so previously saved items remain visible after a cold start without network access.

Suggested tags:
Sports, Education, Health and Fitness

Contact email:
TBD

Privacy Policy URL:
Production web domain + `/privacy` (route added in `apps/web/app/privacy/page.tsx`)

## Screenshot Set

Capture the following on iPhone 6.7-inch and Android phone:

- Home screen with category chips and multi-sport intro visible.
- Category resource listing with skill and level chips.
- Skill page with sort and level filters.
- Saved Library populated, then repeated in airplane mode after force close.
- Suggest flow entry point.

## Launch Content Gate

Mobile should use the same focused launch posture as web: only categories and skills with visible resources are presented in discovery surfaces. The mobile data layer already filters discover/category sections to skills with `resource_count > 0`; broader strict-count gating should stay centralized in the shared/web catalog rules once the production threshold is finalized, so native and web do not drift.

## Smoke Checklist

- `npm --workspace apps/mobile run typecheck`
- `npm --workspace apps/mobile run test`
- `eas build --profile preview --platform ios`
- `eas build --profile preview --platform android`
- Install preview builds on one iOS device and one Android device.
- Save at least three resources, force close, enable airplane mode, reopen Library.
- Confirm unsaving removes the resource from Library after refresh.
- Confirm links open externally from Skill and Saved screens.
- Confirm app icon, adaptive icon, and splash render correctly on both platforms.
