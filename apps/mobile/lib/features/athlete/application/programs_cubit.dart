import 'dart:async';
import 'dart:convert';

import 'package:drift/drift.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:uuid/uuid.dart';

import '../../../core/api/api_client.dart';
import '../../../core/db/database.dart';
import '../../../core/notifications/alert_plan.dart' show decodeStringList;
import '../../../core/sync/sync_engine.dart';
import 'athlete.dart';
import 'athlete_cubit.dart' show encodeStringList;

const Uuid _uuid = Uuid();

class ProgramsState {
  const ProgramsState({
    this.loading = true,
    this.programs = const [],
    this.workouts = const [],
    this.showArchived = false,
    this.problem,
  });

  final bool loading;

  /// The member's programs, active first.
  final List<LocalProgram> programs;

  /// The workout library (FR-009).
  final List<LocalWorkout> workouts;

  final bool showArchived;

  final String? problem;

  ProgramsState copyWith({
    bool? loading,
    List<LocalProgram>? programs,
    List<LocalWorkout>? workouts,
    bool? showArchived,
    String? problem,
    bool clearProblem = false,
  }) => ProgramsState(
    loading: loading ?? this.loading,
    programs: programs ?? this.programs,
    workouts: workouts ?? this.workouts,
    showArchived: showArchived ?? this.showArchived,
    problem: clearProblem ? null : (problem ?? this.problem),
  );
}

/// The member's programs and their workout library.
///
/// Split from [AthleteCubit] because this is the one screen in the feature that
/// **talks to the network**: applying a program and archiving one go over REST,
/// for the reason `ApiClient.applyProgram` gives at length — a warning the
/// member must agree to before their planned week is overwritten cannot be
/// delivered by a sync push whose refusal arrives on the next pass. Everything
/// else here — creating a program, editing it, saving a workout, deleting one —
/// is an ordinary row edit that works offline.
class ProgramsCubit extends Cubit<ProgramsState> {
  ProgramsCubit(this._db, this._sync, this._api) : super(const ProgramsState());

  final AppDatabase _db;
  final SyncEngine _sync;
  final ApiClient _api;

  StreamSubscription<SyncOutcome>? _passes;

  void listenToSync() {
    _passes ??= _sync.outcomes.listen((_) => unawaited(refresh()));
  }

  @override
  Future<void> close() async {
    await _passes?.cancel();
    return super.close();
  }

  void clearProblem() => emit(state.copyWith(clearProblem: true));

  Future<void> showArchived(bool archived) async {
    emit(state.copyWith(showArchived: archived, loading: true));
    await refresh();
  }

  Future<void> refresh() async {
    if (isClosed) return;

    final programs = await (_db.select(_db.programs)
          ..where(
            (r) =>
                r.deletedAt.isNull() &
                notPendingOp(r.pendingOp, PendingOps.purge) &
                r.status.equals(state.showArchived ? 'archived' : 'active'),
          )
          ..orderBy([(r) => OrderingTerm(expression: r.title)]))
        .get();

    final workouts = await (_db.select(_db.workouts)
          ..where(
            (r) =>
                r.deletedAt.isNull() &
                notPendingOp(r.pendingOp, PendingOps.purge),
          )
          ..orderBy([(r) => OrderingTerm(expression: r.name)]))
        .get();

    if (isClosed) return;
    emit(state.copyWith(loading: false, programs: programs, workouts: workouts));
  }

  Future<LocalProgram?> programById(String id) =>
      (_db.select(_db.programs)..where((r) => r.id.equals(id)))
          .getSingleOrNull();

  // ── the two commands ───────────────────────────────────────────────────────

  /// Applies a program from [startDate], warning first (story 4 scenario 2).
  ///
  /// Returns the server's answer rather than a bool, because the screen has two
  /// things to do with it: draw the list of sessions that would be replaced and
  /// offer the retry. The retry is the same call with `force: true`, and it is
  /// the *member's* decision — nothing here retries on its own, which is the
  /// whole point of a warning.
  ///
  /// A sync pass follows an accepted apply, because the sessions it filled were
  /// written on the server and this device has not seen them yet.
  Future<ProgramApply?> apply(
    String programId, {
    required String startDate,
    bool force = false,
  }) async {
    try {
      final answer = await _api.applyProgram(
        programId,
        startDate: startDate,
        force: force,
      );
      if (answer.applied) _sync.kick();
      await refresh();
      return answer;
    } on ApiException catch (e) {
      if (isClosed) return null;
      emit(state.copyWith(problem: e.message));
      return null;
    }
  }

