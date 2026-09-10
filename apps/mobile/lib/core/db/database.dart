import 'package:drift/drift.dart';
import 'package:drift_flutter/drift_flutter.dart';
import 'package:uuid/uuid.dart';

part 'database.g.dart';

/// The columns every synced table carries, so that the sync rules are stated
/// once instead of re-derived per entity. First used by P2's tables.
///
/// [updatedAt] and [baseUpdatedAt] are deliberately two different things:
/// [updatedAt] is when *this device* last edited the row, [baseUpdatedAt] is
/// the server's own value for the version this device last pulled. The API
/// accepts a push outright while the base still matches; sending the local
/// edit time instead would never match, so every offline edit would fall
/// through to a clock comparison, which a slow handset loses.
mixin SyncColumns on Table {
  /// Client-minted UUIDv7 for anything the phone can create offline, so a
  /// retried create is a no-op rather than a duplicate.
  TextColumn get id => text()();

  DateTimeColumn get updatedAt => dateTime()();

  /// Null until a pull fills it in: the row has never been reconciled against
  /// a server timestamp.
  DateTimeColumn get baseUpdatedAt => dateTime().nullable()();

  /// What this device did that the server has not been told about, or null for
  /// a clean row. See [notPendingOp] before writing a filter over it.
  TextColumn get pendingOp => text().nullable()();

  IntColumn get pushAttempts => integer().withDefault(const Constant(0))();

  /// A delete keeps the row and never touches its status: the status is the
  /// only record of whether the thing was completed, cancelled or never dealt
  /// with, and the Deleted view exists to show exactly that.
  DateTimeColumn get deletedAt => dateTime().nullable()();
}

/// The pending operations the sync loop understands.
abstract final class PendingOps {
  static const String create = 'create';
  static const String update = 'update';
  static const String delete = 'delete';
  static const String restore = 'restore';
  static const String purge = 'purge';
}

/// "This row's pending operation is not [op]" — including every row that has
/// no pending operation at all.
///
/// `pendingOp.equals(op).not()` alone is SQL `NOT (pending_op = 'x')`, which is
/// NULL for a clean row, and NULL is falsy: the filter silently hides nearly
/// every row in the table. Bitten twice in v1; it lives here so a third slice
/// cannot get it wrong.
Expression<bool> notPendingOp(Expression<String> pendingOp, String op) =>
    pendingOp.isNull() | pendingOp.equals(op).not();

class KeyValues extends Table {
  TextColumn get key => text()();
  TextColumn get value => text()();

  @override
  Set<Column<Object>> get primaryKey => {key};
}

