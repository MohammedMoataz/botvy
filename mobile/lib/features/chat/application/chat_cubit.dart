import 'dart:async';

import 'package:drift/drift.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:uuid/uuid.dart';

import '../../../core/api/api_client.dart';
import '../../../core/api/socket_client.dart';
import '../../../core/db/database.dart';
import '../../../core/sync/sync_engine.dart';
import '../data/chat_outbox.dart';

const Uuid _uuid = Uuid();

/// One row of a structured list answer.
///
/// FR-016: a list answer arrives as rows the member can tap, not as a
/// paragraph. "What's on today?" answered in prose is something to read; the
/// same answer as rows is something to *do*, and the difference is a tap on the
/// tick instead of switching to the task list and finding it again.
class ChatCardItem {
  const ChatCardItem({
    required this.id,
    required this.title,
    this.subtitle,
    this.at,
    this.status,
    this.deepLink = '',
  });

  factory ChatCardItem.fromFrame(Map<String, dynamic> raw) => ChatCardItem(
    id: raw['id'] as String? ?? '',
    title: raw['title'] as String? ?? '',
    subtitle: raw['subtitle'] as String?,
    at: _instant(raw['at']),
    status: raw['status'] as String?,
    deepLink: raw['deepLink'] as String? ?? '',
  );

  final String id;
  final String title;
  final String? subtitle;

  /// The moment the item is about, as the **server** resolved it. Never
  /// re-derived here: it was worked out against the member's own time zone
  /// through `shared/time`, and a phone that recomputed it from a local clock
  /// is exactly the three-hour shift principle XI exists to stop.
  final DateTime? at;

  /// `open` | `completed` | `cancelled` | `active` | `done` — whatever the
  /// owning context calls it. Read rather than mapped, because the vocabulary
  /// belongs to tasks and reminders and a translation table here would be a
  /// third opinion about it.
  final String? status;

  final String deepLink;

  bool get isSettled => status == 'completed' || status == 'done';
}

/// A structured list answer (`chat.card`).
class ChatCard {
  const ChatCard({required this.kind, required this.items});

  factory ChatCard.fromFrame(Map<String, dynamic> frame) => ChatCard(
    kind: frame['kind'] as String? ?? 'tasks',
    items: (frame['items'] as List? ?? const [])
        .whereType<Map>()
        .map((raw) => ChatCardItem.fromFrame(Map<String, dynamic>.from(raw)))
        .toList(),
  );

  /// `tasks` | `reminders` | `meetings` | `plan` | `sessions`. Decides the
  /// heading and, for a tap on the tick, which context owns the item.
  final String kind;

  final List<ChatCardItem> items;
}

/// The answer went somewhere else, and the member has to be told.
///
/// FR-008: a message that belongs to neither coaching nor planning is moved to
/// a chat of its own *before* the reply streams, titled from the member's own
/// opening words. Without this notice the member watches their question
/// disappear from Coach and concludes it was lost.
class MovedNotice {
  const MovedNotice({required this.conversationId, required this.title});

  final String conversationId;
  final String title;
}

/// A `chat.error`, carrying the server's own sentence.
///
/// [message] is shown **verbatim** for `quota` and `model_unavailable`, and
/// that is a rule rather than laziness. The quota refusal names the limit and
/// the moment it resets *in the member's own time zone* (FR-013), which the
/// server resolved through `shared/time` from the profile's zone. Composing
/// that sentence here would be a second implementation of the one calculation
/// this codebase has already got wrong once, on a device whose own clock is
/// not the member's zone.
class ChatProblem {
  const ChatProblem(this.code, this.message);

  /// `quota` | `model_unavailable` | `rate_limited` | `forbidden` |
  /// `protected` | `internal`, per `ws-chat.md`.
  final String code;

  final String message;

  /// Whether the server's own words must be used rather than a local sentence.
  bool get verbatim =>
      message.isNotEmpty && (code == 'quota' || code == 'model_unavailable');
}

