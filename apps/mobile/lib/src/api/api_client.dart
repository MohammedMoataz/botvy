import 'dart:async';
import 'dart:convert';

import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

import 'models.dart';
import 'sse.dart';

/// Android emulator loopback to the host machine's gateway.
const String kDefaultBaseUrl = 'http://10.0.2.2:8080';

// ---------------------------------------------------------------------------
// Storage
// ---------------------------------------------------------------------------

/// JWTs, the signed-in email, and the server URL.
///
/// The base URL is not a secret, but it is one short string and
/// flutter_secure_storage is already here -- adding shared_preferences for it
/// would be a whole extra package for no gain.
class TokenStore {
  TokenStore(this._storage);

  final FlutterSecureStorage _storage;

  static const _kAccess = 'access_token';
  static const _kRefresh = 'refresh_token';
  static const _kEmail = 'account_email';
  static const _kBaseUrl = 'base_url';

  String? _accessCache;

  Future<String?> readAccess() async =>
      _accessCache ??= await _storage.read(key: _kAccess);

  Future<String?> readRefresh() => _storage.read(key: _kRefresh);

  Future<String?> readEmail() => _storage.read(key: _kEmail);

  Future<String> readBaseUrl() async =>
      (await _storage.read(key: _kBaseUrl)) ?? kDefaultBaseUrl;

  Future<void> writeBaseUrl(String url) =>
      _storage.write(key: _kBaseUrl, value: url);

  Future<void> saveTokens(TokenPair pair, {String? email}) async {
    _accessCache = pair.accessToken;
    await _storage.write(key: _kAccess, value: pair.accessToken);
    await _storage.write(key: _kRefresh, value: pair.refreshToken);
    if (email != null) await _storage.write(key: _kEmail, value: email);
  }

  Future<void> clearTokens() async {
    _accessCache = null;
    await _storage.delete(key: _kAccess);
    await _storage.delete(key: _kRefresh);
    await _storage.delete(key: _kEmail);
    // base URL deliberately survives logout.
  }
}

// ---------------------------------------------------------------------------
// Client
// ---------------------------------------------------------------------------

/// Thrown for anything the UI should show the user verbatim.
class ApiException implements Exception {
  ApiException(this.message, {this.statusCode, this.isOffline = false});

  final String message;
  final int? statusCode;

  /// The gateway could not be reached at all. Callers queue instead of failing:
  /// no connection is a normal state for this app, not an error.
  final bool isOffline;

  @override
  String toString() => message;
}

class ApiClient {
  ApiClient(this.tokens, {required String baseUrl})
      : dio = Dio(BaseOptions(
          baseUrl: baseUrl,
          connectTimeout: const Duration(seconds: 10),
          receiveTimeout: const Duration(seconds: 30),
          headers: {'Accept': 'application/json'},
        )) {
    dio.interceptors.add(QueuedInterceptorsWrapper(
      onRequest: (options, handler) async {
        final token = await tokens.readAccess();
        if (token != null) {
          options.headers['Authorization'] = 'Bearer $token';
        }
        handler.next(options);
      },
      onError: (err, handler) async {
        if (err.response?.statusCode != 401) {
          return handler.next(err);
        }
        // Refresh once per request. Without this, a 401 that survives a valid
        // refresh (a revoked account, say) loops forever: refresh, retry, 401,
        // refresh...
        if (err.requestOptions.extra['botvy_retried'] == true) {
          await tokens.clearTokens();
          onAuthLost?.call();
          return handler.next(err);
        }
        err.requestOptions.extra['botvy_retried'] = true;
        // ponytail: QueuedInterceptorsWrapper serialises onError, so two
        // concurrent 401s refresh one at a time rather than racing. Swap for an
        // explicit Completer lock only if a non-queued interceptor is ever needed.
        final refreshed = await _refresh();
        if (!refreshed) {
          await tokens.clearTokens();
          onAuthLost?.call();
          return handler.next(err);
        }
        try {
          final retried = await dio.fetch<dynamic>(err.requestOptions);
          return handler.resolve(retried);
        } on DioException catch (e) {
          return handler.next(e);
        }
      },
    ));
  }

