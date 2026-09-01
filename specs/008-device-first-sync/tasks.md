# Tasks: The Phone Holds the Account

**Spec**: [spec.md](./spec.md) · **Status**: Implemented

## Prerequisite — the migration that did not exist

- [x] **T001** A drift `MigrationStrategy`. There was none, and drift's default
      `onUpgrade` throws, so bumping `schemaVersion` would have failed to open
      the database on every install that already had data.
      *Evidence*: `test/migration_test.dart`, 9 tests against a hand-built
      v1-shaped sqlite file — a pending reminder, its ping, a queued message and
      the dead profile blob.
- [x] **T002** `wipe()` clears the new tables and the cursor.
      *Evidence*: "signing out leaves none of the account behind".

## Gateway — making a delta expressible

- [x] **T003** Migration `20260901120000_add_sync_cursors_and_tombstones`:
      `updatedAt` on CheckIn and WorkoutRecord, `deletedAt` on Reminder, three
      `(user_id, updated_at)` indexes. Backfilled from `created_at`, not the
      migration clock, so historical rows do not all look changed today.
- [x] **T004** Soft delete. `remove()` sets `deletedAt`; `list()`,
      `ownedOrThrow()` and the sweep's due query each gained one condition, so a
      tombstone is not listed, cannot be resurrected by a PATCH, and never rings.
- [x] **T005** `reminders.tombstoneDays` setting (default 30), purged by the
      sweep, and a cursor past that horizon answered with a full snapshot.
      *Evidence*: `sweep.spec.ts`; e2e check 8.
- [x] **T006** `upsertProfile` filters `undefined` only, so a field can be
      cleared. It could not be before.

## Gateway — POST /sync

- [x] **T007** Push then pull in one pass, delegating to the existing
      `RemindersService` and `CoachingService` so ping re-planning and lead-time
      preservation come from code that already works.
- [x] **T008** Cursor lags real time by `OVERLAP_MS`; the staleness clamp uses
      *real* server time. Conflating the two rejected every edit made in the
      last five seconds.
      *Evidence*: "accepts an edit made seconds ago against a row touched
      seconds ago" — found by the live round trip, not the unit tests.
- [x] **T009** `clientWins`: base-timestamp match accepted outright, otherwise
      `min(claimed, realNow) >= row.updatedAt`. Rejections carry the winning row.
- [x] **T010** The profile push reuses `UpdateCoachingProfileDto` as its
      allowlist, so `whitelist: true` makes server-owned fields unreachable by
      construction.
- [x] **T011** `@Throttle({ ttl: 60_000, limit: 120 })` — the global guard is
      20/min, which resume + connectivity + push nudge + post-batch would trip.
- [x] **T012** 18 tests in `test/sync.spec.ts`. Full snapshot, per-entity delta
      filters, tombstones included, cursor lag, horizon fallback, userId on every
      where-clause, and the six conflict paths.

## Mobile — the local copy

- [x] **T013** New tables: `coaching_profiles` (one row, the eight editable
      fields plus two read-only ones, plus `dirty`), `checkins` and
      `workout_records` keyed by their date so upserts are idempotent for free.
- [x] **T014** `baseUpdatedAt` on reminders — the server's timestamp for the
      version last pulled, never written by a local edit. Sending the local edit
      time instead meant the uncontested path could never fire and a slow
      handset would lose every offline edit.
      *Evidence*: "sends the server timestamp as the base, not this handset's
      clock".
- [x] **T015** The delete sweep runs only against a full snapshot.
      *Evidence*: "a delta must not delete a reminder that simply did not
      change" — the most destructive regression available here.
- [x] **T016** Step isolation: one failing step cannot abort the pass or lose
      the cursor, and the alarms are re-armed either way.
- [x] **T017** `pushAttempts`, bumped on rejection, never on an offline throw.
      A week in airplane mode must not exhaust the outbox.
- [x] **T018** 17 tests in `test/sync_test.dart` against a subclassed
      `ApiClient`.

## Mobile — the three bugs found on the way

- [x] **T019** The FCM nudge wrote a key-value row nothing read. It calls
      `kick()` now.
- [x] **T020** The chat outbox marked every queued row synced regardless of
      what was sent. `outbox()` is now `role='user' AND clientId IS NOT NULL`,
      and only acknowledged ids are marked.
- [x] **T021** No resume trigger. `_RootState` observes the lifecycle.

## Mobile — what the user sees

- [x] **T022** Coaching settings are a local write plus a sync kick. The
      "needs a connection" branch is gone, and the timezone follows the same
      dirty-and-push path instead of a special-cased PATCH that lost a zone
      changed offline.
- [x] **T023** History screen: streak, weekly adherence, recent check-ins, past
      programs. Reads only local tables.
- [x] **T024** `streak.dart` ports `adherence.ts`. The ratio divides by
      *answered* days, not by seven — the first port divided by seven and would
      have contradicted the user's own coaching.
      *Evidence*: `test/streak_test.dart` runs the gateway's own fixtures.

## Verification

- [x] **T025** Gateway: 195 tests, 19 files. Mobile: 73 tests, analyzer clean.
- [x] **T026** End-to-end against the running stack, 9 checks: full snapshot;
      offline-created reminder pushed and given a server id; replayed clientId
      makes one row not two; stale edit rejected with the winner attached;
      uncontested edit accepted; server-side delete arriving as a tombstone;
      quiet delta staying a delta; ancient cursor forcing a full snapshot;
      nightly-tick check-in and program arriving in the next delta.
- [x] **T027** Release APK builds (62.0 MB).

## Left undone, deliberately

- On-device airplane-mode walkthrough and the install-over-previous-release
  upgrade check. `migration_test.dart` covers the upgrade at the database level;
  neither is covered on real hardware.
- The Docker VM clock runs ~6s ahead of the host here. Harmless to the product —
  every comparison that matters is server-side — but it makes host-side tooling
  that compares timestamps look wrong.
