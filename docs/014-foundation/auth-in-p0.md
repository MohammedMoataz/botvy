# Sign-in and password change, added in P0

Foundation phase (P0), `specs/014-foundation`.

The phase spec puts every credential command in P1. Two of them landed here
instead, at your request: "the only one thing I need to seed is the admin
account … and give the admin accessability to change his password."

This file records what that added, what it deliberately did not, and what P1
still owes — so the next phase extends it rather than discovering it.

---

## Why it could not wait

P0 shipped a seeded administrator, a password hasher, a token verifier, and a
boot warning telling the Owner to change the default password at
`POST /api/v1/auth/password`. That endpoint did not exist, and the only token
that could have reached it came from a development script that refuses to run in
production.

So the warning was unactionable, and the account it warned about was reachable
by anyone who read the setup guide. Adding the two endpoints is smaller than
leaving that standing.

## What exists now

### `POST /api/v1/auth/login` — public

```json
{ "email": "imohammedmoataz@gmail.com", "password": "admin" }
```

Returns an access token, the account's id, email and role, and
`mustChangePassword`.

Three properties worth keeping when P1 extends this:

- **One failure message.** A wrong password and an unknown address return the
  same `401` with the same wording. Distinguishing them is an account-existence
  oracle, and this installation's administrator login is written down in
  `SETUP.md`.
- **Constant work either way.** The hash is compared even when no account was
  found, against a throwaway hash. Returning early would make a missing account
  measurably faster than a wrong password, which leaks the same fact through
  timing that the shared message closes off.
- **No length rule on the way in.** A password shorter than today's minimum must
  still be able to sign in, precisely so its owner can reach the endpoint that
  replaces it.

A banned or deleted account is refused, and the log says why while the response
does not.

### `POST /api/v1/auth/password` — a member's own, bearer token required

```json
{ "currentPassword": "admin", "newPassword": "something longer" }
```

- **The current password is required** even though the caller already holds a
  valid token. A stolen access token should not be enough to lock the owner out
  of their own account.
- **Minimum eight characters, enforced on the server.** The client confirms
  twice; a rule only the client applies is not a rule.
- **The new password may not equal the old one**, which is otherwise a silent
  no-op that looks like success.
- `identity.PasswordChanged` is raised by the aggregate and written to
  `identity_outbox` in the same transaction as the new hash, so a crash between
  the two cannot leave the event unsent or the password half-changed.

### `JwtSigner`

The counterpart to `JwtVerifier`, signing exactly the claims that class reads.
They are separate files but one contract; `scripts/dev-token.ts` hand-rolled its
own `jwt.sign` call, which is the drift this exists to prevent.

## What this is not

- **No registration.** P1.
- **No Google sign-in.** P1.
- **No refresh token.** This is the important one. Refresh is database-backed
  with rotation and reuse detection — a table, a family id, and a revocation
  path. Half of that is worse than none, so `login` returns an access token
  only. It expires on `JWT_ACCESS_TTL` (15 minutes by default) and there is
  nothing yet to renew it with: sign in again.
- **No rate limiting on `login`.** The endpoint is public and unthrottled. On a
  LAN or a tunnelled host with one account that is a small exposure, but it is
  real, and it belongs with the hardening pass in `specs/025` rather than
  pretending to be solved here.
- **No account lockout.** Same reasoning.
- **`mustChangePassword` is reported, not enforced.** Refusing to sign in while
  the default password is in use would leave the Owner with no way to reach the
  endpoint that fixes it.

## What P1 inherits

`specs/015-identity-profile` should treat this as the shape to extend, not
rebuild:

- `SignInHandler` gains refresh-token issuance beside the access token.
- The Google path becomes a second handler in the same slice, not a second
  controller.
- `ChangePasswordHandler` is already the write side of the portal's
  password form.
- `AdminSeedService.isStillDefault` already answers the question the portal
  banner asks; T118's job is to write it to `ops.adminPasswordIsDefault` so the
  banner survives a page load.

## Verification

Twelve specs in `apps/backend/src/contexts/identity/features/sign-in/auth.spec.ts`,
covering both handlers: the token round-trips through `JwtVerifier`, the
identical-message property, the case and whitespace handling on the login, the
banned account, `mustChangePassword` in both directions, and every rejection the
password change can produce.

Suite at the time of writing: **261 tests pass**, `pnpm lint` 0 warnings and 0
errors, `tsc --noEmit` clean.
