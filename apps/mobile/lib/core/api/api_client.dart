import 'package:dio/dio.dart';
import 'package:flutter/foundation.dart' show TargetPlatform, defaultTargetPlatform;
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

/// Why a URL the member typed cannot be used. The screen turns each of these
/// into a sentence in their language; the client does not know their language.
enum UrlProblem { empty, notAUrl, scheme, hasPath }

/// What answered at a URL, or did not.
class GatewayProbe {
  const GatewayProbe.reachable({required this.version, required this.degraded})
    : outcome = ProbeOutcome.reachable;

  /// Nothing answered: wrong host, wrong port, no network, tunnel down.
  const GatewayProbe.unreachable()
    : outcome = ProbeOutcome.unreachable,
      version = null,
      degraded = false;

  /// Something answered, but it was not this application. Told apart from
  /// unreachable on purpose: it means the URL is *nearly* right, which is a
  /// different thing to go and check.
  const GatewayProbe.notBotvy()
    : outcome = ProbeOutcome.notBotvy,
      version = null,
      degraded = false;

  final ProbeOutcome outcome;
  final String? version;

  /// The gateway answered and reported itself degraded. Saved anyway: a
  /// degraded platform is still the right address, and refusing to save would
  /// leave the member unable to point the app anywhere while it recovers.
  final bool degraded;

  bool get ok => outcome == ProbeOutcome.reachable;
}

enum ProbeOutcome { reachable, unreachable, notBotvy }

/// Shared instance so `main()` can read persisted state before the container
/// exists without standing up a throwaway one.
// flutter_secure_storage 10 removed `encryptedSharedPreferences`: encrypted
// storage is the only mode now, so the option no longer exists to ask for.
const FlutterSecureStorage kSecureStorage = FlutterSecureStorage();

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

/// A sign-in, which is more than a token pair.
///
/// [mustChangePassword] is true while the account still holds the seeded
/// default. Reported rather than enforced: refusing to continue would leave
/// somebody with no way to reach the screen that fixes it.
class Session {
  const Session({
    required this.tokens,
    required this.userId,
    required this.email,
    required this.role,
    required this.deviceId,
    required this.mustChangePassword,
  });

  factory Session.fromJson(Map<String, dynamic> json) => Session(
    tokens: TokenPair.fromJson(json),
    userId: json['userId'] as String,
    email: json['email'] as String,
    role: json['role'] as String? ?? 'user',
    deviceId: json['deviceId'] as String?,
    mustChangePassword: json['mustChangePassword'] as bool? ?? false,
  );

  final TokenPair tokens;
  final String userId;
  final String email;
  final String role;
  final String? deviceId;
  final bool mustChangePassword;
}

/// The three operations [TokenStore] needs from a keystore.
///
/// A port, and the reason is concrete rather than architectural: a test cannot
/// use `flutter_secure_storage` — it needs a platform channel — and subclassing
/// it instead breaks on every major version, because the option types in its
/// method signatures get renamed (`IOSOptions` became `AppleOptions` in 11).
/// Three methods that will never change are a better seam than six named
/// parameters that do.
abstract interface class SecretStore {
  Future<String?> read(String key);
  Future<void> write(String key, String value);
  Future<void> delete(String key);
}

/// The real one.
class SecureSecretStore implements SecretStore {
  const SecureSecretStore(this._storage);

  final FlutterSecureStorage _storage;

  @override
  Future<String?> read(String key) => _storage.read(key: key);

  @override
  Future<void> write(String key, String value) =>
      _storage.write(key: key, value: value);

  @override
  Future<void> delete(String key) => _storage.delete(key: key);
}

/// In memory, for tests. Here rather than in the test file so every test that
/// needs one shares the same behaviour.
class InMemorySecretStore implements SecretStore {
  final Map<String, String> values = {};

  @override
  Future<String?> read(String key) async => values[key];

  @override
  Future<void> write(String key, String value) async => values[key] = value;

  @override
  Future<void> delete(String key) async => values.remove(key);
}

/// JWTs, the signed-in email, and the server URL.
///
/// The base URL is not a secret, but it is one short string and the keystore is
/// already here — adding a second storage package for it would be a whole
/// extra dependency for no gain.
class TokenStore {
  TokenStore(this._storage);

  final SecretStore _storage;

  static const String _kAccess = 'access_token';
  static const String _kRefresh = 'refresh_token';
  static const String _kEmail = 'account_email';
  static const String _kBaseUrl = 'base_url';

  String? _accessCache;

