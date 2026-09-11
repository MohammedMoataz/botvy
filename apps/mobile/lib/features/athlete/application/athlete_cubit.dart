import 'dart:async';
import 'dart:convert';

// Imported whole rather than by name: `Value` and the `&` of the query builder
// are extension members, and an extension only applies when its library is
// imported outright.
import 'package:drift/drift.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:timezone/timezone.dart' as tz;
import 'package:uuid/uuid.dart';

import '../../../core/db/database.dart';
import '../../../core/notifications/alert_plan.dart'
    show decodeStringList, memberDate, memberZone;
import '../../../core/sync/sync_engine.dart';
import '../../calendar/application/agenda.dart' show dayWindow, weekDates;
import 'athlete.dart';

const Uuid _uuid = Uuid();

/// How far ahead the cubit looks for the next practice.
///
/// The server materialises two weeks by default (`training.materialiseDays`, an
/// Owner setting), so three is a horizon that always contains whatever the
/// server has created without the phone knowing the setting — which it must not
/// hold, because a length compiled into the app would be the hard-coded default
/// constitution XII calls a bug. What this number actually bounds is a local
/// query, and a member whose horizon is longer than this still sees every
/// session in the week view; only the card's "next" would lag, and it cannot,
/// because a member with nothing in three weeks has nothing scheduled by any
/// reading.
const int kNextPracticeHorizonDays = 21;

class AthleteState {
  const AthleteState({
    this.loading = true,
    this.timezone,
    this.cutoff = kDefaultCutoff,
    this.sports = const [],
    this.slots = const [],
    this.today = '',
    this.weekOffset = 0,
    this.week = const [],
    this.sessionsByDate = const {},
    this.next = const NextPractice(null, NextPracticeReason.noneScheduled),
    this.now,
    this.blocked = const {},
    this.problem,
  });

  final bool loading;

  /// The member's own zone from the profile mirror, resolved once by the pass
  /// that loaded this state.
  ///
  /// Carried rather than read in `build`, for the reason every other screen
  /// carries its dates: a widget resolving it from `DateTime.now()` uses the
  /// *handset's* zone, and that shift cost v1 three hours once already.
  final String? timezone;

  /// `defaults.nextPracticeCutoff` as the member set it (FR-007).
  final String cutoff;

  final List<String> sports;
  final List<WeeklySlot> slots;

  /// The member's local today, `YYYY-MM-DD`.
  final String today;

  /// 0 for this week, -1 for last, +1 for next.
  final int weekOffset;

  /// The seven local dates of the week on screen, in the member's own
  /// `weekStartsOn` order.
  final List<String> week;

  /// The week's sessions, grouped by local date. A date with no entry is a rest
  /// day — nothing is stored to represent one (FR-013), so its absence *is* the
  /// representation.
  final Map<String, List<LocalSession>> sessionsByDate;

  /// What the card shows, and why.
  final NextPractice next;

  /// The instant this state was read at, for [isMissed].
  ///
  /// Carried rather than taken from `DateTime.now()` inside a widget, so every
  /// row on one frame answers "is this missed" against the same clock — a week
  /// view that asked per row could draw the 18:00 session as missed and the
  /// card above it as not, one millisecond apart.
  final DateTime? now;

  /// Ids the sync engine has stopped re-sending, so the row can be badged.
  final Set<String> blocked;

  final String? problem;

  /// True when the member has set no slots at all (story 1 scenario 3).
  ///
  /// The screen then invites them to set some rather than drawing an empty
  /// grid, which is the requirement verbatim.
  bool get noSlots => slots.isEmpty;

