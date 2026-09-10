import 'package:botvy/core/api/api_client.dart';
import 'package:botvy/core/api/socket_client.dart';
import 'package:botvy/core/db/database.dart';
import 'package:botvy/core/sync/sync_engine.dart';
import 'package:botvy/features/chat/application/chat_cubit.dart';
import 'package:botvy/features/chat/application/conversations_cubit.dart';
import 'package:botvy/features/chat/data/chat_outbox.dart';
import 'package:drift/drift.dart' show Value;
import 'package:drift/native.dart';
import 'package:flutter_test/flutter_test.dart';

import 'fakes.dart';

/// The chat cubits, against the real drift database in memory and a socket that
/// is driven by hand.
///
/// In memory rather than mocked, for the reason the tasks specs give: what these
/// tests are about *is* what a turn leaves in the tables — which bubble is
/// stored at which sequence, what survives a cancel, and what is taken back
/// when an answer is moved. A mocked repository would assert that the cubit
/// calls the methods the cubit calls.
///
/// Every fixture is relative to `DateTime.now()`. A pinned date in a chat
/// fixture is a test that starts failing on a particular day.
void main() {
  late AppDatabase db;
  late SyncEngine engine;
  late _ChatApi api;
  late _FakeSocket socket;
  late ChatOutbox outbox;
  late ChatCubit chat;
  late ConversationsCubit conversations;

  setUp(() {
    db = AppDatabase.forTesting(NativeDatabase.memory());
    engine = offlineEngine(db);
    api = _ChatApi();
    socket = _FakeSocket(api, db);
    outbox = ChatOutbox(api, db, engine);
    chat = ChatCubit(db, api, socket, outbox, engine);
    conversations = ConversationsCubit(db, api, engine);
  });

  tearDown(() async {
    // Every write kicks the engine, and the kick is deliberately
    // fire-and-forget. Awaiting one more pass joins whichever is in flight —
    // including the single queued re-run behind it — so the teardown does not
    // close the database from under a pass still reading it.
    await engine.sync();
    await chat.close();
    await conversations.close();
    engine.dispose();
    await db.close();
  });

  /// A chat, as the sync applier would have written it.
  Future<void> seedConversation(
    String id, {
    String kind = ChatKinds.free,
    bool pinned = false,
    int clearedUpToSeq = 0,
  }) async {
    final now = DateTime.now().toUtc();
    await db.into(db.conversations).insert(
      ConversationsCompanion.insert(
        id: id,
        kind: Value(kind),
        title: Value(kind == ChatKinds.free ? 'Peru' : kind),
        pinned: Value(pinned),
        clearedUpToSeq: Value(clearedUpToSeq),
        createdAt: now,
        updatedAt: now,
        baseUpdatedAt: Value(now),
      ),
    );
  }

  /// The `requestId` of the turn the cubit has just started.
  String requestIdOf(_FakeSocket socket) {
    final frame = socket.sent.lastWhere((f) => f.event == ChatFrames.send);
    return (frame.data! as Map)['requestId'] as String;
  }

  // ── streaming ──────────────────────────────────────────────────────────────

  group('streaming', () {
    test('assembles the tokens in the order they arrive', () async {
      await seedConversation('coach-1', kind: ChatKinds.coach, pinned: true);
      chat.listen();
      await chat.open('coach-1');

      await chat.send('How much protein today?');
      final requestId = requestIdOf(socket);

      socket.deliver(ChatFrames.accepted, {
        'requestId': requestId,
        'conversationId': 'coach-1',
        'userSeq': 1,
      });
      await pumpEventQueue();

      // Three chunks, one of which is only a space-prefixed fragment: the
      // contract preserves leading spaces so the pieces concatenate into the
      // sentence rather than needing to be joined with one.
      for (final chunk in ['About', ' 120', ' g of protein.']) {
        socket.deliver(ChatFrames.token, {
          'requestId': requestId,
          'text': chunk,
        });
      }

      expect(chat.state.streaming, 'About 120 g of protein.');
      expect(chat.state.awaiting, isTrue);

      // The member's own message is stored at the sequence the server issued,
      // and the queued copy is gone — so the bubble does not double.
      expect(
        (await db.select(db.messages).get()).single.content,
        'How much protein today?',
      );
      expect(await db.select(db.pendingMessages).get(), isEmpty);
    });

    test('a token for another turn is not appended to this one', () async {
      // The case SC-007 is about: one member, two devices, two turns in the
      // same moment. Both answers arrive on this account's sockets, and a cubit
      // that appended every `chat.token` it saw would interleave them into one
      // bubble.
      await seedConversation('coach-1', kind: ChatKinds.coach, pinned: true);
      chat.listen();
      await chat.open('coach-1');
      await chat.send('How much protein today?');
      final requestId = requestIdOf(socket);

      socket.deliver(ChatFrames.token, {
        'requestId': requestId,
        'text': 'About 120 g.',
      });
      socket.deliver(ChatFrames.token, {
        'requestId': 'a-turn-from-the-laptop',
        'text': ' And a nap.',
      });

      expect(chat.state.streaming, 'About 120 g.');
    });

    test('a finished turn is stored at the sequence the server named',
        () async {
      await seedConversation('coach-1', kind: ChatKinds.coach, pinned: true);
      chat.listen();
      await chat.open('coach-1');
      await chat.send('How am I doing?');
      final requestId = requestIdOf(socket);

      socket.deliver(ChatFrames.accepted, {
        'requestId': requestId,
        'conversationId': 'coach-1',
        'userSeq': 4,
      });
      await pumpEventQueue();
      socket.deliver(ChatFrames.token, {
        'requestId': requestId,
        'text': 'Nine days running.',
      });
      socket.deliver(ChatFrames.done, {
        'requestId': requestId,
        'assistantSeq': 5,
      });
      await pumpEventQueue();

      final stored = await db.select(db.messages).get();
      expect(stored.map((r) => r.seq), [4, 5]);
      expect(stored.last.role, 'assistant');
      expect(stored.last.content, 'Nine days running.');

      // The partial is gone from the state because the row has replaced it, and
      // the screen draws the row.
      expect(chat.state.streaming, isNull);
      expect(chat.state.awaiting, isFalse);
      expect(chat.state.messages.last.content, 'Nine days running.');
    });
  });

  // ── cancel ─────────────────────────────────────────────────────────────────

  group('cancel', () {
    test('keeps what arrived and sends chat.cancel with the request id',
        () async {
      await seedConversation('coach-1', kind: ChatKinds.coach, pinned: true);
      chat.listen();
      await chat.open('coach-1');
      await chat.send('Give me a long answer.');
      final requestId = requestIdOf(socket);

      socket.deliver(ChatFrames.token, {
        'requestId': requestId,
        'text': 'Start with the warm-up,',
      });

      chat.stop();

      final cancel = socket.sent.last;
      expect(cancel.event, ChatFrames.cancel);
      expect((cancel.data! as Map)['requestId'], requestId);

      // FR-002: what arrived is kept. Clearing the buffer here would discard
      // the words the member pressed stop in order to keep.
      expect(chat.state.streaming, 'Start with the warm-up,');
      // And the button has stopped inviting a second tap.
      expect(chat.state.awaiting, isFalse);
    });

    test('the partial is stored when the server names its sequence', () async {
      await seedConversation('coach-1', kind: ChatKinds.coach, pinned: true);
      chat.listen();
      await chat.open('coach-1');
      await chat.send('Give me a long answer.');
      final requestId = requestIdOf(socket);

      socket.deliver(ChatFrames.token, {
        'requestId': requestId,
        'text': 'Start with the warm-up,',
      });
      chat.stop();

      // The server aborts the model, stores the partial with
      // `intent: { cancelled: true }` and names its sequence — so the bubble on
      // screen is replaced by a stored row rather than vanishing.
      socket.deliver(ChatFrames.done, {
        'requestId': requestId,
        'assistantSeq': 2,
      });
      await pumpEventQueue();

      final stored = await db.select(db.messages).get();
      expect(
        stored.single.content,
        'Start with the warm-up,',
      );
      expect(chat.state.streaming, isNull);
    });
  });

  // ── the offline queue ──────────────────────────────────────────────────────

  group('the offline queue', () {
    test('a message typed with no socket is queued, not sent', () async {
      await seedConversation('coach-1', kind: ChatKinds.coach, pinned: true);
      socket.connected = false;
      // The server refuses the batch, so the row is still there to look at:
      // what this test is about is that nothing went over the socket, not what
      // the flush does with it afterwards.
      api.acceptBatches = false;
      chat.listen();
      await chat.open('coach-1');

      await chat.send('remind me to call Dad in two hours');
      // `send` starts an opportunistic flush when the socket is down — the
      // socket reconnects on its own schedule and HTTP may work already — so
      // it is joined here rather than left to finish after the teardown has
      // closed the database. `flush` is latched, so this is the same flush.
      await outbox.flush();

      expect(
        socket.sent.where((f) => f.event == ChatFrames.send),
        isEmpty,
      );
      final queued = (await db.select(db.pendingMessages).get()).single;
      expect(queued.body, 'remind me to call Dad in two hours');
      // On screen straight away, which is the whole reason the row is written
      // before anything is sent.
      expect(chat.state.queued.single.body, queued.body);
    });

    test('flushes once when two triggers fire together', () async {
      await seedConversation('coach-1', kind: ChatKinds.coach, pinned: true);
      // Queued straight into the outbox rather than through `send`, which
      // starts an opportunistic flush of its own: this test is about two
      // *later* triggers overlapping, and a third one racing them would prove
      // nothing either way.
      await outbox.queue(
        conversationId: 'coach-1',
        body: 'remind me to call Dad in two hours',
      );

      // Both at once, which is the ordinary case rather than a contrivance: the
      // socket connects and the app resumes in the same instant, and both are
      // wired to the flush.
      await Future.wait([outbox.flush(), outbox.flush()]);

      expect(
        api.batches,
        hasLength(1),
        reason:
            'two overlapping flushes would send the same messages twice, and '
            'the member would read Botvy answering itself',
      );
      // Accepted, so the row is gone rather than re-sent for ever.
      expect(await db.select(db.pendingMessages).get(), isEmpty);
    });

    test('carries composedAt so the server understands it as of when it was '
        'typed', () async {
      await seedConversation('coach-1', kind: ChatKinds.coach, pinned: true);
      socket.connected = false;
      chat.listen();
      await chat.open('coach-1');

      final before = DateTime.now().toUtc();
      await chat.send('remind me to call Dad in two hours');
      // Joins the flush `send` started, so the assertion below reads a batch
      // that has definitely been sent rather than one that may still be in
      // flight when the teardown closes the database.
      await outbox.flush();

      final sent = api.batches.last.single;
      final composedAt = DateTime.parse(sent['composedAt'] as String);
      // FR-007: the moment it was typed, not the moment the network came back.
      // Asserted as a window around the run's own clock rather than against a
      // fixed date, which would fail the day the clock reached it.
      expect(
        composedAt.isBefore(before.subtract(const Duration(seconds: 5))),
        isFalse,
      );
      expect(sent['conversationId'], 'coach-1');
    });

    test('a refused message keeps its place and stops after five attempts',
        () async {
      await seedConversation('coach-1', kind: ChatKinds.coach, pinned: true);
      api.acceptBatches = false;

      await outbox.queue(
        conversationId: 'coach-1',
        body: 'something the server will not take',
      );

      for (var attempt = 0; attempt < 7; attempt++) {
        await outbox.flush();
      }

      // Never discarded — that would be the app quietly deciding somebody's
      // sentence was not worth keeping — but no longer re-sent.
      final row = (await db.select(db.pendingMessages).get()).single;
      expect(row.attempts, SyncEngine.maxPushAttempts);
      expect(api.batches, hasLength(SyncEngine.maxPushAttempts));
    });
  });

  // ── a moved answer ─────────────────────────────────────────────────────────

  group('a moved conversation', () {
    test('routes the reply to the new chat and tells the member where', () async {
      await seedConversation('coach-1', kind: ChatKinds.coach, pinned: true);
      await seedConversation('free-9');
      chat.listen();
      await chat.open('coach-1');

      await chat.send('What is the capital of Peru?');
      final requestId = requestIdOf(socket);

      socket.deliver(ChatFrames.accepted, {
        'requestId': requestId,
        'conversationId': 'coach-1',
        'userSeq': 7,
      });
      await pumpEventQueue();
      expect(await db.select(db.messages).get(), hasLength(1));

      socket.deliver(ChatFrames.moved, {
        'requestId': requestId,
        'fromConversationId': 'coach-1',
        'toConversationId': 'free-9',
        'title': 'What is the capital',
      });
      await pumpEventQueue();

      // The member is told, with somewhere to go.
      expect(chat.state.moved?.conversationId, 'free-9');
      expect(chat.state.moved?.title, 'What is the capital');

      // Coach is not polluted: the optimistic copy of the member's own message
      // is taken back, because the server left nothing behind there.
      expect(await db.select(db.messages).get(), isEmpty);

      // Tokens go on arriving and are not drawn in the chat they left.
      socket.deliver(ChatFrames.token, {
        'requestId': requestId,
        'text': 'Lima.',
      });
      expect(chat.state.streaming, isNull);

      // …and they are there when the member follows the notice.
      await chat.open('free-9');
      expect(chat.state.streaming, 'Lima.');

      socket.deliver(ChatFrames.done, {
        'requestId': requestId,
        'assistantSeq': 8,
      });
      await pumpEventQueue();

      final stored = (await db.select(db.messages).get()).single;
      expect(stored.conversationId, 'free-9');
      expect(stored.content, 'Lima.');
    });
  });

  // ── the pinned list and its refusals ───────────────────────────────────────

  group('the conversation list', () {
    test('puts Coach and Planner above the rest, in that order', () async {
      // Deliberately seeded out of order, and the ordinary chat given the most
      // recent message: a list sorted by recency alone would put it first.
      await seedConversation('planner-1', kind: ChatKinds.planner, pinned: true);
      await seedConversation('coach-1', kind: ChatKinds.coach, pinned: true);
      await seedConversation('free-9');
      await (db.update(db.conversations)..where((r) => r.id.equals('free-9')))
          .write(
            ConversationsCompanion(
              lastMessageAt: Value(DateTime.now().toUtc()),
            ),
          );

      await conversations.refresh();

      expect(
        conversations.state.pinned.map((r) => r.kind),
        [ChatKinds.coach, ChatKinds.planner],
      );
      expect(conversations.state.others.map((r) => r.id), ['free-9']);
    });

    test('a chat with no pending operation at all is still listed', () async {
      // The NULL trap, concretely. `pending_op` is NULL for a clean row and
      // NULL is falsy in a `WHERE`, so a filter written
      // `pendingOp.equals('purge').not()` would hide every conversation the
      // member has — which is all of them, nearly always. Shipped twice in this
      // codebase already.
      await seedConversation('coach-1', kind: ChatKinds.coach, pinned: true);
      expect(
        (await db.select(db.conversations).get()).single.pendingOp,
        isNull,
      );

      await conversations.refresh();

      expect(conversations.state.pinned, hasLength(1));
    });

    test('a protected refusal carries the explanation and the chat to clear',
        () async {
      await seedConversation('coach-1', kind: ChatKinds.coach, pinned: true);
      await conversations.refresh();

      await conversations.remove(conversations.state.pinned.single);

      final refusal = conversations.state.refusal;
      expect(refusal, isNotNull);
      expect(refusal!.conversationId, 'coach-1');
      // The server's own sentence, so the screen can show it in preference to
      // a local one that may predate the rule.
      expect(refusal.message, contains('always here'));
      // And not reported as an ordinary problem, which would have shown a snack
      // bar with no way out of it.
      expect(conversations.state.problem, isNull);
      // Nothing was tombstoned locally.
      expect(
        (await db.select(db.conversations).get()).single.deletedAt,
        isNull,
      );
    });

    test('clearing the same chat is accepted and empties it on this frame',
        () async {
      await seedConversation('coach-1', kind: ChatKinds.coach, pinned: true);
      // Two messages the member is about to be rid of.
      for (final seq in [1, 2]) {
        await db.into(db.messages).insert(
          MessagesCompanion.insert(
            seq: Value(seq),
            conversationId: 'coach-1',
            role: seq.isOdd ? 'user' : 'assistant',
            content: 'message $seq',
            createdAt: DateTime.now().toUtc(),
          ),
        );
      }
      chat.listen();
      await chat.open('coach-1');
      expect(chat.state.messages, hasLength(2));

      api.clearedUpTo = 2;
      await conversations.clear('coach-1');
      await chat.refresh();

      // The watermark is written straight away rather than waited for, which is
      // what makes the clear take effect on the frame the member is looking at.
      // FR-011's other halves are the server's: the pull starts at
      // `max(lastSeq, clearedUpToSeq)`, so nothing cleared reaches a device
      // that catches up later either.
      expect(
        (await db.select(db.conversations).get()).single.clearedUpToSeq,
        2,
      );
      expect(chat.state.messages, isEmpty);
    });

    test('an unrelated refusal is a problem, not a clearing offer', () async {
      // FR-020: a conversation belonging to somebody else is `forbidden` and
      // nothing about it may be revealed — not even that it exists. Branching
      // on the 403 rather than on the code would offer "empty it instead" for
      // a chat that is not the member's.
      await seedConversation('free-9');
      await conversations.refresh();
      api.deleteCode = 'forbidden';

      await conversations.remove(conversations.state.others.single);

      expect(conversations.state.refusal, isNull);
      expect(conversations.state.problem, isNotNull);
    });
  });

  // ── Botvy writing unprompted ───────────────────────────────────────────────

  test('a coach-initiated message appears without reopening the screen',
      () async {
    // FR-017: the evening proposal, the summary, the briefing and the check-in
    // question are written into the coach chat by the server, and a member who
    // is looking at that chat has to see them arrive.
    await seedConversation('coach-1', kind: ChatKinds.coach, pinned: true);
    chat.listen();
    await chat.open('coach-1');
    expect(chat.state.messages, isEmpty);

    socket.deliver(ChatFrames.message, {
      'conversationId': 'coach-1',
      'seq': 11,
      'role': 'assistant',
      'content': 'Shall I set tomorrow to these three?',
      'createdAt': DateTime.now().toUtc().toIso8601String(),
      // Routing for a connected client, and deliberately not stored: a client
      // that was offline routes from the notification's deep link instead.
      'kind': 'evening_prompt',
    });
    await pumpEventQueue();

    expect(chat.state.messages.single.content,
        'Shall I set tomorrow to these three?');
  });

  test('a chat.error keeps the member\'s words and carries the code verbatim',
      () async {
    await seedConversation('coach-1', kind: ChatKinds.coach, pinned: true);
    chat.listen();
    await chat.open('coach-1');
    await chat.send('What should I eat?');
    final requestId = requestIdOf(socket);

    socket.deliver(ChatFrames.error, {
      'requestId': requestId,
      'code': 'quota',
      // The sentence names the limit and the reset in the member's own zone,
      // resolved on the server. The client shows it unchanged rather than
      // re-deriving a time it has no business computing.
      'message': 'You have used your 120,000 tokens for today. '
          'It resets at 00:00 your time.',
    });

    expect(chat.state.problem?.code, 'quota');
    expect(chat.state.problem?.verbatim, isTrue);
    expect(chat.state.problem?.message, contains('00:00 your time'));
    expect(chat.state.awaiting, isFalse);

    // FR-012: the message is kept. `chat.accepted` never arrived, so it is
    // still in the outbox where the member can see it.
    expect(await db.select(db.pendingMessages).get(), hasLength(1));
  });
}

