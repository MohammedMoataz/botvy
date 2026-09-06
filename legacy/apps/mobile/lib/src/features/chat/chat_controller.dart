import 'dart:async';
import 'dart:convert';

import 'package:drift/drift.dart' show Value;
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:uuid/uuid.dart';

import '../../api/api_client.dart';
import '../../api/models.dart';
import '../../api/sse.dart';
import '../../app_providers.dart';
import '../../db/database.dart';
import 'conversations_controller.dart';

const _uuid = Uuid();

class ChatState {
  const ChatState({
    this.messages = const [],
    this.loading = false,
    this.streaming = false,
    this.error,
  });

  final List<ChatMessage> messages;

  /// History is being fetched.
  final bool loading;

  /// A reply is currently arriving token by token.
  final bool streaming;

  final String? error;

  ChatState copyWith({
    List<ChatMessage>? messages,
    bool? loading,
    bool? streaming,
    String? error,
    bool clearError = false,
  }) =>
      ChatState(
        messages: messages ?? this.messages,
        loading: loading ?? this.loading,
        streaming: streaming ?? this.streaming,
        error: clearError ? null : (error ?? this.error),
      );
}

/// One chat's screen state, keyed by the chat's id.
///
/// A family rather than one controller with a `switchTo`: switching then
/// disposes the old SSE subscription, drops its message list and resets
/// `streaming` through the existing `onDispose`, instead of that teardown being
/// hand-written and kept in step with `build` for ever.
///
/// autoDispose is load-bearing beyond that: it wipes the message list when the
/// chat screen goes away on logout, so the next user to sign in on this device
/// cannot see the previous user's conversation.
class ChatController extends AutoDisposeFamilyNotifier<ChatState, String> {
  StreamSubscription<SseEvent>? _sub;

  /// Riverpod 2's Notifier exposes no `mounted`, and both reading and writing
  /// `state` after disposal throw. Logging out mid-request is exactly that
  /// race, so every async continuation goes through [_update].
  bool _disposed = false;

  /// Held while a reply is arriving, so switching chats mid-answer and coming
  /// back finds it finished rather than lost.
  KeepAliveLink? _keepAlive;

  /// Set when the gateway moves this turn out of the coaching chat into one of
  /// its own. The switch happens at `done`, not here.
  String? _movedTo;

  @override
  ChatState build(String arg) {
    ref.onDispose(() {
      _disposed = true;
      _sub?.cancel();
      _keepAlive?.close();
    });
    // Fire-and-forget: the UI renders the loading state meanwhile.
    Future.microtask(loadHistory);
    return const ChatState(loading: true);
  }

  /// This chat's id.
  String get conversationId => arg;

  ApiClient get _api => ref.read(apiClientProvider);

  /// The only place `state` is touched. Returns false if the notifier is gone.
  bool _update(ChatState Function(ChatState current) transform) {
    if (_disposed) return false;
    state = transform(state);
    return true;
  }

  AppDatabase get _db => ref.read(databaseProvider);

  /// The cache first, so history is there with no connection, then the
  /// network — which also flushes anything queued while offline.
  Future<void> loadHistory() async {
    if (!_update((s) => s.copyWith(loading: true, clearError: true))) return;

    // The local store is the history — sync fills it, and this only reads it.
    // Fetching separately here was a second round trip for rows /sync already
    // carries, and it meant the screen could show an error for a conversation
    // it already had.
    final cached = await _readMessages();
    _update((s) => s.copyWith(
          messages: [for (final m in cached) _fromLocal(m)],
          loading: false,
        ));

    await ref.read(syncServiceProvider).sync();
    if (_disposed) return;
    final merged = await _readMessages();
    _update((s) => s.copyWith(messages: [for (final m in merged) _fromLocal(m)]));
  }

  /// This chat's messages.
  ///
  /// The coaching chat also shows messages with no chat of their own: rows
  /// cached before this app had chats, and anything typed offline before its
  /// chat reached the gateway. That is where the server files them, and it is
  /// what keeps a whole pre-upgrade history on screen until the re-pull
  /// redistributes it.
  Future<List<LocalMessage>> _readMessages() async {
    final chat = await _db.findConversation(arg);
    return _db
        .watchConversationMessages(arg, includeUnassigned: chat?.isCoaching ?? false)
        .first;
  }

