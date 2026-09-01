# Feature Specification: The Phone Holds the Account

**Feature Branch**: `008-device-first-sync`

**Created**: 2026-09-01

**Status**: Implemented

**Input**: User description: "for the shared database we need all data related
to the mobile device user to be stored in the device sqlite database and sync
it with Postgres when connected with it."

## Why this feature exists

006 made reminders and chat local-first. Everything else about a user —
coaching settings, check-ins, the programs Botvy had generated — still lived
only in Postgres. Two consequences the user hit directly:

- The coaching section of Settings was network-only. With no signal it rendered
  "Coaching settings need a connection" and refused every edit, including the
  check-in time and the timezone.
- There was nowhere to see how the days had gone. The streak and adherence the
  nightly coaching tick computes were used to write one sentence into a chat
  message and were otherwise invisible.

The alternative on the table was a shared cloud database. It was dropped: 007
already rejected it for chat history, and the same reasoning holds harder here.
This is the other direction — the device holds a complete, editable copy, and
Postgres is the shared merge point rather than the only home.

## What "the phone holds it" can and cannot mean

The gateway keeps generating data the phone could not produce. The nightly tick
writes check-ins, workout records and the awaiting-check-in flag; the sweep
marks pings delivered; chat creates reminders and messages with no client id.
So this is **a complete local copy with the server as the merge point**, not a
server demoted to a backup. Reminders and the coaching profile flow both ways.
Check-ins, workout records and server-authored messages are pull-only.

## What was found while building it

Four things the plan did not survive contact with:

| Assumption | What was actually true |
|---|---|
| Bump `schemaVersion` and add the tables | **There was no `MigrationStrategy` at all.** Drift's default `onUpgrade` throws, so a version bump would have failed to open the database on every install that already had data. Blocking prerequisite for everything else. |
| The client can send its own edit time as the conflict base | The base must be the *server's* timestamp for the version the device last pulled. Sending the local edit time means it can never match, the uncontested path never fires, and a handset running slow loses every offline edit. Reminders needed a second timestamp column that a local edit never touches. |
| One `now` for the whole request | Two clocks. The cursor handed back lags real time by 5s so a transaction committing just after the pull queries is not skipped forever; the staleness clamp must use *real* server time. Clamping to the lagged value rejects every honest edit made in the last five seconds. |
| Port the adherence maths and it will agree | The gateway divides adhered days by *answered* days, not by seven. A port that divided by seven would have shown the user a number contradicting their own coaching. |

The second and third were found by running the round trip against the live
stack, not by the unit tests — which is also how the Docker VM's clock was
found to run ~6s ahead of the host.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Settings work with no signal (Priority: P1)

**Acceptance**: in airplane mode, changing the check-in time, toggling coaching
and editing training days all succeed and show "waiting to sync". On reconnect
one round trip carries all of it and the database shows the new values.

### User Story 2 - I can see how the week went, offline (Priority: P1)

**Acceptance**: the History screen opens with no connection and shows the
streak, the share of answered days that went to plan, the recent check-ins and
the past programs with their muscle groups. The numbers match what the gateway
would compute from the same rows.

### User Story 3 - A deletion made elsewhere reaches the phone (Priority: P1)

**Acceptance**: deleting a reminder on the server makes it disappear from the
phone on the next sync, not only on a reinstall.

### User Story 4 - Concurrent edits resolve without losing work (Priority: P1)

**Acceptance**: a reminder edited offline while the server also changed it
resolves to the newer edit, and the loser is visibly replaced rather than
silently dropped.

### User Story 5 - Upgrading keeps what I had (Priority: P1)

**Acceptance**: installing over the previous release keeps every reminder, its
alarms, and any message still queued to send.

## Requirements *(mandatory)*

- **FR-001** One endpoint, `POST /sync`, MUST carry both directions in a single
  pass: push first, then pull, so an offline-created reminder comes back with
  its server id and its re-planned pings in the same response.
