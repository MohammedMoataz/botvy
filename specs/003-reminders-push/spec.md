# Feature Specification: Reminders & Push Notifications

**Feature Branch**: `003-reminders-push`

**Created**: 2026-08-29

**Status**: Draft

**Input**: User description: "Reminders with push notifications: reminder CRUD scoped per user, natural-language reminder creation through the chat intent pipeline, device registration for FCM push tokens, notification fan-out with lead times, an n8n sweep workflow calling the gateway internal endpoint every 5 minutes, and an n8n error handler workflow pushing failures to admin devices"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Create a reminder by just saying it (Priority: P1)

As a logged-in user, I type "remind me to call mom tomorrow at 5pm" in
chat and a reminder is created at the right time, confirmed back to me,
without filling in a form.

**Why this priority**: this is the single most-used capability of the
predecessor system and the reason the assistant exists. Feature 002
already proved the model classifies this correctly as
`structured_action`; this feature turns that classification into a
stored reminder.

**Independent Test**: send a natural-language reminder message to
`POST /chat`, then `GET /reminders` returns it with a correctly resolved
absolute time; the assistant's reply confirms it without a second model
call.

**Acceptance Scenarios**:

1. **Given** an authenticated user, **When** they send a message that
   asks for a reminder, **Then** the reminder is stored with the correct
   absolute UTC time, the SSE stream emits the structured result, and a
   templated confirmation (not a generated one) is returned.
2. **Given** the same user writes in Arabic ("ذكرني أروح الجيم بكرة ٦ مساءً"),
   **When** the reminder is extracted, **Then** the time resolves
   correctly against the user's timezone.
3. **Given** a message whose time is ambiguous or missing, **When**
   extraction cannot resolve it, **Then** the assistant asks one
   clarifying question instead of storing a wrong time.

---

### User Story 2 - Get notified on my phone when it's time (Priority: P1)

As a user with the mobile app installed, I receive a push notification at
the reminder's lead times even when the app is closed.

**Why this priority**: a reminder that doesn't reach the user is
worthless; this is the feature's whole point.

**Independent Test**: register a device push token, create a reminder due
shortly, trigger the sweep, and observe exactly one push per due
notification row, with the row marked sent.

**Acceptance Scenarios**:

1. **Given** a user has registered a device, **When** a reminder
   notification comes due, **Then** exactly one push is delivered to each
   of that user's devices and the notification row is marked sent.
2. **Given** the sweep runs twice in quick succession, **When** the same
   due notification is considered again, **Then** it is NOT sent twice
   (idempotent).
3. **Given** a push delivery fails, **When** the sweep completes, **Then**
   the row is left unsent so the next sweep retries it.
4. **Given** a user cancels a reminder before its notification time,
   **When** the sweep runs, **Then** no push is sent for it.

---

### User Story 3 - See and manage my reminders (Priority: P2)

As a user, I can list my active and past reminders, edit one, and cancel
one — fixing the predecessor system's worst gap, where a wrong reminder
could only be removed by editing the database by hand.

**Why this priority**: explicitly called out as a pain point of the old
system; but the assistant is still useful before it exists, so it ranks
below P1.

**Independent Test**: full CRUD over `/reminders` with a second user
proving isolation.

**Acceptance Scenarios**:

1. **Given** two users each with reminders, **When** either lists
   `/reminders`, **Then** they see only their own.
2. **Given** a reminder exists, **When** its owner cancels it, **Then**
   its status becomes cancelled and its unsent notifications never fire.
3. **Given** a reminder exists, **When** a *different* user attempts to
   read, edit, or cancel it, **Then** the request is refused.

---

### Edge Cases

- A reminder created for a time in the past → accept it but mark it so no
  push storm results; do not silently shift it to the future.
- A device token that FCM reports as invalid/unregistered → remove that
  device row rather than retrying it forever.
- A user with no registered devices → the notification is marked sent
  (nothing to deliver to) rather than retried forever.
- The sweep endpoint called by anything other than n8n's service token →
  refused.
- Two sweeps overlapping (a slow one still running when the next fires) →
  must not double-send; selection and marking happen in one transaction.
- Daylight-saving / timezone: reminder times are stored in UTC and
  resolved against the user's configured timezone at extraction time.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST extend the chat intent pipeline so a
  reminder-shaped message produces a structured extraction (title,
  absolute time, optional lead times) executed deterministically in code
  — no second model call to phrase the confirmation.
- **FR-002**: System MUST store reminders per user with status
  `active`/`done`/`cancelled`, and fan out one `reminder_notification`
  row per lead time.
- **FR-003**: System MUST expose authenticated CRUD:
  `GET /reminders`, `POST /reminders`, `PATCH /reminders/:id`
  (edit or cancel), each scoped to the authenticated user and refusing
  access to another user's reminder.
- **FR-004**: System MUST expose `POST /devices` (register/update a push
  token for the authenticated user) and `DELETE /devices/:installId`.
- **FR-005**: System MUST expose `POST /internal/reminders/sweep`,
  authenticated by a service token (not a user JWT), which selects all
  due unsent notifications across all users, delivers a push per device,
  and marks rows sent — idempotently, in one transaction.
- **FR-006**: System MUST expose `POST /internal/alerts`, service-token
  authenticated, which pushes an alert to every admin user's devices.
- **FR-007**: Push delivery MUST go through Firebase Cloud Messaging and
  MUST degrade safely when FCM is not configured (log and no-op rather
  than crash), since a fresh install has no Firebase project yet.
- **FR-008**: The repository MUST contain two n8n workflows as JSON: a
  5-minute schedule trigger (plus a companion webhook for manual runs)
  calling the sweep endpoint, and an error trigger calling the alerts
  endpoint. Neither may contain a database node or a data volume.
- **FR-009**: Invalid/unregistered FCM tokens reported by the provider
  MUST cause the corresponding device row to be deleted.

### Key Entities

- **Reminder**: id, owning user, title, `remindAt` (UTC), status,
  timestamps.
- **ReminderNotification**: id, parent reminder, `notifyAt`, label (e.g.
  "1 hour before"), `sentAt` — unique per (reminder, label), with a
  partial index over unsent rows.
- **Device**: already added in Feature 002 — id, owning user, installId,
  platform, fcmToken, lastSeenAt.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A natural-language reminder in English and one in Arabic
  both produce correctly-timed stored reminders.
- **SC-002**: A due reminder produces exactly one push per registered
  device, with the app closed.
- **SC-003**: Running the sweep twice over the same due notification
  sends exactly one push.
- **SC-004**: A second user can neither see nor modify the first user's
  reminders.
- **SC-005**: With FCM unconfigured, the whole flow still runs to
  completion (rows marked, no crash) — so the system is demonstrable
  before a Firebase project exists.

## Assumptions

- Feature 002's gateway (auth, chat SSE, intent extraction) is in place;
  json_schema structured output was verified working there, so the
  extraction approach is known-viable.
- No Firebase project exists yet, so FR-007's degraded path is the one
  that will actually be exercised in this feature's verification; real
  device delivery (SC-002) is verified once the user creates a Firebase
  project and supplies a service-account key.
- The mobile app exists but is not compile-verified (no Flutter SDK on
  this machine), so device registration is verified via HTTP against the
  API rather than from a real handset.
- Users have a single timezone setting; per-reminder timezone overrides
  are out of scope.
- Recurring reminders (RRULE) are out of scope — the predecessor system
  did not have them either.