  /// Archives a program (FR-008, story 4 scenarios 3 and 4).
  ///
  /// The local row is **not** written optimistically. Archiving has a
  /// consequence on the server — the materialiser stops consulting the program
  /// — and a phone that moved the row to Archived and then failed to reach the
  /// gateway would be showing the member a state the product is not in. The
  /// sync pass brings the real row back.
  Future<void> archive(String programId) async {
    try {
      await _api.archiveProgram(programId);
      _sync.kick();
      await refresh();
    } on ApiException catch (e) {
      if (isClosed) return;
      emit(state.copyWith(problem: e.message));
    }
  }

  // ── ordinary row edits ─────────────────────────────────────────────────────

  /// A program the member wrote themselves.
  Future<String> createProgram({
    required String title,
    required String sport,
    List<Map<String, dynamic>> weeks = const [],
  }) async {
    final id = _uuid.v7();
    final now = DateTime.now().toUtc();

    await _db.into(_db.programs).insert(
      ProgramsCompanion.insert(
        id: id,
        title: title,
        sport: sport,
        weeksJson: Value(jsonEncodeWeeks(weeks)),
        createdAt: now,
        updatedAt: now,
        pendingOp: const Value(PendingOps.create),
      ),
    );

    await refresh();
    _sync.kick();
    return id;
  }

  Future<void> deleteProgram(String id) async {
    final row = await programById(id);
    if (row == null) return;
    await (_db.update(_db.programs)..where((r) => r.id.equals(id))).write(
      ProgramsCompanion(
        deletedAt: Value(DateTime.now().toUtc()),
        updatedAt: Value(DateTime.now().toUtc()),
        pendingOp: Value(
          row.pendingOp == PendingOps.create
              ? PendingOps.create
              : PendingOps.delete,
        ),
        pushAttempts: const Value(0),
      ),
    );
    await refresh();
    _sync.kick();
  }

  /// A workout saved to the library (FR-009).
  Future<String> saveWorkout({
    String? id,
    required String name,
    required String sport,
    required List<TrainingExercise> exercises,
    List<String> tags = const [],
  }) async {
    final now = DateTime.now().toUtc();
    final existing = id == null
        ? null
        : await (_db.select(_db.workouts)..where((r) => r.id.equals(id)))
              .getSingleOrNull();

    if (existing == null) {
      final fresh = id ?? _uuid.v7();
      await _db.into(_db.workouts).insert(
        WorkoutsCompanion.insert(
          id: fresh,
          name: name,
          sport: sport,
          exercisesJson: Value(encodeExercises(exercises)),
          tagsJson: Value(encodeStringList(tags)),
          createdAt: now,
          updatedAt: now,
          pendingOp: const Value(PendingOps.create),
        ),
      );
      await refresh();
      _sync.kick();
      return fresh;
    }

    await (_db.update(_db.workouts)..where((r) => r.id.equals(existing.id)))
        .write(
      WorkoutsCompanion(
        name: Value(name),
        sport: Value(sport),
        exercisesJson: Value(encodeExercises(exercises)),
        tagsJson: Value(encodeStringList(tags)),
        updatedAt: Value(now),
        // A row still queued as a `create` stays one: the server has never seen
        // it, and an `update` for a row that is not there is refused as `gone`,
        // which tells the client to delete its local copy.
        pendingOp: Value(
          existing.pendingOp == PendingOps.create
              ? PendingOps.create
              : PendingOps.update,
        ),
        pushAttempts: const Value(0),
      ),
    );
    await refresh();
    _sync.kick();
    return existing.id;
  }

  Future<void> deleteWorkout(String id) async {
    final row = await (_db.select(_db.workouts)..where((r) => r.id.equals(id)))
        .getSingleOrNull();
    if (row == null) return;
    final now = DateTime.now().toUtc();
    await (_db.update(_db.workouts)..where((r) => r.id.equals(id))).write(
      WorkoutsCompanion(
        deletedAt: Value(now),
        updatedAt: Value(now),
        pendingOp: Value(
          row.pendingOp == PendingOps.create
              ? PendingOps.create
              : PendingOps.delete,
        ),
        pushAttempts: const Value(0),
      ),
    );
    await refresh();
    _sync.kick();
  }

  /// The tags on a library row, for the list's chips.
  List<String> tagsOf(LocalWorkout workout) =>
      decodeStringList(workout.tagsJson);
}

/// One week template, as the program column holds it.
///
/// `[{index, sessions:[{templateId, weekday, title, focus, exercises:[…]}]}]`,
/// which is the server's shape verbatim. The phone does not compose one from
/// scratch in this phase — a program arrives from the server, from a suggestion
/// in P7, or from the member naming one and applying it — so this is the create
/// path's encoder and keeps the column's shape out of the caller.
String jsonEncodeWeeks(List<Map<String, dynamic>> weeks) => jsonEncode(weeks);
