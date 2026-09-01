import 'dart:convert';

import 'package:botvy/src/api/api_client.dart';
import 'package:botvy/src/api/models.dart';
import 'package:botvy/src/db/database.dart';
import 'package:botvy/src/notifications/local_notifications.dart';
import 'package:botvy/src/sync/sync_service.dart';
import 'package:drift/drift.dart' show Value;
import 'package:drift/native.dart';
import 'package:flutter_test/flutter_test.dart';

/// A stand-in gateway. Subclassing the real client keeps the test honest about
/// the method signatures without extracting an interface that would have one
/// production implementation.
class _FakeApi extends ApiClient {
  _FakeApi() : super(TokenStore(kSecureStorage), baseUrl: 'http://example.invalid');

  SyncResult next = const SyncResult(now: 'cursor-1', lastMessageId: 0, full: true);
  Object? throwOnSync;

  Map<String, dynamic>? lastProfile;
  List<Map<String, dynamic>> lastReminders = const [];
  String? lastSince;
  int syncCalls = 0;

  List<QueuedMessage> flushed = const [];
  ChatBatchResult batchResult = const ChatBatchResult(processed: 0, duplicates: []);

  @override
  Future<SyncResult> sync({
    String? since,
    int? lastMessageId,
    String? installId,
    List<Map<String, dynamic>> reminders = const [],
    Map<String, dynamic>? profile,
  }) async {
    syncCalls++;
    lastSince = since;
    lastReminders = reminders;
    lastProfile = profile;
    if (throwOnSync != null) throw throwOnSync!;
    return next;
  }

  @override
  Future<ChatBatchResult> sendQueued(List<QueuedMessage> queued) async {
    flushed = queued;
    return batchResult;
  }
}

/// The scheduler touches platform channels; sync only ever asks it to re-arm.
class _FakeScheduler extends NotificationScheduler {
  _FakeScheduler(super.db);

  int rescheduled = 0;

  @override
  Future<int> rescheduleAll({DateTime? now}) async {
    rescheduled++;
    return 0;
  }
}

({AppDatabase db, _FakeApi api, SyncService sync, _FakeScheduler scheduler}) harness() {
  final db = AppDatabase.forTesting(NativeDatabase.memory());
  final api = _FakeApi();
  final scheduler = _FakeScheduler(db);
  return (db: db, api: api, sync: SyncService(api, db, scheduler), scheduler: scheduler);
}

Reminder serverReminder({
  String id = 'r1',
  String title = 'Dentist',
  DateTime? deletedAt,
}) =>
    Reminder(
      id: id,
      title: title,
      remindAt: DateTime(2026, 9, 2, 20),
      status: 'active',
      deletedAt: deletedAt,
    );

Future<void> addPending(AppDatabase db, String id, {String op = ReminderOps.update}) =>
    db.upsertReminder(RemindersCompanion.insert(
      id: id,
      clientId: Value(id),
      title: 'Local $id',
      remindAt: DateTime(2026, 9, 2, 20),
      updatedAt: Value(DateTime(2026, 9, 1, 10)),
      pendingOp: Value(op),
    ));

