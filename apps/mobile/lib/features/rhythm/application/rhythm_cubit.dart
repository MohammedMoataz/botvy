import 'dart:async';
import 'dart:convert';

import 'package:drift/drift.dart';
import 'package:flutter_bloc/flutter_bloc.dart';

import '../../../core/api/api_client.dart';
import '../../../core/db/database.dart';
import '../../../core/notifications/alert_plan.dart'
    show memberDate, memberZone;
import '../../../core/sync/sync_engine.dart';
import 'daily_plan.dart';

/// What the two sheets are showing and whether the last command landed.
class RhythmSheetState {
  const RhythmSheetState({
    this.loading = true,
    this.busy = false,
    this.date = '',
    this.plan,
    this.candidates = const [],
    this.problem,
    this.settled,
  });

  final bool loading;

  /// A command is in flight. What stops a double tap sending two confirms —
  /// the second of which would arrive after the first and overwrite it with
  /// whatever was on screen a moment earlier.
  final bool busy;

  /// The local date the sheet is about, `YYYY-MM-DD`, resolved in the member's
  /// zone rather than the handset's.
  final String date;

  final LocalDailyPlan? plan;

  /// Everything the member may put in the plan: the draft's own tasks first,
  /// then their other open tasks. One list rather than two, because "add" and
  /// "remove" are the same gesture over it — a checkbox — and two lists would
  /// need a move animation to say the same thing.
  final List<PlanTask> candidates;

  final String? problem;

  /// Set once the command has been accepted, so the sheet can close itself and
  /// say what happened. Null while the sheet is still a question.
  final RhythmOutcome? settled;

  RhythmSheetState copyWith({
    bool? loading,
    bool? busy,
    String? date,
    LocalDailyPlan? plan,
    List<PlanTask>? candidates,
    String? problem,
    RhythmOutcome? settled,
    bool clearProblem = false,
  }) => RhythmSheetState(
    loading: loading ?? this.loading,
    busy: busy ?? this.busy,
    date: date ?? this.date,
    plan: plan ?? this.plan,
    candidates: candidates ?? this.candidates,
    problem: clearProblem ? null : (problem ?? this.problem),
    settled: settled ?? this.settled,
  );
}

/// What a completed command was.
enum RhythmOutcome { confirmed, skipped, checkedIn }

/// Confirming tomorrow, and saying how today went.
///
/// The two writes in this feature, and both of them are **REST commands**
/// rather than sync pushes. `contracts/sync.md` has push slots for them
/// (`daily_plans: [{op: 'confirm'}]`, `checkins: [{op: 'record'}]`) and
/// `rest-commands.md` has the endpoints; the endpoints are the permanent path,
/// because they are what the notification action calls and a notification
/// action has to work from a shade with no screen behind it. Two paths that
/// agree most of the time is worse than one that always does.
///
/// The consequence, stated plainly because it is a real cost: **confirming
/// tomorrow needs the network.** Everything else in this application is
/// local-first, and this is not. The command is sent first and the local mirror
/// is written only once the server has accepted it, so what the member sees is
/// never a lie — a confirm that could not be sent says so rather than showing a
/// plan the server has never heard of and then losing it on the next pull.
///
/// ponytail: the offline ceiling. If confirming on a plane turns out to matter,
/// the upgrade is the push slot the contract already reserves — set `pendingOp`
/// on the mirrored row, teach the two appliers to push it, and the engine's
/// existing retry and rejection handling covers the rest. Nothing else here
/// changes.
class RhythmCubit extends Cubit<RhythmSheetState> {
  RhythmCubit(this._db, this._api, this._sync)
    : super(const RhythmSheetState());

  final AppDatabase _db;
  final ApiClient _api;
  final SyncEngine _sync;

  /// Loads the plan for [date], or for tomorrow when the caller has no date —
  /// which is what a notification tap that lost its path falls back to.
  Future<void> openPlan({String? date}) async {
    final resolved = date ?? await memberToday(_db, addDays: 1);
    final plan = await planForDate(_db, resolved);

    emit(
      state.copyWith(
        loading: false,
        date: resolved,
        plan: plan,
        candidates: await _candidates(plan),
        clearProblem: true,
      ),
    );
  }