/// What one chat screen is showing.
class ChatState {
  const ChatState({
    this.loading = true,
    this.conversationId = '',
    this.conversation,
    this.messages = const [],
    this.queued = const [],
    this.quickQuestions = const [],
    this.streaming,
    this.awaiting = false,
    this.card,
    this.moved,
    this.problem,
  });

  final bool loading;

  final String conversationId;

  /// The row itself, for the title, the kind and [LocalConversation.pinned] —
  /// which is what decides whether the menu offers deleting at all.
  final LocalConversation? conversation;

  /// The stored history, oldest first, already past the clear watermark.
  final List<LocalMessage> messages;

  /// What the member has typed and the server has not acknowledged. Drawn after
  /// [messages] because it is always newer: a message with a sequence has been
  /// accepted, and one without has not.
  final List<LocalPendingMessage> queued;

  final List<String> quickQuestions;

  /// The answer as it arrives, assembled from `chat.token` in arrival order.
  ///
  /// Null when no turn is streaming into *this* chat — which is not the same as
  /// "no turn is running": a turn that was moved goes on assembling, and its
  /// words appear when the member opens the chat it moved to.
  final String? streaming;

  /// A turn is in flight. What the stop button is shown for.
  final bool awaiting;

  final ChatCard? card;
  final MovedNotice? moved;
  final ChatProblem? problem;

  ChatState copyWith({
    bool? loading,
    String? conversationId,
    LocalConversation? conversation,
    List<LocalMessage>? messages,
    List<LocalPendingMessage>? queued,
    List<String>? quickQuestions,
    String? streaming,
    bool? awaiting,
    ChatCard? card,
    MovedNotice? moved,
    ChatProblem? problem,
    bool clearStreaming = false,
    bool clearCard = false,
    bool clearMoved = false,
    bool clearProblem = false,
  }) => ChatState(
    loading: loading ?? this.loading,
    conversationId: conversationId ?? this.conversationId,
    conversation: conversation ?? this.conversation,
    messages: messages ?? this.messages,
    queued: queued ?? this.queued,
    quickQuestions: quickQuestions ?? this.quickQuestions,
    streaming: clearStreaming ? null : (streaming ?? this.streaming),
    awaiting: awaiting ?? this.awaiting,
    card: clearCard ? null : (card ?? this.card),
    moved: clearMoved ? null : (moved ?? this.moved),
    problem: clearProblem ? null : (problem ?? this.problem),
  );
}

/// One turn, from `chat.send` to `chat.done`.
///
/// A small mutable object rather than four fields on the cubit, because
/// [conversationId] changes under it: `chat.moved` re-points the turn at a new
/// chat before a single token has arrived, and every frame after that belongs
/// to the new one. Keeping the pair together is what lets the tokens go on
/// being assembled while the screen shows a different chat.
class _Turn {
  _Turn({
    required this.requestId,
    required this.conversationId,
    required this.clientId,
  });

  final String requestId;
  String conversationId;

  /// The id minted for the member's own message, so the queued row can be
  /// exchanged for the stored one when `chat.accepted` names its sequence.
  final String clientId;

  /// The member's message once the server has given it a place in the order,
  /// or null before `chat.accepted`. Needed by the move: an optimistic row in
  /// the chat the turn has *left* has to be taken back.
  int? userSeq;

  /// The answer so far. A buffer and not a string, because a long answer is
  /// hundreds of frames and `answer += text` is a fresh copy of everything
  /// written so far on each one.
  final StringBuffer answer = StringBuffer();
}