/// One frame this socket was asked to send.
class _Sent {
  const _Sent(this.event, this.data);

  final String event;
  final Object? data;
}

/// A socket that is driven by the test rather than by a server.
///
/// Subclasses the real [SocketClient] rather than an interface, because there
/// is one implementation and inventing a port for it would be an abstraction
/// nothing else wants. What is overridden is the four members that touch the
/// wire; everything else — the token refresh, the reconnection — is the real
/// thing and is not what these specs are about.
class _FakeSocket extends SocketClient {
  _FakeSocket(super.api, super.db);

  bool connected = true;
  final List<_Sent> sent = [];
  final Map<String, List<void Function(dynamic)>> handlers = {};

  @override
  bool get isConnected => connected;

  @override
  void on(String event, void Function(dynamic data) handler) =>
      handlers.putIfAbsent(event, () => []).add(handler);

  @override
  void off(String event, void Function(dynamic data) handler) =>
      handlers[event]?.remove(handler);

  @override
  void emit(String event, [Object? data]) => sent.add(_Sent(event, data));

  /// Delivers one server frame to whatever is listening.
  ///
  /// Over a copy of the list, because a handler may register or remove one
  /// while it runs — which is what happens the moment a cubit is closed from
  /// inside a frame.
  void deliver(String event, Object? payload) {
    for (final handler in [...?handlers[event]]) {
      handler(payload);
    }
  }
}

