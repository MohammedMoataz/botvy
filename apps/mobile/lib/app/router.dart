import 'dart:async';

import 'package:flutter/widgets.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:go_router/go_router.dart';

import '../features/auth/application/auth_cubit.dart';
import '../features/auth/presentation/sign_in_page.dart';
import '../features/chat/application/chat_cubit.dart';
import '../features/chat/application/conversations_cubit.dart';
import '../features/chat/presentation/chat_page.dart';
import '../features/chat/presentation/conversations_page.dart';
import '../features/home/application/home_cubit.dart';
import '../features/home/presentation/home_page.dart';
import '../features/onboarding/presentation/onboarding_page.dart';
import '../features/preferences/presentation/preferences_page.dart';
import '../features/profile/presentation/profile_page.dart';
import '../features/reminders/application/reminders_cubit.dart';
import '../features/reminders/presentation/reminders_page.dart';
import '../features/rhythm/application/rhythm_cubit.dart';
import '../features/rhythm/presentation/checkin_sheet.dart';
import '../features/rhythm/presentation/confirm_plan_sheet.dart';
import '../features/settings/presentation/server_page.dart';
import '../features/tasks/application/tasks_cubit.dart';
import '../features/tasks/presentation/tasks_page.dart';
import 'di.dart';

abstract final class Routes {
  static const String home = '/home';
  static const String signIn = '/sign-in';
  static const String onboarding = '/welcome';
  static const String profile = '/profile';
  static const String preferences = '/preferences';
  static const String tasks = '/tasks';
  static const String reminders = '/reminders';

  /// The chat list, and one conversation.
  ///
  /// A route for the conversation and not only a pushed page, for the reason
  /// the rhythm sheets give: Botvy writes into the coach chat unprompted
  /// (FR-017) and the notification for that arrives with a deep link, on a cold
  /// start, with no screen behind it.
  static const String chats = '/chats';

  /// One conversation, by id.
  static String chat(String conversationId) => '$chats/$conversationId';

  /// The two rhythm sheets, as routes.
  ///
  /// Routes and not only functions, because a notification tap arrives with no
  /// screen behind it — on a cold start there is nothing to show a modal sheet
  /// over — and a route is the only thing `go_router` can be told to open from
  /// outside the widget tree. A tap from inside the app calls the sheet
  /// function directly instead; see `_PlanTomorrowCard`.
  static const String rhythmPlan = '/rhythm/plan';
  static const String rhythmCheckin = '/rhythm/checkin';

  /// Where the gateway's address is set. Reachable signed out, deliberately —
  /// see the redirect below.
  static const String server = '/server';
}

