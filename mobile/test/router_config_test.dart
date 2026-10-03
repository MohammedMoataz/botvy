// The real route table's shape, without building a page: which locations
// live inside the shell (a tab, with the bar) and which sit above it (pushed
// from the drawer, or reachable signed out). `app_shell_test.dart` tests how
// the shell behaves; this pins that the app's routes are wired into it the
// way `navigation.dart`'s `isShellLocation` assumes.
import 'package:botvy/app/navigation.dart';
import 'package:botvy/app/router.dart';
import 'package:botvy/core/api/api_client.dart';
import 'package:botvy/core/db/database.dart';
import 'package:botvy/features/auth/application/auth_cubit.dart';
import 'package:botvy/features/profile/data/profile_mirror.dart';
import 'package:drift/native.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';

void main() {
  late AppDatabase db;
  late GoRouter router;

  setUp(() {
    db = AppDatabase.forTesting(NativeDatabase.memory());
    final api = ApiClient(
      TokenStore(InMemorySecretStore()),
      baseUrl: 'http://test.invalid',
    );
    router = buildRouter(AuthCubit(api, db, ProfileMirror(api, db)));
  });

  tearDown(() async {
    router.dispose();
    await db.close();
  });

  const inside = [
    '/home',
    '/rhythm/plan/2026-10-02',
    '/rhythm/checkin',
    '/tasks',
    '/calendar',
    '/chats',
    '/chats/c1',
    '/athlete',
    '/athlete/session/s1',
    '/athlete/programs',
  ];
  const above = [
    '/sign-in',
    '/welcome',
    '/server',
    '/profile',
    '/preferences',
    '/settings',
    '/reminders',
    '/meetings',
    '/meetings/m1',
    '/knowledge',
    '/knowledge/l1',
    '/nutrition',
  ];

  test('the shell has the five tabs, in order', () {
    final shell = router.configuration.routes
        .whereType<StatefulShellRoute>()
        .single;
    expect(
      [for (final b in shell.branches) (b.routes.first as GoRoute).path],
      ['/home', '/tasks', '/calendar', '/chats', '/athlete'],
    );
  });

  for (final location in inside) {
    test('$location is inside the shell', () {
      final match = router.configuration.findMatch(Uri.parse(location));
      expect(match.matches, isNotEmpty);
      expect(match.matches.first, isA<ShellRouteMatch>());
      expect(isShellLocation(location), isTrue);
    });
  }

  for (final location in above) {
    test('$location sits above the shell', () {
      final match = router.configuration.findMatch(Uri.parse(location));
      expect(match.matches, isNotEmpty);
      expect(match.matches.first, isNot(isA<ShellRouteMatch>()));
      expect(isShellLocation(location), isFalse);
    });
  }
}