/// One conversation: its history, the answer as it is written, and the
/// member's own messages on their way out.
///
/// **The socket is not the source of truth; the database is.** Every frame that
/// tells this cubit something durable — `chat.accepted` with the member's
/// sequence, `chat.done` with the answer's — is written into `messages` at the
/// sequence the server named, and the screen is redrawn from the table. So a
/// finished turn survives the app being killed without waiting for a sync pass,
/// and the pull that follows upserts the server's identical copy over the top.
/// The one thing held only in memory is the *partial* answer, which is
/// deliberate: until `chat.done` names its sequence there is no place in the
/// conversation's order to store it at.
///
/// The frames are routed by `requestId` and nothing else. A member with a phone
/// and a laptop has two turns running against one account (SC-007), and both
/// arrive on this device's socket if both sockets belong to them; a cubit that
/// appended every `chat.token` it saw would interleave two answers into one
/// bubble.
class ChatCubit extends Cubit<ChatState> {
  ChatCubit(
    this._db,
    this._api,
    this._socket,
    this._outbox,
    this._sync, {
    this.onCardAction,
  }) : super(const ChatState());

  final AppDatabase _db;
  final ApiClient _api;
  final SocketClient _socket;
  final ChatOutbox _outbox;
  final SyncEngine _sync;

  /// Completing an item from a card row: `(kind, id)`, exactly the pair
  /// `handleAlertAction` takes.
  ///
  /// Injected rather than reached for, because the write belongs to the context
  /// that owns the row — a task is completed by `TasksCubit`, which knows about
  /// recurrence and `pendingOp` — and a chat feature that imported the tasks
  /// feature to call it would be the cross-context reach the constitution
  /// refuses. `app/di.dart` is where both are visible, which is where the
  /// wiring goes.
  final Future<void> Function(String kind, String id)? onCardAction;

  _Turn? _turn;
  StreamSubscription<SyncOutcome>? _passes;

  /// The frame handlers, kept by reference so [close] can take them off again.
  ///
  /// [SocketClient.on] replays its handlers onto every rebuilt socket, so a
  /// handler that is only removed from the live instance comes straight back
  /// the next time the access token is refreshed — and is then delivered into a
  /// cubit that has been closed.
  late final Map<String, void Function(dynamic)> _handlers = {
    ChatFrames.accepted: _onAccepted,
    ChatFrames.intent: _onIntent,
    ChatFrames.moved: _onMoved,
    ChatFrames.token: _onToken,
    ChatFrames.card: _onCard,
    ChatFrames.heartbeat: _onHeartbeat,
    ChatFrames.done: _onDone,
    ChatFrames.error: _onError,
    ChatFrames.message: _onServerMessage,
  };

  /// Wires the frames and the sync passes. Called once, at boot.
  void listen() {
    _handlers.forEach(_socket.on);

    // Redrawn after every pass, so a message sent from the browser, an answer
    // that landed while the app was closed, and a clear made on another device
    // all appear without the member pulling to refresh. `sync.nudge` is what
    // makes that prompt: the engine already turns it into a pass.
    _passes ??= _sync.outcomes.listen((_) => unawaited(refresh()));
  }

  @override
  Future<void> close() async {
    _handlers.forEach(_socket.off);
    await _passes?.cancel();
    return super.close();
  }

  // ── reads ──────────────────────────────────────────────────────────────────

  /// Shows [conversationId], from scratch.
  ///
  /// A fresh state rather than a `copyWith`: the card, the problem and the
  /// moved notice all belong to the chat that was open, and carrying them
  /// across would put the Planner's list of today's tasks at the bottom of the
  /// Coach chat.
  Future<void> open(String conversationId) async {
    emit(ChatState(loading: true, conversationId: conversationId));
    await refresh();
    unawaited(_loadQuickQuestions(conversationId));

    // A turn that was moved *into* this chat resumes here. This is the other
    // half of `chat.moved`: the tokens never stopped arriving, they simply had
    // nowhere on screen to go, and opening the chat they were re-pointed at is
    // where they appear.
    _emitAnswer();
  }