  final Dio dio;
  final TokenStore tokens;

  /// Called when the refresh token is dead and the user must sign in again.
  void Function()? onAuthLost;

  String get baseUrl => dio.options.baseUrl;

  set baseUrl(String url) => dio.options.baseUrl = _normalise(url);

  static String _normalise(String url) {
    var u = url.trim();
    while (u.endsWith('/')) {
      u = u.substring(0, u.length - 1);
    }
    return u;
  }

  /// Rotates the token pair. Uses a bare Dio so a 401 on the refresh call
  /// cannot re-enter the interceptor above.
  Future<bool> _refresh() async {
    final refreshToken = await tokens.readRefresh();
    if (refreshToken == null) return false;
    try {
      final res = await Dio(BaseOptions(
        baseUrl: dio.options.baseUrl,
        connectTimeout: const Duration(seconds: 10),
        receiveTimeout: const Duration(seconds: 15),
      )).post(
        '/auth/refresh',
        data: {'refreshToken': refreshToken},
      );
      await tokens.saveTokens(
          TokenPair.fromJson(Map<String, dynamic>.from(res.data as Map)));
      return true;
    } on DioException {
      return false;
    }
  }

  // -- auth ----------------------------------------------------------------

  Future<Account> register(String email, String password,
      {String? displayName}) async {
    final res = await _guard(() => dio.post('/auth/register', data: {
          'email': email,
          'password': password,
          if (displayName != null && displayName.isNotEmpty)
            'displayName': displayName,
        }));
    return Account.fromJson(Map<String, dynamic>.from(res.data as Map));
  }

  Future<TokenPair> login(String email, String password) async {
    final res = await _guard(() => dio.post('/auth/login', data: {
          'email': email,
          'password': password,
        }));
    final pair = TokenPair.fromJson(Map<String, dynamic>.from(res.data as Map));
    await tokens.saveTokens(pair, email: email);
    return pair;
  }

  Future<void> logout() => tokens.clearTokens();

  // -- chat ----------------------------------------------------------------

  Future<List<ChatMessage>> history({int limit = 50}) async {
    final res = await _guard(
        () => dio.get('/chat/history', queryParameters: {'limit': '$limit'}));
    final rows = (res.data as List?) ?? const [];
    return rows
        .map((r) => ChatMessage.fromJson(Map<String, dynamic>.from(r as Map)))
        .toList();
  }

  /// Streams `POST /chat`. Yields every SSE event; the caller decides which
  /// ones to render (heartbeats are noise and must be dropped).
  Stream<SseEvent> sendMessage(String message, {String? conversationId}) async* {
    final Response<dynamic> res;
    try {
      res = await dio.post<dynamic>(
        '/chat',
        // An id the gateway has never seen is created there, so a chat started
        // offline can carry a message before the sync that would have created
        // it has run.
        data: {'message': message, if (conversationId != null) 'conversationId': conversationId},
        options: Options(
          responseType: ResponseType.stream,
          headers: {'Accept': 'text/event-stream'},
          // Heartbeats arrive every 15s; this only trips if the server dies.
          receiveTimeout: const Duration(minutes: 10),
        ),
      );
    } on DioException catch (e) {
      throw _translate(e);
    }

    final body = res.data as ResponseBody;
    final parser = SseParser();
    // utf8.decoder (not utf8.decode per chunk) so a multi-byte character split
    // across two network chunks is reassembled instead of mangled.
    await for (final text in utf8.decoder.bind(body.stream)) {
      for (final event in parser.add(text)) {
        yield event;
      }
    }
  }

  // -- reminders -----------------------------------------------------------

