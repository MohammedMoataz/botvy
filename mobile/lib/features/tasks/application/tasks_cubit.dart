import 'dart:async';
import 'dart:convert';

import 'package:drift/drift.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:timezone/timezone.dart' as tz;
import 'package:uuid/uuid.dart';

import '../../../core/api/api_client.dart';
import '../../../core/db/database.dart';
import '../../../core/notifications/alert_plan.dart' show memberZone;
import '../../../core/sync/sync_engine.dart';
import 'recurrence.dart';

const Uuid _uuid = Uuid();

/// The six lists the member actually has, named as they are named on screen.
///
/// The same six the server's `TaskListView` names, and the predicates below are
/// the same predicates — see `contexts/planning/infrastructure/
/// mongo-task-read.repository.ts`. Two definitions of "today" is two days, and
/// the one the member sees would depend on whether the phone had synced.
enum TaskView { today, upcoming, overdue, label, completed, deleted }

class TasksState {
  const TasksState({
    this.view = TaskView.today,
    this.labelId,
    this.tasks = const [],
    this.labels = const [],
    this.openCounts = const {},
    this.palette = const [],
    this.loading = true,
    this.problem,
    this.dayStart,
  });

  /// Midnight where the member is, as the pass that loaded [tasks] resolved it.
  ///
  /// Carried on the state rather than recomputed in the widget: the boundary
  /// belongs to the member's zone, and a `build` that worked it out from
  /// `DateTime.now()` would use the *handset's* zone — which is the shift
  /// principle XI exists to stop and which cost v1 three hours once already.
  final DateTime? dayStart;

  final TaskView view;

  /// Which label the `label` view is showing. Null there means "no label",
  /// which is a real list a member wants — the unfiled tasks.
  final String? labelId;

  final List<LocalTask> tasks;
  final List<LocalLabel> labels;

  /// Open tasks per label id, for the label list. Counted in one grouped query
  /// rather than one query per label.
  final Map<String, int> openCounts;

  /// The colours the picker offers, from `settings.labels.palette`.
  final List<String> palette;

  final bool loading;

  /// Something the member has to see: a duplicate label name, a rejection the
  /// server explained. Never a bare "something went wrong" — the server's own
  /// sentence names the field and the rule.
  final String? problem;

  /// Today, split the way the screen draws it.
  ///
  /// Today is **not one day**: it is today's tasks plus everything still open
  /// from before, because a task that slipped is still something the member has
  /// to deal with today. The two are separated rather than merged so the eye
  /// lands on what is late, and the day's own work sits under its own heading.
  List<LocalTask> get overdueGroup => tasks
      .where((t) => t.dueAt != null && t.dueAt!.isBefore(_dayStart))
      .toList();

  List<LocalTask> get todayGroup => tasks
      .where((t) => t.dueAt == null || !t.dueAt!.isBefore(_dayStart))
      .toList();

  DateTime get _dayStart =>
      dayStart ?? DateTime.fromMillisecondsSinceEpoch(0, isUtc: true);

  TasksState copyWith({
    TaskView? view,
    String? labelId,
    List<LocalTask>? tasks,
    List<LocalLabel>? labels,
    Map<String, int>? openCounts,
    List<String>? palette,
    bool? loading,
    String? problem,
    DateTime? dayStart,
    bool clearProblem = false,
    bool clearLabelId = false,
  }) => TasksState(
    view: view ?? this.view,
    labelId: clearLabelId ? null : (labelId ?? this.labelId),
    tasks: tasks ?? this.tasks,
    labels: labels ?? this.labels,
    openCounts: openCounts ?? this.openCounts,
    palette: palette ?? this.palette,
    loading: loading ?? this.loading,
    problem: clearProblem ? null : (problem ?? this.problem),
    dayStart: dayStart ?? this.dayStart,
  );
}