/// The gateway, as far as the chat is concerned.
///
/// Extends [OfflineApi] so `sync` still throws — offline is the normal state of
/// this application and these specs are about the local tables, not about a
/// round trip.
class _ChatApi extends OfflineApi {
  /// Every batch this fake was sent, so a double flush is visible.
  final List<List<Map<String, dynamic>>> batches = [];

  bool acceptBatches = true;

  /// What `clearConversation` answers as the new watermark.
  int clearedUpTo = 0;

  /// The code a delete is refused with. `protected` is the pinned-chat rule;
  /// `forbidden` is somebody else's chat, which must be answered differently.
  String deleteCode = 'protected';

  @override
  Future<List<Map<String, dynamic>>> quickQuestions(String scope) async =>
      const [
        {'id': 'q1', 'text': 'How am I doing?'},
      ];

  @override
  Future<Map<String, dynamic>> conversationsBatch(
    List<Map<String, dynamic>> messages,
  ) async {
    batches.add(messages);
    // A slow answer on purpose: a second flush started while the first is in
    // flight is the case the latch exists for, and an instantaneous fake would
    // never overlap.
    await Future<void>.delayed(const Duration(milliseconds: 10));
    return {
      'accepted': acceptBatches
          ? [for (final message in messages) message['clientId']]
          : <String>[],
      'replies': <Map<String, dynamic>>[],
    };
  }

  @override
  Future<void> deleteConversation(String id) async => throw ApiException(
    deleteCode == 'protected'
        ? 'Coach and Planner are always here, so they cannot be removed.'
        : '',
    statusCode: 403,
    code: deleteCode,
  );

  @override
  Future<Map<String, dynamic>> clearConversation(String id) async {
    final now = DateTime.now().toUtc().toIso8601String();
    return {
      'id': id,
      'kind': ChatKinds.coach,
      'title': 'Coach',
      'pinned': true,
      'archived': false,
      'clearedUpToSeq': clearedUpTo,
      'lastMessageAt': null,
      'createdAt': now,
      'updatedAt': now,
    };
  }
}