  AthleteState copyWith({
    bool? loading,
    String? timezone,
    String? cutoff,
    List<String>? sports,
    List<WeeklySlot>? slots,
    String? today,
    int? weekOffset,
    List<String>? week,
    Map<String, List<LocalSession>>? sessionsByDate,
    NextPractice? next,
    DateTime? now,
    Set<String>? blocked,
    String? problem,
    bool clearProblem = false,
  }) => AthleteState(
    loading: loading ?? this.loading,
    timezone: timezone ?? this.timezone,
    cutoff: cutoff ?? this.cutoff,
    sports: sports ?? this.sports,
    slots: slots ?? this.slots,
    today: today ?? this.today,
    weekOffset: weekOffset ?? this.weekOffset,
    week: week ?? this.week,
    sessionsByDate: sessionsByDate ?? this.sessionsByDate,
    next: next ?? this.next,
    now: now ?? this.now,
    blocked: blocked ?? this.blocked,
    problem: clearProblem ? null : (problem ?? this.problem),
  );
}

/// The athlete's week, local-first exactly as the meetings are.
///
/// ## Every write is a row edit, and that is what makes it work offline
///
/// Logging a set, completing a session, cancelling it, skipping it, reordering
/// its exercises, dropping a library workout into it, choosing sports, editing
/// the timetable: all of them are writes to the phone's own tables with a
/// `pendingOp`, carried up by [SyncEngine]. The server has REST commands for
/// each and they exist for the extension and the web app, which are online by
/// construction. The phone does not use them, because SC-003 and SC-004 are
/// about a member in a gym basement: six exercises logged in ninety seconds and
/// then appearing elsewhere **exactly once** on reconnection.
///
/// "Exactly once" is bought by the client-minted UUIDv7 in [createSession] and
/// nothing else. The push is an upsert on an id the server has never seen, so a
/// request that half-arrived and was retried writes the same row twice and
/// leaves one session.
///
/// ## Applying and archiving a program are the two exceptions
///
/// Both go over REST, because the **refusal** is the point: an apply that would
/// replace planned content answers `409` with the list of what it would
/// replace, and story 4 scenario 2 requires the member sees that list and
/// agrees before it happens. A rejection arriving on the next sync pass, with
/// no screen still open, cannot ask anybody anything. They live in
/// [ProgramsCubit] rather than here.
class AthleteCubit extends Cubit<AthleteState> {
  AthleteCubit(this._db, this._sync) : super(const AthleteState());

  final AppDatabase _db;
  final SyncEngine _sync;

  StreamSubscription<SyncOutcome>? _passes;

  /// Re-reads after every sync pass, so a session the server materialised
  /// overnight appears without the member pulling to refresh — and so a
  /// rejection for one of this feature's four entities reaches a screen.
  void listenToSync() {
    _passes ??= _sync.outcomes.listen((outcome) {
      unawaited(refresh());
      // Branched on `entity` before anything is read, which is the rule the
      // whole rejection shape exists for: four of this phase's entities share
      // it, and a refused slot reported as a refused session would name a row
      // that is not the one the member touched.
      final refused = outcome.rejections
          .where(
            (r) => const {
              'sessions',
              'programs',
              'workouts',
              'athlete_profile',
            }.contains(r.entity),
          )
          .toList();
      if (refused.isEmpty || isClosed) return;
      emit(
        state.copyWith(
          problem: refused.first.message ?? _refusalText(refused.first),
        ),
      );
    });
  }

  @override
  Future<void> close() async {
    await _passes?.cancel();
    return super.close();
  }

  void clearProblem() => emit(state.copyWith(clearProblem: true));

  Future<void> showWeek(int offset) async {
    emit(state.copyWith(weekOffset: offset, loading: true));
    await refresh();
  }

