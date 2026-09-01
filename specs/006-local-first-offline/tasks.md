# Tasks: Local-First Reminders & Offline Mode

**Spec**: [spec.md](./spec.md) · **Status**: Implemented

## Delivery chain

- [x] **T001** Recreate the n8n container so it receives `INTERNAL_SERVICE_TOKEN`.
      *Evidence*: `docker exec botvy-n8n-1 printenv INTERNAL_SERVICE_TOKEN` prints
      the token; before, it printed nothing and every sweep answered 401.
- [x] **T002** Pair `FIREBASE_CREDENTIALS_DIR` (host) with a container path in
      `FIREBASE_CREDENTIALS_FILE`; fail the boot when set but unreadable
      (`push.service.ts` `OnModuleInit`).
      *Evidence*: gateway logs `Firebase Cloud Messaging initialised from
      /run/secrets/firebase-admin.json`; `/health` reports `push: true`.
- [x] **T003** Hold a notification unsent when the user has no device, instead
      of claiming it (`sweep.service.ts`). Expire undelivered rows after a
      configurable window.
- [x] **T004** Skip pushing to a device that has synced since the ping was
      planned, using `ReminderNotification.createdAt` against
      `Device.lastSeenAt`.
- [x] **T005** Log every rejected `/internal/*` call with the likely cause
      (`service-token.guard.ts`).
- [x] **T006** Record `ops.lastSweepAt` / `ops.lastCoachingTickAt`; surface
      them plus staleness on `/health` and in the admin portal.
      *Evidence*: `/health` → `{"status":"ok","push":true,"sweepStale":false}`;
      n8n-driven sweep at 23:06:06 and tick at 23:05:37 on 2026-08-31.

## Timezone

- [x] **T007** `CoachingService.userTimezone()`; delete the `process.env.TZ`
      read; render confirmations with `formatInTz`; resolve `today` per user.
- [x] **T008** Validate the profile timezone as an IANA zone (`@IsTimeZone`).
- [x] **T009** Mobile reports the handset's IANA zone on every sync.

## Reminder lifecycle

- [x] **T010** Persist `leadTimes`; re-plan from the reminder's own offsets on
      reschedule; purge pending pings when finished; re-plan when re-activated.
- [x] **T011** `DELETE /reminders/:id`, owner-scoped, cascading to pings.
- [x] **T012** Client ids for offline creates, unique **per user**.
      *Evidence*: a global unique index let one account's id mask another's;
      migration `20260901030000_scope_client_ids_per_user` scopes both
      `reminders` and `messages`.
- [x] **T013** Live check against the running gateway: create with
      `["1d","2h","0m"]` → three pings; retry with the same clientId → same
      row; reschedule → custom leads kept; `status: done` → pings purged;
      `DELETE` → 200 and the list empties.

## Offline

- [x] **T014** Device database (drift): reminders, pings, chat, key/value.
      `pendingOp` and `syncState` are the outbox; sign-out wipes everything.
- [x] **T015** `NotificationScheduler`: exact alarms from the local database,
      deterministic ids from `(reminderId, label)`, reboot rescheduling via the
      manifest receiver, inexact fallback when the OS refuses exact alarms.
- [x] **T016** `SyncService`: single-flight, connectivity-triggered, push
      outbox → pull snapshot → re-arm alarms (which runs even when offline).
- [x] **T017** `POST /chat/batch`: idempotent per user, each message resolved
      against when it was composed, one reply for the batch.
- [x] **T018** Reconcile pulled messages by clientId.
      *Evidence*: without it, every locally cached turn was inserted a second
      time by the next pull; covered by two tests in `offline_test.dart`.
- [x] **T019** Data-only sync nudges after every reminder mutation.

## Coaching

- [x] **T020** Per-user `checkinTime` / `programTime`, plus the dedupe dates.
- [x] **T021** `POST /internal/coaching/tick`: decides per user, claims the
      local date before sending, catches up until local midnight.
- [x] **T022** Replace the two fixed crons with one five-minute tick and
      re-import into n8n.
- [x] **T023** Settings section in the mobile app: opt-in, times, training
      days, allergies, timezone, exact-alarm warning.

## Configuration

- [x] **T024** `SettingsService` with a typed registry, per-key validation, a
      60-second read-through cache, and DB-over-default precedence.
- [x] **T025** `PATCH /api/admin/settings/:key` and an editable Config page.
      This is the first mutating route on the admin API; the compose comment
      claiming it is read-only was updated with it.
- [x] **T026** `GET /settings/defaults` so the app stops compiling in its own.
- [x] **T027** Read `CORS_ORIGINS` and `PORT` through `ConfigService`.

## Verification

| Check | Result |
|---|---|
| `apps/gateway` unit tests | 120 passed |
| `apps/mobile` unit tests | 33 passed |
| `flutter analyze` | no issues |
| `flutter build apk` | builds (needed core library desugaring for `flutter_local_notifications`) |
| admin `vite build` | builds |
| Live sweep + tick from n8n | both advancing on schedule |
| Live reminder lifecycle | create / idempotent retry / reschedule / done / delete all as specified |

### Not yet verified on hardware

The airplane-mode test in `SETUP.md` — create a reminder with no connection and
watch it fire — needs a device or emulator. Everything it depends on is covered
by unit tests, but the end-to-end behaviour on a real handset has not been
observed.
