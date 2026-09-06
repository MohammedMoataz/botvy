# Implementation Plan: Identity & Profile (P1)

**Branch**: `015-identity-profile` | **Date**: 2026-09-05 | **Spec**: [spec.md](./spec.md)

**Input**: `specs/015-identity-profile/spec.md`; blueprint `specs/013-platform-v2-blueprint/`
(data-model §1 and §2.1, contracts `rest-commands.md` Identity/Profile, `events.md`
identity/profile rows, research R-11, R-12, R-13, R-31); foundation `specs/014-foundation/`.

## Summary

Fill the Identity context (PostgreSQL, Prisma, through repository ports) with the
real authentication slices, and create the Profile context (MongoDB) that every
later phase reads. Add the mobile auth and profile flows, the admin portal's people
screens, and the extension's sign-in. Ports and the unit of work come from the
foundation; this phase writes the first non-demo aggregates.

## Technical Context

**Language/Version**: TypeScript 5.x / Node 24; Dart 3.5 / Flutter stable

**Primary Dependencies**: added — `google-auth-library`, `sharp` (photo resize);
mobile — `google_sign_in` 7, `image_picker`, `image_cropper`, `flutter_timezone`;
frontend — PrimeReact `DataTable`, `Dialog`, `InputSwitch`

**Storage**: PostgreSQL Identity tables (created in P0), MongoDB `profiles`,
`user_preferences`; photo bytes on the `media` volume; phone drift `profile`,
`preferences` tables (pull-only + patch push)

**Testing**: vitest with in-memory repositories for every handler; a Prisma-backed
spec for rotation/reuse; `flutter test` for the auth cubit and the profile form

**Performance Goals**: sign-in under 500 ms locally; photo upload under 2 s for 5 MB

**Constraints**: argon2 verify wrapped (it throws on a Google-only placeholder);
login accepts a bare username; empty profile fields omitted everywhere

**Scale/Scope**: ~45 backend files, 12 mobile files, 6 frontend files

## Constitution Check (v2.1.1)

| Principle | Status | How |
|---|---|---|
| I. API owns data; store per context | PASS | Identity → Prisma port adapters; Profile → Mongo adapters; Profile never queries Postgres, it reacts to `identity.UserRegistered` |
| II. n8n infrastructure only | PASS | No workflow touched |
| III. Local-first LLM | PASS | No inference in this phase |
| IV. Forward-only migrations | PASS | No Prisma migration — P0's `20260905120000_v2_identity` already carries every Identity column this phase writes; one `migrate-mongo` script for `profiles`/`user_preferences` indexes, one for the v1 profile import; drift bump to 2 with a guarded branch |
| V. Single public surface | PASS | New routes sit behind Caddy |
| VI. Multi-user, principal kinds | PASS | Every route declares its kind; admin routes `@Roles('admin')`; `/internal/*` untouched |
| VII. Test-then-verify | PASS | Rotation/reuse, confirm-password, Google verification, BMI, omission of empty fields, quiet hours all specced |
| VIII. YAGNI | PASS | No mail sender, no 2FA, no passkeys; one photo per member |
| IX. Contexts, slices, ports | PASS | `contexts/identity/features/*`, `contexts/profile/features/*`; drivers only in `infrastructure/` |
| X. Commands / queries / streams | PASS | Auth and profile writes are REST commands; `me`, `profile`, `preferences`, admin lists are GraphQL |
| XI. Times belong to the user | PASS | Time zone stored on the profile; preference times are `HH:mm` strings resolved by `shared/time` |
| XII. Three kinds of configuration | PASS | P0 registers the keys; this phase only reads them — `defaults.*` seeds `profiles` and `user_preferences`, `auth.registrationOpen` gates registration, and neither is hard-coded anywhere. Secrets (Google audience, argon2 pepper) stay in env |

## Design

### Identity context (PostgreSQL)