  /// Loads the check-in sheet for [date], or for today.
  Future<void> openCheckin({String? date}) async {
    emit(
      state.copyWith(
        loading: false,
        date: date ?? await memberToday(_db),
        clearProblem: true,
      ),
    );
  }

  /// Everything the member may choose for the day, draft first.
  ///
  /// The draft's own tasks lead, in the order the server proposed them — that
  /// order is priority then due time and it is the server's answer to "the
  /// highest-priority tasks", so re-sorting it here would be the phone
  /// second-guessing the draft. Then the member's other open tasks, so adding
  /// one is a tick rather than a search.
  Future<List<PlanTask>> _candidates(LocalDailyPlan? plan) async {
    final chosen = await decodePlanTasks(_db, plan);
    final inPlan = {for (final task in chosen) task.id};

    final others = await (_db.select(_db.tasks)
          ..where(
            (r) =>
                r.deletedAt.isNull() &
                r.status.equals('open') &
                // Not on its way out. Written with the helper because
                // `pendingOp.equals('purge').not()` alone is NULL for a clean
                // row and NULL is falsy — which hides every task that has no
                // pending operation, and that is nearly all of them. Shipped
                // twice in this codebase already.
                notPendingOp(r.pendingOp, PendingOps.purge),
          )
          ..orderBy([
            (r) => OrderingTerm.asc(r.priority),
            (r) => OrderingTerm.asc(r.dueAt),
          ])
          ..limit(50))
        .get();

    return [
      ...chosen,
      for (final row in others)
        if (!inPlan.contains(row.id))
          PlanTask(
            id: row.id,
            title: row.title,
            priority: row.priority,
            dueAt: row.dueAt,
            deferCount: row.deferCount,
            done: row.status == 'completed',
          ),
    ];
  }

  // ── commands ───────────────────────────────────────────────────────────────

  /// Confirms the day's plan with the ids the member ticked.
  ///
  /// [training] is tri-state and stays tri-state all the way to the wire:
  /// `null` leaves whatever the draft proposed, `false` clears the slot. A
  /// member who says there is no training tomorrow has the slot cleared rather
  /// than argued with (T322), and that is only expressible if "did not say" and
  /// "said no" are different values.
  Future<void> confirm({
    required List<String> taskIds,
    bool? training,
  }) async {
    await _command(RhythmOutcome.confirmed, () async {
      await _api.confirmPlan(state.date, taskIds: taskIds, training: training);

      // The local mirror, so the "plan tomorrow" card goes away on this frame
      // instead of after the next pull. `updatedAt` is this device's edit time;
      // `baseUpdatedAt` is deliberately **not** touched — it is the server's
      // own value for the version last pulled, and overwriting it with a local
      // clock is what makes a later push fall through to a clock comparison
      // that a slow handset loses. Nothing pushes this row today, and the rule
      // holds anyway: the day something does, it must not have been broken
      // here first.
      final plan = state.plan;
      if (plan == null) return;
      final kept = taskIds.toSet();
      await (_db.update(_db.dailyPlans)..where((r) => r.id.equals(plan.id)))
          .write(
            DailyPlansCompanion(
              status: const Value('confirmed'),
              autoConfirmed: const Value(false),
              // Re-snapshotted to exactly what the member ticked, in the
              // order they were offered. The server re-snapshots too and its
              // copy replaces this on the next pull; this one is what the card
              // draws in the meantime.
              tasksJson: Value(
                jsonEncode([
                  for (final task in state.candidates)
                    if (kept.contains(task.id))
                      {
                        'id': task.id,
                        'title': task.title,
                        'priority': task.priority,
                        'dueAt': task.dueAt?.toUtc().toIso8601String(),
                        'deferCount': task.deferCount,
                      },
                ]),
              ),
              // `training: false` clears the slot. Left alone when the member
              // did not say, which is what `Value.absent()` means here.
              trainingJson: training == false
                  ? const Value(null)
                  : const Value.absent(),
              confirmedAt: Value(DateTime.now().toUtc()),
              updatedAt: Value(DateTime.now().toUtc()),
            ),
          );
    });
  }