  Future<String?> readAccess() async =>
      _accessCache ??= await _storage.read(_kAccess);

  Future<String?> readRefresh() => _storage.read(_kRefresh);

  Future<String?> readEmail() => _storage.read(_kEmail);

  Future<String> readBaseUrl() async =>
      (await _storage.read(_kBaseUrl)) ?? kDefaultBaseUrl;

  Future<void> writeBaseUrl(String url) =>
      _storage.write(_kBaseUrl, url);

  Future<void> saveTokens(TokenPair pair, {String? email}) async {
    _accessCache = pair.accessToken;
    await _storage.write(_kAccess, pair.accessToken);
    await _storage.write(_kRefresh, pair.refreshToken);
    if (email != null) await _storage.write(_kEmail, email);
  }

  Future<void> clearTokens() async {
    _accessCache = null;
    await _storage.delete(_kAccess);
    await _storage.delete(_kRefresh);
    await _storage.delete(_kEmail);
    // base URL deliberately survives logout.
  }
}

/// Thrown for anything the UI should show the user verbatim.
class ApiException implements Exception {
  ApiException(
    this.message, {
    this.statusCode,
    this.isOffline = false,
    this.linkEmail,
  });

  final String message;
  final int? statusCode;

  /// The gateway could not be reached at all. Callers queue instead of
  /// failing: no connection is a normal state for this app, not an error.
  final bool isOffline;

  /// Set when a Google sign-in collided with a password account.
  ///
  /// Carried rather than folded into the message, because the caller has
  /// something to *do* with it: ask for that account's password and finish the
  /// link. A member who is only told "already exists" registers again with a
  /// typo in the address.
  final String? linkEmail;

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

  /// Why a typed URL cannot be used, or null when it can.
  ///
  /// Not a regular expression. What Dio actually needs is a scheme it can dial
  /// and a host to dial it at, and `Uri.parse` answers both — where a pattern
  /// permissive enough for `https://192.168.1.7:8080` and a Cloudflare
  /// hostname either lets `my.host` through, which fails later as a mangled
  /// relative path, or rejects something legitimate.
  static UrlProblem? validateBaseUrl(String url) {
    final trimmed = url.trim();
    if (trimmed.isEmpty) return UrlProblem.empty;

    // Checked on the trimmed string, not the normalised one: normalising
    // strips every trailing slash, which turns a bare `http://` into `http:`
    // and would report a missing scheme for the one input that has nothing but
    // a scheme.
    //
    // The scheme is checked textually and first, before anything is parsed.
    // A person typing an address leaves it off far more often than they get
    // anything else wrong, and `Uri` is no help in spotting that: it puts
    // `botvy.example.com` entirely in `path` with an empty `host`, and
    // `tryParse('192.168.1.7:8080')` returns null outright, because a scheme
    // may not begin with a digit. Both would be reported as "not an address"
    // when the fix is one prefix.
    //
    // Missing and unusable are the same problem here, deliberately: they
    // produce the same sentence, and that sentence is the whole fix.
    if (!trimmed.startsWith('http://') && !trimmed.startsWith('https://')) {
      return UrlProblem.scheme;
    }

    final uri = Uri.tryParse(normaliseBaseUrl(trimmed));
    if (uri == null || uri.host.isEmpty) return UrlProblem.notAUrl;

    // A path would be appended to by `/api/v1` and `/ws` and break both. The
    // edge serves the whole platform from one origin, so there is nothing a
    // path here could usefully mean.
    if (uri.path.isNotEmpty) return UrlProblem.hasPath;

    return null;
  }