  Future<void> refresh() async {
    if (isClosed) return;

    final profile = await (_db.select(_db.profiles)..limit(1))
        .getSingleOrNull();
    final preferences = await (_db.select(_db.userPreferences)..limit(1))
        .getSingleOrNull();
    final zone = memberZone(profile?.timezone);
    final now = DateTime.now().toUtc();
    final today = memberDate(now, zone);

    final athlete = await (_db.select(_db.athleteProfile)..limit(1))
        .getSingleOrNull();

    final dates = weekDates(
      // The week the member is looking at, stepped in whole weeks from today.
      // Built by moving the *date* rather than by adding seven days of
      // duration, for the reason `dayWindow` gives: `add(Duration(days: 7))`
      // is not a week twice a year.
      _shiftWeeks(now, zone, state.weekOffset),
      profile?.timezone,
      weekStartsOn: preferences?.weekStartsOn ?? 'monday',
    );

    // One query for the week on screen and the next-practice horizon
    // together, then split in memory. Two queries would read the overlap
    // twice, and the horizon is three weeks of rows.
    final from = dayWindow(dates.first, profile?.timezone).from;
    final horizonEnd = dayWindow(
      memberDate(now, zone, addDays: kNextPracticeHorizonDays),
      profile?.timezone,
    ).to;
    final weekEnd = dayWindow(dates.last, profile?.timezone).to;
    final to = horizonEnd.isAfter(weekEnd) ? horizonEnd : weekEnd;

    final rows = await (_db.select(_db.sessions)
          ..where(
            (r) =>
                r.deletedAt.isNull() &
                // Written this way and never `pendingOp.equals(purge).not()`:
                // `NOT (pending_op = 'purge')` is NULL for a clean row and NULL
                // is falsy, which hides nearly every row in the table.
                notPendingOp(r.pendingOp, PendingOps.purge) &
                r.plannedAt.isBiggerOrEqualValue(from) &
                r.plannedAt.isSmallerOrEqualValue(to),
          )
          ..orderBy([(r) => OrderingTerm(expression: r.plannedAt)]))
        .get();

    final byDate = <String, List<LocalSession>>{};
    for (final row in rows) {
      byDate
          .putIfAbsent(memberDate(row.plannedAt, zone), () => [])
          .add(row);
    }

    final todayEnd = dayWindow(today, profile?.timezone).to;
    final blocked = {
      for (final row in await _sync.blockedRows())
        if (row.entity == 'sessions') row.id,
    };

    if (isClosed) return;
    emit(
      AthleteState(
        loading: false,
        timezone: profile?.timezone,
        // The member's own value, never the registry's: a preference read from
        // the settings registry gives the *installation* number and silently
        // ignores what the member set.
        cutoff: preferences?.nextPracticeCutoff ?? kDefaultCutoff,
        sports: decodeStringList(athlete?.sportsJson ?? '[]'),
        slots: decodeSlots(athlete?.slotsJson ?? '[]'),
        today: today,
        weekOffset: state.weekOffset,
        week: dates,
        sessionsByDate: byDate,
        next: nextPractice(
          byDate[today] ?? const [],
          [
            for (final row in rows)
              if (row.plannedAt.isAfter(todayEnd)) row,
          ],
          now,
          zone,
          preferences?.nextPracticeCutoff ?? kDefaultCutoff,
        ),
        now: now,
        blocked: blocked,
      ),
    );
  }

  /// One session by id, for the session screen and a deep link.
  Future<LocalSession?> byId(String id) =>
      (_db.select(_db.sessions)..where((r) => r.id.equals(id)))
          .getSingleOrNull();

  /// Today's sessions, for Today's training row (T642).
  ///
  /// A live stream rather than a read, because that is the whole point of the
  /// row watching this table instead of the night's `daily_plans` snapshot: a
  /// session completed or skipped offline changes the row **at once** rather
  /// than waiting for tomorrow's plan.
  Stream<List<LocalSession>> watchDay(String date, {String? timezone}) {
    final window = dayWindow(date, timezone ?? state.timezone);
    return (_db.select(_db.sessions)
          ..where(
            (r) =>
                r.deletedAt.isNull() &
                notPendingOp(r.pendingOp, PendingOps.purge) &
                r.plannedAt.isBiggerOrEqualValue(window.from) &
                r.plannedAt.isSmallerOrEqualValue(window.to),
          )
          ..orderBy([(r) => OrderingTerm(expression: r.plannedAt)]))
        .watch();
  }

  // ── the athlete profile ────────────────────────────────────────────────────

  /// Which sports the member practises (FR-001).
  ///
  /// An unrecognised name is kept as typed: "other" in the picker is a text
  /// field and not a bucket. Only the empty string is dropped.
  Future<void> setSports(List<String> sports) async {
    final cleaned = <String>[];
    for (final sport in sports) {
      final trimmed = sport.trim();
      if (trimmed.isNotEmpty && !cleaned.contains(trimmed)) {
        cleaned.add(trimmed);
      }
    }
    await _patchProfile(sportsJson: Value(encodeStringList(cleaned)));
  }