  /// Every status. `?status=active|done|cancelled` exists but the screen shows
  /// the lot, so there is nothing to filter with yet.
  Future<List<Reminder>> reminders() async {
    final res = await _guard(() => dio.get('/reminders'));
    final rows = (res.data as List?) ?? const [];
    return rows
        .map((r) => Reminder.fromJson(Map<String, dynamic>.from(r as Map)))
        .toList();
  }

  /// [clientId] makes the call idempotent: a create whose response was lost
  /// can be retried without producing a second reminder.
  Future<Reminder> createReminder({
    required String title,
    required DateTime remindAt,
    List<String>? leadTimes,
    String? clientId,
  }) async {
    final res = await _guard(() => dio.post('/reminders', data: {
          'title': title,
          'remindAt': remindAt.toUtc().toIso8601String(),
          // A lead time already in the past is dropped server-side, which is
          // expected, not an error.
          if (leadTimes != null) 'leadTimes': leadTimes,
          if (clientId != null) 'clientId': clientId,
        }));
    return Reminder.fromJson(Map<String, dynamic>.from(res.data as Map));
  }

  /// Changing the time or the lead times re-plans the pings server-side.
  Future<Reminder> updateReminder(
    String id, {
    String? title,
    DateTime? remindAt,
    List<String>? leadTimes,
    String? status,
  }) async {
    final res = await _guard(() => dio.patch('/reminders/$id', data: {
          if (title != null) 'title': title,
          if (remindAt != null) 'remindAt': remindAt.toUtc().toIso8601String(),
          if (leadTimes != null) 'leadTimes': leadTimes,
          if (status != null) 'status': status,
        }));
    return Reminder.fromJson(Map<String, dynamic>.from(res.data as Map));
  }

  /// Cancelling also drops the reminder's unsent notifications, server-side.
  /// Someone else's id answers 404, never 403 -- see [ApiException.statusCode].
  Future<Reminder> cancelReminder(String id) =>
      updateReminder(id, status: 'cancelled');

  /// Permanent. Used only on reminders the user already finished or cancelled.
  Future<void> deleteReminder(String id) async {
    await _guard(() => dio.delete('/reminders/$id'));
  }

  // -- offline flush ---------------------------------------------------------

  /// Delivers messages composed offline. Idempotent per `clientId`, so an
  /// interrupted flush is retried whole rather than reconciled.
  Future<ChatBatchResult> sendQueued(List<QueuedMessage> queued) async {
    final res = await _guard(() => dio.post('/chat/batch', data: {
          'messages': [
            for (final m in queued)
              {
                'clientId': m.clientId,
                'text': m.text,
                'composedAt': m.composedAt.toUtc().toIso8601String(),
                if (m.conversationId != null) 'conversationId': m.conversationId,
              },
          ],
        }));
    return ChatBatchResult.fromJson(Map<String, dynamic>.from(res.data as Map));
  }

  // -- devices ---------------------------------------------------------------

  /// Registers this device for push and refreshes its last-seen time, which is
  /// what tells the gateway this phone already holds the upcoming alarms.
  Future<void> registerDevice({
    required String installId,
    required String platform,
    String? fcmToken,
  }) async {
    await _guard(() => dio.post('/devices', data: {
          'installId': installId,
          'platform': platform,
          if (fcmToken != null) 'fcmToken': fcmToken,
        }));
  }

  Future<void> unregisterDevice(String installId) async {
    await _guard(() => dio.delete('/devices/$installId'));
  }

  // -- sync ------------------------------------------------------------------

  /// One round trip in both directions.
  ///
  /// [since] is whatever the last response called `now` — a server timestamp,
  /// passed back verbatim and never parsed, so a wrong device clock cannot
  /// corrupt the cursor. Omitting it asks for a full snapshot.
  Future<SyncResult> sync({
    String? since,
    int? lastMessageId,
    String? installId,
    List<Map<String, dynamic>> reminders = const [],
    List<Map<String, dynamic>> conversations = const [],
    Map<String, dynamic>? profile,
  }) async {
    final res = await _guard(() => dio.post('/sync', data: {
          if (since != null) 'since': since,
          if (lastMessageId != null) 'lastMessageId': lastMessageId,
          if (installId != null) 'installId': installId,
          'push': {
            if (reminders.isNotEmpty) 'reminders': reminders,
            if (conversations.isNotEmpty) 'conversations': conversations,
            if (profile != null) 'profile': profile,
          },
        }));
    return SyncResult.fromJson(Map<String, dynamic>.from(res.data as Map));
  }