  Future<void> refresh() async {
    if (isClosed) return;
    final id = state.conversationId;
    if (id.isEmpty) return;

    final conversation =
        await (_db.select(_db.conversations)
              ..where((r) => r.id.equals(id)))
            .getSingleOrNull();

    // Past the clear watermark, and belt-and-braces on purpose. The sync
    // applier already deletes cleared rows when the conversation arrives with a
    // higher `clearedUpToSeq`, but a clear made *on this device* is answered by
    // REST before any pull happens — the watermark is written straight to the
    // row, and this predicate is what makes the screen empty on that frame
    // rather than on the next pass. FR-011: nothing cleared may appear in the
    // history a screen shows.
    final cleared = conversation?.clearedUpToSeq ?? 0;

    // Newest first with a limit, then reversed for display. Ordering ascending
    // and taking the first two hundred would show a long chat's *opening*,
    // which is the one part of it nobody is looking for.
    final newest =
        await (_db.select(_db.messages)
              ..where(
                (r) =>
                    r.conversationId.equals(id) &
                    r.seq.isBiggerThanValue(cleared),
              )
              ..orderBy([(r) => OrderingTerm.desc(r.seq)])
              ..limit(_historyLimit))
            .get();

    if (isClosed || state.conversationId != id) return;
    emit(
      state.copyWith(
        loading: false,
        conversation: conversation,
        messages: newest.reversed.toList(),
        queued: await _outbox.waiting(id),
      ),
    );
  }

  /// How much history one screen holds.
  ///
  /// A local display cap and not the model's context window: the prompt's own
  /// limit is `chat.historyLimit` in the operator's registry and is applied on
  /// the server, where the prompt is assembled. Two hundred bubbles is more
  /// than a phone screen can scroll through in one sitting and the rest is
  /// still in the table.
  static const int _historyLimit = 200;

  Future<void> _loadQuickQuestions(String conversationId) async {
    final kind = state.conversation?.kind ?? 'free';
    try {
      final rows = await _api.quickQuestions(kind);
      // The member may have moved on while the read was in flight; answering
      // into a different chat would offer the Planner's questions in Coach.
      if (isClosed || state.conversationId != conversationId) return;
      emit(
        state.copyWith(
          quickQuestions: [
            for (final row in rows)
              if (row['text'] is String && (row['text'] as String).isNotEmpty)
                row['text'] as String,
          ],
        ),
      );
    } on ApiException {
      // No chips, and that is the right answer rather than a stale set. They
      // adapt to the member's latest check-in (FR-010), so yesterday's cached
      // list would offer a lighter-day option to somebody who has since
      // reported a good one.
    }
  }

  // ── the turn ───────────────────────────────────────────────────────────────

  /// Sends what the member typed.
  ///
  /// The queued row is written **first and always**, online or off. That is
  /// what puts the sentence on screen on this frame, and it is what keeps it if
  /// the socket dies between the emit and `chat.accepted` — the flush finds it
  /// there and re-sends it, and the server's unique `{userId, clientId}` index
  /// makes the second delivery a no-op rather than a second copy.
  Future<void> send(String text) async {
    final body = text.trim();
    final conversationId = state.conversationId;
    if (body.isEmpty || conversationId.isEmpty) return;

    final composedAt = DateTime.now().toUtc();
    final clientId = await _outbox.queue(
      conversationId: conversationId,
      body: body,
      composedAt: composedAt,
    );
    await refresh();
    if (isClosed) return;

    if (!_socket.isConnected) {
      // The socket being down does not mean HTTP is: it reconnects on its own
      // schedule and may simply not have got there yet. Trying the flush costs
      // one request and is idempotent, and the member's message goes now
      // instead of at the next trigger.
      emit(state.copyWith(clearProblem: true, clearCard: true));
      unawaited(_outbox.flush());
      return;
    }

    final requestId = _uuid.v7();
    _turn = _Turn(
      requestId: requestId,
      conversationId: conversationId,
      clientId: clientId,
    );

    emit(
      state.copyWith(
        awaiting: true,
        clearStreaming: true,
        clearCard: true,
        clearMoved: true,
        clearProblem: true,
      ),
    );

    _socket.emit(ChatFrames.send, {
      'requestId': requestId,
      'conversationId': conversationId,
      'clientId': clientId,
      'text': body,
      // The moment it was typed, not the moment it was sent. Identical here and
      // different the instant the socket was down when the member pressed the
      // button, which is the case the column exists for.
      'composedAt': composedAt.toIso8601String(),
    });
  }

