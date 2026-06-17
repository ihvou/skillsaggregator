import { Redirect } from "expo-router";

/**
 * Auth deep-link landing for `skillsaggregator://auth/callback?code=...`.
 *
 * Without this static route, expo-router matches the `/auth/callback` path
 * against the dynamic `[category]/[skill]` route (category="auth", skill="callback")
 * and renders an empty "Skill" / "No matches for this filter" screen after sign-in.
 *
 * The OAuth / magic-link code exchange itself is handled by AuthProvider's
 * Linking listener (see lib/auth.tsx); this route just sends the signed-in user
 * to the home tab instead of the broken skill screen.
 */
export default function AuthCallback() {
  return <Redirect href="/" />;
}