```text
contexts/identity/
├── domain/
│   ├── user.aggregate.ts           # register, signInWithPassword, linkGoogle, changePassword, ban, unban, promote, softDelete
│   ├── session-chain.ts            # value object: familyId, rotation, reuse detection
│   ├── device.aggregate.ts
│   ├── user.repository.ts · refresh-token.repository.ts · device.repository.ts · service-client.repository.ts   (ports)
│   └── password-hasher.ts · google-verifier.ts        (ports — infrastructure supplies argon2 and google-auth-library)
├── infrastructure/
│   ├── prisma/{schema.prisma,migrations/}
│   ├── prisma-user.repository.ts · prisma-refresh-token.repository.ts · prisma-device.repository.ts · prisma-service-client.repository.ts
│   ├── argon2-password-hasher.ts · google-id-token-verifier.ts
│   └── mappers/
└── features/
    ├── register/ login/ google-sign-in/ refresh/ logout/ change-password/
    ├── register-device/ remove-device/ delete-account/
    ├── admin-set-role/ admin-ban/ admin-unban/ admin-create-service-client/ admin-revoke-service-client/
    └── me/ my-devices/ admin-users/            (queries)
```

Rotation: a refresh presents `{ jti, token }`; the adapter loads the row, verifies
the hash, and if `revokedAt` or `replacedBy` is set it revokes the **family** and
throws `SessionReplay`. Otherwise it marks the row replaced and issues a new row in
the same family, inside `PrismaUnitOfWork`. `argon2.verify` is wrapped: a Google-only
account stores a non-argon2 placeholder and the library throws rather than returning
false.

Google: `GoogleVerifier.verify(idToken)` (mobile, extension) returns `{ sub, email,
emailVerified, name, picture }`; the code flow (web) exchanges at
`/auth/google/callback` and then takes the same path. An unknown `sub` with a known
email is **not** linked automatically — the response asks for the password once
(`409 link_required`), and `POST /auth/google/link` completes it.

### Profile context (MongoDB)

```text
contexts/profile/
├── domain/ profile.aggregate.ts · preferences.aggregate.ts · profile.repository.ts · preferences.repository.ts (ports)
├── infrastructure/ mongo-*.repository.ts · schemas · mappers · photo-store.ts (media volume, sharp resize 512², strips EXIF)
└── features/ update-profile/ upload-photo/ record-body-metric/ update-preferences/ profile/ preferences/ bootstrap-on-registered/ purge-on-deleted/
```

`bootstrap-on-registered` is an `@EventsHandler` for `identity.UserRegistered`: it
creates `profiles` and `user_preferences` by reading every value out of the settings
registry by name — `defaults.timezone`, `defaults.locale`, `defaults.planTomorrowTime`,
`endOfDayTime`, `morningBriefingTime`, `nextPracticeCutoff`, `defaults.leadTimes`,
`defaults.mealMode`, `defaults.aiSuggestions`, `defaults.quietHours`,
`defaults.weekStartsOn`, `defaults.checkinEnabled` — in one transaction, and raises
nothing further. P0 registers all of them; a literal in this handler is a bug.
Idempotent on `userId` so an at-least-once delivery cannot create two.
`purge-on-deleted` handles `identity.UserDeleted`.

Writes raise their contract event: `update-profile`, `upload-photo` and
`record-body-metric` raise `profile.ProfileUpdated{changed}` naming the fields that
actually moved, `update-preferences` raises `profile.PreferencesChanged{changed}`.
Nobody in P1 consumes either — Notifications picks up the `timezone` branch in P2 —
but they are the only way a later context learns a member travelled, so they ship now.

`ProfileAggregate.recordMetric` appends to `bodyMetrics` (capped at 500, oldest
dropped) and recomputes nothing; BMI is derived in the read model
(`latestWeightKg / (heightCm/100)²`, rounded to one decimal, absent when either
input is missing). The prompt line builder that later phases use lives here as
`ProfileSummaryQuery` returning only filled fields.

