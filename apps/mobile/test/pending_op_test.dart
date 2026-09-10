import 'package:botvy/core/db/database.dart';
import 'package:botvy/features/reminders/application/reminders_cubit.dart';
import 'package:botvy/features/tasks/application/tasks_cubit.dart';
import 'package:drift/drift.dart';
import 'package:drift/native.dart';
import 'package:flutter_test/flutter_test.dart';

import 'fakes.dart';

/// The `pendingOp` filter, which has hidden nearly every row in a table twice.
///
/// A filter meaning "this row's pending operation is not X" has to be written
///
/// ```dart
/// pendingOp.isNull() | pendingOp.equals(x).not()
/// ```
///
/// and **not** `pendingOp.equals(x).not()` on its own. The second is SQL
/// `NOT (pending_op = 'x')`, and for a clean row `pending_op` is NULL, so the
/// expression evaluates to NULL rather than true — and NULL is falsy in a
/// `WHERE`. The filter then silently drops every row that has no pending
/// operation, which is nearly all of them.
///
/// It is a three-value-logic trap, not a drift quirk, which is why the second
/// test below asserts the broken form *is* broken: if that ever stops being
/// true the helper is no longer earning its keep, and if somebody rewrites
/// [notPendingOp] as the naive form the first test and the two view tests fail.
void main() {
  late AppDatabase db;

  final now = DateTime.now().toUtc();

  setUp(() => db = AppDatabase.forTesting(NativeDatabase.memory()));
  tearDown(() => db.close());

  Future<void> seedTasks() async {
    // Three rows: one clean (pending_op NULL, which is the ordinary case and
    // the one that goes missing), one with an unrelated pending operation, and
    // one on its way out.
    for (final row in [
      ('clean', null),
      ('being-edited', PendingOps.update),
      ('being-erased', PendingOps.purge),
    ]) {
      await db.into(db.tasks).insert(
        TasksCompanion.insert(
          id: row.$1,
          title: row.$1,
          createdAt: now,
          updatedAt: now,
          deletedAt: Value(now),
          pendingOp: Value(row.$2),
        ),
      );
    }
  }

  test('notPendingOp keeps every row whose pending_op is NULL', () async {
    await seedTasks();

    final rows = await (db.select(db.tasks)
          ..where((r) => notPendingOp(r.pendingOp, PendingOps.purge)))
        .get();

    expect(
      rows.map((r) => r.id).toSet(),
      {'clean', 'being-edited'},
      reason: 'the clean row, whose pending_op is NULL, must survive a filter '
          'that only means to exclude a purge',
    );
  });

  test('the naive form hides every clean row, which is why the helper exists',
      () async {
    await seedTasks();

    // `NOT (pending_op = 'purge')` — NULL for the clean row, and NULL is falsy.
    // This is the bug, asserted so that it cannot be reintroduced under a
    // comment claiming the two forms are equivalent.
    final rows = await (db.select(db.tasks)
          ..where((r) => r.pendingOp.equals(PendingOps.purge).not()))
        .get();

    expect(
      rows.map((r) => r.id).toSet(),
      {'being-edited'},
      reason: 'the naive form drops the clean row; if this ever returns it, '
          'SQL three-value logic has changed and notPendingOp can go',
    );
  });

  test('the Deleted task view lists a clean tombstone and hides an erasure',
      () async {
    await seedTasks();
    final cubit = TasksCubit(
      db,
      offlineEngine(db),
      OfflineApi(),
    );
    addTearDown(cubit.close);

    await cubit.show(TaskView.deleted);

    // The whole point of the view: a member looking for something they deleted
    // finds it. With the naive filter this list comes back empty and the task
    // is unrecoverable through the UI.
    expect(cubit.state.tasks.map((t) => t.id), contains('clean'));
    expect(cubit.state.tasks.map((t) => t.id), isNot(contains('being-erased')));
  });

  test('the Deleted reminder view does the same', () async {
    for (final row in [('clean', null), ('being-erased', PendingOps.purge)]) {
      await db.into(db.reminders).insert(
        RemindersCompanion.insert(
          id: row.$1,
          title: row.$1,
          remindAt: now,
          createdAt: now,
          updatedAt: now,
          deletedAt: Value(now),
          pendingOp: Value(row.$2),
        ),
      );
    }

    final cubit = RemindersCubit(
      db,
      offlineEngine(db),
    );
    addTearDown(cubit.close);

    await cubit.show(ReminderView.deleted);

    expect(cubit.state.reminders.map((r) => r.id), contains('clean'));
    expect(
      cubit.state.reminders.map((r) => r.id),
      isNot(contains('being-erased')),
    );
  });
}