  // -- settings & coaching ---------------------------------------------------

  /// Server-side defaults, so the app stops carrying its own copies.
  Future<ServerDefaults> defaults() async {
    final res = await _guard(() => dio.get('/settings/defaults'));
    return ServerDefaults.fromJson(Map<String, dynamic>.from(res.data as Map));
  }

  Future<CoachingProfile?> coachingProfile() async {
    final res = await _guard(() => dio.get('/coaching/profile'));
    final data = res.data;
    if (data is! Map) return null;
    return CoachingProfile.fromJson(Map<String, dynamic>.from(data));
  }

  Future<CoachingProfile> updateCoachingProfile(Map<String, dynamic> patch) async {
    final res = await _guard(() => dio.patch('/coaching/profile', data: patch));
    return CoachingProfile.fromJson(Map<String, dynamic>.from(res.data as Map));
  }

  // -- health --------------------------------------------------------------

  Future<HealthStatus> health() async {
    final res = await _guard(() => dio.get('/health'));
    return HealthStatus.fromJson(Map<String, dynamic>.from(res.data as Map));
  }

  // -- error plumbing ------------------------------------------------------

  Future<Response<dynamic>> _guard(
      Future<Response<dynamic>> Function() call) async {
    try {
      return await call();
    } on DioException catch (e) {
      throw _translate(e);
    }
  }

  ApiException _translate(DioException e) {
    final status = e.response?.statusCode;
    final data = e.response?.data;
    if (data is Map) {
      final reason = data['reason'] ?? data['message'];
      if (reason is String) return ApiException(reason, statusCode: status);
      if (reason is List && reason.isNotEmpty) {
        return ApiException(reason.join('\n'), statusCode: status);
      }
    }
    if (status == 401) {
      return ApiException('Invalid email or password.', statusCode: 401);
    }
    if (status == 429) {
      return ApiException('Rate limit or daily quota reached.',
          statusCode: 429);
    }
    if (e.type == DioExceptionType.connectionError ||
        e.type == DioExceptionType.connectionTimeout) {
      return ApiException(
          'Cannot reach the gateway at ${dio.options.baseUrl}. '
          'Tap the server icon in the top bar to change it. '
          '10.0.2.2 only works on the Android emulator — a real phone needs '
          "this machine's address on your network, or a tunnel URL.",
          statusCode: status,
          isOffline: true);
    }
    return ApiException(e.message ?? 'Request failed.', statusCode: status);
  }
}

// ---------------------------------------------------------------------------
// Providers
// ---------------------------------------------------------------------------

/// Shared instance so main() can read persisted state before the ProviderScope
/// exists without standing up a throwaway container.
const kSecureStorage = FlutterSecureStorage(
  aOptions: AndroidOptions(encryptedSharedPreferences: true),
);

final secureStorageProvider =
    Provider<FlutterSecureStorage>((ref) => kSecureStorage);

final tokenStoreProvider =
    Provider<TokenStore>((ref) => TokenStore(ref.watch(secureStorageProvider)));

/// Overridden in main() with the persisted value so the rest of the app can
/// read the base URL synchronously.
final initialBaseUrlProvider = Provider<String>(
  (ref) => throw UnimplementedError('overridden in main()'),
);

final apiClientProvider = Provider<ApiClient>((ref) => ApiClient(
      ref.watch(tokenStoreProvider),
      baseUrl: ref.watch(initialBaseUrlProvider),
    ));

/// Settings screen health indicator.
final healthProvider = FutureProvider.autoDispose<HealthStatus>(
  (ref) => ref.watch(apiClientProvider).health(),
);
