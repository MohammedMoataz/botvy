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

/// One of the member's chats, mirroring the server's `conversations` shape
/// (data-model §2.9).
///
/// Two of these exist from the day the member registers and cannot be got rid
/// of: `coach` and `planner` (FR-001). Their [pinned] flag is what puts them in
/// their own section at the top of the list, and the server refuses to clear
/// it — a `PATCH` that unpins one, an archive, or a `DELETE` all come back
/// `403 protected`, and the phone's answer to that is to offer *clearing*
/// instead. Nothing here enforces that locally: a client-side rule would be a
/// second implementation of a decision the server owns, and the two would
/// disagree the first time the operator seeded a third pinned kind.
///
/// Carries [SyncColumns] and is nonetheless **pull-only** through the sync
/// engine, which needs saying because the combination looks like an oversight.
/// The writes — create, rename, pin, archive, clear, delete — go out as REST
/// commands (`rest-commands.md`, Conversations), for the same reason the daily
/// rhythm's two writes do: the refusals are the point. A `protected` verdict
/// has to reach the member as a sentence with a next step in it, and a sync
/// push that is refused arrives as a rejection three seconds later with no
/// screen still open to show it. What the mixin's columns actually buy here is
/// [SyncColumns.baseUpdatedAt]: `PATCH /conversations/:id` takes it verbatim,
/// so the server can accept the edit outright while the base still matches
/// rather than falling through to a clock comparison a slow handset loses.
///
/// [clearedUpToSeq] is the one column with a rule on both sides. The server
/// pulls messages from `max(lastSeq, clearedUpToSeq)`, and the sync applier
/// here deletes every local message at or below it the moment a higher value
/// arrives — because FR-011 says nothing cleared may reappear in the history a
/// screen shows, and a device that already holds those rows would otherwise go
/// on showing them for ever. The server's half only stops them being sent
/// *again*.
@DataClassName('LocalConversation')
@TableIndex(name: 'conversations_updated', columns: {#updatedAt})
@TableIndex(name: 'conversations_pending', columns: {#pendingOp})
class Conversations extends Table with SyncColumns {
  /// `coach` | `planner` | `free`. Not an enum column: the set is the server's
  /// and a fourth kind from a newer gateway has to land in the row rather than
  /// fail the pull, which is what a strict local enum would do.
  TextColumn get kind => text().withDefault(const Constant('free'))();

  /// The member's own opening words for a chat that was moved here, the seeded
  /// name for the two pinned ones. Empty is legitimate — a chat created from
  /// the list before anything has been said has no title yet — so the screen
  /// falls back to a placeholder rather than this column carrying one.
  TextColumn get title => text().withDefault(const Constant(''))();

  BoolColumn get pinned => boolean().withDefault(const Constant(false))();
  BoolColumn get archived => boolean().withDefault(const Constant(false))();

  /// The highest message sequence the member has cleared away.
  ///
  /// A watermark and not a delete, so clearing is idempotent and survives a
  /// device that has been away: the number is what a catching-up phone compares
  /// its own rows against. Nought means nothing has been cleared, which is why
  /// it defaults to nought rather than being nullable — "cleared up to message
  /// zero" and "never cleared" are the same statement.
  IntColumn get clearedUpToSeq => integer().withDefault(const Constant(0))();

  /// When something was last said here, for the list's ordering. Null for a
  /// chat nobody has written in.
  DateTimeColumn get lastMessageAt => dateTime().nullable()();

  DateTimeColumn get createdAt => dateTime()();

  @override
  Set<Column<Object>> get primaryKey => {id};
}

/// One meeting — and for a repeating one, one *series* (data-model §2.10).
///
/// Mirrors `MeetingSyncAdapter.pull` field for field. Three of those fields are
/// the interesting ones and each is stored as the JSON the server sent rather
/// than as columns or child rows:
///
/// * [recurrenceJson] is `{dtstart, rrule, exdates[], overrides[]}` — a rule
///   plus its exceptions, **never expanded rows** (FR-006). A series of any
///   length is one row here, and `core/recurrence/expander.dart` derives the
///   occurrences for whatever window a screen asks about. Materialising them
///   would make "skip one" ambiguous and would push a long series down the sync
///   channel a device has to store.
/// * [locationJson] is `{onlineLink, address}`. Two columns would have done and
///   would then have to agree with the server's own object on the wire; the
///   invariant that at least one half is present (FR-001) lives on the server's
///   aggregate and in the editor, not in a column constraint that cannot
///   express "either of these two".
/// * [reminderOffsetsJson] is the minutes-before list, stored at creation from
///   the member's defaults so a later change to those defaults never silently
///   moves the warnings of a meeting that already exists.
///
/// [authoredTimezone] is carried and never written by this device. It records
/// what the member's clock read when they typed "18:00", and the expander
/// recovers those digits from the stored instant against it — a client that
/// rewrote it would move every occurrence of the series with nothing on the row
/// visibly changing. The server refuses to read a pushed copy for the same
/// reason.
@DataClassName('LocalMeeting')
@TableIndex(name: 'meetings_start', columns: {#startAt})
@TableIndex(name: 'meetings_status_start', columns: {#status, #startAt})
@TableIndex(name: 'meetings_pending', columns: {#pendingOp})
class Meetings extends Table with SyncColumns {
  TextColumn get title => text()();
  TextColumn get description => text().nullable()();

  /// The instant the member placed. For a series this is also what
  /// `recurrence.dtstart` anchors on, and the expander re-reads its wall clock
  /// rather than trusting the instant — see [authoredTimezone].
  DateTimeColumn get startAt => dateTime()();

  IntColumn get durationMin => integer().withDefault(const Constant(30))();

  /// On the row because the server's document carries it, and unread here for
  /// the same reason: a whole-day entry is a [CalendarEvents] row (FR-001).
  BoolColumn get allDay => boolean().withDefault(const Constant(false))();

  /// The zone this series is pinned to, or null to follow the member (FR-007).
  TextColumn get lockTimezone => text().nullable()();

  /// The zone whose clock the member was reading when they wrote this. Never
  /// written by the phone; see the class note.
  TextColumn get authoredTimezone => text().withDefault(const Constant(''))();

  /// `{onlineLink, address}`, as the server sent it.
  TextColumn get locationJson => text().nullable()();

  TextColumn get prepNotes => text().nullable()();
  IntColumn get prepMinutes => integer().withDefault(const Constant(0))();

  /// JSON array of minutes before the occurrence, e.g. `[1440,30]`.
  TextColumn get reminderOffsetsJson =>
      text().withDefault(const Constant('[]'))();

  /// `{dtstart, rrule, exdates[], overrides[]}` or null. See the class note.
  TextColumn get recurrenceJson => text().nullable()();

  /// `scheduled` | `completed` | `cancelled`. A delete never touches it: the
  /// status is the only record of whether the meeting happened, was called off
  /// or was simply removed from the diary.
  TextColumn get status => text().withDefault(const Constant('scheduled'))();
  DateTimeColumn get completedAt => dateTime().nullable()();

  /// `app` | `chat` | `extension`.
  TextColumn get source => text().withDefault(const Constant('app'))();

  DateTimeColumn get createdAt => dateTime()();

  @override
  Set<Column<Object>> get primaryKey => {id};
}

/// One personal event — a birthday, a holiday, a block of focus time (FR-011).
///
/// Its own table rather than a flag on [Meetings], mirroring the server's two
/// aggregates: an event has a colour and may fill a whole day, and has none of
/// a meeting's location, preparation, reminders or outcome. A flag would switch
/// off half the columns of one table.
///
/// The *repeat* is deliberately identical: [recurrenceJson] holds the same
/// object a meeting's does and goes through the same expander, so a birthday
/// moved one year behaves exactly as a meeting moved one week.
@DataClassName('LocalCalendarEvent')
@TableIndex(name: 'calendar_events_start', columns: {#startAt})
@TableIndex(name: 'calendar_events_pending', columns: {#pendingOp})
class CalendarEvents extends Table with SyncColumns {
  TextColumn get title => text()();
  TextColumn get notes => text().nullable()();

  DateTimeColumn get startAt => dateTime()();

  /// After [startAt], and at most a year later — the server's own bound, and
  /// not tidiness: the expander derives an occurrence's window from the length,
  /// so an unbounded event would appear on every agenda between its two ends.
  DateTimeColumn get endAt => dateTime()();

  BoolColumn get allDay => boolean().withDefault(const Constant(false))();

  /// `#rrggbb`, or null for the theme's own. A string and not a palette index,
  /// for the reason [Labels.color] gives.
  TextColumn get color => text().nullable()();

  TextColumn get recurrenceJson => text().nullable()();

  /// As on [Meetings], and never written here. An event has no `lockTimezone`
  /// at all — a birthday is a date rather than an instant, so pinning it to a
  /// zone would put a member who flew on the wrong day of their own birthday.
  TextColumn get authoredTimezone => text().withDefault(const Constant(''))();

  DateTimeColumn get createdAt => dateTime()();

  @override
  Set<Column<Object>> get primaryKey => {id};
}

/// One training session — planned, and then logged (data-model §2.6).
///
/// **There is no `missed` column, and there must not be.** "Missed" is a
/// `planned` session whose moment has passed with nothing logged, and it is a
/// reading of the clock rather than an outcome anybody records (FR-018): the
/// server's `Session.isMissed(now, tz)` answers it, `isMissed` in
/// `features/athlete/application/athlete.dart` is the phone's copy of that one
/// line, and nothing on either side writes it. A column would need a sweep to
/// set it and a second one to un-set it the moment the member logged the
/// session late — and the card, the week view and Today would then have three
/// chances to disagree.
///
/// [exercisesJson] holds `[{id,name,notes,mediaRefs,sets:[…]}]` as the JSON the
/// server sent, for the reason [Tasks.recurrenceJson] gives: it is read whole,
/// every time, and never queried across sessions. A set is one shape for every
/// sport with optional fields — the *sport* decides which pair the editor draws
/// — so a table of sets would be forty nullable columns and a join for a list
/// that is always shown in full.
///
/// [slotId] is null for a session the member made by hand, which is what keeps
/// it out of the materialiser's way; [suggestionId] is carried and written by
/// nothing until P7.
@DataClassName('LocalSession')
@TableIndex(name: 'sessions_planned_at', columns: {#plannedAt})
@TableIndex(name: 'sessions_status_planned', columns: {#status, #plannedAt})
@TableIndex(name: 'sessions_pending', columns: {#pendingOp})
class Sessions extends Table with SyncColumns {
  DateTimeColumn get plannedAt => dateTime()();

  IntColumn get durationMin => integer().withDefault(const Constant(60))();

  /// One of the seven known names or the member's own word. A text column and
  /// not an enum, for the reason [Conversations.kind] gives — and here it is
  /// the product rule as well: "other" in the picker is a text field, not a
  /// bucket, so a member whose sport is padel stores `padel`.
  TextColumn get sport => text()();

  TextColumn get title => text()();
  TextColumn get focus => text().nullable()();

  /// Which program filled this, and which of its weeks. Null for a bare slot.
  TextColumn get programId => text().nullable()();
  IntColumn get weekIndex => integer().nullable()();

  /// Which weekly slot produced it. Null for a session made by hand.
  TextColumn get slotId => text().nullable()();

  TextColumn get suggestionId => text().nullable()();

  TextColumn get exercisesJson => text().withDefault(const Constant('[]'))();

  /// `planned` | `completed` | `cancelled` | `skipped`. Four, and a delete
  /// never touches it: a skipped session stays in the week marked skipped,
  /// which is the whole of FR-005's honesty.
  TextColumn get status => text().withDefault(const Constant('planned'))();
  DateTimeColumn get completedAt => dateTime().nullable()();

  TextColumn get notes => text().nullable()();

  DateTimeColumn get createdAt => dateTime()();

  @override
  Set<Column<Object>> get primaryKey => {id};
}

/// One program: weeks of session templates (data-model §2.6).
///
/// [weeksJson] is `[{index, sessions:[{templateId, weekday, title, focus,
/// exercises:[…]}]}]`, stored whole for the reason [Sessions.exercisesJson]
/// gives. Nothing on the phone queries inside it.
///
/// [appliedStartDate] is the local date the member applied it from, `YYYY-MM-DD`
/// — a text column and not an instant, because a date is a date. It is what
/// lets the server's materialiser compute a week index long after the apply, so
/// week four of a four-week program lands on the day the horizon reaches it;
/// the phone carries it so the detail screen can say which week is running.
@DataClassName('LocalProgram')
@TableIndex(name: 'programs_status', columns: {#status})
@TableIndex(name: 'programs_pending', columns: {#pendingOp})
class Programs extends Table with SyncColumns {
  TextColumn get title => text()();
  TextColumn get sport => text()();

  /// `user` | `suggestion` | `link`.
  TextColumn get source => text().withDefault(const Constant('user'))();

  /// The ids only, never the links themselves: Knowledge owns those and does
  /// not exist until P7. A client that wants them asks Knowledge.
  TextColumn get sourceLinkIdsJson =>
      text().withDefault(const Constant('[]'))();

  TextColumn get weeksJson => text().withDefault(const Constant('[]'))();

  /// `active` | `archived`. Archiving stops the program filling anything new
  /// and never rewrites a week the member can already see (FR-008).
  TextColumn get status => text().withDefault(const Constant('active'))();

  TextColumn get appliedStartDate => text().nullable()();

  DateTimeColumn get createdAt => dateTime()();

  @override
  Set<Column<Object>> get primaryKey => {id};
}

/// One entry in the member's own workout library (FR-009).
@DataClassName('LocalWorkout')
@TableIndex(name: 'workouts_sport', columns: {#sport})
@TableIndex(name: 'workouts_pending', columns: {#pendingOp})
class Workouts extends Table with SyncColumns {
  TextColumn get name => text()();
  TextColumn get sport => text()();
  TextColumn get exercisesJson => text().withDefault(const Constant('[]'))();
  TextColumn get tagsJson => text().withDefault(const Constant('[]'))();

  DateTimeColumn get createdAt => dateTime()();

  @override
  Set<Column<Object>> get primaryKey => {id};
}

/// What the member practises and when (data-model §2.6).
///
/// One row, keyed by `userId`, and the one entity in this phase the server
/// takes as a **patch** rather than as a row: `sync.md`'s push slot is
/// `{"athlete_profile": {"patch": {…}}}` over an allowlist of `sports` and
/// `slots`, with no conflict check — the fields a client writes and the fields
/// server jobs write are disjoint sets — and no delete sweep, because there is
/// nothing to delete.
///
/// So it carries **some** of [SyncColumns] and deliberately not the mixin.
/// [pendingOp] and [pushAttempts] are here because the phone really does push
/// this — a member picks their sports on a plane and the patch waits — and the
/// blocked-row badge and the retry both read those two columns. What is absent
/// is `id` (the key is the member's), `updatedAt` and `baseUpdatedAt` (there is
/// no conflict rule to feed them to; sending them would be two columns the
/// server is contractually obliged to ignore) and `deletedAt` (a profile goes
/// when the member does, which `purge-on-deleted` handles). [Profiles] states
/// the general form of that reasoning: columns a table nothing pushes as a row
/// would only be speculation every later migration has to step over.
///
/// [slotsJson] is `[{id,weekday,start,durationMin,sport,location}]`, where
/// `start` is `HH:mm` **in the member's own zone and never an instant** — "gym
/// at 18:00 on Mondays" is a statement about their clock, so it survives a move
/// and the server resolves it against their current zone on every pass.
@DataClassName('LocalAthleteProfile')
class AthleteProfile extends Table {
  TextColumn get userId => text()();

  TextColumn get sportsJson => text().withDefault(const Constant('[]'))();
  TextColumn get slotsJson => text().withDefault(const Constant('[]'))();

  /// `update`, or null for a row with nothing queued. Only ever `update`: a
  /// patch has no create, no delete and no purge — the server writes the empty
  /// profile when the member registers, which is what lets every reader
  /// promise a document rather than a null.
  TextColumn get pendingOp => text().nullable()();

  IntColumn get pushAttempts => integer().withDefault(const Constant(0))();

  /// When this copy was last filled from the server. As on [Profiles], this is
  /// about the copy and not about the record.
  DateTimeColumn get fetchedAt => dateTime()();

  @override
  Set<Column<Object>> get primaryKey => {userId};
}

/// One message, mirroring the server's `messages` shape (data-model §2.9).
///
/// **Immutable, and that is load-bearing.** There is no [SyncColumns] here and
/// there must not be: no `updatedAt`, no `pendingOp`, no `baseUpdatedAt`, no
/// tombstone. The whole cursor for this table is one integer — the highest
/// [seq] this device holds, kept in [DbKeys.messagesLastSeq] — and a pull is
/// `seq > lastSeq`. That is why the cursor is cheap, and it is also why the
/// usual migration move is unavailable: a column backfilled onto the server's
/// existing rows can never reach a device that already holds them, because
/// their sequences are below the watermark and nothing will ever send them
/// again. The answer is [repullMessages] — mark the cache and re-pull — and the
/// comment there is the long version.
///
/// [seq] is the primary key rather than the server's `_id`, because the
/// per-member monotonic sequence *is* the identity as far as this device is
/// concerned: it is what the pull is cut on, what orders the conversation, and
/// what `chat.accepted` and `chat.done` name when they tell the phone where the
/// turn's two messages landed. The server's ObjectId is never sent here and
/// nothing would use it. Two messages sent by one member from two devices in
/// the same moment take distinct increasing sequences (SC-007), so the key
/// holds.
///
/// [clientId] is the id this device minted before sending, and it is how the
/// server's copy of a message the member typed offline is recognised as the
/// same thing as the local [PendingMessages] row: the sync applier deletes the
/// pending row when a pulled message names its client id, which is what stops
/// the sentence appearing twice. The server's own unique partial index over
/// `{userId, clientId}` is the other half — a message re-sent because the
/// socket died mid-flight is one row there, not two.
@DataClassName('LocalMessage')
@TableIndex(name: 'messages_conversation_seq', columns: {#conversationId, #seq})
@TableIndex(name: 'messages_client', columns: {#clientId})
class Messages extends Table {
  /// The member's own monotonic sequence, issued by the server's `counters`
  /// document. Unique per member, so it is unique on a device that holds one
  /// member's rows.
  IntColumn get seq => integer()();

  TextColumn get conversationId => text()();

  /// `user` | `assistant` | `system`. A text column for the reason
  /// [Conversations.kind] gives.
  TextColumn get role => text()();

  TextColumn get content => text()();

  /// The id this device minted for a message it composed, or null for anything
  /// the server wrote — an answer, the evening prompt, a system note.
  TextColumn get clientId => text().nullable()();

  /// When the member typed it, which is **not** when it was understood.
  ///
  /// FR-007: a message composed offline is delivered later and interpreted as
  /// of when it was typed, so "remind me in two hours" written at 14:10 and
  /// flushed at 19:00 is still a reminder for 16:10. Null for anything the
  /// server wrote.
  DateTimeColumn get composedAt => dateTime().nullable()();

  DateTimeColumn get createdAt => dateTime()();

  @override
  Set<Column<Object>> get primaryKey => {seq};
}

/// A message the member has typed and the server has not acknowledged.
///
/// The chat outbox, and a table of its own rather than a `pendingOp` on
/// [Messages] — which is the shape every other synced entity uses and which
/// cannot work here. A message has no [Messages.seq] until the server issues
/// one, and `seq` is that table's primary key, so a locally composed message
/// has nothing to be keyed by there. Keying it by [clientId] in its own table
/// is the honest version of the same idea.
///
/// It is also what the member sees the moment they press send, online or off:
/// every send writes a row here first and the socket path is what removes it
/// again, on `chat.accepted`. So there is one code path for "typed but not yet
/// acknowledged" instead of two, and a socket that dies between `chat.send`
/// and `chat.accepted` leaves the row for the batch flush to carry — deduped
/// by the server's unique `{userId, clientId}` index rather than by anything
/// this device has to remember.
///
/// No tombstone and no `deletedAt`: a row here is either still waiting or gone
/// because it arrived. Nothing else can happen to it.
@DataClassName('LocalPendingMessage')
@TableIndex(name: 'pending_messages_composed', columns: {#composedAt})
class PendingMessages extends Table {
  /// Client-minted UUIDv7, so a flush retried after a half-delivered request is
  /// a no-op on the server rather than a second copy of the sentence.
  TextColumn get clientId => text()();

  TextColumn get conversationId => text()();

  /// Named `body` and not `text`, because `text()` is drift's own column
  /// builder and a getter called `text` shadows it into infinite recursion.
  TextColumn get body => text()();

  /// When the member typed it. Not nullable here, unlike [Messages.composedAt]:
  /// a row in this table exists *because* somebody typed it, and the whole
  /// point of the batch flush is that the server is told when.
  DateTimeColumn get composedAt => dateTime()();

  /// How many flushes have failed for this row.
  ///
  /// Capped for the reason the sync engine gives for its own cap: the row is
  /// never discarded — that would be the app quietly deciding somebody's
  /// sentence was not worth keeping — but it does stop being re-sent, so a
  /// message the server refuses for a reason retrying cannot fix does not flush
  /// on every reconnection for the life of the install.
  IntColumn get attempts => integer().withDefault(const Constant(0))();

  @override
  Set<Column<Object>> get primaryKey => {clientId};
}

@DataClassName('LocalLink')
/// Something the member saved to read later (P7, FR-001, FR-003).
///
/// The phone holds a copy so the list renders with the network off, and it
/// **pushes only add and remove**. Every interesting column here —
/// [status], [attempts], [failReason], [docId], [title] — is the server's
/// record of work it did, and a client that could push them could tell the
/// server it had read an article itself. The sync adapter refuses an edit as
/// `invalid` rather than ignoring it, so the phone stops trying rather than
/// believing a write landed.
///
/// There is no summary column and there never should be. A knowledge document
/// runs to sixty thousand characters, no list shows it, and the detail screen
/// fetches it over GraphQL when the member opens one. [docId] is the pointer
/// that says there is something to fetch — the difference between "done, tap to
/// read" and "done, nothing here".
@TableIndex(name: 'links_added_at', columns: {#addedAt})
@TableIndex(name: 'links_status_added', columns: {#status, #addedAt})
@TableIndex(name: 'links_parent', columns: {#parentLinkId})
@TableIndex(name: 'links_pending', columns: {#pendingOp})
class Links extends Table with SyncColumns {
  TextColumn get url => text()();

  /// `article` | `website` | `video` | `playlist`. The server recognises it
  /// from the URL; the phone never declares one, because a client that could
  /// declare a kind could declare the wrong one.
  TextColumn get kind => text().withDefault(const Constant('article'))();

  TextColumn get title => text().nullable()();

  TextColumn get tagsJson => text().withDefault(const Constant('[]'))();

  /// `queued` | `fetching` | `extracting` | `summarising` | `done` | `failed`.
  ///
  /// The member reads the middle two as one word — "reading" — because from
  /// outside they are one thing. They are two states on the server because a
  /// crash between them says where the work stopped.
  TextColumn get status => text().withDefault(const Constant('queued'))();

  TextColumn get failReason => text().nullable()();
  IntColumn get attempts => integer().withDefault(const Constant(0))();

  /// Set on a playlist's videos; null for anything the member saved directly.
  TextColumn get parentLinkId => text().nullable()();

  /// How many of a playlist's videos the Owner's limit left behind. Null — not
  /// zero — for anything that is not an expanded playlist, so the list can say
  /// nothing at all rather than "0 skipped" beside every article.
  IntColumn get skippedCount => integer().nullable()();

  /// Whether a summary exists to fetch. Never the summary itself.
  TextColumn get docId => text().nullable()();

  DateTimeColumn get addedAt => dateTime()();
  DateTimeColumn get processedAt => dateTime().nullable()();
  DateTimeColumn get createdAt => dateTime()();

  @override
  Set<Column<Object>> get primaryKey => {id};
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
    Conversations,
    Messages,
    PendingMessages,
    Meetings,
    CalendarEvents,
    AthleteProfile,
    Programs,
    Workouts,
    Sessions,
    Links,
  ],
)
class AppDatabase extends _$AppDatabase {
  AppDatabase() : super(driftDatabase(name: 'botvy_v2'));

  /// Test constructor: whatever executor the test opened, no platform plugins.
  AppDatabase.forTesting(super.executor);

  @override
  int get schemaVersion => 8;

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

      // 4 -> 5: the chat — conversations, messages and the chat outbox (P4,
      // `specs/018-coach-chat` T440).
      //
      // `from < 5` and not a band, for the reason the note above gives: these
      // are `createTable` calls, and a phone at 1, 2, 3 or 4 all need them
      // built. The band shape belongs to `addColumn` alone.
      if (from < 5) {
        await m.createTable(conversations);
        await m.createTable(messages);
        await m.createTable(pendingMessages);

        await m.create(conversationsUpdated);
        await m.create(conversationsPending);
        await m.create(messagesConversationSeq);
        await m.create(messagesClient);
        await m.create(pendingMessagesComposed);

        // Mark the cache and re-pull. A no-op today — the table was created
        // three lines up, so there is nothing to discard and no watermark to
        // reset — and it is here rather than in a comment because the *next*
        // change to `messages` has to do exactly this and a call that has run
        // in CI is worth more than an instruction nobody has executed. See
        // [repullMessages] for why a backfill is not available to this table.
        await repullMessages(this);
      }

      // 5 -> 6: meetings and personal events (P5, `specs/019-meetings-calendar`
      // T540).
      //
      // `from < 6`, and the two indexes per table listed explicitly, for the
      // reasons the branches above give: drift calls `onUpgrade` once with the
      // pair it has, so every `createTable` is guarded `from < N`; and
      // `createTable` builds the table and *not* its indexes, which drift keeps
      // as separate schema entities that only `createAll` picks up.
      if (from < 6) {
        await m.createTable(meetings);
        await m.createTable(calendarEvents);

        await m.create(meetingsStart);
        await m.create(meetingsStatusStart);
        await m.create(meetingsPending);
        await m.create(calendarEventsStart);
        await m.create(calendarEventsPending);
      }

      // 6 -> 7: training (P6, `specs/020-training` T650) — the athlete
      // profile, the programs, the workout library and the sessions.
      //
      // `from < 7` and the seven indexes listed explicitly, for the two
      // reasons every branch above gives: drift calls `onUpgrade` once with the
      // pair it has, so a `createTable` is guarded `from < N` and never
      // `from >= N-1 && from < N`; and `createTable` builds the table and
      // *not* its indexes, which drift keeps as separate schema entities that
      // only `createAll` picks up on a fresh install.
      //
      // `athlete_profile` declares no index: it holds one row per member and
      // is only ever read by its primary key, so an index over it would be a
      // second copy of the key.
      if (from < 7) {
        await m.createTable(athleteProfile);
        await m.createTable(programs);
        await m.createTable(workouts);
        await m.createTable(sessions);

        await m.create(programsStatus);
        await m.create(programsPending);
        await m.create(workoutsSport);
        await m.create(workoutsPending);
        await m.create(sessionsPlannedAt);
        await m.create(sessionsStatusPlanned);
        await m.create(sessionsPending);
      }

      // 7 -> 8: saved links (P7, `specs/021-knowledge-ingestion` T740).
      //
      // `from < 8`, one `createTable` and its four indexes listed explicitly —
      // the two reasons every branch above gives, unchanged: drift calls
      // `onUpgrade` once with the pair it has, so a `createTable` is guarded
      // `from < N`; and `createTable` builds the table and *not* its indexes,
      // which drift keeps as separate schema entities that only `createAll`
      // picks up on a fresh install.
      if (from < 8) {
        await m.createTable(links);

        await m.create(linksAddedAt);
        await m.create(linksStatusAdded);
        await m.create(linksParent);
        await m.create(linksPending);
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

  /// The highest message [Messages.seq] this device holds.
  ///
  /// The whole of the chat's pull cursor, and a key here rather than a column
  /// anywhere because it is about the *copy* and not about any row: the sync
  /// request carries it as `lastSeq` and the server answers `seq > lastSeq`.
  /// Kept as text like every other value in `key_values` and parsed on read;
  /// absent means "nothing held", which is the same request as nought.
  ///
  /// Rewound by [repullMessages], which is the only thing that ever moves it
  /// backwards.
  static const String messagesLastSeq = 'messagesLastSeq';
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

/// Discards the local message cache from [fromSeq] upwards and rewinds the pull
/// watermark so the next sync fetches those rows again.
///
/// **The only migration move available to [Messages].** Every other table on
/// this device can gain a column and have the server backfill it: the pull is
/// cut on `updatedAt`, a backfill bumps `updatedAt`, and the row arrives again
/// carrying the new field. Messages have no `updatedAt` — deliberately, because
/// that absence is what makes their cursor a single integer — and the pull is
/// cut on `seq > lastSeq`. A row the device already holds is below the
/// watermark for ever, so a column added to it on the server can never reach
/// this handset. Nothing fails; the field is simply null on every message the
/// member already had, on every install that already existed, permanently.
///
/// So the schema change and the cache invalidation are the same operation.
/// v1 learned this the expensive way and the trick it settled on is the one
/// here: delete the rows, rewind the watermark, let the ordinary sync pass pull
/// them down again with the new shape. It is not clever and it is not cheap —
/// a long-lived chat re-downloads — but it is the only version that is
/// *correct*, and the rows are immutable so there is nothing local to lose.
///
/// [fromSeq] is inclusive: the watermark is set to `fromSeq - 1`, because the
/// server sends `seq > lastSeq`. Default nought re-pulls the member's whole
/// history, which is what a change to a column every message carries needs.
/// Pass a real sequence when only messages written after some point are
/// affected.
///
/// Written with `customStatement` rather than the generated query builder
/// because it is called from inside `onUpgrade`, where drift's generated API
/// describes *today's* schema and the file on disk may not match it yet. The
/// two statements below are true of every version of these tables that has
/// ever existed.
Future<void> repullMessages(AppDatabase db, {int fromSeq = 0}) async {
  await db.customStatement('DELETE FROM messages WHERE seq >= ?', [fromSeq]);

  final watermark = fromSeq > 0 ? fromSeq - 1 : 0;
  await db.customStatement(
    'INSERT INTO key_values (key, value) VALUES (?, ?) '
    'ON CONFLICT(key) DO UPDATE SET value = excluded.value',
    [DbKeys.messagesLastSeq, '$watermark'],
  );
}
