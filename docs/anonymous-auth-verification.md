# Anonymous Auth Verification

Checked: 2026-08-29

## Result

Supabase anonymous sign-in is compatible with the closed-testing identity model:

- `signInAnonymously()` creates a real Supabase Auth user and session.
- The session uses the `authenticated` Postgres role, with an `is_anonymous` JWT/user claim.
- Converting that anonymous user to a permanent user is done by linking an identity to the same user:
  - email/phone: `updateUser({ email })`
  - OAuth: `linkIdentity({ provider })`
- Supabase states that, after conversion, the user id remains the same, so rows keyed by
  `auth.uid()` remain attached to the account.

Sources checked:

- https://supabase.com/docs/guides/auth/auth-anonymous
- https://supabase.com/blog/anonymous-sign-ins
- Installed SDK source: `node_modules/@supabase/auth-js/src/GoTrueClient.ts`

## Implementation Notes

The app now creates anonymous users lazily, on first write action, not on first launch. This means
`auth.users where is_anonymous is true` is a first-action signal, not a store-install or first-open
signal.

Hosted Supabase still needs the matching dashboard settings before release:

- Enable anonymous sign-ins.
- Enable manual identity linking.

Local development mirrors this in `supabase/config.toml`.

---

## Empirically verified against hosted — 2026-08-29

The section above was written from Supabase's documentation. This section is an actual test run
against the production project after anonymous sign-ins and manual linking were enabled.

| step | result |
|---|---|
| `POST /auth/v1/signup {}` | anonymous user created, `is_anonymous = true`, role `authenticated` |
| `set_user_bookmark` as that anonymous user | **OK** — RLS accepts the anonymous JWT, one row written |
| `PUT /auth/v1/user {email}` | **OK** — but the email lands in `new_email` (pending), and the user stays `is_anonymous = true` |
| after the email change is confirmed | **id unchanged**, `is_anonymous = false`, `identities = ['email']`, the bookmark **still attached to the same id** |

**The linchpin assumption holds: the user id survives the upgrade and data stays attached.**

Two things the documentation did not make obvious, both of which affect the UI:

1. **The upgrade is not instant.** `updateUser({ email })` only sets `new_email`; the account
   remains anonymous until the confirmation link is clicked. So "add an email to keep your list"
   must show a pending state and must not claim the account is saved until confirmation lands.
2. **The final confirmation step in this test was completed admin-side**, because
   `generate_link(type=email_change_new)` cannot look up a user who has no current email
   (`user_not_found`). The user-facing path — clicking the emailed link — was not exercised end
   to end and should be smoke-tested once the UI exists.

## Collision: the email already has an account

Tested directly. An anonymous user calling `updateUser({ email })` with an address that already
belongs to an account gets:

```
422 email_exists — "A user with this email address has already been registered"
```

This is a **real user journey**, not an edge case: someone signs in on the web, later installs the
app, uses it anonymously long enough to build a Watch later list, then tries to add their email —
and hits this. Their anonymous data is stranded on the anonymous account with no path to the
existing one.

`M120` must decide the behaviour:

- **(a)** catch `email_exists`, offer "sign in to that account instead", and say plainly that the
  items collected on this device will not carry over; or
- **(b)** merge — sign in to the existing account, then move the anonymous user's rows across and
  delete the anonymous user; or
- **(c)** at minimum, do not surface the raw Supabase error.

(b) is the only option that does not lose data, and it is the one users will expect.

## Cleanup

The four test users created for this run (three anonymous, one upgraded) were deleted afterwards.
Only the real account remains.
