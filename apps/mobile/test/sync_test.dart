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

  /// Responses handed out in order, for the paging loop. Falls back to [next].
  List<SyncResult> queue = const [];
  Object? throwOnSync;

  Map<String, dynamic>? lastProfile;
  List<Map<String, dynamic>> lastReminders = const [];
  List<Map<String, dynamic>> lastConversations = const [];
  List<int?> requestedMessageIds = [];
  List<String?> sinceValues = [];
  String? lastSince;
  int syncCalls = 0;

  List<List<QueuedMessage>> flushes = [];
  List<QueuedMessage> get flushed => flushes.isEmpty ? const [] : flushes.last;
  ChatBatchResult batchResult = const ChatBatchResult(processed: 0, duplicates: []);

  @override
  Future<SyncResult> sync({
    String? since,
    int? lastMessageId,
    String? installId,
    List<Map<String, dynamic>> reminders = const [],
    List<Map<String, dynamic>> conversations = const [],
    Map<String, dynamic>? profile,
  }) async {
    lastSince = since;
    sinceValues.add(since);
    requestedMessageIds.add(lastMessageId);
    lastReminders = reminders;
    lastConversations = conversations;
    lastProfile = profile;
    if (throwOnSync != null) throw throwOnSync!;
    final result = syncCalls < queue.length ? queue[syncCalls] : next;
    syncCalls++;
    return result;
  }

  @override
  Future<ChatBatchResult> sendQueued(List<QueuedMessage> queued) async {
    flushes.add(queued);
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

    test('a tombstone in a delta takes it out of the list but keeps it', () async {
      // How a deletion made elsewhere reaches the device — and the row stays,
      // because it is what the Deleted view lists and what Restore undoes.
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

      expect(await h.db.watchReminders().first, isEmpty);
      expect((await h.db.watchDeletedReminders().first).map((r) => r.id), ['r1']);
    });

    test('a restore made elsewhere puts it back', () async {
      final h = harness();
      addTearDown(h.db.close);
      await h.db.upsertReminder(RemindersCompanion.insert(
        id: 'r1',
        title: 'Dentist',
        remindAt: DateTime(2026, 9, 2, 20),
        deletedAt: Value(DateTime(2026, 9, 1)),
      ));
      await h.db.setValue(SyncKeys.cursor, 'cursor-0');
      h.api.next = SyncResult(
        now: 'cursor-2',
        lastMessageId: 0,
        full: false,
        reminders: [serverReminder()], // no deletedAt any more
      );

      await h.sync.sync();

      expect((await h.db.watchReminders().first).map((r) => r.id), ['r1']);
      expect(await h.db.watchDeletedReminders().first, isEmpty);
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

    test('an undo is pushed as an explicit false, not as an ordinary edit', () async {
      // The gateway refuses an ordinary edit to a tombstoned row, so omitting
      // the field would make every restore fail with "gone".
      final h = harness();
      addTearDown(h.db.close);
      await h.db.upsertReminder(RemindersCompanion.insert(
        id: 'r1',
        clientId: const Value('r1'),
        title: 'Dentist',
        remindAt: DateTime(2026, 9, 2, 20),
        updatedAt: Value(DateTime(2026, 9, 1, 10)),
        pendingOp: const Value(ReminderOps.restore),
      ));

      await h.sync.sync();

      expect(h.api.lastReminders.single['deleted'], false);
    });

    test('a delete is still pushed as a true', () async {
      final h = harness();
      addTearDown(h.db.close);
      await addPending(h.db, 'r1', op: ReminderOps.delete);

      await h.sync.sync();

      expect(h.api.lastReminders.single['deleted'], true);
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

  group('named chats', () {
    Conversation chat({
      String id = 'chat-1',
      String title = '',
      bool isCoaching = false,
      DateTime? deletedAt,
    }) =>
        Conversation(
          id: id,
          title: title,
          isCoaching: isCoaching,
          updatedAt: DateTime.utc(2026, 9, 1, 8),
          deletedAt: deletedAt,
        );

    test('stores a chat the server sent, with the server timestamp as the base', () async {
      final h = harness();
      addTearDown(h.db.close);
      h.api.next = SyncResult(
        now: 'cursor-1',
        lastMessageId: 0,
        full: true,
        conversations: [chat(title: 'Cairo trip')],
      );

      await h.sync.sync();

      final row = (await h.db.allConversations()).single;
      expect(row.title, 'Cairo trip');
      expect(row.baseUpdatedAt, DateTime.utc(2026, 9, 1, 8).toLocal());
      expect(row.pendingOp, isNull);
    });

    test('a tombstone removes the chat and everything said in it', () async {
      // Messages carry no tombstone of their own, so this cascade is the only
      // way a deletion made elsewhere reaches this device.
      final h = harness();
      addTearDown(h.db.close);
      await h.db.upsertConversation(ConversationsCompanion.insert(id: 'chat-1'));
      await h.db.insertMessage(ChatMessagesCompanion.insert(
        conversationId: const Value('chat-1'),
        role: 'user',
        content: 'still here?',
        composedAt: DateTime(2026, 9, 1, 6),
      ));
      await h.db.setValue(SyncKeys.cursor, 'cursor-0');
      h.api.next = SyncResult(
        now: 'cursor-2',
        lastMessageId: 0,
        full: false,
        conversations: [chat(deletedAt: DateTime.utc(2026, 9, 1, 9))],
      );

      await h.sync.sync();

      expect(await h.db.allConversations(), isEmpty);
      expect(await h.db.watchMessages().first, isEmpty);
    });

    test('a full snapshot spares a chat this device has not pushed yet', () async {
      final h = harness();
      addTearDown(h.db.close);
      await h.db.upsertConversation(ConversationsCompanion.insert(
        id: 'local-only',
        pendingOp: const Value(ConversationOps.upsert),
      ));
      await h.db.upsertConversation(ConversationsCompanion.insert(id: 'server-had-it'));

      await h.sync.sync(); // full snapshot, no conversations

      expect((await h.db.allConversations()).map((c) => c.id), ['local-only']);
    });

    test('pushes a rename with the server timestamp as its base', () async {
      final h = harness();
      addTearDown(h.db.close);
      await h.db.upsertConversation(ConversationsCompanion.insert(
        id: 'chat-1',
        title: const Value('Renamed'),
        baseUpdatedAt: Value(DateTime.utc(2026, 9, 1, 8)),
        updatedAt: Value(DateTime(2026, 9, 1, 11)),
        pendingOp: const Value(ConversationOps.upsert),
      ));

      await h.sync.sync();

      final sent = h.api.lastConversations.single;
      expect(sent['id'], 'chat-1');
      expect(sent['title'], 'Renamed');
      expect(sent['baseUpdatedAt'], DateTime.utc(2026, 9, 1, 8).toIso8601String());
    });

    test('a rejected chat is not written through the reminder path', () async {
      // The rejection shape is shared; without reading `entity` a refused chat
      // would be stored as a reminder. Corruption, not a crash.
      final h = harness();
      addTearDown(h.db.close);
      await h.db.upsertConversation(ConversationsCompanion.insert(
        id: 'chat-1',
        title: const Value('Mine'),
        updatedAt: Value(DateTime(2026, 9, 1, 11)),
        pendingOp: const Value(ConversationOps.upsert),
      ));
      h.api.next = SyncResult(
        now: 'cursor-2',
        lastMessageId: 0,
        full: false,
        rejected: [
          SyncRejection(
            id: 'chat-1',
            entity: 'conversation',
            reason: 'stale',
            serverConversation: chat(title: 'Server won'),
          ),
        ],
      );
      await h.db.setValue(SyncKeys.cursor, 'cursor-0');

      await h.sync.sync();

      expect(await h.db.allReminders(), isEmpty);
      final row = await h.db.findConversation('chat-1');
      expect(row!.title, 'Server won');
      expect(row.pushAttempts, 1);
    });
  });

  group('rebuilding the message cache after the upgrade', () {
    test('asks for the whole history while pre-chat rows are still cached', () async {
      // A synced message with no chat can only have come from before chats
      // existed, and the gateway can never re-send it — messages are immutable
      // and pulled by id. So the history has to be fetched again.
      final h = harness();
      addTearDown(h.db.close);
      await h.db.insertMessage(ChatMessagesCompanion.insert(
        serverId: const Value(11),
        role: 'user',
        content: 'from before chats',
        composedAt: DateTime(2026, 9, 1, 5),
      ));
      h.api.next = SyncResult(
        now: 'cursor-1',
        lastMessageId: 11,
        full: true,
        conversations: [
          Conversation(id: 'chat-1', isCoaching: true, updatedAt: DateTime.utc(2026, 9, 1)),
        ],
        messages: [
          ChatMessage(
            id: 11,
            conversationId: 'chat-1',
            role: 'user',
            content: 'from before chats',
            createdAt: DateTime(2026, 9, 1, 5),
          ),
        ],
      );

      await h.sync.sync();

      expect(h.api.requestedMessageIds.first, 0);
      final rows = await h.db.watchMessages().first;
      expect(rows.single.conversationId, 'chat-1');
      // Nothing is left unfiled, so the next sync asks from the watermark again.
      expect(await h.db.hasLegacyMessages(), isFalse);
    });

    test('keeps a message queued before the upgrade instead of sweeping it', () async {
      // The sweep is for cache. An unsent message exists nowhere else.
      final h = harness();
      addTearDown(h.db.close);
      await h.db.insertMessage(ChatMessagesCompanion.insert(
        clientId: const Value('c1'),
        role: 'user',
        content: 'typed on a plane',
        composedAt: DateTime(2026, 9, 1, 6),
        syncState: const Value(SyncStates.queued),
      ));
      await h.db.insertMessage(ChatMessagesCompanion.insert(
        serverId: const Value(11),
        role: 'assistant',
        content: 'cached',
        composedAt: DateTime(2026, 9, 1, 5),
      ));

      await h.sync.sync();

      final rows = await h.db.watchMessages().first;
      expect(rows.map((m) => m.content), ['typed on a plane']);
    });

    test('keeps pulling while the page comes back full', () async {
      final h = harness();
      addTearDown(h.db.close);
      h.api.queue = [
        const SyncResult(now: 'cursor-1', lastMessageId: 200, full: true, moreMessages: true),
        const SyncResult(now: 'cursor-2', lastMessageId: 250, full: false),
      ];

      await h.sync.sync();

      expect(h.api.syncCalls, 2);
    });

    test('later pages stay deltas and push nothing', () async {
      // A null `since` would make each page a full snapshot, and the delete
      // sweep would then run once per page.
      final h = harness();
      addTearDown(h.db.close);
      await addPending(h.db, 'r1');
      h.api.queue = [
        const SyncResult(now: 'cursor-1', lastMessageId: 200, full: true, moreMessages: true),
        const SyncResult(now: 'cursor-2', lastMessageId: 250, full: false),
      ];

      await h.sync.sync();

      expect(h.api.sinceValues.last, 'cursor-1');
      expect(h.api.lastReminders, isEmpty);
    });

    test('does not file a message whose chat has not arrived', () async {
      // Stopping leaves the watermark behind, so the next sync asks again and
      // succeeds once the chat is there. Dropping it would lose it for good.
      final h = harness();
      addTearDown(h.db.close);
      h.api.next = SyncResult(
        now: 'cursor-1',
        lastMessageId: 9,
        full: true,
        messages: [
          ChatMessage(
            id: 9,
            conversationId: 'chat-nobody-sent',
            role: 'user',
            content: 'orphan',
            createdAt: DateTime(2026, 9, 1, 6),
          ),
        ],
      );

      await h.sync.sync();

      expect(await h.db.watchMessages().first, isEmpty);
      expect(await h.db.highestMessageId(), 0);
    });
  });

  test('an outbox larger than one batch flushes in chunks', () async {
    // The endpoint refuses more than 20. Sending the whole outbox meant that
    // past that point every flush 400'd, the error was swallowed as "offline",
    // and nothing ever drained it again.
    final h = harness();
    addTearDown(h.db.close);
    for (var i = 0; i < 25; i++) {
      await h.db.insertMessage(ChatMessagesCompanion.insert(
        clientId: Value('c$i'),
        role: 'user',
        content: 'message $i',
        composedAt: DateTime(2026, 9, 1, 6, i),
        syncState: const Value(SyncStates.queued),
      ));
    }
    h.api.batchResult = const ChatBatchResult(processed: 0, duplicates: []);

    await h.sync.sync();

    expect(h.api.flushes.map((f) => f.length), [20, 5]);
  });

  test('only the client ids the server named are cleared', () async {
    final h = harness();
    addTearDown(h.db.close);
    for (final id in ['c1', 'c2']) {
      await h.db.insertMessage(ChatMessagesCompanion.insert(
        clientId: Value(id),
        role: 'user',
        content: id,
        composedAt: DateTime(2026, 9, 1, 6),
        syncState: const Value(SyncStates.queued),
      ));
    }
    h.api.batchResult = const ChatBatchResult(
      processed: 1,
      duplicates: [],
      accepted: ['c1'],
    );

    await h.sync.sync();

    final stillQueued = await h.db.outbox();
    expect(stillQueued.map((m) => m.clientId), ['c2']);
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
