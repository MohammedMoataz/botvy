import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../api/api_client.dart';
import '../../api/models.dart';
import '../../api/sse.dart';

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

/// autoDispose is load-bearing, not tidiness: it wipes the message list when
/// the chat screen goes away on logout, so the next user to sign in on this
/// device cannot see the previous user's conversation.
class ChatController extends AutoDisposeNotifier<ChatState> {
  StreamSubscription<SseEvent>? _sub;

  /// Riverpod 2's Notifier exposes no `mounted`, and both reading and writing
  /// `state` after disposal throw. Logging out mid-request is exactly that
  /// race, so every async continuation goes through [_update].
  bool _disposed = false;

  @override
  ChatState build() {
    ref.onDispose(() {
      _disposed = true;
      _sub?.cancel();
    });
    // Fire-and-forget: the UI renders the loading state meanwhile.
    Future.microtask(loadHistory);
    return const ChatState(loading: true);
  }

  ApiClient get _api => ref.read(apiClientProvider);

  /// The only place `state` is touched. Returns false if the notifier is gone.
  bool _update(ChatState Function(ChatState current) transform) {
    if (_disposed) return false;
    state = transform(state);
    return true;
  }

  Future<void> loadHistory() async {
    if (!_update((s) => s.copyWith(loading: true, clearError: true))) return;
    try {
      final messages = await _api.history();
      _update((s) => s.copyWith(messages: messages, loading: false));
    } on ApiException catch (e) {
      _update((s) => s.copyWith(loading: false, error: e.message));
    }
  }

  void send(String text) {
    final trimmed = text.trim();
    if (_disposed || trimmed.isEmpty || state.streaming) return;

    final assistant =
        ChatMessage(role: 'assistant', content: '', streaming: true);
    _update((s) => s.copyWith(
          messages: [
            ...s.messages,
            ChatMessage(role: 'user', content: trimmed),
            assistant,
          ],
          streaming: true,
          clearError: true,
        ));

    _sub?.cancel();
    _sub = _api.sendMessage(trimmed).listen(
      (event) {
        // 'heartbeat' keeps the connection open and 'intent' is diagnostic --
        // neither is ever rendered.
        if (event.event == 'token') {
          // ponytail: one rebuild per token. Fine at Ollama's token rate; if a
          // faster model ever makes this janky, buffer and flush on a ~50ms
          // timer instead.
          assistant.content += event.data;
          _update((s) => s.copyWith(messages: [...s.messages]));
        } else if (event.event == 'error') {
          _finish(error: 'The assistant is unavailable right now.');
        } else if (event.event == 'done') {
          _finish();
        }
      },
      onError: (Object e) => _finish(
          error: e is ApiException ? e.message : 'The reply stream failed.'),
      onDone: () {
        // Server closed without a `done` event (crash, tunnel drop).
        if (!_disposed && state.streaming) {
          _finish(error: 'The reply ended unexpectedly.');
        }
      },
      cancelOnError: true,
    );
  }

  void _finish({String? error}) {
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
    NotifierProvider.autoDispose<ChatController, ChatState>(ChatController.new);
