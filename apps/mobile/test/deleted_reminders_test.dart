import 'package:botvy/src/db/database.dart';
import 'package:drift/drift.dart' show Value;
import 'package:drift/native.dart';
import 'package:flutter_test/flutter_test.dart';

/// Deleted reminders: which list they appear in, and that the row survives so
/// there is something to undo.
void main() {
  late AppDatabase db;

  setUp(() => db = AppDatabase.forTesting(NativeDatabase.memory()));
  tearDown(() => db.close());

  Future<void> add(
    String id, {
    String status = 'active',
    DateTime? deletedAt,
    String? pendingOp,
  }) =>
      db.upsertReminder(RemindersCompanion.insert(
        id: id,
        title: id,
        remindAt: DateTime(2026, 9, 2, 20),
        status: Value(status),
        deletedAt: Value(deletedAt),
        pendingOp: Value(pendingOp),
        updatedAt: Value(DateTime(2026, 9, 1, 10)),
      ));

  group('the active list', () {
    test('shows a reminder with nothing pending', () async {
      // The regression guard for the NULL comparison: `pending_op != 'delete'`
      // is NULL for a clean row, which is falsy, so writing the filter that way
      // hides every reminder in the database.
      await add('clean');

      expect((await db.watchReminders().first).map((r) => r.id), ['clean']);
    });

    test('shows one with an ordinary pending edit', () async {
      await add('edited', pendingOp: ReminderOps.update);
      expect((await db.watchReminders().first).map((r) => r.id), ['edited']);
    });

    test('hides a tombstone the server has confirmed', () async {
      await add('gone', deletedAt: DateTime(2026, 9, 1, 11));
      expect(await db.watchReminders().first, isEmpty);
    });

    test('hides one deleted offline, before the gateway has been told', () async {
      // Until now it stayed in the list until the sync landed, so deleting with
      // no connection looked like it had not worked.
      await add('gone', pendingOp: ReminderOps.delete);
      expect(await db.watchReminders().first, isEmpty);
    });
  });

  group('the deleted list', () {
    test('holds both a confirmed tombstone and one still to be pushed', () async {
      await add('confirmed', deletedAt: DateTime(2026, 9, 1, 11));
      await add('offline', pendingOp: ReminderOps.delete);
      await add('kept');

      final ids = (await db.watchDeletedReminders().first).map((r) => r.id).toSet();
      expect(ids, {'confirmed', 'offline'});
    });

    test('keeps the status the reminder had', () async {
      // This is the whole point: a deleted reminder has to still say whether it
      // was completed, cancelled, or never dealt with.
      await add('done-one', status: 'done', deletedAt: DateTime(2026, 9, 1, 11));
      await add('cancelled-one', status: 'cancelled', deletedAt: DateTime(2026, 9, 1, 11));
      await add('waiting-one', status: 'active', deletedAt: DateTime(2026, 9, 1, 11));

      final byId = {
        for (final r in await db.watchDeletedReminders().first) r.id: r.status,
      };
      expect(byId, {
        'done-one': 'done',
        'cancelled-one': 'cancelled',
        'waiting-one': 'active',
      });
    });
  });

  group('tombstoning', () {
    test('keeps the row and silences it', () async {
      await add('r1');
      await db.replacePings('r1', [
        ReminderPingsCompanion.insert(
          id: 'p1',
          reminderId: 'r1',
          notifyAt: DateTime(2026, 9, 2, 20),
          label: 'now',
        ),
      ]);

      await db.tombstoneReminder('r1', DateTime(2026, 9, 1, 11));

      expect(await db.findReminder('r1'), isNotNull);
      expect(await db.upcomingPings(DateTime(2026, 9, 1)), isEmpty);
      expect(await db.watchReminders().first, isEmpty);
    });

    test('undoing puts it back in the active list', () async {
      await add('r1', status: 'done', deletedAt: DateTime(2026, 9, 1, 11));

      await db.untombstoneReminder('r1');

      expect((await db.watchReminders().first).map((r) => r.id), ['r1']);
      expect(await db.watchDeletedReminders().first, isEmpty);
      // And it is still the completed reminder it was, not a cancelled one.
      expect((await db.findReminder('r1'))!.status, 'done');
    });
  });
}