  /// Stops the answer and keeps what arrived (FR-002).
  ///
  /// The buffer is deliberately **not** cleared. The server aborts the model,
  /// stores the partial with `intent: { cancelled: true }` and names its
  /// sequence in `chat.done`, so what is on screen is replaced by the stored
  /// row rather than vanishing. Throwing the buffer away here would discard the
  /// words the member pressed stop precisely in order to keep.
  void stop() {
    final turn = _turn;
    if (turn == null) return;
    _socket.emit(ChatFrames.cancel, {'requestId': turn.requestId});
    // The turn is still live — `chat.done` is what ends it — but the stop
    // button has done its job and must not invite a second tap.
    emit(state.copyWith(awaiting: false));
  }

  /// Completes an item from a card row, through the context that owns it.
  Future<void> completeCardItem(ChatCardItem item) async {
    final action = onCardAction;
    final card = state.card;
    if (action == null || card == null || item.id.isEmpty) return;

    // The card's kind is plural ('tasks'), the alert vocabulary is singular
    // ('task'), and `handleAlertAction` branches on the singular. Mapped here
    // rather than by trimming an 's', because 'plan' and 'meetings' do not
    // share a rule and a string operation would quietly produce 'meeting' for
    // one and 'plan' for the other and look correct.
    final kind = switch (card.kind) {
      'tasks' => 'task',
      'reminders' => 'reminder',
      'meetings' => 'meeting',
      _ => null,
    };
    if (kind == null) return;

    await action(kind, item.id);
    // The row's status came from the server with the card and nothing local
    // updates it, so the tick is re-read from the next pass rather than
    // guessed at here.
    _sync.kick();
  }

  void clearProblem() => emit(state.copyWith(clearProblem: true));
  void clearMoved() => emit(state.copyWith(clearMoved: true));
  void clearCard() => emit(state.copyWith(clearCard: true));

  // ── frames ─────────────────────────────────────────────────────────────────

  /// The member's own message took a place in the order.
  void _onAccepted(dynamic raw) {
    final frame = _frame(raw);
    final turn = _turn;
    if (turn == null || frame['requestId'] != turn.requestId) return;

    final seq = frame['userSeq'];
    if (seq is! int) return;
    turn.userSeq = seq;

    // The conversation the server actually put it in, which is not always the
    // one we asked for.
    final landed =
        frame['conversationId'] as String? ?? turn.conversationId;
    turn.conversationId = landed;

    unawaited(_storeOwnMessage(turn, seq, landed));
  }

  /// Exchanges the queued row for a stored message at the sequence the server
  /// issued.
  ///
  /// The queued row is deleted and the message inserted in that order, so the
  /// bubble never doubles. Nothing advances [DbKeys.messagesLastSeq] here — and
  /// that matters: the watermark is moved only by an actual pull, which is what
  /// keeps this row eligible to be pulled again and reconciled against the
  /// server's own copy.
  Future<void> _storeOwnMessage(
    _Turn turn,
    int seq,
    String conversationId,
  ) async {
    final queued =
        await (_db.select(_db.pendingMessages)
              ..where((r) => r.clientId.equals(turn.clientId)))
            .getSingleOrNull();
    if (queued == null) return;

    await _db.into(_db.messages).insertOnConflictUpdate(
      MessagesCompanion.insert(
        seq: Value(seq),
        conversationId: conversationId,
        role: 'user',
        content: queued.body,
        clientId: Value(queued.clientId),
        composedAt: Value(queued.composedAt),
        createdAt: DateTime.now().toUtc(),
      ),
    );
    await _outbox.forget(turn.clientId);
    await refresh();
  }

