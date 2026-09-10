import 'dart:async';

import 'package:flutter/widgets.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:go_router/go_router.dart';

import '../features/auth/application/auth_cubit.dart';
import '../features/auth/presentation/sign_in_page.dart';
import '../features/onboarding/presentation/onboarding_page.dart';
import '../features/preferences/presentation/preferences_page.dart';
import '../features/profile/presentation/profile_page.dart';
import '../features/reminders/application/reminders_cubit.dart';
import '../features/reminders/presentation/reminders_page.dart';
import '../features/settings/presentation/server_page.dart';
import '../features/tasks/application/tasks_cubit.dart';
import '../features/tasks/presentation/tasks_page.dart';
import 'di.dart';

abstract final class Routes {
  static const String signIn = '/sign-in';
  static const String onboarding = '/welcome';
  static const String profile = '/profile';
  static const String preferences = '/preferences';
  static const String tasks = '/tasks';
  static const String reminders = '/reminders';

  /// Where the gateway's address is set. Reachable signed out, deliberately —
  /// see the redirect below.
  static const String server = '/server';
}

/// Re-runs the redirect whenever the session changes.
///
/// `go_router` only re-evaluates `redirect` on a navigation, so a session that
/// dies while the member is looking at a screen would leave them there —
/// staring at data whose requests are all now failing. This is what turns the
/// cubit's stream into a navigation.
class _CubitRefresh extends ChangeNotifier {
  _CubitRefresh(Stream<AuthState> stream) {
    _sub = stream.listen((_) => notifyListeners());
  }

  late final StreamSubscription<AuthState> _sub;

  @override
  void dispose() {
    unawaited(_sub.cancel());
    super.dispose();
  }
}

/// The app's routes and the one rule that decides which of them you see.
///
/// Three states, in order, because each is a precondition for the next: not
/// signed in, signed in but never finished the walkthrough, and signed in and
/// set up. The order matters — sending somebody to onboarding before they have
/// a session means the writes it makes have no account to land on.
GoRouter buildRouter(AuthCubit auth) => GoRouter(
  initialLocation: Routes.signIn,
  refreshListenable: _CubitRefresh(auth.stream),
  redirect: (context, state) {
    final session = auth.state;

    // Still deciding. Staying put avoids the sign-in form flashing in front of
    // a returning member before `restore()` has answered.
    if (session.phase == AuthPhase.unknown) return null;

    // The one screen that is not behind the session, and it has to be: until
    // the gateway's address is right, the sign-in request is going somewhere
    // that cannot answer it. A settings screen locked behind signing in would
    // be locked behind the thing it exists to fix.
    if (state.matchedLocation == Routes.server) return null;

    final atSignIn = state.matchedLocation == Routes.signIn;

    if (!session.isSignedIn) return atSignIn ? null : Routes.signIn;

    // Signed in. The walkthrough is skippable but not bypassable: it is where
    // the time zone is confirmed, and every reminder the member ever gets is
    // resolved against it.
    if (session.needsOnboarding) {
      return state.matchedLocation == Routes.onboarding
          ? null
          : Routes.onboarding;
    }

    // Signed in and set up: the sign-in page is no longer somewhere to be.
    if (atSignIn || state.matchedLocation == Routes.onboarding) {
      return Routes.profile;
    }
    return null;
  },
  routes: [
    GoRoute(
      path: Routes.signIn,
      builder: (context, state) => const SignInPage(),
    ),
    GoRoute(
      path: Routes.onboarding,
      builder: (context, state) => const OnboardingPage(),
    ),
    GoRoute(
      path: Routes.profile,
      builder: (context, state) => const ProfilePage(),
    ),
    GoRoute(
      path: Routes.preferences,
      builder: (context, state) => const PreferencesPage(),
    ),
    // `.value`, as `main.dart` does for the session: both cubits are
    // singletons from the container and already listening to the sync engine.
    // Letting `BlocProvider` construct one here would give this route a second
    // instance, with its own listener and its own copy of the list — so a task
    // completed from a notification would still read as open on screen.
    GoRoute(
      path: Routes.tasks,
      builder: (context, state) => BlocProvider<TasksCubit>.value(
        value: sl<TasksCubit>(),
        child: const TasksPage(),
      ),
    ),
    GoRoute(
      path: Routes.reminders,
      builder: (context, state) => BlocProvider<RemindersCubit>.value(
        value: sl<RemindersCubit>(),
        child: const RemindersPage(),
      ),
    ),
    GoRoute(
      path: Routes.server,
      builder: (context, state) => const ServerPage(),
    ),
  ],
);