/// The route one of the server's `deepLink` strings opens, or null.
///
/// Two spellings arrive here and both have to work. The alerts this phone
/// derives for itself carry a bare path (`/tasks/<id>`, `alert_plan.dart`), and
/// the ones the server plans carry the app's own scheme
/// (`botvy://rhythm/plan/<date>`) because the same string has to be openable
/// from an FCM payload and from a browser. Normalising the scheme away first is
/// what lets one table cover both, rather than two tables that drift.
///
/// Unknown links resolve to null and are ignored rather than guessed at. A
/// newer gateway can plan an alert for a feature this build has no screen for,
/// and navigating "somewhere near it" would drop the member on an unrelated
/// page with no way to know why.
String? routeForDeepLink(String deepLink) {
  final trimmed = deepLink.trim();
  if (trimmed.isEmpty) return null;

  // `botvy://rhythm/checkin` parses with `rhythm` as the *host* and `/checkin`
  // as the path, so the host cannot simply be dropped — it is the first
  // segment. Read this way the two spellings produce the same segment list.
  final uri = Uri.tryParse(trimmed);
  if (uri == null) return null;
  final segments = [
    if (uri.host.isNotEmpty) uri.host,
    ...uri.pathSegments,
  ].where((segment) => segment.isNotEmpty).toList();
  if (segments.isEmpty) return null;

  return switch (segments) {
    // The date is part of the route: a member who reads the 21:00 notification
    // after midnight must still confirm the day it was about, and a sheet that
    // worked "tomorrow" out from the moment of the tap would confirm the wrong
    // one.
    ['rhythm', 'plan', final String date] => '${Routes.rhythmPlan}/$date',
    ['rhythm', 'checkin', ...] => Routes.rhythmCheckin,
    // Both spellings the server may produce for a chat. `chat` is what the
    // rhythm's own touches use in their deep links; `conversations` is the REST
    // path and is what a card row or a knowledge suggestion may carry. One
    // table for both rather than guessing which the gateway sends.
    ['chat', final String id] || ['conversations', final String id] =>
      Routes.chat(id),
    ['chat', ...] || ['conversations', ...] => Routes.chats,
    // No per-row route exists for these yet, so the list is where a tap lands.
    // Better than nowhere, and it is the screen the member was going to have
    // to reach anyway.
    ['tasks', ...] => Routes.tasks,
    ['reminders', ...] => Routes.reminders,
    _ => null,
  };
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
    //
    // Home rather than the profile, which is where P2 landed for want of
    // anywhere better. Home is the screen this phase exists to build and the
    // one the member opens the app for; the profile is reachable from its app
    // bar.
    if (atSignIn || state.matchedLocation == Routes.onboarding) {
      return Routes.home;
    }
    return null;
  },
  routes: [
    GoRoute(
      path: Routes.home,
      builder: (context, state) => MultiBlocProvider(
        providers: [
          // `.value` for both, as the tasks route does: they are singletons
          // from the container and already listening to the sync engine.
          // Letting `BlocProvider` construct one here would give this route a
          // second instance with its own copy of the day, so a task ticked off
          // on Home would still read as open on the list behind it.
          BlocProvider<HomeCubit>.value(value: sl<HomeCubit>()),
          BlocProvider<RhythmCubit>.value(value: sl<RhythmCubit>()),
        ],
        child: const HomePage(),
      ),
    ),
    // The rhythm sheets, for a notification tap. Both render Home and open
    // their sheet over it, so the member lands somewhere they can stay when
    // the sheet closes rather than on a blank route.
    GoRoute(
      path: '${Routes.rhythmPlan}/:date',
      builder: (context, state) => _SheetOverHome(
        open: (context, cubit) => showConfirmPlanSheet(
          context,
          cubit,
          date: state.pathParameters['date'],
        ),
      ),
    ),
    GoRoute(
      path: Routes.rhythmCheckin,
      builder: (context, state) =>
          _SheetOverHome(open: showCheckinSheet),
    ),
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
    // The chat list and one conversation. `.value` for both cubits, as
    // everywhere else: the chat cubit owns the turn that is streaming, and a
    // second instance built by the route would not recognise its `requestId`.
    GoRoute(
      path: Routes.chats,
      builder: (context, state) => MultiBlocProvider(
        providers: [
          BlocProvider<ConversationsCubit>.value(
            value: sl<ConversationsCubit>(),
          ),
          BlocProvider<ChatCubit>.value(value: sl<ChatCubit>()),
        ],
        child: ConversationsPage(
          onOpen: (id) => context.push(Routes.chat(id)),
        ),
      ),
    ),
    GoRoute(
      path: '${Routes.chats}/:id',
      builder: (context, state) => MultiBlocProvider(
        providers: [
          BlocProvider<ConversationsCubit>.value(
            value: sl<ConversationsCubit>(),
          ),
          BlocProvider<ChatCubit>.value(value: sl<ChatCubit>()),
        ],
        child: ChatPage(
          conversationId: state.pathParameters['id'] ?? '',
          // `pushReplacement`, so following a moved answer does not leave the
          // chat it moved *out of* on the back stack: going back from there
          // would land the member in a conversation the message is no longer
          // in, which is the confusion the notice exists to prevent.
          onOpenChat: (id) => context.pushReplacement(Routes.chat(id)),
        ),
      ),
    ),
    GoRoute(
      path: Routes.server,
      builder: (context, state) => const ServerPage(),
    ),
  ],
);

/// Home, with one of the rhythm sheets opened over it.
///
/// What a notification tap lands on. The sheet is opened in a post-frame
/// callback rather than in `build`, because `showModalBottomSheet` pushes a
/// route and pushing a route during a build is an assertion failure — and on a
/// cold start this *is* the first build. Opening it after the frame also means
/// Home is drawn behind the sheet, so dismissing it leaves the member on a
/// screen rather than on nothing.
///
/// Guarded by [_opened] because a route's `build` runs again for every
/// dependency change — a theme change, a keyboard appearing, the locale — and
/// each of those would otherwise stack another copy of the sheet.
class _SheetOverHome extends StatefulWidget {
  const _SheetOverHome({required this.open});

  final Future<void> Function(BuildContext context, RhythmCubit cubit) open;

  @override
  State<_SheetOverHome> createState() => _SheetOverHomeState();
}

class _SheetOverHomeState extends State<_SheetOverHome> {
  bool _opened = false;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (_opened || !mounted) return;
      _opened = true;
      unawaited(widget.open(context, sl<RhythmCubit>()));
    });
  }

  @override
  Widget build(BuildContext context) => MultiBlocProvider(
    providers: [
      BlocProvider<HomeCubit>.value(value: sl<HomeCubit>()),
      BlocProvider<RhythmCubit>.value(value: sl<RhythmCubit>()),
    ],
    child: const HomePage(),
  );
}