  Future<void> send(String text) async {
    final trimmed = text.trim();
    if (_disposed || trimmed.isEmpty || state.streaming) return;

    final clientId = _uuid.v4();
    final composedAt = DateTime.now();

    // The chat row is written here rather than when the user tapped "New chat",
    // so one they open and abandon litters neither the list nor the gateway.
    // pendingOp stays null: /chat and /chat/batch both create by id, and the
    // pull brings the server's copy back — there is no create to push.
    if (await _db.findConversation(arg) == null) {
      await _db.upsertConversation(ConversationsCompanion.insert(
        id: arg,
        updatedAt: Value(composedAt),
        lastMessageAt: Value(composedAt),
      ));
    } else {
      await _db.bumpLastMessageAt(arg, composedAt);
    }
    if (_disposed) return;

    final userMessage =
        ChatMessage(role: 'user', content: trimmed, clientId: clientId);
    final assistant =
        ChatMessage(role: 'assistant', content: '', streaming: true);
    _update((s) => s.copyWith(
          messages: [...s.messages, userMessage, assistant],
          streaming: true,
          clearError: true,
        ));

    _keepAlive ??= ref.keepAlive();
    _sub?.cancel();
    _sub = _api.sendMessage(trimmed, conversationId: arg).listen(
      (event) {
        // 'heartbeat' keeps the connection open and 'intent' is diagnostic --
        // neither is ever rendered.
        if (event.event == 'token') {
          // ponytail: one rebuild per token. Fine at Ollama's token rate; if a
          // faster model ever makes this janky, buffer and flush on a ~50ms
          // timer instead.
          assistant.content += event.data;
          _update((s) => s.copyWith(messages: [...s.messages]));
        } else if (event.event == 'moved') {
          // The coaching chat is a track, not a general assistant: something
          // unrelated typed there is answered in a chat of its own. Recorded
          // now, acted on at `done` — switching mid-stream would show an empty
          // new chat while the reply was still arriving here.
          _movedTo = _conversationIdFrom(event.data);
        } else if (event.event == 'error') {
          _finish(error: 'The assistant is unavailable right now.');
        } else if (event.event == 'done') {
          // Both turns are already stored server-side; the sync pulls them
          // back with their ids. Caching copies here would give that pull
          // nothing to match and leave the history doubled.
          final moved = _movedTo;
          _finish();
          ref.read(syncServiceProvider).kick();
          if (moved != null) {
            _movedTo = null;
            ref.read(activeConversationProvider.notifier).select(moved);
          }
        }
      },
      onError: (Object e) {
        // Unreachable gateway is not a lost message: it goes to the outbox and
        // is delivered, with its original timestamp, when the network returns.
        if (e is ApiException && e.isOffline) {
          _queue(userMessage, composedAt);
          _dropStreamingBubble(assistant);
          _finish();
          return;
        }
        _finish(error: e is ApiException ? e.message : 'The reply stream failed.');
      },
      onDone: () {
        // Server closed without a `done` event (crash, tunnel drop).
        if (!_disposed && state.streaming) {
          _finish(error: 'The reply ended unexpectedly.');
        }
      },
      cancelOnError: true,
    );
  }

  /// Retries one queued message by handing the outbox back to the sync engine.
  void retryQueued() => ref.read(syncServiceProvider).kick();

  Future<void> _queue(ChatMessage message, DateTime composedAt) async {
    message.syncState = SyncStates.queued;
    await _db.insertMessage(ChatMessagesCompanion.insert(
      clientId: Value(message.clientId),
      conversationId: Value(arg),
      role: 'user',
      content: message.content,
      composedAt: composedAt,
      syncState: const Value(SyncStates.queued),
    ));
    _update((s) => s.copyWith(messages: [...s.messages]));
  }

  void _dropStreamingBubble(ChatMessage assistant) {
    _update((s) => s.copyWith(
          messages: [for (final m in s.messages) if (!identical(m, assistant)) m],
        ));
  }

  /// The `moved` event's payload is JSON on the wire; the parser hands it over
  /// as a string when it is not an object it recognises.
  String? _conversationIdFrom(String data) {
    try {
      final decoded = jsonDecode(data);
      if (decoded is Map && decoded['conversationId'] is String) {
        return decoded['conversationId'] as String;
      }
    } catch (_) {
      // Not JSON. Nothing to move to, so the turn simply stays where it is.
    }
    return null;
  }

  ChatMessage _fromLocal(LocalMessage row) => ChatMessage(
        id: row.serverId,
        clientId: row.clientId,
        conversationId: row.conversationId,
        role: row.role,
        content: row.content,
        createdAt: row.composedAt,
        syncState: row.syncState,
      );

  void _finish({String? error}) {
    _keepAlive?.close();
    _keepAlive = null;
    _update((s) {
      for (final m in s.messages) {
        m.streaming = false;
      }
      return s.copyWith(
        messages: [...s.messages],
        streaming: false,
        error: error,
      );
    });
  }

  void clearError() => _update((s) => s.copyWith(clearError: true));
}

final chatControllerProvider =
    NotifierProvider.autoDispose.family<ChatController, ChatState, String>(
        ChatController.new);
