import 'package:botvy/core/api/api_client.dart';
import 'package:botvy/core/db/database.dart';
import 'package:botvy/features/auth/application/auth_cubit.dart';
import 'package:botvy/features/profile/data/profile_mirror.dart';
import 'package:dio/dio.dart';
import 'package:drift/native.dart';
import 'package:flutter_test/flutter_test.dart';

/// Answers whatever the test queued, and records what was asked.
class _Fake {
  final List<RequestOptions> calls = [];
  final Map<String, Object> replies = {};

  /// How many GraphQL reads answer with no profile and no preferences before
  /// the canned rows appear (E-019).
  ///
  /// That is what the server says for the seconds between an account being
  /// created and the relay writing its two Mongo documents: the query resolves,
  /// both fields are null, and nothing is wrong.
  int emptyBootstrapReads = 0;

  void on(String method, String path, Object reply) {
    replies['$method $path'] = reply;
  }

  Interceptor get interceptor => InterceptorsWrapper(
    onRequest: (options, handler) {
      calls.add(options);

      if (emptyBootstrapReads > 0 && options.path.endsWith('/graphql')) {
        emptyBootstrapReads -= 1;
        return handler.resolve(
          Response<dynamic>(
            requestOptions: options,
            statusCode: 200,
            data: {
              'data': {'profile': null, 'preferences': null},
            },
          ),
        );
      }

      final reply = replies['${options.method} ${options.path}'];

      if (reply is DioException) {
        return handler.reject(
          DioException(
            requestOptions: options,
            response: reply.response == null
                ? null
                : Response<dynamic>(
                    requestOptions: options,
                    statusCode: reply.response!.statusCode,
                    data: reply.response!.data,
                  ),
            type: reply.type,
          ),
        );
      }

      return handler.resolve(
        Response<dynamic>(
          requestOptions: options,
          statusCode: 200,
          data: reply ?? <String, dynamic>{},
        ),
      );
    },
  );
}

const _session = {
  'accessToken': 'access-1',
  'refreshToken': 'refresh-1',
  'userId': 'user-1',
  'email': 'member@example.test',
  'role': 'user',
  'deviceId': 'dev-1',
  'mustChangePassword': false,
};

const _profile = {
  'userId': 'user-1',
  'timezone': 'Africa/Cairo',
  'locale': 'en',
  'metrics': <Map<String, dynamic>>[],
};

const _preferences = {
  'userId': 'user-1',
  'planTomorrowTime': '21:00',
  'endOfDayTime': '22:00',
  'morningBriefingTime': '08:00',
  'nextPracticeCutoff': '21:00',
  'leadTimes': ['1h', '0m'],
  'quietHours': {'from': '22:00', 'to': '07:00'},
  'weekStartsOn': 'monday',
  'checkinEnabled': true,
  'meetingDurationMin': 30,
  'mealMode': 'llm',
  'aiSuggestions': true,
};

