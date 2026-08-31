# Tasks: Reminders & Push Notifications

**Branch**: `003-reminders-push` | **Input**: `spec.md`

## Phase A — Data model

- [x] T001 `Reminder` + `ReminderNotification` models; `Device` reused from Feature 002.
- [x] T002 Migration `20260829203150_add_reminders` generated and applied.
      Verified: gateway boots against it and reminder rows persist.

## Phase B — Lead-time logic (pure, unit-tested)

- [x] T003 `src/reminders/lead-times.ts` — offset parsing, labels, expansion.
- [x] T004 9 vitest cases covering unit conversion, malformed input, pluralisation,
      chronological ordering, dedup, the already-past lead time, and the past-dated reminder.
      Verified: `vitest run` → **25 passed (4 files)**.

## Phase C — Reminders & devices API (User Stories 1 & 3)

- [x] T005 `RemindersService` + controller: list/create/patch, per-user scoping.
- [x] T006 `DevicesController`: upsert-by-installId, list, delete.
- [x] T007 Verify per-user isolation and cross-user denial.
      Verified: alice creates "call mom" → notifications `["now"]` (the
      "1 hour before" mark was already past, correctly dropped);
      `GET /reminders` as bob → `0`;
      bob `PATCH` on alice's reminder → **404** (not 403 — ids must not leak).

## Phase D — Push & sweep (User Story 2)

- [x] T008 `PushService` over FCM, degrading to a logged no-op when
      `FIREBASE_CREDENTIALS_FILE` is unset; deletes device rows for tokens
      FCM reports permanently invalid.
- [x] T009 `SweepService.run()` — claims each row with a conditional
      `updateMany` (`sentAt: null` in the WHERE) *before* pushing.
- [x] T010 `ServiceTokenGuard` — timing-safe compare, rejects user JWTs.
- [x] T011 Verify the sweep end to end.
      Verified:
      - no token → **401**; a valid *user* JWT → **401** (internal endpoints
        must not be reachable with a user credential)
      - sweep #1 → `{"due":1,"pushed":0,"markedSent":1,"devicesRemoved":0}`
      - sweep #2 immediately after → `{"due":0,...,"markedSent":0}` — **idempotent** (SC-003)
      - `pushed:0` is the expected degraded path with no Firebase project (SC-005):
        the flow completes and marks rows rather than crashing
      - reminder cancelled before its due time → later sweep reports `due:0` (SC-004)
      - `POST /internal/alerts` → `{"admins":1,"delivered":0}`

## Phase E — n8n workflows

- [x] T012 `workflows/reminder_sweep.json` — 5-minute schedule trigger plus a
      companion `botvy-sweep` webhook (n8n's public API has no execute-now, so
      the gateway's future run-now hits this webhook). Calls
      `POST /internal/reminders/sweep` with the service token. No DB node.
- [x] T013 `workflows/error_handler.json` — error trigger → `POST /internal/alerts`.
      Must be imported FIRST: n8n silently drops an `errorWorkflow` setting
      whose id does not resolve.
- [x] T014 Import both into the running n8n.
      Verified: `node workflows/import.mjs` →
      `created Botvy Error Handler (CyhmDLuvjgTX7kHU)` /
      `created Botvy Reminder Sweep (eJ67qs9hLJr96Ts0)`;
      activation returns `active: true`.
      Prerequisites handled along the way: n8n owner account created (its
      REST API refuses everything until one exists), an API key minted and
      stored in `.env`, and `INTERNAL_SERVICE_TOKEN` passed through to the
      n8n container so the workflows' HTTP nodes can authenticate.
- [ ] T015 Observe a real *scheduled* execution reaching the gateway.
      Requires the gateway running as a container (the workflow calls
      `http://gateway:8080`, which only resolves inside the compose
      network). Pending the image rebuild that carries the Prisma ESM fix.

## Deferred / blocked

- **SC-002 (a real push to a real handset)** — blocked on two things the
  user must supply: a Firebase project + service-account key, and a
  Flutter SDK install so the mobile app can build. The degraded path is
  verified; the delivery path is not.
- **Firebase service-account key rotation** — the key in use was exposed and
  its rotation is deliberately deferred; triggers and steps in `SETUP.md`,
  Part 2 § 2.
- **Arabic reminder extraction (SC-001, second half)** — the chat intent
  pipeline currently classifies `structured_action` but does not yet
  extract `{title, remindAt}` and call `RemindersService`. Wiring that is
  the remaining piece of User Story 1.