- **FR-002** The cursor MUST be server-issued and echoed back verbatim. A device
  clock MUST NOT be able to corrupt it.
- **FR-003** The cursor MUST lag real time. A transaction that began before the
  pull queries and commits after them would otherwise be skipped forever by the
  next `updatedAt > since`. Duplicates cost nothing — every apply is an upsert
  by id — and a missed row costs everything.
- **FR-004** Deletion MUST be expressible in a delta. Reminders are
  soft-deleted; a tombstone is pulled like any other change.
- **FR-005** Tombstones MUST be purged past `reminders.tombstoneDays`, and a
  cursor older than that horizon MUST be answered with a full snapshot — a
  delta after a purge would silently resurrect deleted rows.
- **FR-006** Conflicts resolve newest-edit-wins, but a push whose base
  timestamp still matches the server row MUST be accepted outright, consulting
  no clock. That is the ordinary case.
- **FR-007** The base timestamp a client sends MUST be the server's own value
  for the version it last pulled, never its local edit time.
- **FR-008** A claimed edit time MUST be clamped to *real* server time, so a
  handset set to 2099 cannot win every conflict for the rest of its life — and
  MUST NOT be clamped to the lagged cursor, which rejects honest edits.
- **FR-009** A rejected push MUST return the winning row, and the device MUST
  overwrite its copy with it. Nothing is lost silently.
- **FR-010** One rejected row MUST NOT block the outbox. It keeps its pending
  operation, counts an attempt, and stops being re-sent after five. An offline
  attempt MUST NOT count.
- **FR-011** The delete-what-the-server-does-not-have sweep MUST run only
  against a full snapshot. Running it on a delta deletes every unchanged local
  reminder.
- **FR-012** The coaching profile needs no conflict detection: the columns a
  client may write and the columns the nightly tick writes are disjoint sets.
  The client-writable set MUST be an explicit allowlist, never a `toJson`.
- **FR-013** Server-owned profile fields (`awaitingCheckin`, `awaitingSince`,
  `lastCheckinSentDate`, `lastProgramSentDate`) MUST be unreachable from a
  client.
- **FR-014** The device MUST NOT hold: another user's anything, other devices'
  FCM tokens, password hashes, refresh tokens, usage logs, or global settings.
- **FR-015** A drift `MigrationStrategy` MUST exist before any schema change
  ships, and MUST preserve pending operations and queued messages.
- **FR-016** `wipe()` MUST clear the new tables and the cursor, or signing out
  leaves the previous account's history on the device.
- **FR-017** Streak and adherence MUST be computed on the device from local
  rows, using the same rules as `coaching/adherence.ts`, and MUST be tested
  against the same fixtures.
- **FR-018** A failed sync MUST still re-arm the local alarms. They are the
  product; a network error must not leave them unset.

## Assumptions

- **An allergy edited offline does not protect the user until it syncs.** The
  server gates plan withholding on its own copy, so the risk window equals the
  offline window. The "waiting to sync" chip is the only honest mitigation.
- A verbatim retry of a push that already succeeded lands in `rejected[]`. It is
  harmless — the returned row already contains that edit — but it looks alarming
  in a log.
- The message cursor is an autoincrement id, not a timestamp. There is a
  theoretical commit-ordering gap if a live streamed turn and a batch flush
  commit out of order for one user. The fix, if it ever bites, is a `createdAt`
  cursor with the same overlap trick.
- The streak is computed against the device's calendar date, so a user who has
  just flown sees a day-old streak until the timezone syncs. It is a display;
  the server's own number drives coaching.

## Out of scope

- A shared cloud database, again and for the same reasons.
- Chat paging. The local store is already cumulative and `/sync` carries
  messages; older history simply was never stored and is not retrofitted.
- `drift_schemas/` and generated migration tests. That machinery earns its keep
  when a migration alters or drops a column, not for adds.
