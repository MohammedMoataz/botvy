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
      socket.on('auth.expiring', (_) => unawaited(_reauthenticate()));

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
    if (code == 'unauthorized' || code == 'token_expired') {
      unawaited(_reauthenticate());
      return;
    }
    debugPrint('socket connect error: $error');
  }

  void _onDisconnect(dynamic reason) {
    if (reason == 'token_expired') {
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