void main() {
  late AppDatabase db;
  late _Fake fake;
  late ApiClient api;
  late ProfileMirror mirror;
  late AuthCubit cubit;

  setUp(() {
    db = AppDatabase.forTesting(NativeDatabase.memory());
    fake = _Fake();
    api = ApiClient(
      TokenStore(InMemorySecretStore()),
      baseUrl: 'http://test.invalid',
    );
    api.dio.interceptors.add(fake.interceptor);
    mirror = ProfileMirror(api, db);
    cubit = AuthCubit(api, db, mirror);

    fake
      ..on('POST', '/auth/login', _session)
      // Both reads are GraphQL now, and both are one POST to the same absolute
      // URL beside the REST prefix — so a single canned envelope carrying both
      // fields answers each of them: `profile()` reads `data.profile` and
      // `preferences()` reads `data.preferences`. The two REST stubs this
      // replaces stopped matching anything when the reads moved, and every
      // test that filled the mirror failed on a null `data`.
      ..on('POST', 'http://test.invalid/graphql', {
        'data': {'profile': _profile, 'preferences': _preferences},
      });
  });

  tearDown(() async {
    await cubit.close();
    await db.close();
  });

  test('a fresh install starts signed out', () async {
    await cubit.restore();

    expect(cubit.state.phase, AuthPhase.signedOut);
  });

  test('a successful sign-in reports the member', () async {
    await cubit.signIn('member@example.test', 'a-password');

    expect(cubit.state.isSignedIn, isTrue);
    expect(cubit.state.email, 'member@example.test');
    expect(cubit.state.userId, 'user-1');
  });

  /// The task's own acceptance criterion: a signed-in cubit on a fresh install
  /// has both rows locally. The sync loop arrives in P2, so this phase has to
  /// fetch them itself — and a home screen with no profile is what happens if
  /// it does not.
  test('a signed-in cubit on a fresh install has both rows locally', () async {
    await cubit.signIn('member@example.test', 'a-password');

    expect(await mirror.readProfile(), isNotNull);
    expect(await mirror.readPreferences(), isNotNull);
  });

  /// The router redirects on `isSignedIn`, so reporting it before the mirror is
  /// filled would land the member on a screen whose data is still in flight.
  test('the mirror is filled before signedIn is reported', () async {
    final seen = <bool>[];
    cubit.stream.listen((state) async {
      if (state.isSignedIn) seen.add(await mirror.readProfile() != null);
    });

    await cubit.signIn('member@example.test', 'a-password');
    await Future<void>.delayed(Duration.zero);

    expect(seen, isNotEmpty);
    expect(seen.every((filled) => filled), isTrue);
  });

  test('the device travels with the sign-in, so the session is bound to it', () async {
    await cubit.signIn('member@example.test', 'a-password');

    final login = fake.calls.firstWhere((c) => c.path == '/auth/login');
    final device = (login.data as Map)['device'] as Map;
    expect(device['installId'], isNotEmpty);
    expect(device['kind'], isNotNull);
  });

  /// Minted once and kept: a fresh id per sign-in would give the member a new
  /// device row each time, and then one notification per row.
  test('the install id is the same across two sign-ins', () async {
    await cubit.signIn('member@example.test', 'a-password');
    await cubit.signIn('member@example.test', 'a-password');

    final ids = fake.calls
        .where((c) => c.path == '/auth/login')
        .map((c) => ((c.data as Map)['device'] as Map)['installId'])
        .toSet();
    expect(ids, hasLength(1));
  });

  test('a wrong password reports invalid credentials, not a raw message', () async {
    fake.on(
      'POST',
      '/auth/login',
      DioException(
        requestOptions: RequestOptions(),
        response: Response<dynamic>(
          requestOptions: RequestOptions(),
          statusCode: 401,
        ),
      ),
    );

    await cubit.signIn('member@example.test', 'wrong');

    expect(cubit.state.failure, AuthFailure.invalidCredentials);
    expect(cubit.state.isSignedIn, isFalse);
  });

  test('a closed installation is distinct from a taken address', () async {
    fake.on(
      'POST',
      '/auth/register',
      DioException(
        requestOptions: RequestOptions(),
        response: Response<dynamic>(
          requestOptions: RequestOptions(),
          statusCode: 403,
        ),
      ),
    );

    await cubit.register(
      email: 'a@b.test',
      password: 'a-long-password',
      passwordConfirm: 'a-long-password',
    );

    expect(cubit.state.failure, AuthFailure.registrationClosed);
  });

  /// Checked before the request. The server checks it too — this one is for the
  /// person who mistyped, and it saves them a round trip.
  test('a mismatched confirmation never reaches the network', () async {
    await cubit.register(
      email: 'a@b.test',
      password: 'a-long-password',
      passwordConfirm: 'something-else',
    );

    expect(cubit.state.failure, AuthFailure.passwordMismatch);
    expect(fake.calls.where((c) => c.path == '/auth/register'), isEmpty);
  });

  /// The caller has something to do about this one: ask for the password and
  /// call `linkGoogle`. The address has to survive the failure for that.
  test('a Google collision keeps the address so the link can finish', () async {
    fake.on(
      'POST',
      '/auth/google',
      DioException(
        requestOptions: RequestOptions(),
        response: Response<dynamic>(
          requestOptions: RequestOptions(),
          statusCode: 409,
          data: {'code': 'link_required', 'email': 'member@example.test'},
        ),
      ),
    );

    await cubit.signInWithGoogle('id-token');

    expect(cubit.state.failure, AuthFailure.linkRequired);
    expect(cubit.state.linkEmail, 'member@example.test');
  });

  test('signing out drops the local mirror', () async {
    await cubit.signIn('member@example.test', 'a-password');
    expect(await mirror.readProfile(), isNotNull);

    await cubit.signOut();

    expect(cubit.state.phase, AuthPhase.signedOut);
    expect(await mirror.readProfile(), isNull);
  });

  /// A revoked family, a deleted account, a password changed elsewhere. The
  /// mirror goes with the session: the next member must not see the last one's
  /// allergies.
  test('a lost session clears the mirror too', () async {
    await cubit.signIn('member@example.test', 'a-password');

    await cubit.onSessionLost();

    expect(cubit.state.phase, AuthPhase.signedOut);
    expect(await mirror.readProfile(), isNull);
  });

  test('a returning member is restored without a network call', () async {
    await cubit.signIn('member@example.test', 'a-password');
    final before = fake.calls.length;

    await cubit.restore();

    expect(cubit.state.isSignedIn, isTrue);
    expect(fake.calls.length, before);
  });

  /// E-019: registration commits the account and an outbox entry, and the relay
  /// writes `profiles` and `user_preferences` on a later tick. Onboarding is
  /// the very next screen and it patches both, so a member who taps through
  /// fast used to be told their preference could not be saved — and before
  /// that, the null profile was cast to a `Map` and threw a `TypeError` past
  /// the one handler this cubit catches, reporting a failed sign-in for an
  /// account that had been created.
  test('a registration inside the bootstrap window waits for the rows', () async {
    fake
      ..on('POST', '/auth/register', {
        'userId': 'user-1',
        'email': 'member@example.test',
        'bootstrapped': false,
      })
      ..on('POST', '/auth/login', {..._session, 'bootstrapped': false})
      ..emptyBootstrapReads = 1;

    await cubit.register(
      email: 'member@example.test',
      password: 'a-long-password',
      passwordConfirm: 'a-long-password',
    );

    expect(cubit.state.isSignedIn, isTrue);
    expect(cubit.state.failure, isNull);
    // The point of the wait: onboarding writes into these, and a walkthrough
    // that opened on an empty mirror would patch a row the server does not have.
    expect(await mirror.readProfile(), isNotNull);
    expect(await mirror.readPreferences(), isNotNull);
  });

  /// The other direction, and the reason the flag is read rather than the poll
  /// simply always running: a returning member is the common case and must not
  /// pay a retry for a read that legitimately came back empty.
  test('a sign-in the server reports as ready is never polled', () async {
    fake.emptyBootstrapReads = 1;

    await cubit.signIn('member@example.test', 'a-password');

    expect(cubit.state.isSignedIn, isTrue);
    expect(
      fake.calls.where((c) => c.path.endsWith('/graphql')),
      hasLength(1),
    );
  });
}