  /// The weekly timetable (FR-002).
  ///
  /// Replaces the whole thing, as `PUT /athlete/slots` does — and a slot
  /// keeping its id keeps its sessions, which is why the editor mints an id
  /// once and never on edit. Changing slots affects **future** sessions only,
  /// and that half belongs to the server's materialiser: nothing here deletes a
  /// session, because deleting the past would be exactly the record story 1
  /// scenario 2 asks to keep.
  Future<void> setSlots(List<WeeklySlot> slots) =>
      _patchProfile(slotsJson: Value(encodeSlots(slots)));

  Future<void> _patchProfile({
    Value<String> sportsJson = const Value.absent(),
    Value<String> slotsJson = const Value.absent(),
  }) async {
    final userId = await _db.getValue(DbKeys.userId);
    // Nothing to key the patch by. A row under a sentinel would collide with
    // the next account to sign in on this handset, so a member with no session
    // is skipped rather than guessed at — the same rule the sync applier
    // follows.
    if (userId == null || userId.isEmpty) return;

    final existing = await (_db.select(_db.athleteProfile)
          ..where((r) => r.userId.equals(userId)))
        .getSingleOrNull();

    await _db.into(_db.athleteProfile).insertOnConflictUpdate(
      AthleteProfileCompanion.insert(
        userId: userId,
        sportsJson: sportsJson.present
            ? sportsJson
            : Value(existing?.sportsJson ?? '[]'),
        slotsJson:
            slotsJson.present ? slotsJson : Value(existing?.slotsJson ?? '[]'),
        // Only ever `update`: the server writes the empty profile when the
        // member registers, so there is nothing to create and nothing to
        // delete.
        pendingOp: const Value(PendingOps.update),
        // The strike count is reset, because this is a new patch and not a
        // retry of the one that was refused.
        pushAttempts: const Value(0),
        fetchedAt: existing?.fetchedAt ?? DateTime.now().toUtc(),
      ),
    );

    await refresh();
    _sync.kick();
  }

  // ── sessions ───────────────────────────────────────────────────────────────

  /// A session the member made by hand, with a client-minted id.
  ///
  /// UUIDv7 and minted **here**, which is what makes a create idempotent: the
  /// server accepts the client's id, so a retried push is a no-op rather than a
  /// second session (SC-004). It carries no `slotId`, which is what keeps the
  /// materialiser from treating it as a slot's session and removing it when the
  /// slot changes.
  Future<String> createSession({
    required DateTime plannedAt,
    required String sport,
    required String title,
    int durationMin = 60,
    String? focus,
  }) async {
    final id = _uuid.v7();
    final now = DateTime.now().toUtc();

    await _db.into(_db.sessions).insert(
      SessionsCompanion.insert(
        id: id,
        plannedAt: plannedAt.toUtc(),
        durationMin: Value(durationMin),
        sport: sport,
        title: title,
        focus: Value(focus),
        createdAt: now,
        updatedAt: now,
        // Null, and deliberately: `baseUpdatedAt` is the server's own value for
        // the version this device last pulled, and the server has never seen
        // this row. A local time here would make the push fall through to a
        // clock comparison a slow handset loses.
        pendingOp: const Value(PendingOps.create),
      ),
    );

    await refresh();
    _sync.kick();
    return id;
  }

  /// The session's exercises and notes, as the logger left them.
  ///
  /// One write for the whole list rather than one per set, which is what makes
  /// the ninety seconds of SC-003 possible: a member tapping a stepper six
  /// times a set would otherwise queue six pushes and six re-plans of the
  /// alarms. The screen holds the draft and saves it.
  Future<void> saveExercises(
    String id,
    List<TrainingExercise> exercises, {
    String? notes,
    bool clearNotes = false,
  }) => _write(
    id,
    SessionsCompanion(
      exercisesJson: Value(encodeExercises(exercises)),
      notes: clearNotes ? const Value(null) : Value.absentIfNull(notes),
    ),
  );

