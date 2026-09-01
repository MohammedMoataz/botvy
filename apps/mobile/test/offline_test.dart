import 'dart:convert';

import 'package:botvy/src/db/database.dart';
import 'package:botvy/src/notifications/local_notifications.dart';
import 'package:botvy/src/sync/sync_service.dart';
import 'package:drift/drift.dart' show Value;
import 'package:drift/native.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  group('planPings', () {
    final remindAt = DateTime(2026, 9, 2, 20, 0);

    test('expands lead times oldest first', () {
      final pings = planPings(remindAt, ['1h', '0m'], now: DateTime(2026, 9, 1));

      expect(pings.map((p) => p.label), ['1 hour before', 'now']);
      expect(pings.first.notifyAt, DateTime(2026, 9, 2, 19, 0));
      expect(pings.last.notifyAt, remindAt);
    });

    test('drops a lead time that has already passed', () {
      // Twenty minutes before the reminder: the "1 hour before" ping would be
      // in the past and must not fire the moment it is created.
      final pings = planPings(remindAt, ['1h', '0m'], now: DateTime(2026, 9, 2, 19, 40));

      expect(pings.map((p) => p.label), ['now']);
    });

    test('keeps the at-the-moment ping even for a past reminder', () {
      // A reminder typed offline hours ago still has to be delivered once.
      final pings = planPings(remindAt, ['1h', '0m'], now: DateTime(2026, 9, 3));

      expect(pings.map((p) => p.label), ['now']);
    });

    test('ignores duplicates and unparseable offsets', () {
      final pings = planPings(remindAt, ['1h', '1h', 'soon', '0m'],
          now: DateTime(2026, 9, 1));

      expect(pings.length, 2);
    });
  });

  group('notificationIdFor', () {
    test('is stable for the same reminder and label', () {
      expect(notificationIdFor('r1', '1 hour before'),
          notificationIdFor('r1', '1 hour before'));
    });

    test('differs per label and per reminder', () {
      expect(notificationIdFor('r1', 'now'), isNot(notificationIdFor('r1', '1 hour before')));
      expect(notificationIdFor('r1', 'now'), isNot(notificationIdFor('r2', 'now')));
    });

    test('always fits in a positive 32-bit int, as Android requires', () {
      for (final id in ['r1', 'a-very-long-uuid-like-value-0000-1111', 'ﻉ']) {
        final value = notificationIdFor(id, 'now');
        expect(value, greaterThanOrEqualTo(0));
        expect(value, lessThan(1 << 31));
      }
    });
  });

  group('AppDatabase', () {
    late AppDatabase db;

    setUp(() => db = AppDatabase.forTesting(NativeDatabase.memory()));
    tearDown(() => db.close());

    Future<void> addReminder(String id, {String? pendingOp, String status = 'active'}) {
      return db.upsertReminder(RemindersCompanion.insert(
        id: id,
        title: 'Reminder $id',
        remindAt: DateTime(2026, 9, 2, 20, 0),
        status: Value(status),
        leadTimes: Value(jsonEncode(const ['1h', '0m'])),
        pendingOp: Value(pendingOp),
      ));
    }

    test('a reminder created offline is stored with its pending operation', () async {
      await addReminder('r1', pendingOp: ReminderOps.create);

      final pending = await db.pendingReminders();
      expect(pending.single.id, 'r1');
    });

    test('upcomingPings returns only unfired pings of active reminders', () async {
      await addReminder('r1');
      await addReminder('r2', status: 'cancelled');
      await db.replacePings('r1', [
        ReminderPingsCompanion.insert(
          id: 'p-past',
          reminderId: 'r1',
          notifyAt: DateTime(2026, 9, 1),
          label: 'now',
        ),
        ReminderPingsCompanion.insert(
          id: 'p-future',
          reminderId: 'r1',
          notifyAt: DateTime(2026, 9, 3),
          label: '1 hour before',
        ),
        ReminderPingsCompanion.insert(
          id: 'p-sent',
          reminderId: 'r1',
          notifyAt: DateTime(2026, 9, 4),
          label: '2 hours before',
          sentAt: Value(DateTime(2026, 9, 4)),
        ),
      ]);
      // A cancelled reminder must never contribute an alarm.
      await db.replacePings('r2', [
        ReminderPingsCompanion.insert(
          id: 'p-cancelled',
          reminderId: 'r2',
          notifyAt: DateTime(2026, 9, 3),
          label: 'now',
        ),
      ]);

      final upcoming = await db.upcomingPings(DateTime(2026, 9, 2));
      expect(upcoming.map((p) => p.id), ['p-future']);
    });

    test('replacing pings removes the ones planned from the old time', () async {
      await addReminder('r1');
      await db.replacePings('r1', [
        ReminderPingsCompanion.insert(
          id: 'old',
          reminderId: 'r1',
          notifyAt: DateTime(2026, 9, 3),
          label: 'now',
        ),
      ]);
      await db.replacePings('r1', const []);

      expect(await db.upcomingPings(DateTime(2026, 9, 2)), isEmpty);
    });

    test('deleting a reminder takes its pings with it', () async {
      await addReminder('r1');
      await db.replacePings('r1', [
        ReminderPingsCompanion.insert(
          id: 'p1',
          reminderId: 'r1',
          notifyAt: DateTime(2026, 9, 3),
          label: 'now',
        ),
      ]);

      await db.deleteReminder('r1');

      expect(await db.allReminders(), isEmpty);
      expect(await db.upcomingPings(DateTime(2026, 9, 2)), isEmpty);
    });

    test('the outbox holds only messages that have not been delivered', () async {
      await db.insertMessage(ChatMessagesCompanion.insert(
        clientId: const Value('c1'),
        role: 'user',
        content: 'sent while offline',
        composedAt: DateTime(2026, 9, 1, 6),
        syncState: const Value(SyncStates.queued),
      ));
      await db.insertMessage(ChatMessagesCompanion.insert(
        serverId: const Value(7),
        role: 'assistant',
        content: 'already delivered',
        composedAt: DateTime(2026, 9, 1, 7),
      ));

      final outbox = await db.outbox();
      expect(outbox.map((m) => m.clientId), ['c1']);

      await db.markSynced('c1');
      expect(await db.outbox(), isEmpty);
    });

    test('a pulled message matches the local draft instead of doubling it', () async {
      // Composed offline, flushed, then pulled back: the gateway returns it
      // with the same clientId, and it must stay one message.
      await db.insertMessage(ChatMessagesCompanion.insert(
        clientId: const Value('c1'),
        role: 'user',
        content: 'buy eggs',
        composedAt: DateTime(2026, 9, 1, 6),
        syncState: const Value(SyncStates.queued),
      ));

      await db.upsertServerMessage(
        serverId: 42,
        clientId: 'c1',
        role: 'user',
        content: 'buy eggs',
        composedAt: DateTime(2026, 9, 1, 6),
      );

      final rows = await db.watchMessages().first;
      expect(rows.length, 1);
      expect(rows.single.serverId, 42);
      expect(rows.single.syncState, SyncStates.synced);
      expect(await db.outbox(), isEmpty);
    });

    test('pulling the same history twice does not duplicate it', () async {
      for (var i = 0; i < 2; i++) {
        await db.upsertServerMessage(
          serverId: 7,
          role: 'assistant',
          content: 'Got it.',
          composedAt: DateTime(2026, 9, 1, 7),
        );
      }

      expect((await db.watchMessages().first).length, 1);
    });

    test('signing out leaves nothing of the account behind', () async {
      await addReminder('r1');
      await db.setValue('fcmToken', 'tok');
      await db.insertMessage(ChatMessagesCompanion.insert(
        role: 'user',
        content: 'private',
        composedAt: DateTime(2026, 9, 1),
      ));

      await db.wipe();

      expect(await db.allReminders(), isEmpty);
      expect(await db.outbox(), isEmpty);
      expect(await db.getValue('fcmToken'), isNull);
    });

    test('the install id is generated once and then reused', () async {
      final first = await stableInstallId(db);
      final second = await stableInstallId(db);

      expect(first, isNotEmpty);
      expect(second, first);
    });
  });
}
