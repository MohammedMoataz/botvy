import 'dart:async';
import 'dart:convert';

import 'package:drift/drift.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:uuid/uuid.dart';

import '../../../core/db/database.dart';
import '../../../core/notifications/alert_plan.dart' show kSnoozeFor;
import '../../../core/sync/sync_engine.dart';

const Uuid _uuid = Uuid();

/// The four lists the server's `ReminderListView` names, with the same
/// predicates: `snoozedUntil ?? remindAt` is the moment every one of them is
/// cut on, which is the server's own `effectiveAt`.
enum ReminderView { upcoming, overdue, done, deleted }

class RemindersState {
  const RemindersState({
    this.view = ReminderView.upcoming,
    this.reminders = const [],
    this.loading = true,
    this.problem,
    this.blocked = const {},
  });

  final ReminderView view;
  final List<LocalReminder> reminders;
  final bool loading;
  final String? problem;

  /// Ids the sync engine has stopped re-sending, so the row can be badged and
  /// tapped to retry. The member's edit is still there — it is simply not
  /// getting through, and saying nothing about that is how an edit disappears.
  final Set<String> blocked;

  RemindersState copyWith({
    ReminderView? view,
    List<LocalReminder>? reminders,
    bool? loading,
    String? problem,
    Set<String>? blocked,
    bool clearProblem = false,
  }) => RemindersState(
    view: view ?? this.view,
    reminders: reminders ?? this.reminders,
    loading: loading ?? this.loading,
    problem: clearProblem ? null : (problem ?? this.problem),
    blocked: blocked ?? this.blocked,
  );
}

/// The member's reminders, local-first exactly as the tasks are.
///
/// The one rule here that is easy to get wrong: **a snooze is not a new
/// `remindAt`**. The moment the member originally asked for is still the truth
/// about what they wanted, so "not now, in ten minutes" is written to
/// `snoozedUntil` and the alarm fires at `snoozedUntil ?? remindAt` — the same
/// `effectiveAt` the server's aggregate plans from. Overwriting `remindAt`
/// would mean a member who snoozed twice could no longer see when they had
/// meant to be reminded.
class RemindersCubit extends Cubit<RemindersState> {
  RemindersCubit(this._db, this._sync) : super(const RemindersState());

  final AppDatabase _db;
  final SyncEngine _sync;

  StreamSubscription<SyncOutcome>? _passes;

  void listenToSync() {
    _passes ??= _sync.outcomes.listen((outcome) {
      unawaited(refresh());
      final refused =
          outcome.rejections.where((r) => r.entity == 'reminders').toList();
      if (refused.isEmpty || isClosed) return;
      emit(state.copyWith(
        problem: refused.first.message ?? _refusalText(refused.first.reason),
      ));
    });
  }

  @override
  Future<void> close() async {
    await _passes?.cancel();
    return super.close();
  }

  Future<void> show(ReminderView view) async {
    emit(state.copyWith(view: view, loading: true, clearProblem: true));
    await refresh();
  }

  Future<void> refresh() async {
    if (isClosed) return;
    final rows = await _read(state.view, DateTime.now().toUtc());
    final blocked = {
      for (final row in await _sync.blockedRows())
        if (row.entity == 'reminders') row.id,
    };
    if (isClosed) return;
    emit(state.copyWith(reminders: rows, blocked: blocked, loading: false));
  }

  Future<List<LocalReminder>> _read(ReminderView view, DateTime now) {
    final select = _db.select(_db.reminders);
    // `snoozedUntil ?? remindAt`, in SQL. The server calls it `effectiveAt` and
    // cuts every list on it; computing it in Dart instead would mean reading
    // every reminder the member has ever had to show the next three.
    final effectiveAt = coalesce([
      _db.reminders.snoozedUntil,
      _db.reminders.remindAt,
    ]);

    switch (view) {
      case ReminderView.upcoming:
        select
          ..where((r) =>
              r.deletedAt.isNull() &
              r.status.equals('active') &
              effectiveAt.isBiggerOrEqualValue(now))
          ..orderBy([(r) => OrderingTerm.asc(effectiveAt)]);
      case ReminderView.overdue:
        select
          ..where((r) =>
              r.deletedAt.isNull() &
              r.status.equals('active') &
              effectiveAt.isSmallerThanValue(now))
          ..orderBy([(r) => OrderingTerm.desc(effectiveAt)]);
      case ReminderView.done:
        select
          ..where((r) =>
              r.deletedAt.isNull() &
              r.status.isIn(const ['done', 'cancelled']))
          ..orderBy([(r) => OrderingTerm.desc(r.updatedAt)]);
      case ReminderView.deleted:
        // The pending-op filter, for the same reason the Deleted task view
        // needs it: a reminder the member has erased is on its way out and must
        // not be offered for restoring. `pendingOp.equals(x).not()` alone would
        // be NULL for every clean row and NULL is falsy, so the list would come
        // back empty — see `test/pending_op_test.dart`.
        select
          ..where((r) =>
              r.deletedAt.isNotNull() &
              notPendingOp(r.pendingOp, PendingOps.purge))
          ..orderBy([(r) => OrderingTerm.desc(r.deletedAt)]);
    }
    return select.get();
  }