void main() {
  group('the cursor', () {
    test('asks for a full snapshot when the device has none', () async {
      final h = harness();
      addTearDown(h.db.close);

      await h.sync.sync();

      expect(h.api.lastSince, isNull);
      expect(await h.db.getValue(SyncKeys.cursor), 'cursor-1');
    });

    test('sends back exactly what the server last called now', () async {
      final h = harness();
      addTearDown(h.db.close);
      await h.db.setValue(SyncKeys.cursor, 'cursor-from-server');

      await h.sync.sync();

      expect(h.api.lastSince, 'cursor-from-server');
    });

    test('is kept apart from the human-facing last-synced time', () async {
      // One is a server timestamp, the other the device clock. Sending the
      // device's would skip whatever the skew covers.
      final h = harness();
      addTearDown(h.db.close);

      await h.sync.sync();

      expect(await h.db.getValue(SyncKeys.cursor), 'cursor-1');
      expect(await h.db.getValue(SyncKeys.lastSyncAt), isNot('cursor-1'));
    });
  });

  group('applying a pull', () {
    test('a delta must not delete a reminder that simply did not change', () async {
      // The most destructive regression available here: the delete sweep is
      // only meaningful against a full snapshot.
      final h = harness();
      addTearDown(h.db.close);
      await h.db.upsertReminder(RemindersCompanion.insert(
        id: 'untouched',
        title: 'Still here',
        remindAt: DateTime(2026, 9, 5, 9),
      ));
      await h.db.setValue(SyncKeys.cursor, 'cursor-0');
      h.api.next = SyncResult(
        now: 'cursor-2',
        lastMessageId: 0,
        full: false,
        reminders: [serverReminder(id: 'other')],
      );

      await h.sync.sync();

      final ids = (await h.db.allReminders()).map((r) => r.id);
      expect(ids, containsAll(<String>['untouched', 'other']));
    });

    test('a full snapshot does remove what the server no longer has', () async {
      final h = harness();
      addTearDown(h.db.close);
      await h.db.upsertReminder(RemindersCompanion.insert(
        id: 'gone',
        title: 'Deleted elsewhere',
        remindAt: DateTime(2026, 9, 5, 9),
      ));
      h.api.next = SyncResult(
        now: 'cursor-2',
        lastMessageId: 0,
        full: true,
        reminders: [serverReminder()],
      );

      await h.sync.sync();

      expect((await h.db.allReminders()).map((r) => r.id), ['r1']);
    });

    test('a tombstone in a delta removes the local row', () async {
      // This is how a deletion made elsewhere reaches the device at all.
      final h = harness();
      addTearDown(h.db.close);
      await h.db.upsertReminder(RemindersCompanion.insert(
        id: 'r1',
        title: 'Dentist',
        remindAt: DateTime(2026, 9, 2, 20),
      ));
      await h.db.setValue(SyncKeys.cursor, 'cursor-0');
      h.api.next = SyncResult(
        now: 'cursor-2',
        lastMessageId: 0,
        full: false,
        reminders: [serverReminder(deletedAt: DateTime(2026, 9, 1))],
      );

      await h.sync.sync();

      expect(await h.db.allReminders(), isEmpty);
    });

    test('stores check-ins and programs so history reads offline', () async {
      final h = harness();
      addTearDown(h.db.close);
      h.api.next = SyncResult(
        now: 'cursor-2',
        lastMessageId: 0,
        full: true,
        checkins: [
          CheckinEntry(
            checkinDate: '2026-09-01',
            adhered: true,
            rawReply: 'yes',
            createdAt: DateTime(2026, 9, 1),
          ),
        ],
        workouts: [
          WorkoutEntry(
            workoutDate: '2026-09-01',
            source: 'planned',
            muscleGroups: const ['back'],
            createdAt: DateTime(2026, 9, 1),
          ),
        ],
      );

      await h.sync.sync();

      expect((await h.db.recentCheckins()).single.adhered, isTrue);
      expect(jsonDecode((await h.db.recentWorkouts()).single.muscleGroups), ['back']);
    });
  });

  group('pushing', () {
    test('sends a pending reminder and clears it once the server has it', () async {
      final h = harness();
      addTearDown(h.db.close);
      await addPending(h.db, 'r1');
      h.api.next = SyncResult(
        now: 'cursor-2',
        lastMessageId: 0,
        full: true,
        reminders: [serverReminder()],
      );

      await h.sync.sync();

      expect(h.api.lastReminders.single['clientId'], 'r1');
      expect((await h.db.pendingReminders()), isEmpty);
    });

    test('sends the server timestamp as the base, not this handset\'s clock', () async {
      // The whole point of the base check: the gateway accepts the edit
      // outright while it matches, so a slow phone does not lose its work.
      final h = harness();
      addTearDown(h.db.close);
      final serverStamp = DateTime.utc(2026, 9, 1, 8);
      h.api.next = SyncResult(
        now: 'cursor-1',
        lastMessageId: 0,
        full: true,
        reminders: [
          Reminder(
            id: 'r1',
            title: 'Dentist',
            remindAt: DateTime(2026, 9, 2, 20),
            status: 'active',
            updatedAt: serverStamp,
          ),
        ],
      );
      await h.sync.sync();

      // Now edit it locally, the way the reminders controller does.
      final localEdit = DateTime(2026, 9, 1, 11);
      await h.db.upsertReminder(RemindersCompanion.insert(
        id: 'r1',
        title: 'Dentist, moved',
        remindAt: DateTime(2026, 9, 2, 21),
        updatedAt: Value(localEdit),
        pendingOp: const Value(ReminderOps.update),
      ));
      h.api.next = const SyncResult(now: 'cursor-2', lastMessageId: 0, full: false);

      await h.sync.sync();

      final sent = h.api.lastReminders.single;
      expect(sent['baseUpdatedAt'], serverStamp.toIso8601String());
      expect(sent['updatedAt'], localEdit.toUtc().toIso8601String());
    });

    test('a rejected row keeps its edit, counts a strike and stops blocking', () async {
      final h = harness();
      addTearDown(h.db.close);
      await addPending(h.db, 'r1');
      h.api.next = SyncResult(
        now: 'cursor-2',
        lastMessageId: 0,
        full: false,
        rejected: [
          SyncRejection(id: 'r1', reason: 'stale', server: serverReminder(title: 'Server won')),
        ],
      );
      await h.db.setValue(SyncKeys.cursor, 'cursor-0');

      await h.sync.sync();

      final row = await h.db.findReminder('r1');
      expect(row!.title, 'Server won'); // the loser is visibly replaced
      expect(row.pushAttempts, 1);
      // The cursor still advanced: one refused row cannot stall the pass.
      expect(await h.db.getValue(SyncKeys.cursor), 'cursor-2');
    });

    test('an offline pass burns no attempt', () async {
      // A week in airplane mode must not exhaust the outbox.
      final h = harness();
      addTearDown(h.db.close);
      await addPending(h.db, 'r1');
      h.api.throwOnSync = ApiException('offline', isOffline: true);

      await h.sync.sync();

      expect((await h.db.findReminder('r1'))!.pushAttempts, 0);
      expect(await h.db.pendingReminders(), hasLength(1));
    });

    test('the profile push carries the client fields and no server-owned one', () async {
      final h = harness();
      addTearDown(h.db.close);
      await h.db.writeProfile(CoachingProfilesCompanion(
        optedIn: const Value(true),
        checkinTime: const Value('21:30'),
        awaitingCheckin: const Value(true), // server-owned; must not go up
        dirty: const Value(true),
        updatedAt: Value(DateTime(2026, 9, 1)),
      ));

      await h.sync.sync();

      expect(h.api.lastProfile, isNotNull);
      expect(h.api.lastProfile!['optedIn'], true);
      expect(h.api.lastProfile!['checkinTime'], '21:30');
      expect(h.api.lastProfile!.containsKey('awaitingCheckin'), isFalse);
      expect(h.api.lastProfile!.containsKey('awaitingSince'), isFalse);
    });

    test('a clean profile is not pushed at all', () async {
      final h = harness();
      addTearDown(h.db.close);
      await h.db.writeProfile(CoachingProfilesCompanion(
        optedIn: const Value(true),
        timezone: Value(await deviceTimezone()),
      ));

      await h.sync.sync();

      expect(h.api.lastProfile, isNull);
    });

    test('a handset that changed zone says so instead of losing it', () async {
      // The gateway resolves "8pm" against this field, and it was the one
      // setting that used to need a live connection.
      final h = harness();
      addTearDown(h.db.close);
      await h.db.writeProfile(const CoachingProfilesCompanion(
        timezone: Value('Pacific/Auckland'),
      ));

      await h.sync.sync();

      expect(h.api.lastProfile!['timezone'], await deviceTimezone());
      expect((await h.db.profile())!.dirty, isTrue);
    });
  });

  group('the chat outbox', () {
    test('sends only rows the batch endpoint can accept', () async {
      final h = harness();
      addTearDown(h.db.close);
      await h.db.insertMessage(ChatMessagesCompanion.insert(
        clientId: const Value('c1'),
        role: 'user',
        content: 'sendable',
        composedAt: DateTime(2026, 9, 1, 6),
        syncState: const Value(SyncStates.queued),
      ));
      await h.db.insertMessage(ChatMessagesCompanion.insert(
        role: 'assistant',
        content: 'not sendable',
        composedAt: DateTime(2026, 9, 1, 7),
        syncState: const Value(SyncStates.queued),
      ));

      await h.sync.sync();

      expect(h.api.flushed.map((m) => m.clientId), ['c1']);
      // The unsendable row is left alone rather than marked delivered.
      final rows = await h.db.watchMessages().first;
      final assistant = rows.firstWhere((m) => m.role == 'assistant');
      expect(assistant.syncState, SyncStates.queued);
    });

    test('pulls again after a flush, because the batch creates rows', () async {
      // A reminder extracted from a queued message carries no client id, and
      // the reply is written server-side; only a pull can find them.
      final h = harness();
      addTearDown(h.db.close);
      await h.db.insertMessage(ChatMessagesCompanion.insert(
        clientId: const Value('c1'),
        role: 'user',
        content: 'remind me later',
        composedAt: DateTime(2026, 9, 1, 6),
        syncState: const Value(SyncStates.queued),
      ));
      h.api.batchResult = const ChatBatchResult(processed: 1, duplicates: []);

      await h.sync.sync();

      expect(h.api.syncCalls, 2);
    });
  });

  test('re-arms the alarms even when the network step failed', () async {
    // The alarms are the product; a failed sync must not leave them unset.
    final h = harness();
    addTearDown(h.db.close);
    h.api.throwOnSync = ApiException('offline', isOffline: true);

    await h.sync.sync();

    expect(h.scheduler.rescheduled, 1);
  });
}