  /// What the extraction understood, and a deliberate no-op.
  ///
  /// Registered rather than omitted so that a reader looking for the frame
  /// finds the decision instead of wondering. Every intent the server executes
  /// in code still arrives as `chat.token` plus `chat.done` — the contract says
  /// so, "so clients render one path" — which means the confirmation the member
  /// reads is already on its way. A client that also drew the intent would say
  /// the same thing twice, in its own words, and what the member is told about
  /// what was stored is the server's decision (FR-004).
  void _onIntent(dynamic raw) {}

  /// The turn was off-topic for a pinned chat and has been re-pointed.
  void _onMoved(dynamic raw) {
    final frame = _frame(raw);
    final turn = _turn;
    if (turn == null || frame['requestId'] != turn.requestId) return;

    final to = frame['toConversationId'] as String?;
    if (to == null || to.isEmpty) return;

    final leaving = turn.userSeq;
    turn.conversationId = to;

    if (isClosed) return;
    emit(
      state.copyWith(
        moved: MovedNotice(
          conversationId: to,
          title: frame['title'] as String? ?? '',
        ),
        // Whatever had been assembled belongs to the other chat now. The buffer
        // itself is untouched: the answer goes on being written and appears
        // when the member opens where it went.
        clearStreaming: true,
      ),
    );

    // Our optimistic copy of the member's own message is in the chat the turn
    // has left, and the server left nothing behind there (US3 acceptance 4:
    // "Coach is not polluted"). Dropped rather than re-pointed, because
    // re-pointing would be this device deciding where a server row belongs;
    // the pull brings both messages to the chat they are actually in, and the
    // sequence is still above the watermark so it will.
    if (leaving != null) {
      unawaited(_forgetOptimistic(leaving));
    }
  }

  Future<void> _forgetOptimistic(int seq) async {
    await (_db.delete(_db.messages)..where((r) => r.seq.equals(seq))).go();
    await refresh();
    _sync.kick();
  }

  /// One chunk of the answer.
  void _onToken(dynamic raw) {
    final frame = _frame(raw);
    final turn = _turn;
    if (turn == null || frame['requestId'] != turn.requestId) return;

    final text = frame['text'];
    if (text is! String) return;

    // Appended in arrival order, which *is* the order the model wrote them:
    // one websocket delivers frames in sequence, and the contract preserves
    // leading spaces so the chunks concatenate into the sentence rather than
    // needing to be joined with one.
    turn.answer.write(text);
    _emitAnswer();
  }

  /// Puts the buffer on screen, but only when the turn belongs to the chat that
  /// is open.
  void _emitAnswer() {
    final turn = _turn;
    if (isClosed) return;
    if (turn == null ||
        turn.conversationId != state.conversationId ||
        turn.answer.isEmpty) {
      return;
    }
    emit(state.copyWith(streaming: turn.answer.toString(), awaiting: true));
  }

  void _onCard(dynamic raw) {
    final frame = _frame(raw);
    final turn = _turn;
    if (turn == null || frame['requestId'] != turn.requestId) return;
    if (isClosed || turn.conversationId != state.conversationId) return;
    emit(state.copyWith(card: ChatCard.fromFrame(frame)));
  }

  /// The model is thinking, not dead.
  ///
  /// Fifteen seconds of silence on a busy host is normal, and the only thing
  /// that has to happen is that the "writing" indicator stays up — so this
  /// re-asserts [ChatState.awaiting] rather than doing nothing, which also
  /// recovers the indicator if something else cleared it.
  void _onHeartbeat(dynamic raw) {
    final frame = _frame(raw);
    final turn = _turn;
    if (turn == null || frame['requestId'] != turn.requestId) return;
    if (isClosed || state.awaiting) return;
    emit(state.copyWith(awaiting: true));
  }

  void _onDone(dynamic raw) {
    final frame = _frame(raw);
    final turn = _turn;
    if (turn == null || frame['requestId'] != turn.requestId) return;

    _turn = null;
    final seq = frame['assistantSeq'];
    unawaited(_storeAnswer(turn, seq is int ? seq : null));
  }