  // ── writes ─────────────────────────────────────────────────────────────────

  /// Creates a reminder and reports its id.
  ///
  /// [leadTimes] empty means "the member's defaults", which live in the
  /// preferences row — stored empty rather than expanded, so a member who
  /// later changes their defaults changes this reminder too.
  Future<String> create({
    required String title,
    required DateTime remindAt,
    List<String> leadTimes = const [],
    String source = 'app',
  }) async {
    final id = _uuid.v7();
    final now = DateTime.now().toUtc();

    await _db.into(_db.reminders).insert(
      RemindersCompanion.insert(
        id: id,
        title: title.trim(),
        remindAt: remindAt.toUtc(),
        leadTimesJson: Value(jsonEncode(leadTimes)),
        source: Value(source),
        createdAt: now,
        updatedAt: now,
        baseUpdatedAt: const Value(null),
        pendingOp: const Value(PendingOps.create),
      ),
    );

    await _after();
    return id;
  }

  Future<void> edit(
    String id, {
    String? title,
    DateTime? remindAt,
    List<String>? leadTimes,
  }) => _write(
    id,
    RemindersCompanion(
      title: title == null ? const Value.absent() : Value(title.trim()),
      remindAt:
          remindAt == null ? const Value.absent() : Value(remindAt.toUtc()),
      leadTimesJson: leadTimes == null
          ? const Value.absent()
          : Value(jsonEncode(leadTimes)),
      // A new moment clears a snooze: the member has said when they want it
      // now, and holding the old "in ten minutes" over the new time would fire
      // for a moment they have replaced.
      snoozedUntil:
          remindAt == null ? const Value.absent() : const Value(null),
    ),
  );

  /// "Not now, in ten minutes."
  ///
  /// A member-chosen delay, so the moment it lands on is the member's own and
  /// quiet hours never move it — the same rule the server applies to
  /// `snoozedUntil`.
  Future<void> snooze(String id, {Duration by = kSnoozeFor}) => _write(
    id,
    RemindersCompanion(
      snoozedUntil: Value(DateTime.now().toUtc().add(by)),
    ),
  );

  Future<void> complete(String id) =>
      _write(id, const RemindersCompanion(status: Value('done')));

  Future<void> cancelReminder(String id) =>
      _write(id, const RemindersCompanion(status: Value('cancelled')));

  /// Brings a finished or cancelled reminder back, at a new moment.
  ///
  /// The new moment is required rather than optional, and that is the server's
  /// rule too: reactivating without one would leave an active reminder whose
  /// time has passed, which alarms immediately or never depending on how the
  /// sweep's expiry lands.
  Future<void> reactivate(String id, DateTime remindAt) => _write(
    id,
    RemindersCompanion(
      status: const Value('active'),
      remindAt: Value(remindAt.toUtc()),
      snoozedUntil: const Value(null),
    ),
  );

  /// A delete never touches the status. The Deleted view is where a member
  /// finds out whether the thing they removed had been done, cancelled or was
  /// still waiting.
  Future<void> delete(String id) => _write(
    id,
    RemindersCompanion(deletedAt: Value(DateTime.now().toUtc())),
    op: PendingOps.delete,
  );

  Future<void> restore(String id) => _write(
    id,
    const RemindersCompanion(deletedAt: Value(null)),
    op: PendingOps.restore,
  );

  /// Erases a tombstone for good.
  Future<void> erase(String id) =>
      _write(id, const RemindersCompanion(), op: PendingOps.purge);

  /// Puts a blocked row back in the outbox at the member's request.
  Future<void> retry(String id) async {
    await _sync.retry('reminders', id);
    await refresh();
  }

  void clearProblem() => emit(state.copyWith(clearProblem: true));

  Future<void> _write(
    String id,
    RemindersCompanion patch, {
    String op = PendingOps.update,
  }) async {
    final row = await (_db.select(_db.reminders)
          ..where((r) => r.id.equals(id)))
        .getSingleOrNull();
    if (row == null) return;

    await (_db.update(_db.reminders)..where((r) => r.id.equals(id))).write(
      patch.copyWith(
        updatedAt: Value(DateTime.now().toUtc()),
        // A row the server has never seen stays a `create`: pushing `update`
        // for a missing row is refused as `gone`, and the client's obligation
        // on a `gone` is to delete its local copy — so the member's second edit
        // would erase their own new reminder.
        pendingOp: Value(
          row.pendingOp == PendingOps.create ? PendingOps.create : op,
        ),
        // `baseUpdatedAt` stays untouched, deliberately: it is the server's
        // timestamp for the version this device pulled, and it is what makes
        // the next push uncontested.
        pushAttempts: const Value(0),
      ),
    );
    await _after();
  }

  Future<void> _after() async {
    await refresh();
    _sync.kick();
  }
}

String _refusalText(String reason) => switch (reason) {
  'stale' => 'Another device changed this first. Its version is shown.',
  'gone' => 'That had already been removed elsewhere.',
  'protected' => 'That one cannot be changed.',
  'not_deleted' => 'Delete it before erasing it.',
  _ => 'Botvy refused that change.',
};
