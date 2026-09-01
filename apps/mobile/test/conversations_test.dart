import 'package:botvy/src/db/database.dart';
import 'package:botvy/src/features/chat/conversations_controller.dart';
import 'package:drift/drift.dart' show Value;
import 'package:drift/native.dart';
import 'package:flutter_test/flutter_test.dart';

/// The chat list, at the database level, plus the derived name.
void main() {
  late AppDatabase db;

  setUp(() => db = AppDatabase.forTesting(NativeDatabase.memory()));
  tearDown(() => db.close());

  Future<void> add(
    String id, {
    bool pinned = false,
    bool archived = false,
    String? pendingOp,
    DateTime? lastMessageAt,
  }) =>
      db.upsertConversation(ConversationsCompanion.insert(
        id: id,
        pinned: Value(pinned),
        archived: Value(archived),
        pendingOp: Value(pendingOp),
        lastMessageAt: Value(lastMessageAt),
      ));

  group('the list', () {
    test('puts pinned chats first, then newest activity', () async {
      await add('old', lastMessageAt: DateTime(2026, 8, 1));
      await add('recent', lastMessageAt: DateTime(2026, 9, 1));
      await add('pinned', pinned: true, lastMessageAt: DateTime(2026, 7, 1));

      final rows = await db.watchConversations().first;
      expect(rows.map((c) => c.id), ['pinned', 'recent', 'old']);
    });

    test('hides archived chats, and shows them on request', () async {
      await add('open');
      await add('filed', archived: true);

      expect((await db.watchConversations().first).map((c) => c.id), ['open']);
      expect(
        (await db.watchConversations(archived: true).first).map((c) => c.id),
        ['filed'],
      );
    });

    test('hides one deleted offline while its tombstone waits to be pushed', () async {
      await add('gone', pendingOp: ConversationOps.delete);
      await add('kept');

      expect((await db.watchConversations().first).map((c) => c.id), ['kept']);
    });

    test('still shows a clean chat alongside one with a pending edit', () async {
      // The guard against two mistakes at once: `pendingOp != 'delete'` is NULL
      // for a clean row and so hides it, and dropping the parentheses round the
      // pendingOp clause ANDs `archived` with only half of it.
      await add('clean');
      await add('edited', pendingOp: ConversationOps.upsert);
      await add('filed', archived: true, pendingOp: ConversationOps.upsert);

      final open = await db.watchConversations().first;
      expect(open.map((c) => c.id).toSet(), {'clean', 'edited'});
    });
  });

  group('messages in a chat', () {
    setUp(() async {
      await add('chat-1');
      await db.insertMessage(ChatMessagesCompanion.insert(
        conversationId: const Value('chat-1'),
        role: 'user',
        content: 'in this chat',
        composedAt: DateTime(2026, 9, 1, 6),
      ));
      await db.insertMessage(ChatMessagesCompanion.insert(
        conversationId: const Value('chat-2'),
        role: 'user',
        content: 'somewhere else',
        composedAt: DateTime(2026, 9, 1, 7),
      ));
      await db.insertMessage(ChatMessagesCompanion.insert(
        role: 'user',
        content: 'no chat yet',
        composedAt: DateTime(2026, 9, 1, 8),
      ));
    });

    test('shows only this chat by default', () async {
      final rows = await db.watchConversationMessages('chat-1').first;
      expect(rows.map((m) => m.content), ['in this chat']);
    });

    test('the coaching chat also shows anything not yet filed', () async {
      // Rows cached before this app had chats, and anything typed offline
      // before its chat reached the gateway. This is what keeps a whole
      // pre-upgrade history on screen until the re-pull redistributes it.
      final rows =
          await db.watchConversationMessages('chat-1', includeUnassigned: true).first;
      expect(rows.map((m) => m.content), ['in this chat', 'no chat yet']);
    });
  });

  group('deleting', () {
    test('takes the messages with the chat', () async {
      await add('chat-1');
      await db.insertMessage(ChatMessagesCompanion.insert(
        conversationId: const Value('chat-1'),
        role: 'user',
        content: 'gone too',
        composedAt: DateTime(2026, 9, 1, 6),
      ));

      await db.deleteConversation('chat-1');

      expect(await db.allConversations(), isEmpty);
      expect(await db.watchMessages().first, isEmpty);
    });

    test('can keep the row as a tombstone to push', () async {
      await add('chat-1');
      await db.insertMessage(ChatMessagesCompanion.insert(
        conversationId: const Value('chat-1'),
        role: 'user',
        content: 'gone',
        composedAt: DateTime(2026, 9, 1, 6),
      ));

      await db.deleteConversation('chat-1', keepTombstone: true);

      expect(await db.findConversation('chat-1'), isNotNull);
      expect(await db.watchMessages().first, isEmpty);
    });
  });

  group('highestMessageId', () {
    test('is zero on an empty table', () async {
      expect(await db.highestMessageId(), 0);
    });

    test('ignores rows that have never been sent', () async {
      await db.insertMessage(ChatMessagesCompanion.insert(
        serverId: const Value(42),
        role: 'user',
        content: 'synced',
        composedAt: DateTime(2026, 9, 1, 6),
      ));
      await db.insertMessage(ChatMessagesCompanion.insert(
        clientId: const Value('c1'),
        role: 'user',
        content: 'queued',
        composedAt: DateTime(2026, 9, 1, 7),
        syncState: const Value(SyncStates.queued),
      ));

      expect(await db.highestMessageId(), 42);
    });
  });

  group('what a chat is called', () {
    LocalConversation named(String title, {bool isCoaching = false}) => LocalConversation(
          id: 'c',
          title: title,
          pinned: false,
          archived: false,
          isCoaching: isCoaching,
          pushAttempts: 0,
        );

    test('uses the name the user gave it', () {
      expect(conversationLabel(named('Cairo trip'), 'anything at all'), 'Cairo trip');
    });

    test('falls back to the first thing said', () {
      expect(conversationLabel(named(''), 'what should I eat today?'),
          'what should I eat today?');
    });

    test('trims a long opening line rather than filling the list with it', () {
      final label = conversationLabel(named(''), 'a' * 200);
      expect(label.runes.length, 41); // 40 characters plus the ellipsis
      expect(label.endsWith('…'), isTrue);
    });

    test('collapses newlines, so a pasted block is still one line', () {
      expect(conversationLabel(named(''), 'first line\n\nsecond line'),
          'first line second line');
    });

    test('cuts on characters, not UTF-16 units', () {
      // The cut lands exactly on the emoji. Slicing code units instead of code
      // points would keep half a surrogate pair, which renders as tofu and does
      // not survive a JSON round trip.
      final label = conversationLabel(named(''), '${'a' * 39}😀 and more');

      expect(label, '${'a' * 39}😀…');
      expect(label.contains('�'), isFalse);
      // Every surrogate that appears is half of a complete pair.
      for (var i = 0; i < label.codeUnits.length; i++) {
        final unit = label.codeUnits[i];
        if (unit >= 0xD800 && unit <= 0xDBFF) {
          final next = label.codeUnits[i + 1];
          expect(next >= 0xDC00 && next <= 0xDFFF, isTrue);
        }
      }
    });

    test('says "New chat" until there is anything to go on', () {
      expect(conversationLabel(named(''), null), 'New chat');
      expect(conversationLabel(named(''), '   '), 'New chat');
      expect(conversationLabel(null, null), 'New chat');
    });

    test('names the coaching chat even before it has been used', () {
      expect(conversationLabel(named('', isCoaching: true), null), 'Coaching');
    });
  });
}