/// The member's tasks and labels, read from and written to the local database.
///
/// **Every write is local and immediate.** A task created in airplane mode is
/// in the list before the sheet closes, survives a force quit, and is uploaded
/// whenever the network comes back — which is the whole point of the design and
/// the reason nothing here awaits the network before reporting success. The
/// write sets a `pendingOp`, and [SyncEngine] is what eventually carries it up.
///
/// Two things about those writes are easy to get backwards and both have bitten
/// this codebase before:
///
/// * `updatedAt` is when *this device* edited the row. `baseUpdatedAt` is the
///   server's own value for the version this device last pulled, and a local
///   edit must never touch it — the API accepts a push outright while the base
///   still matches, and sending the local time instead makes every offline edit
///   fall through to a clock comparison, which a slow handset loses.
/// * A row still queued as a `create` stays a `create` however many times it is
///   edited. Overwriting the op with `update` would push an edit for a row the
///   server has never seen, which the conflict rule refuses as `gone` — so the
///   member's new task would be deleted by its own second edit.
class TasksCubit extends Cubit<TasksState> {
  TasksCubit(this._db, this._sync, this._api) : super(const TasksState());

  final AppDatabase _db;
  final SyncEngine _sync;
  final ApiClient _api;

  StreamSubscription<SyncOutcome>? _passes;

