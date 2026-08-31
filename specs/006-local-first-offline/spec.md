# Feature Specification: Local-First Reminders & Offline Mode

**Feature Branch**: `006-local-first-offline`

**Created**: 2026-09-01

**Status**: Implemented

**Input**: User description: "Notifications are not working — scheduling a
reminder sends nothing. There are no followups or plans like the old botvy.
Saved reminders must be updatable, and removable after being marked done. With
no network the saved reminders must still work, so a SQLite database on the
device. Offline chats must be stored and sent when the network returns, and
the LLM must be able to analyse and handle them. Handle Egypt timezone for
now. Nothing hardcoded in app/gateway/admin — every value configurable from
admin or the mobile app."

## Why this feature exists

Everything below was already built and none of it reached the user. Reminders
were stored, planned and swept correctly while silently reaching no phone;
the coaching cycle ran server-side with no way to opt in from the app; a
finished reminder could never be removed. The platform looked complete and
behaved as if it were not there.

The root causes were three independent breaks in one delivery chain, plus a
timezone read from the wrong place. Fixing the chain alone would have left the
product still unable to remind anyone without a network — which for a personal
assistant on a phone is the case that matters most. So delivery moves onto the
device, and the server becomes the fallback rather than the mechanism.

## What was broken

| Symptom | Root cause |
|---|---|
| No reminder ever notified | The n8n container predated the compose line declaring `INTERNAL_SERVICE_TOKEN`, so every 5-minute sweep answered 401 and nothing ran |
| Still nothing after the sweep ran | `FIREBASE_CREDENTIALS_FILE` was a Windows host path inside a Linux container; FCM initialisation failed and was swallowed by a catch |
| Still nothing after FCM worked | The app never sent its FCM token: `initPush()` returned early on a `--dart-define` nobody defined, and the token was only printed to the debug console |
| A ping that could not be delivered was lost | The sweep claimed a notification row before checking whether the user had any device, marking it delivered to nobody |
| Chat-created reminders landed hours off | Times were extracted against `process.env.TZ`, which was never passed to the gateway, so every one resolved as UTC |
| No followups or plans | The coaching cycle existed but `optedIn` defaults to false and no screen could set it; the same 401 blocked its schedule |
| Done reminders could not be removed | No `DELETE` endpoint existed, and the list deliberately pinned finished rows in place |

## User Scenarios & Testing *(mandatory)*

### User Story 1 - A reminder fires with no connection (Priority: P1)

As a user, I set a reminder while my phone has no signal, and it still goes
off at the time I asked for.

**Why this priority**: it is the whole product. A reminder that depends on a
server, a tunnel and Google being reachable is a reminder that fails on the
train.

**Acceptance**: in airplane mode, creating a reminder two minutes out shows it
in the list immediately and fires a notification on time. When the network
returns the reminder exists server-side, and no second notification arrives.

### User Story 2 - Messages typed offline are understood (Priority: P1)

As a user, I type a few things to the assistant with no connection, and when I
am back online it answers them together — including creating any reminder I
asked for, at the time I meant when I typed it.

**Acceptance**: two messages composed offline are delivered on reconnect as
one batch and answered once. "Remind me in two hours", typed three hours ago,
produces a reminder for two hours after it was typed, and that reminder is
delivered rather than dropped. Re-sending the same batch changes nothing.

### User Story 3 - A finished reminder can be cleared (Priority: P2)

As a user, I can edit a reminder I already saved, mark it done, and then
delete it permanently so it stops filling my list.

**Acceptance**: editing changes the time and re-plans the alerts, keeping any
custom lead times. Marking done removes its pending alerts. Deleting removes
it from the phone, the server and the device's scheduled alarms.

### User Story 4 - The evening check-in reaches me (Priority: P2)

As a user, I turn on coaching from Settings, choose when to be asked, and get
the check-in and the next day's program at those times, in my own timezone.

**Acceptance**: with a check-in time two minutes out, the tick sends once and
does not repeat that day. Answering in chat records adherence.

### User Story 5 - An operator retunes the system without a deploy (Priority: P3)

As the operator, I change the nightly times, the default lead times or the
notification wording from the admin portal, and the change takes effect.

**Acceptance**: a `PATCH` to a setting is validated per key, rejected with a
reason when wrong, and observed by the gateway within a minute.

## Requirements *(mandatory)*

- **FR-001** A reminder's pings MUST be scheduled on the device from a local
  database, and MUST fire with no network, no gateway and no FCM.
- **FR-002** The server sweep MUST remain as fallback delivery, and MUST NOT
  push to a device that has synced since the ping was planned (that device
  already holds the alarm).
- **FR-003** A notification with no reachable device MUST stay unsent and be
  retried, up to a configurable expiry.
- **FR-004** Reminders, chat history and the outbox MUST persist on the device
  and MUST be erased on sign-out, along with every scheduled alarm.
- **FR-005** Offline mutations MUST carry a client-generated id, so a retry
  after a lost response cannot duplicate anything.
- **FR-006** Queued messages MUST be delivered in one batch, resolved against
  the time each was composed, and answered with a single reply.
- **FR-007** Every user-facing time MUST be resolved against the user's own
  profile timezone. The gateway MUST NOT read its own `TZ`.
- **FR-008** The mobile app MUST report the handset's IANA timezone to the
  profile on sign-in and whenever it changes.
- **FR-009** Reminders MUST support update (title, time, lead times), status
  changes, and permanent deletion.
- **FR-010** Finishing a reminder MUST delete its pending notification rows.
- **FR-011** Coaching check-in and program times MUST be per user, in that
  user's timezone, driven by a periodic tick rather than a fixed cron.
- **FR-012** The tick MUST act once per user per local date, claiming the date
  before sending, and MUST catch up if it was not running at the time.
- **FR-013** Operational values MUST live in the `settings` table, be
  validated per key, be editable from the admin portal, and take effect
  without a restart. Secrets MUST NOT be settable this way.
- **FR-014** The mobile app MUST take its defaults from the gateway rather
  than compiling in its own copies.
- **FR-015** A configured-but-unreadable FCM credential MUST fail the boot.
  Unconfigured push MUST still degrade quietly.
- **FR-016** The gateway MUST record when the sweep and the tick last ran, and
  surface staleness on `/health` and in the admin portal.

## Assumptions

- Android only. iOS paths are written where they were free, and untested.
- Arabic covers dates and notification copy; the interface stays English.
- Reminder sync is a full snapshot, not a delta — correct and self-healing at
  the number of reminders one person owns.
- Hard delete is allowed for any status server-side; the app offers it only on
  finished reminders.
- Per-user preferences live on `coaching_profiles` because that row already
  holds the timezone. The table name understates what it now stores.

## Out of scope

- Full Arabic interface translation and RTL layout.
- The `pending_reminder` clarification drafts the predecessor had: a
  half-finished reminder is still answered with a question, but the draft is
  not parked and resumed.
- A background isolate for silent sync nudges while the app is terminated. The
  staleness gate already prevents duplicate pings; the nudge only shortens how
  long a cancelled reminder keeps a stale alarm.
