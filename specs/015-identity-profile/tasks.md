# Tasks: Identity & Profile (P1)

**Input**: `spec.md`, `plan.md`; blueprint data-model §1/§2.1, contracts
`rest-commands.md` (Identity, Profile), `events.md`.

**Tests**: required for rotation and reuse detection, password rules, Google
verification, bootstrap idempotency, BMI, empty-field omission, drift ladder.

**Task ids are phase-local.** The blueprint's own `tasks.md` runs a separate T###
series whose numbers mean something else; nothing here refers to it by id.

## Phase 1 — Identity domain and ports

- [X] T101 `contexts/identity/domain/`: `user.aggregate.ts` (register, linkGoogle, changePassword, ban/unban, promote, softDelete — each raising its event), `session-chain.ts`, `device.aggregate.ts`, ports `user.repository.ts`, `refresh-token.repository.ts`, `device.repository.ts`, `password-hasher.ts`, `google-verifier.ts`
- [X] T102 [P] `infrastructure/`: `prisma-user.repository.ts`, `prisma-refresh-token.repository.ts` (rotation + family revoke in one transaction), `prisma-device.repository.ts`, `argon2-password-hasher.ts` (verify wrapped in try/catch), `google-id-token-verifier.ts` (`google-auth-library`, audience from env), mappers
- [X] T103 [P] `infrastructure/in-memory/`: in-memory adapters for all four repositories + a fake hasher and verifier, for handler specs

## Phase 2 — Identity slices (US1, US2, US3)

- [X] T110 [US1] `features/register/` — DTO (`email`, `password`, `passwordConfirm`, `displayName?`, `locale?`, `timezone?`), server rule ≥ 8 chars, gated on the registry key `auth.registrationOpen` read through `SettingsService` (no env var, so the Owner closes registration from the portal without a redeploy), raises `identity.UserRegistered`; spec: mismatch refused, short password refused, duplicate email → 409, `auth.registrationOpen: false` → 403 for both register and a first-time Google sign-in
- [X] T111 [P] [US2] `features/login/` — accepts email or bare username, argon2 verify wrapped, updates `lastLoginAt`, stamps `devices.lastSeenAt` when the request carries a `device`, refuses banned; spec: `admin`/`admin` works, banned refused, `lastSeenAt` moved
- [X] T112 [P] [US2] `features/google-sign-in/` — verifies the id token, creates on unknown `sub` when registration is open, returns `409 link_required` when the email exists with a password; `features/google-link/` completes with the password; `/auth/google/start` + `/callback` for the web and extension code flow
- [X] T113 [US2] `features/refresh/` — rotate: verify hash, detect `revokedAt`/`replacedBy` → revoke family + `401 session_replay`; issue the next row in the same family; spec covers both paths
- [X] T114 [P] [US2] `features/logout/` (revoke one row), `features/change-password/` (current required, revoke all families, raise `identity.PasswordChanged{bySelf}` — catalogued in `events.md`, consumed by Operations to clear the seeded-admin warning); spec: wrong current password refused, every other family gone, event raised
- [X] T115 [P] [US3] `features/register-device/` (idempotent on `installId`, sets `kind`, stamps `lastSeenAt`, raises `identity.DeviceRegistered{deviceId, kind, hasPush}`), `features/remove-device/` (raises `identity.DeviceRemoved`), query `my-devices`; spec: the same `installId` twice leaves one row with the later `lastSeenAt` and raises the event once; removing another member's device → 404
- [X] T116 [US2] `features/delete-account/` — soft-delete the user, revoke tokens, raise `identity.UserDeleted`; spec: the account can no longer sign in, every refresh family is revoked, the event carries the `userId` the Mongo contexts purge on
- [X] T117 [P] Extend the `me` query shipped by P0 (role, status, `deviceCount`) and add admin `admin-users` (search, status filter, cursor)
- [ ] T118 [US2] Extend P0's `admin-seed.service.ts`: at every boot, if the `ADMIN_EMAIL` account's password still verifies against the shipped default, log a warning and set `ops.adminPasswordIsDefault`; `Health.defaultAdminPassword` reads it and `identity.PasswordChanged` clears it; spec: a seeded admin whose password was changed is never reset and the flag stays false across a restart

