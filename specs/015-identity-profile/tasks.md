# Tasks: Identity & Profile (P1)

**Input**: `spec.md`, `plan.md`; blueprint data-model §1/§2.1, contracts
`rest-commands.md` (Identity, Profile), `events.md`.

**Tests**: required for rotation and reuse detection, password rules, Google
verification, bootstrap idempotency, BMI, empty-field omission, drift ladder.

## Phase 1 — Identity domain and ports

- [ ] T101 `contexts/identity/domain/`: `user.aggregate.ts` (register, linkGoogle, changePassword, ban/unban, promote, softDelete — each raising its event), `session-chain.ts`, `device.aggregate.ts`, ports `user.repository.ts`, `refresh-token.repository.ts`, `device.repository.ts`, `password-hasher.ts`, `google-verifier.ts`
- [ ] T102 [P] `infrastructure/`: `prisma-user.repository.ts`, `prisma-refresh-token.repository.ts` (rotation + family revoke in one transaction), `prisma-device.repository.ts`, `argon2-password-hasher.ts` (verify wrapped in try/catch), `google-id-token-verifier.ts` (`google-auth-library`, audience from env), mappers
- [ ] T103 [P] `infrastructure/in-memory/`: in-memory adapters for all four repositories + a fake hasher and verifier, for handler specs

## Phase 2 — Identity slices (US1, US2, US3)

- [ ] T110 [US1] `features/register/` — DTO (`email`, `password`, `passwordConfirm`, `displayName?`, `locale?`, `timezone?`), server rule ≥ 8 chars, `ALLOW_REGISTRATION` gate, raises `identity.UserRegistered`; spec: mismatch refused, short password refused, duplicate email → 409, closed registration → 403
- [ ] T111 [P] [US2] `features/login/` — accepts email or bare username, argon2 verify wrapped, updates `lastLoginAt`, refuses banned; spec: `admin`/`admin` works, banned refused
- [ ] T112 [P] [US2] `features/google-sign-in/` — verifies the id token, creates on unknown `sub` when registration is open, returns `409 link_required` when the email exists with a password; `features/google-link/` completes with the password; `/auth/google/start` + `/callback` for the web and extension code flow
- [ ] T113 [US2] `features/refresh/` — rotate: verify hash, detect `revokedAt`/`replacedBy` → revoke family + `401 session_replay`; issue the next row in the same family; spec covers both paths
- [ ] T114 [P] [US2] `features/logout/` (revoke one row), `features/change-password/` (current required, revoke all families, raise `identity.PasswordChanged`)
- [ ] T115 [P] [US3] `features/register-device/` (idempotent on `installId`, sets `kind`), `features/remove-device/`, query `my-devices`
- [ ] T116 [US2] `features/delete-account/` — soft-delete the user, revoke tokens, raise `identity.UserDeleted`
- [ ] T117 [P] Queries `me`, and admin `admin-users` (search, status filter, cursor)

## Phase 3 — Profile context (US4, US5)

- [ ] T120 `contexts/profile/domain/`: `profile.aggregate.ts` (updateDetails, recordMetric capped at 500, setFoods, setAllergies), `preferences.aggregate.ts` (patch with per-field validation), ports
- [ ] T121 [P] `infrastructure/`: mongo adapters + schemas + mappers, `photo-store.ts` (sharp → 512² webp, EXIF stripped, path `<userId>/avatar-<hash>.webp`), in-memory adapters
- [ ] T122 [US1] `features/bootstrap-on-registered/` — `@EventsHandler(identity.UserRegistered)`: create profile + preferences from `settings.defaults.*`, idempotent on `userId`; spec: two deliveries create one pair
- [ ] T123 [P] [US4] `features/update-profile/`, `features/record-body-metric/`, `features/upload-photo/` (multipart ≤ 5 MB, jpeg/png/webp, `GET /api/v1/profile/photo` authorised to the owner and admins)
- [ ] T124 [P] [US5] `features/update-preferences/` — patch, each field validated against the registry schema for its default
- [ ] T125 [P] Queries `profile` (with derived `bmi` and `latestWeightKg`, empty fields omitted) and `preferences`; `ProfileSummaryQuery` used by later prompts
- [ ] T126 [US4] `features/purge-on-deleted/` — `@EventsHandler(identity.UserDeleted)` removes profile, preferences and the photo
- [ ] T127 `infrastructure/legacy-profile-reader.ts` + lazy bootstrap on first sign-in when no profile exists (copies v1 coaching profile fields); marked for removal in P11

## Phase 4 — Admin (US6)

- [ ] T130 [P] [US6] `contexts/identity/features/admin-set-role/`, `admin-ban/`, `admin-unban/` — each writes `audit_log` through the Operations port and raises its event
- [ ] T131 [P] [US6] `admin-create-service-client/` (secret returned once, hashed at rest), `admin-revoke-service-client/`
- [ ] T132 [P] [US6] `identity.UserBanned` handler in Notifications is deferred to P2; here the event is raised and asserted in a spec

## Phase 5 — Clients

- [ ] T140 [P] Mobile `features/auth`: sign-in, register (confirm field, inline mismatch), Google button (`google_sign_in` 7 `initialize()` + `authenticate()`), `AuthCubit` + secure storage, `go_router` redirect, sign-out
- [ ] T141 [P] Mobile `features/profile`: photo picker + cropper, name, time zone (device-detected, editable), language, body metrics with history list, foods and allergies chip editors
- [ ] T142 [P] Mobile `features/preferences`: every default with the right control, quiet hours, week start; writes through the REST command and the local mirror
- [ ] T143 Mobile drift `schemaVersion` 1 → 2: `profile`, `preferences`, `devices_local` tables with a guarded `from >= 1 && from < 2` branch and a ladder test that opens a v1-shaped file
- [ ] T144 [P] Frontend: real login (email/password + Google), Users table (search, role menu, ban switch), Devices, Service clients (secret dialog shown once), default-password warning on Overview
- [ ] T145 [P] Extension: sign-in view wired to `AuthStore`, Google through `chrome.identity.launchWebAuthFlow`, tokens in `chrome.storage.local`, signed-in placeholder panel

## Phase 6 — Contracts and polish

- [ ] T150 `pnpm gen:contracts` regenerated; `packages/sdk` gains `AuthStore.register/login/google/refresh/logout`, `ProfileStore`
- [ ] T151 [P] `migrate-mongo` script for `profiles`/`user_preferences` indexes; Prisma migration if any column is still missing
- [ ] T152 [P] Arabic strings for auth, profile and preferences; RTL screenshots attached to the gate
- [ ] T153 Record gate evidence here; open `016-tasks-labels-reminders`

## Dependencies

T101 → T102/T103 → T110–T117. T120 → T121 → T122–T127. T122 needs
`identity.UserRegistered` (T110). Clients (T140+) need the slices they call.
T130–T132 need T101 and the Operations audit port from P0.

## Verification gate

1. `pnpm --filter @botvy/backend test` — all Identity and Profile specs green,
   including reuse detection and bootstrap idempotency.
2. `cd apps/mobile && flutter test && flutter analyze` — auth cubit, ladder test green.
3. Manual: register on the phone → the member appears in the admin Users table with
   their device; change the password → the second device is signed out on its next
   request; replay a refresh token → `401 session_replay` and the family gone from
   the database; upload a photo → visible to the owner, `403` for another member.
4. `curl /health` still `ok`; `/api/v1/ping` still works (spine intact).