/// One of the member's labels.
///
/// Parent of [Tasks] as far as the sync order goes: labels are applied before
/// tasks on every pull, because a task carrying a label the device has never
/// heard of would render a blank chip.
///
/// No `userId` column, here or on any other synced table: the phone holds one
/// account's rows, and signing out clears them. A column that is the same
/// value on every row is a column every query has to carry and no query can
/// use.
@DataClassName('LocalLabel')
@TableIndex(name: 'labels_sort', columns: {#sortOrder})
@TableIndex(name: 'labels_pending', columns: {#pendingOp})
class Labels extends Table with SyncColumns {
  TextColumn get name => text()();

  /// `#rrggbb`. A palette entry or a colour the member picked themselves —
  /// which is why this is a string and not an index into the palette: the
  /// palette is an operator setting (`settings.labels.palette`) and may change
  /// under a label that was already given one of its colours.
  TextColumn get color => text()();

  IntColumn get sortOrder => integer().withDefault(const Constant(0))();

  DateTimeColumn get createdAt => dateTime()();

  @override
  Set<Column<Object>> get primaryKey => {id};
}

/// One task, mirroring the server's `tasks` shape (data-model §2.2).
///
/// The label is stored twice on purpose: [labelId] is the reference and
/// [labelName]/[labelColor] are the server's Extended Reference snapshot,
/// refreshed when the label is renamed. The snapshot is what a list renders,
/// so Today draws without a join and without a second query per row.
@DataClassName('LocalTask')
@TableIndex(name: 'tasks_due', columns: {#dueAt})
@TableIndex(name: 'tasks_status_due', columns: {#status, #dueAt})
@TableIndex(name: 'tasks_label', columns: {#labelId})
@TableIndex(name: 'tasks_pending', columns: {#pendingOp})
class Tasks extends Table with SyncColumns {
  TextColumn get title => text()();
  TextColumn get notes => text().nullable()();

  /// The moment the member chose. Null for a task with no date at all.
  DateTimeColumn get dueAt => dateTime().nullable()();

  /// An all-day task has a date and no moment, so nothing alarms from it —
  /// see `core/notifications/alert_plan.dart`, which skips it rather than
  /// waking somebody at midnight.
  BoolColumn get allDay => boolean().withDefault(const Constant(false))();

  /// 1 highest … 4 none, exactly as the server numbers them.
  IntColumn get priority => integer().withDefault(const Constant(4))();

  TextColumn get labelId => text().nullable()();
  TextColumn get labelName => text().nullable()();
  TextColumn get labelColor => text().nullable()();

  /// `open` | `completed` | `cancelled`. A delete never touches it: the status
  /// is the only record of whether the task was done, dropped or still
  /// waiting, and the Deleted view exists to show exactly that.
  TextColumn get status => text().withDefault(const Constant('open'))();
  DateTimeColumn get completedAt => dateTime().nullable()();

  /// The recurrence *rule*, as the JSON the server sent:
  /// `{ dtstart, rrule, mode, exdates[] }`.
  ///
  /// A rule plus its exceptions, never expanded rows — the window is expanded
  /// on read. Storing occurrences would make a moved one an edit to the series
  /// instead of an override, and there is no bottom to a series.
  TextColumn get recurrenceJson => text().nullable()();

  IntColumn get estimatedMinutes => integer().nullable()();
  IntColumn get deferCount => integer().withDefault(const Constant(0))();
  DateTimeColumn get deferredFrom => dateTime().nullable()();

  /// `app` | `chat` | `extension` | `rhythm` — who created it.
  TextColumn get source => text().withDefault(const Constant('app'))();

  DateTimeColumn get createdAt => dateTime()();

  @override
  Set<Column<Object>> get primaryKey => {id};
}

/// One reminder, mirroring the server's `reminders` shape (data-model §2.3).
@DataClassName('LocalReminder')
@TableIndex(name: 'reminders_remind_at', columns: {#remindAt})
@TableIndex(name: 'reminders_pending', columns: {#pendingOp})
class Reminders extends Table with SyncColumns {
  TextColumn get title => text()();

  /// The moment the member asked for. Never overwritten by a snooze.
  DateTimeColumn get remindAt => dateTime()();

  /// JSON array of offsets, e.g. `["1h","0m"]`. Empty means "the member's
  /// defaults", which live in [UserPreferences.leadTimesJson].
  TextColumn get leadTimesJson =>
      text().withDefault(const Constant('[]'))();

  /// `active` | `done` | `cancelled`.
  TextColumn get status => text().withDefault(const Constant('active'))();

  /// "Not now, in ten minutes" — a field of its own rather than a write to
  /// [remindAt], because the original moment is still the truth about what the
  /// member asked for. The alarm fires at `snoozedUntil ?? remindAt`, which is
  /// the same `effectiveAt` the server's aggregate plans from.
  DateTimeColumn get snoozedUntil => dateTime().nullable()();

  TextColumn get source => text().withDefault(const Constant('app'))();

  DateTimeColumn get createdAt => dateTime()();

  @override
  Set<Column<Object>> get primaryKey => {id};
}

/// The alerts the server planned for this device, as `/sync` returned them.
///
/// A mirror of `pendingAlerts` (next 7 days) and nothing else: it carries the
/// alerts this phone could *not* have worked out for itself — a meeting
/// occurrence, an evening prompt, a suggestion — so the local alarm plan is
/// the union of these rows and what the local tasks and reminders imply.
///
/// Deliberately without [SyncColumns], for the reason [Profiles] gives: alerts
/// are server-only (data-model §2.4), the phone never pushes one, and
/// `pendingOp`, `pushAttempts` and `baseUpdatedAt` on a table nothing pushes
/// would be three columns of speculation that every later migration has to
/// step over. The rows are replaced wholesale on every sync, so there is
/// nothing to reconcile either.
///
/// The instants here are **already final**: the server applied quiet hours
/// before sending them, so re-applying the shift on this side would move a
/// system alert twice. Only the locally derived alerts go through the quiet
/// window.
@DataClassName('LocalAlert')
@TableIndex(name: 'alerts_local_notify_at', columns: {#notifyAt})
class AlertsLocal extends Table {
  /// `kind|sourceId|occurrenceAt|label` — the server's own unique key for an
  /// alert, so the same alert pulled twice is one row, and the row a local
  /// task or reminder implies collides with the server's copy of it instead of
  /// double-notifying.
  TextColumn get id => text()();

  /// `reminder` | `task` | `meeting` | `rhythm` | `suggestion`.
  TextColumn get sourceKind => text()();
  TextColumn get sourceId => text()();

  /// Which occurrence of a recurring source this is, or null for a one-off.
  DateTimeColumn get occurrenceAt => dateTime().nullable()();

  /// `0m` | `1h` | `prep` | `evening` | `morning` | `suggestion`. Half of the
  /// notification id, so it has to be the server's own string rather than
  /// display text.
  TextColumn get label => text()();

  DateTimeColumn get notifyAt => dateTime()();

  TextColumn get title => text()();
  TextColumn get body => text().withDefault(const Constant(''))();
  TextColumn get deepLink => text().withDefault(const Constant(''))();

  /// When this mirror row was pulled. Not the alert's own time — this is about
  /// the copy, as on [Profiles].
  DateTimeColumn get fetchedAt => dateTime()();

  @override
  Set<Column<Object>> get primaryKey => {id};
}

/// The member's own facts, mirrored locally.
///
/// One row, keyed by `userId`. It is a *mirror*, not a source: the server owns
/// it, this device shows it, and P2's sync loop is what reconciles them. Which
/// is why it carries no [SyncColumns] — there is nothing to push from here yet,
/// and adding the columns before a slice pushes them would be five columns of
/// speculation in a table every later migration has to step over.
class Profiles extends Table {
  TextColumn get userId => text()();
  TextColumn get displayName => text().nullable()();
  TextColumn get photoPath => text().nullable()();
  TextColumn get timezone => text()();
  TextColumn get locale => text()();

  /// The metric history, as the JSON the API sent.
  ///
  /// Stored whole rather than as a table of its own: it is read together,
  /// never queried across members, and the server caps it. A `body_metrics`
  /// table would be a join for a list that is always shown in full.
  TextColumn get metricsJson => text().withDefault(const Constant('[]'))();

  /// Four string lists, each stored as JSON for the same reason.
  TextColumn get foodLikesJson => text().withDefault(const Constant('[]'))();
  TextColumn get foodDislikesJson => text().withDefault(const Constant('[]'))();
  TextColumn get allergiesJson => text().withDefault(const Constant('[]'))();
  TextColumn get symptomsJson => text().withDefault(const Constant('[]'))();

  DateTimeColumn get onboardingCompletedAt => dateTime().nullable()();

  /// When this mirror was last filled from the server. Not the profile's own
  /// updatedAt — this is about the copy, not the original.
  DateTimeColumn get fetchedAt => dateTime()();

  @override
  Set<Column<Object>> get primaryKey => {userId};
}

/// The knobs the member may turn, mirrored locally.
///
/// Kept as its own table rather than columns on [Profiles] because it is its
/// own aggregate on the server, with its own event and its own consumers — and
/// because the preferences screen writes it without touching the profile.
class UserPreferences extends Table {
  TextColumn get userId => text()();
  TextColumn get planTomorrowTime => text()();
  TextColumn get endOfDayTime => text()();
  TextColumn get morningBriefingTime => text()();
  TextColumn get nextPracticeCutoff => text()();
  TextColumn get leadTimesJson => text().withDefault(const Constant('[]'))();
  TextColumn get quietFrom => text()();
  TextColumn get quietTo => text()();
  TextColumn get weekStartsOn => text()();
  BoolColumn get checkinEnabled => boolean()();
  IntColumn get meetingDurationMin => integer()();
  TextColumn get mealMode => text()();
  BoolColumn get aiSuggestions => boolean()();
  DateTimeColumn get fetchedAt => dateTime()();

  @override
  Set<Column<Object>> get primaryKey => {userId};
}

/// One day's plan, mirroring the server's `daily_plans` shape (data-model §2.5).
///
/// The id is **not** a UUIDv7, unlike every other row carrying [SyncColumns]:
/// it is the server's own `"<userId>:<YYYY-MM-DD>"` composite. That is
/// deliberate and it buys the same thing the minted ids buy — there is exactly
/// one plan per member per day, so the id is derivable from the date and a
/// second confirm for the same day upserts the same row instead of creating a
/// rival one. [date] is stored again as its own column because the id is a key
/// and not a value: parsing a date back out of a composite id in a `where`
/// clause is a table scan.
///
/// [tasksJson] is the snapshot the server took when it proposed the plan —
/// `[{id,title,priority,dueAt,deferCount}]` — and it is stored as JSON rather
/// than as a join table for the reason [Profiles.metricsJson] gives: it is read
/// whole, every time, and never queried across plans. It is also a *snapshot*,
/// which matters: the plan records what was proposed, and the live `tasks` rows
/// record what has since been done. Home reads the first for the list and the
/// second for the ticks, which is why a task deleted after the plan was set
/// still shows in the plan it was part of rather than silently shrinking the
/// completion ring's denominator.
@DataClassName('LocalDailyPlan')
@TableIndex(name: 'daily_plans_date', columns: {#date})
@TableIndex(name: 'daily_plans_pending', columns: {#pendingOp})
class DailyPlans extends Table with SyncColumns {
  /// `YYYY-MM-DD` in the **member's** zone, as the server resolved it. A text
  /// column and not a `DateTimeColumn`: a local date is a date, and storing it
  /// as an instant would make it a moment in some zone — which is exactly the
  /// three-hour shift principle XI exists to stop.
  TextColumn get date => text()();

  /// `draft` | `confirmed` | `skipped`.
  TextColumn get status => text().withDefault(const Constant('draft'))();

  /// True when the end-of-day touch set the plan because the member never
  /// answered. Kept apart from [status] because "confirmed by me" and
  /// "confirmed for me at 22:00" are the same status and different sentences,
  /// and the summary has to say which.
  BoolColumn get autoConfirmed =>
      boolean().withDefault(const Constant(false))();

  TextColumn get tasksJson => text().withDefault(const Constant('[]'))();

  /// `{sessionId,title,sport,startAt}`, or null when there is no training —
  /// which is also what a member who answered "no training tomorrow" leaves
  /// behind, and what every plan looks like until P6 lands the Training
  /// context. The card reads correctly without it (spec Assumptions).
  TextColumn get trainingJson => text().nullable()();

  TextColumn get workoutLine => text().nullable()();

  /// Absent until P8's nutrition feature, and absent again whenever the model
  /// could not draft it — FR-012: a missing meal line never stops the plan
  /// being sent, so it must never stop the card drawing either.
  TextColumn get mealLine => text().nullable()();

  DateTimeColumn get promptedAt => dateTime().nullable()();
  DateTimeColumn get confirmedAt => dateTime().nullable()();
  DateTimeColumn get summarisedAt => dateTime().nullable()();
  DateTimeColumn get briefedAt => dateTime().nullable()();

  @override
  Set<Column<Object>> get primaryKey => {id};
}

/// One evening's check-in, mirroring the server's `checkins` shape (§2.5).
///
/// Same `"<userId>:<date>"` id as [DailyPlans], for the same reason: one per
/// member per day, so answering twice corrects the answer instead of recording
/// two days.
@DataClassName('LocalCheckin')
@TableIndex(name: 'checkins_date', columns: {#date})
@TableIndex(name: 'checkins_pending', columns: {#pendingOp})
class Checkins extends Table with SyncColumns {
  TextColumn get date => text()();

  /// 0..100, and **nullable on purpose**. Nought is a real answer — the worst
  /// day the scale can describe — so "no mood recorded" cannot be represented
  /// by a zero, and a non-nullable column with a default of 0 would turn every
  /// unanswered day into the member's worst. The week strip on Home reads the
  /// same distinction: see [adhered].
  IntColumn get mood => integer().nullable()();

  /// Whether the plan was followed, or null for a day that was never answered.
  ///
  /// Three states, not two, and the third one is the one that gets lost: a day
  /// the member did not answer is **not** a missed day. Rendering it as a miss
  /// tells somebody who was travelling that they broke a streak they never
  /// broke, which is why nothing on the phone stores this week as a
  /// `List<bool>`.
  BoolColumn get adhered => boolean().nullable()();

  TextColumn get note => text().nullable()();

  /// `chat` | `notification` | `app` — where the answer came from.
  TextColumn get source => text().withDefault(const Constant('app'))();

  @override
  Set<Column<Object>> get primaryKey => {id};
}

/// What the rhythm has already done for this member, and what it is waiting for.
///
/// One row per install, keyed by `userId`, mirroring the server's
/// `rhythm_states` (§2.5). Deliberately without [SyncColumns], for the reason
/// [Profiles] gives: the phone never writes a claim date or a streak — the tick
/// owns all of it — so `pendingOp`, `pushAttempts` and `baseUpdatedAt` here
/// would be three columns of speculation that every later migration has to step
/// over.
///
/// The three claim dates are mirrored rather than ignored because Home needs
/// them to know whether tonight's touch has already happened: a "plan tomorrow"
/// card offered before the prompt was ever sent would be asking the member to
/// confirm a draft that does not exist.
@DataClassName('LocalRhythmState')
class RhythmState extends Table {
  TextColumn get userId => text()();

  /// The local dates each touch was last claimed for, `YYYY-MM-DD`, null until
  /// the first one fires. Three columns and not one, for the same reason the
  /// server has three claim methods: a gateway that came back between the
  /// 21:00 and 22:00 touches must be able to send the one it missed without
  /// re-sending the one it did not.
  TextColumn get lastPlanPromptDate => text().nullable()();
  TextColumn get lastEndOfDayDate => text().nullable()();
  TextColumn get lastMorningBriefingDate => text().nullable()();

  /// Whether the end-of-day question is still open. One flag per member, which
  /// is why the server only ever interprets a reply inside the coach
  /// conversation — see the check-in note in the root `CLAUDE.md`.
  BoolColumn get awaitingCheckin =>
      boolean().withDefault(const Constant(false))();

  /// When the question was asked. The window that follows is an operator
  /// setting (`settings.rhythm.checkinWindowHours`), so it is not stored here:
  /// a length compiled into the phone would be a hard-coded default, which
  /// constitution XII calls a bug.
  DateTimeColumn get awaitingSince => dateTime().nullable()();

  IntColumn get streakCurrent => integer().withDefault(const Constant(0))();

  /// The best run so far, kept when the current one resets. FR-008: a "no"
  /// restarts the count and must not erase what the member already managed.
  IntColumn get streakBest => integer().withDefault(const Constant(0))();

  TextColumn get lastAdheredDate => text().nullable()();

  @override
  Set<Column<Object>> get primaryKey => {userId};
}

/// Thrown when the ladder is asked for a step it has no branch for.
///
/// drift's own default `onUpgrade` throws too, which is the right behaviour and
/// the reason a forgotten branch bricks every existing install rather than
/// failing loudly in CI. This one names the step so the CI failure says what is
/// missing.
class MigrationLadderError extends Error {
  MigrationLadderError(this.from, this.to);

  final int from;
  final int to;

  @override
  String toString() =>
      'MigrationLadderError: no migration from schema $from to $to. '
      'A drift schema change needs a schemaVersion bump AND a matching branch '
      'in AppDatabase.migration, in the same change.';
}

@DriftDatabase(
  tables: [
    KeyValues,
    Profiles,
    UserPreferences,
    Labels,
    Tasks,
    Reminders,
    AlertsLocal,
    DailyPlans,
    Checkins,
    RhythmState,
  ],
)
class AppDatabase extends _$AppDatabase {
  AppDatabase() : super(driftDatabase(name: 'botvy_v2'));

  /// Test constructor: whatever executor the test opened, no platform plugins.
  AppDatabase.forTesting(super.executor);

  @override
  int get schemaVersion => 4;

  @override
  MigrationStrategy get migration => MigrationStrategy(
    onCreate: (m) async {
      // drift maps a stored user_version of 0 to "brand new database", so
      // a file that already holds tables but was never stamped lands here
      // rather than in onUpgrade. `createAll` would then fail with
      // sqlite's "table already exists" — a driver error nobody can act
      // on. Name it instead.
      final existing = await customSelect(
        "SELECT name FROM sqlite_master WHERE type = 'table' "
        "AND name NOT LIKE 'sqlite_%'",
      ).get();
      if (existing.isNotEmpty) {
        throw MigrationLadderError(0, schemaVersion);
      }
      await m.createAll();
    },
    onUpgrade: (m, from, to) async {
      // Every bump adds its own guarded branch HERE and raises schemaVersion
      // in the same change; test/migration_ladder_test.dart gains one case per
      // bump. A forgotten branch falls through to the throw at the bottom,
      // which is a loud CI failure rather than an install that will not open.

      // A note on the guards, because P3 found a defect in them.
      //
      // drift calls this **once** with the pair it actually has — a phone that
      // last ran schemaVersion 1 and is opening version 4 arrives as
      // `(from: 1, to: 4)` and every branch below sees `from == 1`. So a
      // branch guarded `from >= 2 && from < 3` never runs for that phone, and
      // it is the *only* thing that creates `tasks`, `labels`, `reminders` and
      // `alerts_local`: a v1 install upgrading straight to v3 came out with the
      // profile mirrors and no task tables at all, and every query against them
      // failed for the life of the install. Nothing caught it because the
      // ladder test only ever opened a v1 file against a v2 schema, where the
      // two guard shapes agree.
      //
      // The rule the root `CLAUDE.md` states is about `addColumn`, and it is
      // still exactly right there: a column added to a table that a *later*
      // branch's `createTable` builds from today's definition must be guarded
      // `from >= N && from < M`, or it fails with "duplicate column" on every
      // upgrade from before that table existed. A `createTable` needs the other
      // half of that rule — `from < N`, "this install predates the version that
      // introduced the table" — because `from == 0` is `onCreate`'s job and
      // never reaches here at all.
      //
      // So: `createTable` is guarded `from < N`. `addColumn` is guarded
      // `from >= N && from < M`. Two shapes, one reason, and the ladder test
      // now opens a file from *every* earlier version against the current
      // schema rather than only the previous one.

      // 1 -> 2: the profile and preferences mirrors.
      if (from < 2) {
        await m.createTable(profiles);
        await m.createTable(userPreferences);
      }

      // 2 -> 3: tasks, labels, reminders and the alert mirror.
      //
      // `createTable` builds the table and nothing else: drift creates a
      // table's indexes as separate schema entities, which `createAll` picks
      // up on a fresh install and an upgrade does not. So each index is
      // created here explicitly. Missing them costs nothing visible in a test
      // database of ten rows and shows up as a slow Today list on a real one.
      if (from < 3) {
        await m.createTable(labels);
        await m.createTable(tasks);
        await m.createTable(reminders);
        await m.createTable(alertsLocal);

        await m.create(labelsSort);
        await m.create(labelsPending);
        await m.create(tasksDue);
        await m.create(tasksStatusDue);
        await m.create(tasksLabel);
        await m.create(tasksPending);
        await m.create(remindersRemindAt);
        await m.create(remindersPending);
        await m.create(alertsLocalNotifyAt);
      }

      // 3 -> 4: the daily rhythm — the plan, the check-ins and the claim/streak
      // row (P3, `specs/017-daily-rhythm` T350).
      //
      // Three creates and no `addColumn`, so `from < 4` is the whole guard: a
      // phone at 1, 2 or 3 all need these built, and a phone at 4 or later is
      // not in `onUpgrade` for this step. The indexes are listed for the reason
      // the 2 -> 3 branch gives — an upgrade that only calls `createTable`
      // leaves a phone with the tables and none of the indexes, and nothing
      // ever says so.
      if (from < 4) {
        await m.createTable(dailyPlans);
        await m.createTable(checkins);
        await m.createTable(rhythmState);

        await m.create(dailyPlansDate);
        await m.create(dailyPlansPending);
        await m.create(checkinsDate);
        await m.create(checkinsPending);
      }

      // Anything the ladder above did not cover.
      if (from < 1 || from > schemaVersion) throw MigrationLadderError(from, to);
    },
  );

  Future<String?> getValue(String key) async {
    final row = await (select(
      keyValues,
    )..where((r) => r.key.equals(key))).getSingleOrNull();
    return row?.value;
  }

  Future<void> setValue(String key, String value) => into(
    keyValues,
  ).insertOnConflictUpdate(KeyValuesCompanion.insert(key: key, value: value));
}

/// Keys used by the shared plumbing. Feature slices declare their own.
abstract final class DbKeys {
  static const String installId = 'installId';
  static const String fcmToken = 'fcmToken';

  /// The server's own id for this device, learned when it registers.
  ///
  /// Kept because removing a device is addressed by that id rather than by the
  /// install id — the two are deliberately different, and the install id is
  /// the one the phone mints while this one only the server can supply.
  static const String deviceId = 'deviceId';

  /// The signed-in member, so the mirrors can be read before a request.
  static const String userId = 'userId';
}

/// This install's id, minted once and kept forever.
///
/// It is what tells the server this handset already holds the upcoming alarms,
/// so the server-side sweep can skip it. Losing it means being notified twice.
Future<String> stableInstallId(AppDatabase db) async {
  final existing = await db.getValue(DbKeys.installId);
  if (existing != null && existing.isNotEmpty) return existing;
  final fresh = const Uuid().v7();
  await db.setValue(DbKeys.installId, fresh);
  return fresh;
}