Two shapes are wider here than the blueprint's data model, which this phase does not
edit. The photo is stored as `avatar-<hash>.webp`, not `.jpg`: `sharp` already
re-encodes to strip EXIF, and webp at 512² is the smaller file for the same quality —
a P1 decision, recorded here. And `profiles` gains `onboardingCompletedAt:
Date|null`, accepted on `PATCH /profile` and returned by the `profile` query, because
FR-000's walkthrough has nowhere else to remember that it finished; also a P1
addition, and the only field this phase adds.

### Admin actions and the audit trail

`admin-set-role`, `admin-ban`, `admin-unban` and the two service-client slices record
through Operations' `AuditPort` (the port and the `audit_log` schema come from P0) —
Identity never opens that collection. The port's write is what raises
`operations.UserRoleChanged`, which is why the event catalogue lists Operations as
its producer: the Identity slice dispatches the change and its own
`identity.*` event, and Operations owns the record of who did it.

### Quiet hours

`user_preferences.quietHours` is stored and returned in P1 and enforced by
Notifications in P2 (an alert whose `notifyAt` falls inside the window is planned at
the window's end unless its source is a member-set reminder). P1 ships the field,
the screen and the contract; the enforcement task is listed in P2's tasks.

### Clients

- **Mobile**: `features/auth` (sign-in, register with confirm field, Google button),
  `features/onboarding` (a first-run walkthrough of steps registered by feature
  modules: name + photo, time zone, language, daily times preview here; sports arrive
  with P6 — skippable, resumable from Settings, marks `onboardingCompletedAt` on the
  profile), `features/profile` (photo picker + cropper, body metrics as a history
  list, foods and allergies chips), `features/preferences` (every default, time
  pickers, quiet hours, week start). `AuthCubit` holds tokens in secure storage;
  `go_router` redirects on authentication state. Sync is P2, so a successful sign-in
  pulls `profile` and `preferences` into the mirror itself before the first screen
  paints — that one call is what makes a second device look like the first. Drift
  `schemaVersion` 1 → 2 adds `profile` and `preferences` with a guarded branch and a
  ladder test; the install id stays in `key_values`, no device table.
- **Frontend (admin)**: real login page, Users table (search, role, ban), Devices,
  Service clients (secret shown once), Overview shows the default-password warning.
- **Extension**: sign-in view wired to `@botvy/sdk` `AuthStore`; Google through
  `chrome.identity.launchWebAuthFlow` against `/auth/google/start`.

### Migration of v1 accounts

Existing rows in `users` work unchanged, and their profiles are imported by a one-off
`migrate-mongo` script that runs once at deploy: for every user without a `profiles`
document it writes one, copying time zone, language, body facts, foods, allergies and
training days from the v1 `coaching_profiles` row when one exists, and falling back to
`settings.defaults.*` where it does not.

The script is the choice over the lazy alternative. Doing it on first sign-in needs
either a Profile handler called from the login slice, which reaches across a context
boundary (IX), or a `profile` query that writes, which is a command wearing a query's
name (X). Raising `identity.UserSignedIn` for Profile to handle would be legal but
buys a permanent event, a permanent handler and an at-least-once race, all to import a
fixed set of rows exactly once. A script that runs to completion at deploy and is then
deleted is smaller and finishes. It is the only code allowed to read
`coaching_profiles`, and it goes away with the legacy tables in P11.

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
|---|---|---|
| A one-off migration script reads a v1 table to seed `profiles` | Members keep their body facts across the rebuild | Asking every member to re-enter height, weight, foods and allergies; a lazy import on sign-in (see above — it costs a boundary violation or a permanent handler) |
| Google link flow with a password challenge | Silent linking by email is an account-takeover path | Auto-link (unsafe); refuse entirely (locks members out of their own account) |

## Verification gate

```powershell
pnpm --filter @botvy/backend test          # rotation/reuse, confirm/min-length, Google verify, bootstrap idempotency, BMI, omission
cd apps/mobile; flutter test; flutter analyze
# manual: register on phone → profile on admin Users; change password → second device signed out;
#         replay a refresh token → 401 and family revoked; upload a photo → visible, 403 for another member;
#         Google sign-in on the phone and in the extension; Arabic RTL screenshots of the four screens
curl -s http://localhost/health            # still ok
```
