import 'package:dio/dio.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

/// Where a fresh install looks for the gateway, before anyone opens Settings.
///
/// Injected at build time so a release can carry whatever hostname the tunnel
/// is actually serving:
///
/// ```
/// flutter build apk --release --dart-define=BOTVY_BASE_URL=https://your.host
/// ```
///
/// It is only the *first* value: the URL lives in secure storage from the
/// moment the user sets one, so a build with the wrong default is corrected on
/// the device rather than needing a new APK. Falls back to the Android
/// emulator's loopback to the host machine, which is what a developer wants.
const String kDefaultBaseUrl = String.fromEnvironment(
  'BOTVY_BASE_URL',
  defaultValue: 'http://10.0.2.2:8080',
);

/// Every command lives under one prefix; GraphQL is `/graphql` and the socket
/// is `/ws`, both off the same origin.
const String kApiPrefix = '/api/v1';

/// Shared instance so `main()` can read persisted state before the container
/// exists without standing up a throwaway one.
const FlutterSecureStorage kSecureStorage = FlutterSecureStorage(
  aOptions: AndroidOptions(encryptedSharedPreferences: true),
);

/// What the gateway hands back on sign-in and on refresh.
class TokenPair {
  const TokenPair({required this.accessToken, required this.refreshToken});

  factory TokenPair.fromJson(Map<String, dynamic> json) => TokenPair(
    accessToken: json['accessToken'] as String,
    refreshToken: json['refreshToken'] as String,
  );

  final String accessToken;
  final String refreshToken;
}

/// JWTs, the signed-in email, and the server URL.
///
/// The base URL is not a secret, but it is one short string and
/// flutter_secure_storage is already here — adding a second storage package
/// for it would be a whole extra dependency for no gain.
class TokenStore {
  TokenStore(this._storage);

  final FlutterSecureStorage _storage;

  static const String _kAccess = 'access_token';
  static const String _kRefresh = 'refresh_token';
  static const String _kEmail = 'account_email';
  static const String _kBaseUrl = 'base_url';

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

/// Thrown for anything the UI should show the user verbatim.
class ApiException implements Exception {
  ApiException(this.message, {this.statusCode, this.isOffline = false});

  final String message;
  final int? statusCode;

  /// The gateway could not be reached at all. Callers queue instead of
  /// failing: no connection is a normal state for this app, not an error.
  final bool isOffline;

  @override
  String toString() => message;
}

class ApiClient {
  ApiClient(this.tokens, {required String baseUrl})
    : _origin = normaliseBaseUrl(baseUrl),
      dio = Dio(
        BaseOptions(
          baseUrl: '${normaliseBaseUrl(baseUrl)}$kApiPrefix',
          connectTimeout: const Duration(seconds: 10),
          receiveTimeout: const Duration(seconds: 30),
          headers: {'Accept': 'application/json'},
        ),
      ) {
    dio.interceptors.add(
      QueuedInterceptorsWrapper(
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
          // concurrent 401s refresh one at a time rather than racing. Swap for
          // an explicit Completer lock only if a non-queued interceptor is ever
          // needed.
          final refreshed = await refreshSession();
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
      ),
    );
  }

  final Dio dio;
  final TokenStore tokens;

  String _origin;

  /// Called when the refresh token is dead and the user must sign in again.
  void Function()? onAuthLost;

  /// The scheme+host the server is served from — what the socket connects to.
  String get origin => _origin;

  set origin(String url) {
    _origin = normaliseBaseUrl(url);
    dio.options.baseUrl = '$_origin$kApiPrefix';
  }

  static String normaliseBaseUrl(String url) {
    var u = url.trim();
    while (u.endsWith('/')) {
      u = u.substring(0, u.length - 1);
    }
    return u;
  }

  /// Rotates the token pair. Uses a bare Dio so a 401 on the refresh call
  /// cannot re-enter the interceptor above. Public because the socket needs a
  /// fresh access token after `token_expired`, with no REST call to trigger
  /// one.
  Future<bool> refreshSession() async {
    final refreshToken = await tokens.readRefresh();
    if (refreshToken == null) return false;
    try {
      final res = await Dio(
        BaseOptions(
          baseUrl: dio.options.baseUrl,
          connectTimeout: const Duration(seconds: 10),
          receiveTimeout: const Duration(seconds: 15),
        ),
      ).post<dynamic>('/auth/refresh', data: {'refreshToken': refreshToken});
      await tokens.saveTokens(
        TokenPair.fromJson(Map<String, dynamic>.from(res.data as Map)),
      );
      return true;
    } on DioException {
      return false;
    }
  }

  // -- auth ------------------------------------------------------------------

  Future<TokenPair> login(String email, String password) async {
    final res = await _guard(
      () => dio.post<dynamic>(
        '/auth/login',
        data: {'email': email, 'password': password},
      ),
    );
    final pair = TokenPair.fromJson(Map<String, dynamic>.from(res.data as Map));
    await tokens.saveTokens(pair, email: email);
    return pair;
  }

  Future<void> logout() => tokens.clearTokens();

  // -- devices ---------------------------------------------------------------

  /// Registers this device for push and refreshes its last-seen time, which is
  /// what tells the server this phone already holds the upcoming alarms.
  Future<void> registerDevice({
    required String installId,
    required String platform,
    String? fcmToken,
  }) async {
    await _guard(
      () => dio.post<dynamic>(
        '/devices',
        data: {
          'installId': installId,
          'platform': platform,
          if (fcmToken != null) 'fcmToken': fcmToken,
        },
      ),
    );
  }

  Future<void> unregisterDevice(String installId) async {
    await _guard(() => dio.delete<dynamic>('/devices/$installId'));
  }

  // -- health ----------------------------------------------------------------

  /// The reachability indicator. `/health` is public, so it answers before
  /// there is a session.
  Future<Map<String, dynamic>> health() async {
    final res = await _guard(() => dio.get<dynamic>('/health'));
    return Map<String, dynamic>.from(res.data as Map);
  }

  // -- error plumbing --------------------------------------------------------

  Future<Response<dynamic>> _guard(
    Future<Response<dynamic>> Function() call,
  ) async {
    try {
      return await call();
    } on DioException catch (e) {
      throw translate(e);
    }
  }

  ApiException translate(DioException e) {
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
      return ApiException(
        'Rate limit or daily quota reached.',
        statusCode: 429,
      );
    }
    if (e.type == DioExceptionType.connectionError ||
        e.type == DioExceptionType.connectionTimeout) {
      return ApiException(
        'Cannot reach the server at $_origin. 10.0.2.2 only works on the '
        "Android emulator — a real phone needs this machine's address on your "
        'network, or a tunnel URL.',
        statusCode: status,
        isOffline: true,
      );
    }
    return ApiException(e.message ?? 'Request failed.', statusCode: status);
  }
}
