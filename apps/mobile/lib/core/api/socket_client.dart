import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:socket_io_client/socket_io_client.dart' as io;

import '../db/database.dart';
import 'api_client.dart';

/// The one real-time connection: chat streaming and server-initiated nudges
/// ride the same socket.
///
/// New code, not a port. v1 streamed one chat turn per `POST /chat` over
/// Server-Sent Events, which cannot carry anything the user did not ask for;
/// v2's contract (`ws-chat.md`) is Socket.IO at `/ws` with the access token in
/// the handshake `auth` payload — never a query string, which lands in server
/// logs and proxy access logs.
class SocketClient {
  SocketClient(this._api, this._db);

  final ApiClient _api;
  final AppDatabase _db;

  io.Socket? _socket;
  bool _opening = false;

  /// Listeners survive a reconnect. The socket is thrown away and rebuilt with
  /// a fresh token when one expires, so anything registered on the old
  /// instance would silently stop firing.
  final Map<String, List<void Function(dynamic)>> _listeners = {};

  bool get isConnected => _socket?.connected ?? false;

  /// Registers a handler for a server event, now and after every reconnect.
  void on(String event, void Function(dynamic data) handler) {
    _listeners.putIfAbsent(event, () => []).add(handler);
    _socket?.on(event, handler);
  }

  /// Removes a handler [on] registered, from the live socket **and** from the
  /// replay map.
  ///
  /// Needed because [_listeners] is what survives a reconnect: a handler taken
  /// off the socket alone comes straight back the next time the token is
  /// refreshed, and the object it closed over — a `Cubit` that has since been
  /// closed — is then emitted into. The chat cubit registers nine of these on
  /// every screen it opens, so without this the map grows for the life of the
  /// process and every frame is delivered to every chat the member has ever
  /// looked at.
  void off(String event, void Function(dynamic data) handler) {
    final handlers = _listeners[event];
    if (handlers == null) return;
    handlers.remove(handler);
    if (handlers.isEmpty) _listeners.remove(event);
    _socket?.off(event, handler);
  }

  /// Fire-and-forget, and silently dropped when there is no connection.
  ///
  /// Deliberately silent rather than throwing or queueing: every caller in this
  /// application already has a local record of what it was trying to say — the
  /// chat writes a `pending_messages` row before it emits `chat.send` — so a
  /// second queue here would be a second source of truth about the same
  /// sentence, and the one the member cannot see is the one that would get it
  /// wrong. Callers check [isConnected] when they need to know.
  void emit(String event, [Object? data]) => _socket?.emit(event, data);

  /// Optional keepalive; the ack carries the server's clock.
  void presencePing() => emit('presence.ping', <String, dynamic>{});

  /// Opens the connection, or does nothing if one is already open or opening.
  Future<void> connect() async {
    if (_opening || isConnected) return;
    _opening = true;
    try {
      final token = await _api.tokens.readAccess();
      if (token == null) return; // nothing to authenticate with yet
      final installId = await stableInstallId(_db);

      final socket = io.io(
        _api.origin,
        io.OptionBuilder()
            .setPath('/ws')
            // The default polling upgrade doubles the handshake and needs
            // sticky sessions behind the edge. One transport, one hop.
            .setTransports(['websocket'])
            .disableAutoConnect()
            .setAuth({'token': token, 'installId': installId})
            .build(),
      );

      socket.onConnectError(_onConnectError);
      socket.onDisconnect(_onDisconnect);
      // The server warns 60s before the access token dies. Renewing here means
      // the socket is rebuilt at a moment of our choosing rather than dropped
      // mid-turn.
      socket.on(ChatFrames.authExpiring, (_) => unawaited(_reauthenticate()));
      // And the same again for the drop itself, as an event rather than as a
      // disconnect reason. Both spellings are handled because the reason is
      // not reliably ours: Socket.IO synthesises its own strings for a
      // transport that simply died ('transport close', 'ping timeout'), and a
      // server-side `disconnect(reason)` does not always survive the trip. A
      // client that cannot tell "your token expired" from "the wifi went"
      // reconnects in a loop with the same dead token, which is the exact
      // failure this pair of handlers exists to stop.
      socket.on(
        ChatFrames.tokenExpired,
        (_) => unawaited(_reauthenticate()),
      );

      _listeners.forEach((event, handlers) {
        for (final handler in handlers) {
          socket.on(event, handler);
        }
      });

      _socket = socket;
      socket.connect();
    } finally {
      _opening = false;
    }
  }