## Phase 3 — Profile context (US4, US5)

- [X] T120 `contexts/profile/domain/`: `profile.aggregate.ts` (updateDetails, recordMetric capped at 500, setFoods, setAllergies), `preferences.aggregate.ts` (patch with per-field validation), ports
- [X] T121 [P] `infrastructure/`: mongo adapters + schemas + mappers, `photo-store.ts` (sharp → 512² webp, EXIF stripped, path `<userId>/avatar-<hash>.webp`), in-memory adapters
- [X] T122 [US1] `features/bootstrap-on-registered/` — `@EventsHandler(identity.UserRegistered)`: create the profile from `defaults.timezone` and `defaults.locale` (the event's own values win when registration supplied them) and the preferences from `defaults.planTomorrowTime`, `defaults.endOfDayTime`, `defaults.morningBriefingTime`, `defaults.nextPracticeCutoff`, `defaults.leadTimes`, `defaults.mealMode`, `defaults.aiSuggestions`, `defaults.quietHours`, `defaults.weekStartsOn`, `defaults.checkinEnabled` — every one read from the registry P0 populated, none written as a literal here; idempotent on `userId`; spec: two deliveries create one pair, and changing `defaults.morningBriefingTime` changes what the next registration gets while an existing member keeps theirs
- [X] T123 [P] [US4] `features/update-profile/` (also accepts `onboardingCompletedAt`), `features/record-body-metric/`, `features/upload-photo/` (multipart ≤ 5 MB, jpeg/png/webp, `GET /api/v1/profile/photo` authorised to the owner and admins); each raises `profile.ProfileUpdated{changed}` naming only the fields that moved; spec: a patch that changes the time zone raises `changed: ['timezone']`, a patch that changes nothing raises nothing
- [X] T124 [P] [US5] `features/update-preferences/` — patch any subset, each field validated against the zod schema of its `settings.defaults.*` registry entry rather than a local rule, then raises `profile.PreferencesChanged{changed}`; spec: `endOfDayTime: '25:00'` refused with 400, a valid patch leaves the untouched fields alone and the event names only the patched ones
- [X] T125 [P] Queries `profile` (with derived `bmi`, `latestWeightKg` and `onboardingCompletedAt`, empty fields omitted) and `preferences`; `ProfileSummaryQuery` used by later prompts
- [X] T126 [US4] `features/purge-on-deleted/` — `@EventsHandler(identity.UserDeleted)` removes profile, preferences and the photo bytes; spec: two deliveries of the same event collapse to one purge and the second is a no-op, and the file on the `media` volume is gone
- [~] T127 **Obsolete.** One-off `migrate-mongo` script importing v1 profiles: for every user without a `profiles` document, copy time zone, language, body facts, foods, allergies and training days from `coaching_profiles` when a row exists and fall back to `settings.defaults.*` when it does not (see plan.md — a script, not a sign-in hook); the only reader of that legacy table, removed with it in P11 — **dropped**: the Owner chose a clean start (see `docs/014-foundation/inputs-needed.md` A1), so v2 runs on its own volumes and there is no `coaching_profiles` table on this side to read. Every member registers again, and `bootstrap-on-registered` (T122) gives them the registry defaults. If a v1 import is ever wanted, the dump is at `backups/pre-v2-identity-20260908T181658Z.dump`.

## Phase 4 — Admin (US6)

- [X] T130 [P] [US6] `contexts/identity/features/admin-set-role/`, `admin-ban/`, `admin-unban/` — each records the action through Operations' `AuditPort` (port and `audit_log` schema from P0; Identity never opens the collection) and raises its `identity.*` event; `admin-ban/` also revokes every refresh family the member holds, so a live session dies on its next request rather than at expiry; spec: a banned member's second device is refused within one request, an `audit_log` row names the acting admin, unban does not restore the revoked families
- [X] T131 [P] [US6] `admin-create-service-client/` (secret returned once, hashed at rest), `admin-revoke-service-client/` — both through the same `AuditPort`; spec: the secret is absent from the second read of the client, a revoked client's token is refused, both actions leave an `audit_log` row
- [X] T132 [P] [US6] `identity.UserBanned` handler in Notifications is deferred to P2; here the event is raised and asserted in a spec

## Phase 5 — Clients

- [X] T150 `pnpm gen:contracts` regenerated; `packages/sdk` gains `AuthStore.register/login/google/refresh/logout` and `ProfileStore` — first in this phase, because the admin portal and the extension are only wiring on top of it
- [ ] T140 [P] Mobile `features/auth`: sign-in, register (confirm field, inline mismatch), Google button (`google_sign_in` 7 `initialize()` + `authenticate()`), `AuthCubit` + secure storage, `go_router` redirect, sign-out; on a successful sign-in, pull `profile` and `preferences` into the drift mirror before routing to the first screen (sync arrives in P2, so this phase fetches them itself); spec: a signed-in cubit on a fresh install has both rows locally
- [ ] T141 [P] Mobile `features/profile`: photo picker + cropper, name, time zone (device-detected, editable), language, body metrics with history list, foods and allergies chip editors
- [ ] T142 [P] Mobile `features/preferences`: every default with the right control, quiet hours, week start; writes through the REST command and the local mirror
- [ ] T143 Mobile drift `schemaVersion` 1 → 2: `profile` and `preferences` tables with a guarded `from >= 1 && from < 2` branch and a ladder test that opens a v1-shaped file (the install id stays a `key_values` row — no device table until something reads one)
- [ ] T144 [P] Frontend: real login (email/password + Google), Users table (search, role menu, ban switch), Devices, Service clients (secret dialog shown once), and on Overview the default-password warning driven by `Health.defaultAdminPassword` plus the registration-open switch writing `auth.registrationOpen` through `PATCH /admin/settings/:key`
- [ ] T145 [P] Extension: sign-in view wired to `AuthStore`, Google through `chrome.identity.launchWebAuthFlow`, tokens in `chrome.storage.local`; once signed in the panel shows the member's name and a sign-out button — the working side panel arrives with P9
- [ ] T146 [P] Mobile `features/onboarding`: step registry (feature modules contribute steps), first-run walkthrough — name + optional photo, time zone detected and confirmable, language, preview of the three daily times — skippable and resumable from Settings; finishing writes `onboardingCompletedAt` through `PATCH /profile`, and the walkthrough never runs again once it is set; cubit spec: skipping leaves defaults intact

## Phase 6 — Polish and gate

- [ ] T151 [P] `migrate-mongo` script for the `profiles` / `user_preferences` indexes; no Prisma migration — P0's `20260905120000_v2_identity` already carries every Identity column this phase writes
- [ ] T152 [P] Arabic strings for auth, profile and preferences; RTL screenshots attached to the gate
- [ ] T153 Record gate evidence here; open `016-tasks-labels-reminders`

## Dependencies

T101 → T102/T103 → T110–T118. T120 → T121 → T122–T127. T122 needs
`identity.UserRegistered` (T110) and P0's registry keys. T150 comes before every
client task: T140, T144 and T145 all consume `AuthStore` and `ProfileStore`, and
T144/T145 have nothing else to call. T130–T132 need T101 and Operations' `AuditPort`
from P0; T118 needs P0's `admin-seed.service.ts` and the `Health` resolver.

## Verification gate

1. `pnpm --filter @botvy/backend test` — all Identity and Profile specs green,
   including reuse detection, bootstrap idempotency, the purge collapsing two
   deliveries into one, the ban revoking every family, and the admin seed leaving a
   changed password alone across a restart.
2. `cd apps/mobile && flutter test && flutter analyze` — auth cubit, ladder test green.
3. Manual: register on the phone → the member appears in the admin Users table with
   their device; change the password → the second device is signed out on its next
   request; replay a refresh token → `401 session_replay` and the family gone from
   the database; upload a photo → on the profile within 5 seconds, `403` for another
   member; a session credential minted more than 15 minutes ago is refused.
4. Manual: Google sign-in completes on the phone and in the extension, both landing
   on the same account.
5. RTL: Arabic screenshots of registration, sign-in, profile and preferences from
   T152 attached here, reviewed for mirrored layout and no clipped strings.
6. `curl /health` still `ok` and reports `defaultAdminPassword`; `/api/v1/ping` still
   works (spine intact).