  /// The exercise list, reordered (T652).
  ///
  /// [to] is the **final** index, already adjusted for the removal — which is
  /// what the SDK's `onReorderItem` hands over, and why there is no `to > from`
  /// arithmetic here. The deprecated `onReorder` reports an index counting the
  /// list with the dragged row still in it, and doing the subtraction on top of
  /// an index that has already had it applied is the same off-by-one twice: an
  /// exercise dragged downwards lands one place short of where the member let
  /// go of it.
  ///
  /// It lives on the cubit rather than in the widget because the list is
  /// persisted, not merely displayed: the new order is a write, and every write
  /// to `sessions` goes through one place so the `pendingOp` and
  /// `baseUpdatedAt` rules are stated once.
  Future<void> reorderExercises(
    String id,
    List<TrainingExercise> exercises,
    int from,
    int to,
  ) async {
    final reordered = [...exercises];
    final moved = reordered.removeAt(from);
    reordered.insert(to.clamp(0, reordered.length), moved);
    await saveExercises(id, reordered);
  }

  /// The library entry's exercises, copied into a session (FR-009).
  ///
  /// **Fresh ids for every exercise**, which is the whole of why this is a copy
  /// and not a reference: editing the session must not rewrite the library
  /// entry, and an exercise id shared between the two would make the session's
  /// reorder a reorder of the workout as well. The actuals are dropped for the
  /// same reason a template is a template — what is copied is what to do, not
  /// what somebody once did.
  Future<void> applyWorkout(String sessionId, String workoutId) async {
    final workout = await (_db.select(_db.workouts)
          ..where((r) => r.id.equals(workoutId)))
        .getSingleOrNull();
    if (workout == null) return;

    final copied = [
      for (final exercise in decodeExercises(workout.exercisesJson))
        TrainingExercise(
          id: _uuid.v7(),
          name: exercise.name,
          notes: exercise.notes,
          sets: [
            for (final set in exercise.sets) set.copyWith(clearActuals: true),
          ],
          mediaRefs: exercise.mediaRefs,
        ),
    ];

    await saveExercises(sessionId, copied);
  }

  /// The last time this member did this exercise, for "repeat last" (T652).
  ///
  /// Matched on the exercise **name** rather than its id, because ids are
  /// minted per session: the member's squat on Monday and their squat on
  /// Thursday are two rows with two ids and one name. Case-folded and trimmed
  /// so "Back Squat" finds "back squat".
  ///
  /// Reads the most recent *logged* session that carries it, not merely the
  /// most recent one: repeating a set the member never did would put a target
  /// they had abandoned back on the screen as though they had achieved it.
  Future<List<TrainingSet>?> lastLogged(String exerciseName) async {
    final wanted = exerciseName.trim().toLowerCase();
    if (wanted.isEmpty) return null;

    final rows = await (_db.select(_db.sessions)
          ..where(
            (r) =>
                r.deletedAt.isNull() &
                notPendingOp(r.pendingOp, PendingOps.purge) &
                r.status.equals('completed'),
          )
          ..orderBy([
            (r) => OrderingTerm(
              expression: r.plannedAt,
              mode: OrderingMode.desc,
            ),
          ])
          ..limit(30))
        .get();

    for (final row in rows) {
      for (final exercise in decodeExercises(row.exercisesJson)) {
        if (exercise.name.trim().toLowerCase() != wanted) continue;
        final logged = [
          for (final set in exercise.sets)
            if (set.isLogged) set,
        ];
        if (logged.isNotEmpty) return logged;
      }
    }
    return null;
  }

  /// It happened (FR-005).
  Future<void> complete(String id) => _write(
    id,
    SessionsCompanion(
      status: const Value('completed'),
      completedAt: Value(DateTime.now().toUtc()),
    ),
  );

  /// It is not happening, and the row stays (FR-005, story 3 scenario 3).
  ///
  /// Cancelled and skipped are two different sentences and both keep the row:
  /// the week is a record of what the member actually did with their timetable,
  /// and a deleted session would make it a record of the days that went well.
  Future<void> cancel(String id) => _write(
    id,
    const SessionsCompanion(
      status: Value('cancelled'),
      completedAt: Value(null),
    ),
  );