  Future<void> _storeAnswer(_Turn turn, int? seq) async {
    final answer = turn.answer.toString();
    if (seq != null && answer.isNotEmpty) {
      await _db.into(_db.messages).insertOnConflictUpdate(
        MessagesCompanion.insert(
          seq: Value(seq),
          conversationId: turn.conversationId,
          role: 'assistant',
          content: answer,
          // No client id and no `composedAt`: the server wrote this one.
          createdAt: DateTime.now().toUtc(),
        ),
      );
    }

    if (isClosed) return;
    emit(state.copyWith(awaiting: false, clearStreaming: true));
    await refresh();

    // Whatever the turn did in other contexts — a task created, a reminder
    // cancelled — is named in `chat.done`'s `actions` and stored in those
    // contexts' own collections. A pass is how they reach this device; reading
    // the ids out of the frame and writing the rows here would be the chat
    // feature writing into the planning tables.
    _sync.kick();
  }

  /// The turn failed, and the member's words are kept.
  ///
  /// Nothing is deleted here, deliberately (FR-012). If `chat.accepted` had
  /// already landed, the message is stored at its sequence; if it had not, the
  /// queued row is still in the outbox. Either way the sentence is on screen
  /// and can be sent again.
  void _onError(dynamic raw) {
    final frame = _frame(raw);
    final turn = _turn;
    // Matched on the request id like every other frame, and for the same
    // reason: a member with a phone and a laptop has two turns running against
    // one account, and an error belonging to the laptop's must not put a
    // message on this screen about a question that was never asked here.
    if (turn == null || frame['requestId'] != turn.requestId) return;

    _turn = null;
    if (isClosed) return;
    emit(
      state.copyWith(
        awaiting: false,
        clearStreaming: true,
        problem: ChatProblem(
          frame['code'] as String? ?? 'internal',
          frame['message'] as String? ?? '',
        ),
      ),
    );
  }

  /// Botvy writing unprompted: the evening proposal, the end-of-day summary,
  /// the morning briefing, the check-in question (FR-017).
  ///
  /// Stored immediately so a member who is *looking* at the coach chat sees it
  /// arrive without reopening the screen. The frame's `kind` is not stored and
  /// not meant to be: the contract calls it routing for a connected client, and
  /// a client that was offline routes from the notification's deep link
  /// instead. Writing it onto the row would make it look like message state and
  /// would then be wrong for every message pulled rather than pushed.
  void _onServerMessage(dynamic raw) {
    final frame = _frame(raw);
    final seq = frame['seq'];
    final conversationId = frame['conversationId'] as String?;
    if (seq is! int || conversationId == null || conversationId.isEmpty) return;

    unawaited(_storeServerMessage(frame, seq, conversationId));
  }

  Future<void> _storeServerMessage(
    Map<String, dynamic> frame,
    int seq,
    String conversationId,
  ) async {
    await _db.into(_db.messages).insertOnConflictUpdate(
      MessagesCompanion.insert(
        seq: Value(seq),
        conversationId: conversationId,
        role: frame['role'] as String? ?? 'assistant',
        content: frame['content'] as String? ?? '',
        createdAt: _instant(frame['createdAt']) ?? DateTime.now().toUtc(),
      ),
    );
    if (conversationId == state.conversationId) await refresh();
  }
}

/// One frame's payload, whatever shape it arrived in.
///
/// Socket.IO hands a handler `dynamic`, and a frame that is not a map is a
/// gateway sending something this build does not understand. Answered with an
/// empty map rather than a cast, so every handler's `requestId` check fails and
/// the frame is ignored — a `as Map` here would throw out of a socket callback,
/// where nothing catches it.
Map<String, dynamic> _frame(dynamic raw) =>
    raw is Map ? Map<String, dynamic>.from(raw) : const {};

DateTime? _instant(Object? value) {
  if (value is DateTime) return value;
  if (value is! String || value.isEmpty) return null;
  return DateTime.tryParse(value)?.toUtc();
}