  Future<void> skip() async {
    await _command(RhythmOutcome.skipped, () async {
      await _api.skipPlan(state.date);

      final plan = state.plan;
      if (plan == null) return;
      await (_db.update(_db.dailyPlans)..where((r) => r.id.equals(plan.id)))
          .write(
            DailyPlansCompanion(
              status: const Value('skipped'),
              // No `confirmedAt`, and the task snapshot is left exactly as the
              // draft had it. A skip is not an empty plan: it is the member
              // declining to plan, and the summary still names tomorrow's
              // training (US1 acceptance 5).
              updatedAt: Value(DateTime.now().toUtc()),
            ),
          );
    });
  }

  /// Records the check-in. Every field is optional: a mood with no verdict is
  /// still worth keeping, and a note on its own is a diary entry.
  Future<void> recordCheckin({int? mood, bool? adhered, String? note}) async {
    await _command(RhythmOutcome.checkedIn, () async {
      await _api.recordCheckin(
        date: state.date,
        mood: mood,
        adhered: adhered,
        note: note,
      );

      // No local write for the streak. The streak is arithmetic over every
      // check-in the member has ever made and the server owns it — recomputing
      // it here would be a second implementation of `adherence.ts` on a device
      // that holds only the last seven days, and the two would disagree the
      // first time somebody was offline for a week. The sync kick below is what
      // brings the new number back.
    });
  }

  /// The shape all three commands share: guard against a double tap, send,
  /// report a failure in the member's own language, and pull afterwards.
  Future<void> _command(
    RhythmOutcome outcome,
    Future<void> Function() send,
  ) async {
    if (state.busy) return;
    emit(state.copyWith(busy: true, clearProblem: true));

    try {
      await send();
    } on ApiException catch (error) {
      if (isClosed) return;
      emit(
        state.copyWith(
          busy: false,
          // `isOffline` rather than a status code: the sheet says something
          // different about "no network" than about "the server refused", and
          // a member on a train needs to be told to try again rather than that
          // something went wrong.
          problem: error.isOffline
              ? _kOffline
              : (error.message.isEmpty ? _kRefused : error.message),
        ),
      );
      return;
    } catch (error) {
      if (isClosed) return;
      emit(state.copyWith(busy: false, problem: _kRefused));
      return;
    }

    if (isClosed) return;
    emit(state.copyWith(busy: false, settled: outcome));

    // Fire-and-forget: the server's own copy of the plan and the new streak
    // arrive on the next pass, and the sheet must not wait for a round trip it
    // has already had.
    _sync.kick();
  }

  void clearProblem() => emit(state.copyWith(clearProblem: true));

  /// Sentinels rather than sentences.
  ///
  /// The cubit has no `BuildContext` and so no `AppLocalizations`; a message
  /// composed here would be English on an Arabic screen. The sheet maps these
  /// two onto its own localised strings, which is the same split the tasks
  /// feature uses for a rejection with no server message.
  static const String _kOffline = 'rhythm.offline';
  static const String _kRefused = 'rhythm.refused';

  static const String offlineProblem = _kOffline;
  static const String refusedProblem = _kRefused;
}

/// The member's own date, from the mirrored profile's zone.
///
/// A function rather than a field because it is wanted by the cubit before any
/// state exists — a notification tap arrives with no screen — and because the
/// answer changes at midnight. `memberZone` falls back to the handset's zone
/// and then to UTC, so this works before the profile has ever been pulled.
Future<String> memberToday(AppDatabase db, {int addDays = 0}) async {
  final profile = await (db.select(db.profiles)..limit(1)).getSingleOrNull();
  return memberDate(
    DateTime.now(),
    memberZone(profile?.timezone),
    addDays: addDays,
  );
}