  /// Whether a gateway answers at [url], asked before anything is saved.
  ///
  /// `GET /health` and not a sign-in attempt: it is public, it needs no
  /// credentials, and it is the one endpoint that can tell "this is a Botvy
  /// gateway" from "this is a web server that returned a page". Without it the
  /// only way to discover a wrong URL is a failed sign-in, which looks exactly
  /// like a wrong password.
  ///
  /// A bare Dio, on the given origin rather than this client's: the point is
  /// to check a URL the member has not committed to yet.
  static Future<GatewayProbe> probeGateway(String url) async {
    if (validateBaseUrl(url) != null) return const GatewayProbe.unreachable();

    try {
      final res = await Dio(
        BaseOptions(
          baseUrl: normaliseBaseUrl(url),
          connectTimeout: const Duration(seconds: 8),
          receiveTimeout: const Duration(seconds: 8),
          // Read rather than thrown, so a 404 from some other server is
          // reported as "not a gateway" instead of as a network failure.
          validateStatus: (_) => true,
        ),
      ).get<dynamic>('/health');

      final body = res.data;
      if (res.statusCode != 200 || body is! Map) {
        return const GatewayProbe.notBotvy();
      }
      final version = body['version'];
      // `status` and `version` together are what only this application
      // answers with. A reverse proxy's own health page has neither.
      if (body['status'] is! String || version is! String) {
        return const GatewayProbe.notBotvy();
      }
      return GatewayProbe.reachable(
        version: version,
        degraded: body['status'] != 'ok',
      );
    } on DioException {
      return const GatewayProbe.unreachable();
    }
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

  /// Signs in, and registers this handset in the same call.
  ///
  /// The device rides along rather than being a second request: the server
  /// binds the refresh family to it, and a phone that signed in and then failed
  /// to register would hold a session bound to nothing — so signing this device
  /// out later would sign out all of them.
  Future<Session> login(
    String email,
    String password, {
    Map<String, dynamic>? device,
  }) async {
    final res = await _guard(
      () => dio.post<dynamic>(
        '/auth/login',
        data: {
          'email': email,
          'password': password,
          if (device != null) 'device': device,
        },
      ),
    );
    final session = Session.fromJson(
      Map<String, dynamic>.from(res.data as Map),
    );
    await tokens.saveTokens(session.tokens, email: session.email);
    return session;
  }

  /// Creates an account. The confirmation is checked on the server too — the
  /// client's own check is for the person who mistyped.
  Future<void> register({
    required String email,
    required String password,
    required String passwordConfirm,
    String? displayName,
    String? locale,
    String? timezone,
  }) async {
    await _guard(
      () => dio.post<dynamic>(
        '/auth/register',
        data: {
          'email': email,
          'password': password,
          'passwordConfirm': passwordConfirm,
          if (displayName != null && displayName.isNotEmpty)
            'displayName': displayName,
          if (locale != null) 'locale': locale,
          if (timezone != null) 'timezone': timezone,
        },
      ),
    );
  }

  /// Google sign-in. A 409 carrying `link_required` means the address already
  /// has a password account; [linkGoogle] finishes with that password.
  Future<Session> google(String idToken, {Map<String, dynamic>? device}) async {
    final res = await _guard(
      () => dio.post<dynamic>(
        '/auth/google',
        data: {'idToken': idToken, if (device != null) 'device': device},
      ),
    );
    final session = Session.fromJson(
      Map<String, dynamic>.from(res.data as Map),
    );
    await tokens.saveTokens(session.tokens, email: session.email);
    return session;
  }

  Future<Session> linkGoogle(
    String idToken,
    String password, {
    Map<String, dynamic>? device,
  }) async {
    final res = await _guard(
      () => dio.post<dynamic>(
        '/auth/google/link',
        data: {
          'idToken': idToken,
          'password': password,
          if (device != null) 'device': device,
        },
      ),
    );
    final session = Session.fromJson(
      Map<String, dynamic>.from(res.data as Map),
    );
    await tokens.saveTokens(session.tokens, email: session.email);
    return session;
  }

  /// Ends this session on the server as well as locally.
  ///
  /// The local clear happens whichever way the request goes: somebody who
  /// pressed sign-out on a train must not be left looking at their own data.
  Future<void> logout() async {
    final refresh = await tokens.readRefresh();
    if (refresh != null) {
      try {
        await dio.post<dynamic>(
          '/auth/logout',
          data: {'refreshToken': refresh},
        );
      } on DioException {
        // Nothing to do about it, and the token expires on its own.
      }
    }
    await tokens.clearTokens();
  }

  // -- devices ---------------------------------------------------------------

  /// Registers this device for push and refreshes its last-seen time, which is
  /// what tells the server this phone already holds the upcoming alarms.
  /// `/auth/devices` with `kind`, not v1's `/devices` with `platform`: the
  /// route moved under auth and the field was renamed, because `kind` is a
  /// closed set the server branches on — `chrome_extension` gets no push at
  /// all — where `platform` was a free string nobody could rely on.
  Future<String> registerDevice({
    required String installId,
    required String kind,
    String? name,
    String? pushToken,
  }) async {
    final res = await _guard(
      () => dio.post<dynamic>(
        '/auth/devices',
        data: {
          'installId': installId,
          'kind': kind,
          if (name != null) 'name': name,
          if (pushToken != null) 'pushToken': pushToken,
        },
      ),
    );
    return Map<String, dynamic>.from(res.data as Map)['deviceId'] as String;
  }

  Future<List<Map<String, dynamic>>> devices() async {
    final data = await query(r'''
      query MyDevices {
        myDevices { id kind hasPush lastSeenAt }
      }
    ''');
    return (data['myDevices'] as List)
        .map((row) => Map<String, dynamic>.from(row as Map))
        .toList();
  }

  Future<void> unregisterDevice(String deviceId) async {
    await _guard(() => dio.delete<dynamic>('/auth/devices/$deviceId'));
  }

  // -- profile ---------------------------------------------------------------

  Future<Map<String, dynamic>> profile() async {
    final data = await query('query Profile { profile { $_profileFields } }');
    return Map<String, dynamic>.from(data['profile'] as Map);
  }

  Future<Map<String, dynamic>> preferences() async {
    final data = await query(
      'query Preferences { preferences { $_preferencesFields } }',
    );
    return Map<String, dynamic>.from(data['preferences'] as Map);
  }

  /// Both halves in one request.
  ///
  /// The screen needs both and the phone pays for every round trip twice on a
  /// bad connection, which is the read edge earning its keep - two REST reads
  /// could not be combined without inventing an endpoint that served both.
  Future<({Map<String, dynamic> profile, Map<String, dynamic> preferences})>
  profileAndPreferences() async {
    final data = await query('''
      query ProfileAndPreferences {
        profile { $_profileFields }
        preferences { $_preferencesFields }
      }
    ''');
    return (
      profile: Map<String, dynamic>.from(data['profile'] as Map),
      preferences: Map<String, dynamic>.from(data['preferences'] as Map),
    );
  }

  /// Returns the stored profile, not the patch: the server trims the name and
  /// lower-cases the tag lists, so echoing the request back locally would show
  /// `Peanuts` where the server holds `peanuts` — and the next save would then
  /// look like a change when it is not.
  Future<Map<String, dynamic>> patchProfile(Map<String, dynamic> patch) async {
    final res = await _guard(() => dio.patch<dynamic>('/profile', data: patch));
    return Map<String, dynamic>.from(res.data as Map);
  }

  Future<Map<String, dynamic>> recordMetric(Map<String, dynamic> metric) async {
    final res = await _guard(
      () => dio.post<dynamic>('/profile/metrics', data: metric),
    );
    return Map<String, dynamic>.from(res.data as Map);
  }

  Future<Map<String, dynamic>> patchPreferences(
    Map<String, dynamic> patch,
  ) async {
    await _guard(() => dio.patch<dynamic>('/preferences', data: patch));
    // Re-read rather than assume: a patch answers with the fields that changed
    // and the screen wants the whole record.
    return preferences();
  }

  // -- reads -----------------------------------------------------------------

  /// The selections, named once. A GraphQL query asks for exactly the fields it
  /// wants, so the field list *is* the type - and two copies of it drift the
  /// moment one is edited.
  ///
  /// `metrics` is aliased from the schema's `bodyMetrics` because the REST
  /// commands that still return a profile call it `metrics`, and the mirror
  /// stores whichever arrives last.
  static const String _profileFields = '''
    userId displayName photoUrl timezone locale
    latestWeightKg latestHeightCm bmi
    metrics: bodyMetrics { recordedAt weightKg heightCm bodyFatPct note }
    foodLikes foodDislikes allergies symptoms onboardingCompletedAt
  ''';

  static const String _preferencesFields = '''
    userId planTomorrowTime endOfDayTime morningBriefingTime nextPracticeCutoff
    leadTimes quietHours { from to } weekStartsOn checkinEnabled
    meetingDurationMin mealMode aiSuggestions
  ''';

  /// A read.
  ///
  /// Posted to `\$_origin/graphql`, an absolute URL, because `dio.options
  /// .baseUrl` ends in `/api/v1` and the read edge sits beside that prefix
  /// rather than under it. Dio leaves an absolute URL alone.
  ///
  /// It goes through `_guard` and the interceptor like every other call, so a
  /// 401 refreshes and retries exactly as a command does. What it adds is the
  /// GraphQL envelope: the server answers 200 with an `errors` array, so a
  /// caller checking only the status reads a refusal as an empty answer.
  Future<Map<String, dynamic>> query(
    String document, [
    Map<String, dynamic>? variables,
  ]) async {
    final res = await _guard(
      () => dio.post<dynamic>(
        // Interpolated, not escaped: written `'\$_origin/graphql'` this posted
        // to the *literal* path `$_origin/graphql`, which dio resolved against
        // `baseUrl` — so every read on the phone asked for
        // `/api/v1/$_origin/graphql` and got a 404 the caller reported as an
        // empty answer.
        '$_origin/graphql',
        data: {
          'query': document,
          if (variables != null) 'variables': variables,
        },
      ),
    );

    final body = Map<String, dynamic>.from(res.data as Map);
    final errors = body['errors'];
    if (errors is List && errors.isNotEmpty) {
      final first = Map<String, dynamic>.from(errors.first as Map);
      final extensions = first['extensions'];
      final code = extensions is Map ? extensions['code'] as String? : null;
      throw ApiException(
        first['message'] as String? ?? 'the read failed',
        // The codes the server sets, mapped to the statuses the rest of this
        // client already branches on. `unauthorized` is deliberately not
        // mapped to 401: the interceptor has already refreshed and retried by
        // the time this line runs, so reaching it means the refresh failed
        // too, and reporting 401 again would ask for a second one.
        statusCode: switch (code) {
          'forbidden' => 403,
          'not_found' => 404,
          _ => 500,
        },
      );
    }

    return Map<String, dynamic>.from(body['data'] as Map);
  }

  // -- sync ------------------------------------------------------------------

  /// One round trip of the offline contract: this device's outbox up,
  /// everything that changed since its cursor down.
  ///
  /// Answers the raw map rather than a typed result, deliberately. The shape of
  /// a pulled row is owned by the context that produced it and is already
  /// written down three times (the aggregate, the sync adapter, the contract);
  /// a fourth copy here as Dart classes would be one more place to forget a
  /// field, and every one of those fields is on its way into a drift companion
  /// anyway. `core/sync/sync_engine.dart` is the single reader, and it reads
  /// the map straight into the tables.
  ///
  /// [since] is the server's own `now` from the previous response, echoed
  /// verbatim as the string it arrived as. Never a locally formatted time: the
  /// cursor is the server's clock, and reformatting it through `DateTime` would
  /// round the milliseconds a delta depends on.
  Future<Map<String, dynamic>> sync({
    required String installId,
    required List<String> entities,
    String? since,
    Map<String, dynamic> push = const {},
  }) async {
    final res = await _guard(
      () => dio.post<dynamic>(
        '/sync',
        data: {
          'installId': installId,
          // Sent even when null: null is how a client asks for a full
          // snapshot, and omitting the key would look the same to the server
          // but not to anyone reading the request.
          'since': since,
          'entities': entities,
          if (push.isNotEmpty) 'push': push,
        },
      ),
    );
    return Map<String, dynamic>.from(res.data as Map);
  }

  /// The colours the label picker offers.
  ///
  /// `settings.labels.palette` is an operator knob, so a hard-coded list here
  /// would be a bug by constitution XII — the operator retunes the key and the
  /// phone would go on offering the twelve colours somebody compiled in.
  ///
  /// Read through the admin `settings` query, which is the only surface that
  /// exposes the registry: there is no member-facing read for this key yet (see
  /// the note in `features/tasks/data/label_palette.dart`). A member whose role
  /// is not `admin` gets a `forbidden` here, which the caller treats as "not
  /// learned yet" rather than as an error — the picker then offers the colours
  /// the member's own labels already use.
  Future<List<String>> labelPalette() async {
    final data = await query(r'''
      query LabelPalette {
        settings { key value }
      }
    ''');
    final rows = data['settings'];
    if (rows is! List) return const [];
    for (final row in rows.whereType<Map>()) {
      if (row['key'] != 'labels.palette') continue;
      final value = row['value'];
      if (value is List) return value.whereType<String>().toList();
    }
    return const [];
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
      // The link conflict first: it is the one 409 with a next step attached,
      // and reading it as a generic message would lose the address.
      if (data['code'] == 'link_required') {
        return ApiException(
          'That address already has a password. Sign in with it to link them.',
          statusCode: status,
          linkEmail: data['email'] as String?,
        );
      }
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

/// The server's `kind`, which is a closed set and not a platform name.
///
/// `TargetPlatform.iOS.name` is `iOS`, and the API expects `ios` — a mismatch
/// the server would refuse with a validation error that reads like a bug in
/// the request rather than a case difference. Anything that is neither phone
/// platform is `web`, which is what a desktop Flutter build honestly is from
/// the server's point of view: a session with no push.
String deviceKind() {
  switch (defaultTargetPlatform) {
    case TargetPlatform.android:
      return 'android';
    case TargetPlatform.iOS:
      return 'ios';
    default:
      return 'web';
  }
}
