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
  ApiException(this.message, {this.statusCode});

  final String message;
  final int? statusCode;

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
  Stream<SseEvent> sendMessage(String message) async* {
    final Response<dynamic> res;
    try {
      res = await dio.post<dynamic>(
        '/chat',
        data: {'message': message},
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

  Future<Reminder> createReminder({
    required String title,
    required DateTime remindAt,
  }) async {
    final res = await _guard(() => dio.post('/reminders', data: {
          'title': title,
          'remindAt': remindAt.toUtc().toIso8601String(),
          // Fixed defaults -- the UI has no lead-time editor. A lead time
          // already in the past is dropped server-side, which is expected.
          'leadTimes': const ['1h', '0m'],
        }));
    return Reminder.fromJson(Map<String, dynamic>.from(res.data as Map));
  }

  /// Cancelling also drops the reminder's unsent notifications, server-side.
  /// Someone else's id answers 404, never 403 -- see [ApiException.statusCode].
  Future<Reminder> cancelReminder(String id) async {
    final res = await _guard(
        () => dio.patch('/reminders/$id', data: {'status': 'cancelled'}));
    return Reminder.fromJson(Map<String, dynamic>.from(res.data as Map));
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
          statusCode: status);
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