  Future<void> skip(String id) => _write(
    id,
    const SessionsCompanion(
      status: Value('skipped'),
      completedAt: Value(null),
    ),
  );

  /// Back to `planned`, which is also what un-does a mistaken skip.
  Future<void> reopen(String id) => _write(
    id,
    const SessionsCompanion(status: Value('planned'), completedAt: Value(null)),
  );

  /// A session removed from the week, keeping its status.
  ///
  /// The status is the only record of whether it was completed, cancelled or
  /// never dealt with, and the Deleted view exists to show exactly that — so a
  /// delete sets the tombstone and touches nothing else.
  Future<void> delete(String id) => _write(
    id,
    SessionsCompanion(deletedAt: Value(DateTime.now().toUtc())),
    op: PendingOps.delete,
  );

  Future<void> restore(String id) => _write(
    id,
    const SessionsCompanion(deletedAt: Value(null)),
    op: PendingOps.restore,
  );

  /// One local edit, with the two timestamp rules applied in one place.
  ///
  /// [SyncColumns.baseUpdatedAt] is never written here: it is the server's own
  /// value for the version this device last pulled, and the push is accepted
  /// outright while it still matches. Writing the local edit time into it
  /// instead would make every offline edit fall through to a clock comparison,
  /// which a slow handset loses.
  Future<void> _write(
    String id,
    SessionsCompanion patch, {
    String op = PendingOps.update,
  }) async {
    final row = await byId(id);
    if (row == null) return;

    await (_db.update(_db.sessions)..where((r) => r.id.equals(id))).write(
      patch.copyWith(
        updatedAt: Value(DateTime.now().toUtc()),
        pendingOp: Value(_nextOp(row.pendingOp, op)),
        pushAttempts: const Value(0),
      ),
    );

    await refresh();
    _sync.kick();
  }
}

/// A row still queued as a `create` stays a `create`, whatever happens to it.
///
/// The server has never seen it, and pushing `update` for a row that is not
/// there is refused as `gone` — which tells the client to delete its local
/// copy. A member's second edit of a session logged on a plane would then
/// erase it.
String _nextOp(String? current, String wanted) =>
    current == PendingOps.create ? PendingOps.create : wanted;

/// A refusal the member has to see, when the server sent no message of its own.
///
/// `protected` is absent on purpose: nothing in Training is protected, and a
/// branch for it would be a sentence no server can produce. `invalid` covers
/// the one this phase really can hit — a session naming a slot the profile no
/// longer holds.
String _refusalText(Rejection rejection) => switch (rejection.reason) {
  'stale' => 'That was changed on another device; its version is shown.',
  'gone' => 'That session no longer exists.',
  'not_deleted' => 'That has to be deleted before it can be erased.',
  _ => 'The server refused that change.',
};

/// The same date, [weeks] whole weeks away, as an instant.
///
/// Moved by calendar fields rather than by adding a duration: seven days of
/// duration is not a week on the two nights the clocks change, and the week
/// grid would come out a day short.
DateTime _shiftWeeks(DateTime now, tz.Location zone, int weeks) {
  final local = tz.TZDateTime.from(now, zone);
  final shifted = tz.TZDateTime(
    zone,
    local.year,
    local.month,
    local.day + weeks * 7,
    12,
  );
  // A plain DateTime, because this database stores date-times as ISO text and
  // `TZDateTime.toString()` appends its zone — a TZDateTime in any column here
  // is a row that can be written and never read.
  return DateTime.fromMillisecondsSinceEpoch(
    shifted.millisecondsSinceEpoch,
    isUtc: true,
  );
}

/// A JSON array of strings, encoded.
///
/// The decoder is `decodeStringList` in `core/notifications/alert_plan.dart`,
/// which three features already share; this is its other half and lives here
/// because nothing else needed it yet.
String encodeStringList(List<String> values) => jsonEncode(values);