  void _onConnectError(dynamic error) {
    // `{ code: 'unauthorized' }` means the token was rejected at the
    // handshake: refresh and rebuild rather than retrying the dead credential
    // forever, which is what Socket.IO's own backoff would do.
    final code = error is Map ? error['code'] : null;
    if (code == 'unauthorized' || code == ChatFrames.tokenExpired) {
      unawaited(_reauthenticate());
      return;
    }
    debugPrint('socket connect error: $error');
  }

  void _onDisconnect(dynamic reason) {
    if (reason == ChatFrames.tokenExpired) {
      unawaited(_reauthenticate());
    }
  }

  /// Rebuilds the connection around a fresh access token. A dead refresh token
  /// leaves the socket closed; `ApiClient.onAuthLost` takes the user to
  /// sign-in.
  Future<void> _reauthenticate() async {
    disconnect();
    if (!await _api.refreshSession()) return;
    await connect();
  }

  void disconnect() {
    _socket?.dispose();
    _socket = null;
  }
}

/// Every frame name `contracts/ws-chat.md` defines, in one place.
///
/// Constants and not string literals at the call sites, because the emitter and
/// the listener for one frame live in different files — the cubit sends
/// `chat.cancel` and the server's answer arrives through a handler registered
/// in the same cubit — and a typo in one of the two halves is a feature that
/// silently does nothing. There is no compiler check on a Socket.IO event name;
/// this is the closest thing available.
abstract final class ChatFrames {
  // -- client -> server -----------------------------------------------------

  static const String send = 'chat.send';
  static const String cancel = 'chat.cancel';

  // -- server -> client, one turn, in order ---------------------------------

  /// The member's own message was stored, with the `seq` it took.
  static const String accepted = 'chat.accepted';

  /// What the extraction understood. Arrives before any token.
  static const String intent = 'chat.intent';

  /// The turn was off-topic for a pinned chat and has been moved to a new one
  /// **before** the reply streams. FR-008.
  static const String moved = 'chat.moved';

  static const String token = 'chat.token';

  /// A structured list answer: the tappable rows FR-016 requires instead of a
  /// paragraph.
  static const String card = 'chat.card';

  /// Every 15 s while the model is silent, so a long think does not look like
  /// a dead connection.
  static const String heartbeat = 'chat.heartbeat';

  static const String done = 'chat.done';
  static const String error = 'chat.error';

  // -- server -> client, unsolicited ----------------------------------------

  /// Botvy writing into the coach chat by itself: the evening prompt, the
  /// end-of-day summary, the morning briefing, the check-in question (FR-017).
  /// The `kind` discriminator says which, and it is routing rather than stored
  /// state — a client that was offline routes from the notification's deep link
  /// instead.
  static const String message = 'chat.message';

  /// Another of the member's clients pushed something, or a server job changed
  /// their data. Handled by `SyncEngine.watch`, which debounces it into a pass —
  /// so the chat gets a message written from the browser without a screen
  /// having to ask for it.
  static const String nudge = 'sync.nudge';

  /// 60 s before the access token dies. See [SocketClient.connect].
  static const String authExpiring = 'auth.expiring';

  /// The server's own reason string when it drops a socket whose token has
  /// died, delivered both as a disconnect reason and — on gateways that send it
  /// — as an event of its own.
  static const String tokenExpired = 'token_expired';
}