  /// Re-reads after every sync pass, so a task created in the browser appears
  /// here without the member pulling to refresh.
  void listenToSync() {
    _passes ??= _sync.outcomes.listen((outcome) {
      unawaited(refresh());
      final refused = outcome.rejections
          .where((r) => r.entity == 'tasks' || r.entity == 'labels')
          .toList();
      if (refused.isEmpty || isClosed) return;
      // The server's own sentence. A rejection the member cannot see is an
      // edit that has silently stopped being saved.
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

  // ── reads ──────────────────────────────────────────────────────────────────

  Future<void> show(TaskView view, {String? labelId}) async {
    emit(state.copyWith(
      view: view,
      labelId: labelId,
      clearLabelId: labelId == null,
      loading: true,
      clearProblem: true,
    ));
    await refresh();
  }

  Future<void> refresh() async {
    if (isClosed) return;
    final zone = await _zone();
    final now = DateTime.now();

    final tasks = await _read(state.view, state.labelId, now, zone);
    final labels = await (_db.select(_db.labels)
          ..where((r) => r.deletedAt.isNull())
          ..orderBy([(r) => OrderingTerm.asc(r.sortOrder)]))
        .get();

    if (isClosed) return;
    emit(state.copyWith(
      tasks: tasks,
      labels: labels,
      openCounts: await _openCounts(),
      palette: await _palette(),
      loading: false,
      dayStart: _midnight(now, zone),
    ));
  }

  /// One view, as a query.
  ///
  /// The predicates are the server's, transcribed from `taskPredicateFor`. The
  /// sort orders are the server's too, from `TASK_SORT_KEYS`: a list that is
  /// ordered differently on the phone and on the web is a list where "the top
  /// one" means two things.
  Future<List<LocalTask>> _read(
    TaskView view,
    String? labelId,
    DateTime now,
    tz.Location zone,
  ) {
    final start = _midnight(now, zone);
    final end = _midnight(now, zone, tomorrow: true);
    final select = _db.select(_db.tasks);

    switch (view) {
      case TaskView.today:
        // Today *and* everything still open before it. `dueAt != null` matters:
        // an undated task is a someday task and has no business in a list about
        // a day.
        select
          ..where((r) =>
              r.deletedAt.isNull() &
              r.status.equals('open') &
              r.dueAt.isNotNull() &
              r.dueAt.isSmallerThanValue(end))
          ..orderBy([
            (r) => OrderingTerm.asc(r.dueAt),
            (r) => OrderingTerm.asc(r.priority),
          ]);
      case TaskView.upcoming:
        select
          ..where((r) =>
              r.deletedAt.isNull() &
              r.status.equals('open') &
              r.dueAt.isBiggerOrEqualValue(end))
          ..orderBy([
            (r) => OrderingTerm.asc(r.dueAt),
            (r) => OrderingTerm.asc(r.priority),
          ]);
      case TaskView.overdue:
        select
          ..where((r) =>
              r.deletedAt.isNull() &
              r.status.equals('open') &
              r.dueAt.isNotNull() &
              r.dueAt.isSmallerThanValue(start))
          ..orderBy([
            (r) => OrderingTerm.asc(r.dueAt),
            (r) => OrderingTerm.asc(r.priority),
          ]);
      case TaskView.label:
        select
          ..where((r) =>
              r.deletedAt.isNull() &
              (labelId == null
                  ? r.labelId.isNull()
                  : r.labelId.equals(labelId)))
          ..orderBy([
            (r) => OrderingTerm.asc(r.status),
            (r) => OrderingTerm.asc(r.dueAt),
            (r) => OrderingTerm.asc(r.priority),
          ]);
      case TaskView.completed:
        select
          ..where((r) => r.deletedAt.isNull() & r.status.equals('completed'))
          ..orderBy([(r) => OrderingTerm.desc(r.completedAt)]);
      case TaskView.deleted:
        // The one view that shows tombstones, and the one that needs the
        // pending-op filter: a task the member has erased is on its way out and
        // must not be offered for restoring.
        //
        // Written `notPendingOp`, which is `pending_op IS NULL OR pending_op
        // != 'purge'`. `pendingOp.equals('purge').not()` alone is SQL
        // `NOT (pending_op = 'purge')`, which evaluates to NULL for a clean row
        // — and NULL is falsy, so the list would come back empty. It has hidden
        // nearly every row twice in this codebase's history; see
        // `test/pending_op_test.dart`, which fails if it is rewritten the wrong
        // way.
        select
          ..where((r) =>
              r.deletedAt.isNotNull() &
              notPendingOp(r.pendingOp, PendingOps.purge))
          ..orderBy([(r) => OrderingTerm.desc(r.deletedAt)]);
    }
    return select.get();
  }

  Future<Map<String, int>> _openCounts() async {
    final count = _db.tasks.id.count();
    final query = _db.selectOnly(_db.tasks)
      ..addColumns([_db.tasks.labelId, count])
      ..where(_db.tasks.deletedAt.isNull() & _db.tasks.status.equals('open'))
      ..groupBy([_db.tasks.labelId]);

    return {
      for (final row in await query.get())
        row.read(_db.tasks.labelId) ?? '': row.read(count) ?? 0,
    };
  }

  // ── tasks ──────────────────────────────────────────────────────────────────

  /// Creates a task and reports its id.
  ///
  /// The id is minted here, as a UUIDv7, and the server takes it: that is what
  /// makes a retried create a no-op rather than a second task, and it is why
  /// the sheet can close before anything has reached the network.
  Future<String> create({
    required String title,
    String? notes,
    DateTime? dueAt,
    bool allDay = true,
    int priority = 4,
    String? labelId,
    Recurrence? recurrence,
    int? estimatedMinutes,
    String source = 'app',
  }) async {
    final id = _uuid.v7();
    final now = DateTime.now().toUtc();
    final label = labelId == null ? null : _labelById(labelId);

    await _db.into(_db.tasks).insert(
      TasksCompanion.insert(
        id: id,
        title: title.trim(),
        notes: Value(_blankToNull(notes)),
        dueAt: Value(dueAt?.toUtc()),
        allDay: Value(allDay),
        priority: Value(priority),
        labelId: Value(labelId),
        // The snapshot is written locally so the row renders straight away.
        // The push deliberately does not send it: the server re-resolves the
        // name and colour from its own store, because a phone that was offline
        // may hold a label renamed since.
        labelName: Value(label?.name),
        labelColor: Value(label?.color),
        recurrenceJson: Value(recurrence?.encode()),
        estimatedMinutes: Value(estimatedMinutes),
        source: Value(source),
        createdAt: now,
        updatedAt: now,
        // Null: this row has never been reconciled against a server timestamp,
        // which is exactly what tells the conflict rule it is an insert.
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
    String? notes,
    DateTime? dueAt,
    bool clearDueAt = false,
    bool? allDay,
    int? priority,
    String? labelId,
    bool clearLabel = false,
    Recurrence? recurrence,
    bool clearRecurrence = false,
    int? estimatedMinutes,
  }) async {
    final label = labelId == null ? null : _labelById(labelId);
    await _write(
      id,
      TasksCompanion(
        title: title == null ? const Value.absent() : Value(title.trim()),
        notes: notes == null ? const Value.absent() : Value(_blankToNull(notes)),
        dueAt: clearDueAt
            ? const Value(null)
            : (dueAt == null ? const Value.absent() : Value(dueAt.toUtc())),
        allDay: allDay == null ? const Value.absent() : Value(allDay),
        priority: priority == null ? const Value.absent() : Value(priority),
        labelId: clearLabel
            ? const Value(null)
            : (labelId == null ? const Value.absent() : Value(labelId)),
        labelName: clearLabel
            ? const Value(null)
            : (labelId == null ? const Value.absent() : Value(label?.name)),
        labelColor: clearLabel
            ? const Value(null)
            : (labelId == null ? const Value.absent() : Value(label?.color)),
        recurrenceJson: clearRecurrence
            ? const Value(null)
            : (recurrence == null
                  ? const Value.absent()
                  : Value(recurrence.encode())),
        estimatedMinutes: estimatedMinutes == null
            ? const Value.absent()
            : Value(estimatedMinutes),
      ),
    );
  }

  /// Ticks a task off — or, if it repeats, moves it to its next occurrence.
  ///
  /// A completed occurrence **advances the series rather than ending it**, which
  /// is the server's rule too: the task stays open and its `dueAt` moves. The
  /// advance happens here, on the device, because the sync facade deliberately
  /// writes a pushed status without re-running the transition — if it re-ran
  /// `complete()` the series would jump two occurrences for one tick.
  Future<void> complete(String id) async {
    final task = await _byId(id);
    if (task == null) return;
    final now = DateTime.now().toUtc();

    final rule = Recurrence.decode(task.recurrenceJson);
    final next = rule?.nextAfterCompleting(
      completedAt: now,
      dueAt: task.dueAt,
      timezone: (await _profile())?.timezone,
    );

    if (next != null) {
      await _write(
        id,
        TasksCompanion(dueAt: Value(next), deferCount: const Value.absent()),
      );
      return;
    }

    await _write(
      id,
      TasksCompanion(
        status: const Value('completed'),
        completedAt: Value(now),
      ),
    );
  }

  Future<void> reopen(String id) => _write(
    id,
    const TasksCompanion(status: Value('open'), completedAt: Value(null)),
  );

  Future<void> cancel(String id) => _write(
    id,
    const TasksCompanion(status: Value('cancelled'), completedAt: Value(null)),
  );

  /// Moves a task to another day, recording that it was carried over.
  ///
  /// `deferCount` and `deferredFrom` are what let the member see a task they
  /// have pushed forward five times, which is the point of counting it.
  Future<void> deferTo(String id, DateTime dueAt) async {
    final task = await _byId(id);
    if (task == null) return;
    await _write(
      id,
      TasksCompanion(
        dueAt: Value(dueAt.toUtc()),
        deferCount: Value(task.deferCount + 1),
        deferredFrom: Value(task.dueAt),
      ),
    );
  }

  /// Deletes with an undo, and **never touches the status**.
  ///
  /// The status is the only record of whether the task was completed, cancelled
  /// or never dealt with, and the Deleted view exists to show exactly that — so
  /// a restore brings it back as it was, including having been finished.
  Future<void> delete(String id) => _write(
    id,
    TasksCompanion(deletedAt: Value(DateTime.now().toUtc())),
    op: PendingOps.delete,
  );

  Future<void> restore(String id) =>
      _write(id, const TasksCompanion(deletedAt: Value(null)),
          op: PendingOps.restore);

  /// Erases a tombstone for good.
  Future<void> purge(String id) =>
      _write(id, const TasksCompanion(), op: PendingOps.purge);

  // ── labels ─────────────────────────────────────────────────────────────────

  /// Creates a label, refusing a name another live label already holds.
  ///
  /// Checked here as well as by the server's partial unique index, and the
  /// duplication is deliberate: the local check is what turns "refused" into a
  /// sentence the member reads *now*, in the editor, rather than a rejection
  /// that arrives after the next sync when they have moved on.
  Future<bool> createLabel(String name, String color) async {
    final trimmed = name.trim();
    if (trimmed.isEmpty) return false;
    if (state.labels.any(
      (l) => l.name.toLowerCase() == trimmed.toLowerCase(),
    )) {
      emit(state.copyWith(problem: 'A label called "$trimmed" already exists.'));
      return false;
    }

    final now = DateTime.now().toUtc();
    await _db.into(_db.labels).insert(
      LabelsCompanion.insert(
        id: _uuid.v7(),
        name: trimmed,
        color: color,
        sortOrder: Value(state.labels.length),
        createdAt: now,
        updatedAt: now,
        baseUpdatedAt: const Value(null),
        pendingOp: const Value(PendingOps.create),
      ),
    );
    await _after();
    return true;
  }

  /// Renames or recolours a label, and refreshes the snapshot on every task
  /// that carries it.
  ///
  /// The snapshot is refreshed locally rather than waited for: the server does
  /// the same thing on `LabelUpdated`, but a member who renames a label offline
  /// would otherwise keep seeing the old name on every task until the next
  /// sync, which reads as the rename not having worked.
  Future<bool> updateLabel(String id, {String? name, String? color}) async {
    final trimmed = name?.trim();
    if (trimmed != null &&
        state.labels.any(
          (l) =>
              l.id != id && l.name.toLowerCase() == trimmed.toLowerCase(),
        )) {
      emit(state.copyWith(problem: 'A label called "$trimmed" already exists.'));
      return false;
    }

    final now = DateTime.now().toUtc();
    await _db.transaction(() async {
      final row = await (_db.select(_db.labels)
            ..where((r) => r.id.equals(id)))
          .getSingleOrNull();
      if (row == null) return;

      await (_db.update(_db.labels)..where((r) => r.id.equals(id))).write(
        LabelsCompanion(
          name: trimmed == null ? const Value.absent() : Value(trimmed),
          color: color == null ? const Value.absent() : Value(color),
          updatedAt: Value(now),
          pendingOp: Value(_nextOp(row.pendingOp, PendingOps.update)),
        ),
      );

      await (_db.update(_db.tasks)..where((r) => r.labelId.equals(id))).write(
        TasksCompanion(
          labelName: trimmed == null ? const Value.absent() : Value(trimmed),
          labelColor: color == null ? const Value.absent() : Value(color),
        ),
      );
    });

    await _after();
    return true;
  }

  /// Deletes a label. Its tasks stay, without a label — losing the tasks
  /// because their grouping went would be the deletion doing far more than it
  /// said.
  Future<void> deleteLabel(String id) async {
    final now = DateTime.now().toUtc();
    await _db.transaction(() async {
      final row = await (_db.select(_db.labels)
            ..where((r) => r.id.equals(id)))
          .getSingleOrNull();
      if (row == null) return;

      await (_db.update(_db.labels)..where((r) => r.id.equals(id))).write(
        LabelsCompanion(
          deletedAt: Value(now),
          updatedAt: Value(now),
          pendingOp: Value(_nextOp(row.pendingOp, PendingOps.delete)),
        ),
      );
      // The reference is cleared with the snapshot. Leaving `labelId` pointing
      // at a tombstone would make the by-label view list tasks under a label
      // that is not in the label list.
      await (_db.update(_db.tasks)..where((r) => r.labelId.equals(id))).write(
        const TasksCompanion(
          labelId: Value(null),
          labelName: Value(null),
          labelColor: Value(null),
        ),
      );
    });
    await _after();
  }

  void clearProblem() => emit(state.copyWith(clearProblem: true));

  // ── plumbing ───────────────────────────────────────────────────────────────

  /// One local edit: the row, its new `updatedAt`, and its pending operation.
  ///
  /// [op] defaults to `update`, and [_nextOp] is what keeps a row that has
  /// never reached the server queued as a `create`.
  Future<void> _write(
    String id,
    TasksCompanion patch, {
    String op = PendingOps.update,
  }) async {
    final row = await _byId(id);
    if (row == null) return;

    await (_db.update(_db.tasks)..where((r) => r.id.equals(id))).write(
      patch.copyWith(
        updatedAt: Value(DateTime.now().toUtc()),
        pendingOp: Value(_nextOp(row.pendingOp, op)),
        // `baseUpdatedAt` is deliberately absent: it is the server's own
        // timestamp for the version this device pulled, and a local edit that
        // touched it would turn the uncontested push into a clock comparison.
        //
        // `pushAttempts` is reset, because this is a *different* row now — the
        // member has changed what the server refused, and it deserves its
        // strikes back.
        pushAttempts: const Value(0),
      ),
    );
    await _after();
  }

  Future<void> _after() async {
    await refresh();
    // Fire and forget. A member who has just created a task must not wait for
    // a round trip to see it, and the engine collapses a burst into one pass.
    _sync.kick();
  }

  Future<LocalTask?> _byId(String id) =>
      (_db.select(_db.tasks)..where((r) => r.id.equals(id))).getSingleOrNull();

  LocalLabel? _labelById(String id) {
    for (final label in state.labels) {
      if (label.id == id) return label;
    }
    return null;
  }

  Future<Profile?> _profile() =>
      (_db.select(_db.profiles)..limit(1)).getSingleOrNull();

  Future<tz.Location> _zone() async => memberZone((await _profile())?.timezone);

  /// The colours the picker offers, cached locally.
  ///
  /// `settings.labels.palette` is an operator knob, so compiling a list in here
  /// would be a bug by constitution XII. It is fetched once and kept, because
  /// the only surface that exposes the registry is admin-only — a member whose
  /// role is not `admin` never learns it, and then the picker offers the
  /// colours the member's own labels already use, which is at least their own
  /// palette rather than somebody's compiled-in guess.
  Future<List<String>> _palette() async {
    final cached = await _db.getValue(_kPaletteKey);
    if (cached != null && cached.isNotEmpty) {
      final decoded = jsonDecode(cached);
      if (decoded is List && decoded.isNotEmpty) {
        return decoded.whereType<String>().toList();
      }
    }

    try {
      final fetched = await _api.labelPalette();
      if (fetched.isNotEmpty) {
        await _db.setValue(_kPaletteKey, jsonEncode(fetched));
        return fetched;
      }
    } catch (_) {
      // Offline, or a member without the admin role. Neither is worth a
      // message: the fallback below is a usable picker.
    }

    return {for (final label in state.labels) label.color}.toList();
  }

  static const String _kPaletteKey = 'settings.labels.palette';
}

/// The op a row should carry after an edit.
///
/// A row still queued as a `create` stays a `create`, whatever happens to it:
/// the server has never seen it, and pushing `update` for a row that is not
/// there is refused as `gone` — which tells the client to delete its local copy.
/// A member's second edit of a new task would then erase it.
String _nextOp(String? current, String wanted) =>
    current == PendingOps.create ? PendingOps.create : wanted;

String? _blankToNull(String? value) {
  final trimmed = value?.trim();
  return trimmed == null || trimmed.isEmpty ? null : trimmed;
}

/// Midnight where the member is.
///
/// Built from calendar fields in their zone, never by truncating a UTC instant:
/// a member in Cairo asking for Today at 00:30 means the day that has just
/// started where *they* are, and the server's own date would have said
/// yesterday.
DateTime _midnight(DateTime now, tz.Location zone, {bool tomorrow = false}) {
  final local = tz.TZDateTime.from(now, zone);
  final midnight = tz.TZDateTime(
    zone,
    local.year,
    local.month,
    local.day + (tomorrow ? 1 : 0),
  );
  // Handed back as a plain DateTime: this database stores date-times as ISO
  // text and `TZDateTime.toString()` appends the zone, which `DateTime.parse`
  // then refuses — a TZDateTime in any column here is a row that can be
  // written and never read.
  return DateTime.fromMillisecondsSinceEpoch(
    midnight.millisecondsSinceEpoch,
    isUtc: true,
  );
}

/// What a rejection reason means, for the reasons that carry no message.
String _refusalText(String reason) => switch (reason) {
  'stale' => 'Another device changed this first. Its version is shown.',
  'gone' => 'That had already been removed elsewhere.',
  'protected' => 'That one cannot be changed.',
  'not_deleted' => 'Delete it before erasing it.',
  _ => 'Botvy refused that change.',
};
