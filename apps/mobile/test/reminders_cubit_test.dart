import 'package:botvy/core/db/database.dart';
import 'package:botvy/core/sync/sync_engine.dart';
import 'package:botvy/features/reminders/application/reminders_cubit.dart';
import 'package:drift/drift.dart' show Value;
import 'package:drift/native.dart';
import 'package:flutter_test/flutter_test.dart';

import 'fakes.dart';

/// The reminders Cubit, against the real drift database in memory.
///
/// Fixtures relative to `DateTime.now()`. A reminder is a moment, so a pinned
/// one is a test that means something different every day until it means
/// nothing.
void main() {
  late AppDatabase db;
  late SyncEngine engine;
  late RemindersCubit cubit;

  setUp(() {
    db = AppDatabase.forTesting(NativeDatabase.memory());
    engine = offlineEngine(db);
    cubit = RemindersCubit(db, engine);
  });

  tearDown(() async {
    // Every write kicks the engine, deliberately without waiting for it.
    // Joining one more pass here stops the teardown closing the database from
    // under a pass that is still reading it.
    await engine.sync();
    await cubit.close();
    engine.dispose();
    await db.close();
  });

  Future<LocalReminder> row(String id) =>
      (db.select(db.reminders)..where((r) => r.id.equals(id))).getSingle();

  final soon = DateTime.now().toUtc().add(const Duration(hours: 2));
  final passed = DateTime.now().toUtc().subtract(const Duration(hours: 2));

  group('creating', () {
    test('a new reminder is queued as a create and listed in Upcoming',
        () async {
      final id = await cubit.create(title: 'Ring the bank', remindAt: soon);

      final reminder = await row(id);
      expect(reminder.pendingOp, PendingOps.create);
      expect(reminder.baseUpdatedAt, isNull);
      expect(reminder.status, 'active');

      await cubit.show(ReminderView.upcoming);
      expect(cubit.state.reminders.single.id, id);
    });

    test('empty lead times mean the member\'s defaults, and stay empty',
        () async {
      final id = await cubit.create(title: 'Ring the bank', remindAt: soon);

      // Stored empty rather than expanded from the preferences: a member who
      // later changes their defaults changes this reminder too, which is what
      // "my defaults" means.
      expect((await row(id)).leadTimesJson, '[]');
    });

    test('a moment already behind the clock lands in Overdue, not Upcoming',
        () async {
      final id = await cubit.create(title: 'Missed it', remindAt: passed);

      await cubit.show(ReminderView.overdue);
      expect(cubit.state.reminders.single.id, id);

      await cubit.show(ReminderView.upcoming);
      expect(cubit.state.reminders, isEmpty);
    });

    test('editing one the server has never seen keeps it a create', () async {
      final id = await cubit.create(title: 'First go', remindAt: soon);

      await cubit.edit(id, title: 'Second go');

      // Pushing `update` for a row the server has never seen is refused as
      // `gone`, and a `gone` tells the client to delete its local copy — so the
      // member's second edit would erase their own new reminder.
      final reminder = await row(id);
      expect(reminder.pendingOp, PendingOps.create);
      expect(reminder.title, 'Second go');
    });
  });

  group('snoozing', () {
    test('never touches the moment the member asked for', () async {
      final id = await cubit.create(title: 'Ring the bank', remindAt: soon);

      await cubit.snooze(id, by: const Duration(minutes: 10));

      final reminder = await row(id);
      // The original moment is still the truth about what the member wanted, so
      // a member who snoozed twice can still see when they had meant to be
      // reminded.
      expect(reminder.remindAt, soon);
      expect(reminder.snoozedUntil, isNotNull);
      expect(reminder.snoozedUntil!.isAfter(DateTime.now().toUtc()), isTrue);
    });

    test('the list is cut on the snoozed moment, not the original', () async {
      final id = await cubit.create(title: 'Missed it', remindAt: passed);

      await cubit.snooze(id, by: const Duration(hours: 3));

      // `snoozedUntil ?? remindAt` is the server's own `effectiveAt`, and it is
      // what every view is cut on — so a snoozed overdue reminder is upcoming
      // again.
      await cubit.show(ReminderView.overdue);
      expect(cubit.state.reminders, isEmpty);
      await cubit.show(ReminderView.upcoming);
      expect(cubit.state.reminders.single.id, id);
    });

    test('a new moment clears the snooze', () async {
      final id = await cubit.create(title: 'Ring the bank', remindAt: soon);
      await cubit.snooze(id);

      await cubit.edit(id, remindAt: soon.add(const Duration(days: 1)));

      // The member has said when they want it now, and holding the old "in ten
      // minutes" over the new time would fire for a moment they replaced.
      expect((await row(id)).snoozedUntil, isNull);
    });
  });

  group('finishing', () {
    test('a completed reminder shows in Done', () async {
      final id = await cubit.create(title: 'Ring the bank', remindAt: soon);

      await cubit.complete(id);

      expect((await row(id)).status, 'done');
      await cubit.show(ReminderView.done);
      expect(cubit.state.reminders.single.id, id);
      await cubit.show(ReminderView.upcoming);
      expect(cubit.state.reminders, isEmpty);
    });

    test('a cancelled one shows there too, told apart by its status', () async {
      final id = await cubit.create(title: 'Not any more', remindAt: soon);

      await cubit.cancelReminder(id);

      expect((await row(id)).status, 'cancelled');
      await cubit.show(ReminderView.done);
      expect(cubit.state.reminders.single.status, 'cancelled');
    });

    test('reactivating takes a new moment and clears the snooze', () async {
      final id = await cubit.create(title: 'Ring the bank', remindAt: passed);
      await cubit.snooze(id);
      await cubit.complete(id);

      final again = DateTime.now().toUtc().add(const Duration(days: 1));
      await cubit.reactivate(id, again);

      final reminder = await row(id);
      // A new moment is required rather than optional, and the server agrees:
      // reactivating without one leaves an active reminder whose time has
      // passed, which alarms immediately or never depending on how the sweep's
      // expiry lands.
      expect(reminder.status, 'active');
      expect(reminder.remindAt, again);
      expect(reminder.snoozedUntil, isNull);
    });
  });

  group('deleting', () {
    test('leaves the status alone and the Deleted view reports it', () async {
      final id = await cubit.create(title: 'Was done', remindAt: soon);
      await cubit.complete(id);

      await cubit.delete(id);

      final reminder = await row(id);
      expect(reminder.deletedAt, isNotNull);
      // The status is the only record of whether it was done, cancelled or
      // still waiting, and the Deleted view exists to show exactly that.
      expect(reminder.status, 'done');

      await cubit.show(ReminderView.deleted);
      expect(cubit.state.reminders.single.status, 'done');
      await cubit.show(ReminderView.done);
      expect(cubit.state.reminders, isEmpty);
    });

    test('the undo brings it back as it was', () async {
      final id = await cubit.create(title: 'Was done', remindAt: soon);
      await cubit.complete(id);
      await cubit.delete(id);

      await cubit.restore(id);

      final reminder = await row(id);
      expect(reminder.deletedAt, isNull);
      expect(reminder.status, 'done');
    });

    test('erasing queues a purge and takes it out of the Deleted view',
        () async {
      // A tombstone the server already knows about, so the purge is a purge and
      // not an unsent create.
      final base = DateTime.now().toUtc().subtract(const Duration(hours: 1));
      await db.into(db.reminders).insert(
        RemindersCompanion.insert(
          id: 'binned',
          title: 'Gone for good',
          remindAt: soon,
          createdAt: base,
          updatedAt: base,
          baseUpdatedAt: Value(base),
          deletedAt: Value(base),
        ),
      );

      await cubit.erase('binned');

      expect((await row('binned')).pendingOp, PendingOps.purge);
      await cubit.show(ReminderView.deleted);
      // Still in the table until the server accepts the purge, and already out
      // of the list — offering the member a restore for something they have
      // just erased is the Deleted view undoing itself.
      expect(cubit.state.reminders, isEmpty);
    });
  });

  group('the sync badge', () {
    test('marks a row the engine has given up on, and the retry clears it',
        () async {
      final base = DateTime.now().toUtc().subtract(const Duration(hours: 1));
      await db.into(db.reminders).insert(
        RemindersCompanion.insert(
          id: 'stuck',
          title: 'The member wrote this',
          remindAt: soon,
          createdAt: base,
          updatedAt: base,
          baseUpdatedAt: Value(base),
          pendingOp: const Value(PendingOps.update),
          pushAttempts: const Value(SyncEngine.maxPushAttempts),
        ),
      );

      await cubit.show(ReminderView.upcoming);
      expect(cubit.state.blocked, contains('stuck'));

      await cubit.retry('stuck');

      // The edit was never discarded — it was waiting for another attempt, and
      // saying nothing about that is how an edit disappears.
      expect((await row('stuck')).title, 'The member wrote this');
      expect((await row('stuck')).pushAttempts, 0);
      expect(cubit.state.blocked, isEmpty);
    });
  });
}
