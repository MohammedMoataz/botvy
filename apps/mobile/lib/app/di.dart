import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:get_it/get_it.dart';
import 'package:go_router/go_router.dart';

import '../core/api/api_client.dart';
import '../core/api/socket_client.dart';
import '../core/db/database.dart';
import '../core/notifications/local_notifications.dart';
import '../core/push.dart';
import '../core/sync/sync_engine.dart';
import '../features/athlete/application/athlete_cubit.dart';
import '../features/athlete/application/programs_cubit.dart';
import '../features/auth/application/auth_cubit.dart';
import '../features/calendar/application/calendar_cubit.dart';
import '../features/chat/application/chat_cubit.dart';
import '../features/chat/application/conversations_cubit.dart';
import '../features/chat/data/chat_outbox.dart';
import '../features/home/application/home_cubit.dart';
import '../features/meetings/application/meetings_cubit.dart';
import '../features/onboarding/application/athlete_steps.dart';
import '../features/onboarding/application/identity_steps.dart';
import '../features/onboarding/application/onboarding_steps.dart';
import '../features/profile/data/profile_mirror.dart';
import '../features/reminders/application/reminders_cubit.dart';
import '../features/rhythm/application/rhythm_cubit.dart';
import '../features/tasks/application/tasks_cubit.dart';
import 'router.dart';

final GetIt sl = GetIt.instance;

/// Wires the app's collaborators once, at boot.
///
/// [baseUrl] is read from secure storage before this runs, so the rest of the
/// app treats it as a plain synchronous value — no async provider, no
/// sign-in-screen flash for a returning user.
Future<void> configureDependencies({required String baseUrl}) async {
  sl
    ..registerSingleton<FlutterSecureStorage>(kSecureStorage)
    ..registerSingleton<SecretStore>(SecureSecretStore(sl<FlutterSecureStorage>()))
    ..registerSingleton<TokenStore>(TokenStore(sl<SecretStore>()))
    ..registerSingleton<AppDatabase>(AppDatabase())
    ..registerSingleton<ApiClient>(
      ApiClient(sl<TokenStore>(), baseUrl: baseUrl),
    )
    ..registerSingleton<SocketClient>(
      SocketClient(sl<ApiClient>(), sl<AppDatabase>()),
    )
    ..registerSingleton<NotificationScheduler>(NotificationScheduler())
    ..registerSingleton<PushService>(
      PushService(
        sl<ApiClient>(),
        sl<AppDatabase>(),
        sl<NotificationScheduler>(),
      ),
    )
    ..registerSingleton<ProfileMirror>(
      ProfileMirror(sl<ApiClient>(), sl<AppDatabase>()),
    )
    // A singleton, not a factory: the router reads its state to decide where
    // to send somebody, and a second instance would answer differently.
    ..registerSingleton<AuthCubit>(
      AuthCubit(sl<ApiClient>(), sl<AppDatabase>(), sl<ProfileMirror>()),
    )
    ..registerSingleton<SyncEngine>(
      SyncEngine(
        sl<ApiClient>(),
        sl<AppDatabase>(),
        sl<NotificationScheduler>(),
      ),
    )
    // Singletons, not factories. Both cubits listen to the sync engine's
    // passes, and a factory would give every screen its own listener and its
    // own copy of the list — so a task completed on one screen would still be
    // open on the one behind it.
    ..registerSingleton<TasksCubit>(
      TasksCubit(sl<AppDatabase>(), sl<SyncEngine>(), sl<ApiClient>()),
    )
    ..registerSingleton<RemindersCubit>(
      RemindersCubit(sl<AppDatabase>(), sl<SyncEngine>()),
    )
    // Singletons for the same reason: both listen to the sync engine's passes,
    // and the calendar reads the meetings table the meetings cubit writes — two
    // instances would each hold their own copy of the month, so a meeting
    // skipped on the calendar would still show on the list behind it.
    ..registerSingleton<MeetingsCubit>(
      MeetingsCubit(sl<AppDatabase>(), sl<SyncEngine>()),
    )
    ..registerSingleton<CalendarCubit>(
      CalendarCubit(sl<AppDatabase>(), sl<SyncEngine>()),
    )
    // Singletons for the same reason the others are: both listen to the sync
    // engine, and Today's training row watches the same `sessions` table the
    // week view and the session screen write — two instances would each hold
    // their own copy, so a session skipped from its own screen would still
    // read as planned on Home behind it.
    ..registerSingleton<AthleteCubit>(
      AthleteCubit(sl<AppDatabase>(), sl<SyncEngine>()),
    )
    // The one cubit in this feature that talks to the network: applying a
    // program and archiving one are REST commands, because the refusal — the
    // list of sessions an apply would replace — is what the member has to
    // agree to before it happens.
    ..registerSingleton<ProgramsCubit>(
      ProgramsCubit(sl<AppDatabase>(), sl<SyncEngine>(), sl<ApiClient>()),
    )
    // Home reads the day and writes nothing of its own: ticking a task off goes
    // through [TasksCubit], so there is one writer for the `tasks` table rather
    // than two copies of the recurrence and `pendingOp` rules.
    ..registerSingleton<HomeCubit>(
      HomeCubit(sl<AppDatabase>(), sl<SyncEngine>(), sl<TasksCubit>()),
    )
    ..registerSingleton<RhythmCubit>(
      RhythmCubit(sl<AppDatabase>(), sl<ApiClient>(), sl<SyncEngine>()),
    )
    // The chat outbox is a singleton and has to be: it holds the "one flush at
    // a time" latch, and two instances would each hold their own and send the
    // member's queued messages twice.
    ..registerSingleton<ChatOutbox>(
      ChatOutbox(sl<ApiClient>(), sl<AppDatabase>(), sl<SyncEngine>()),
    )
    ..registerSingleton<ConversationsCubit>(
      ConversationsCubit(sl<AppDatabase>(), sl<ApiClient>(), sl<SyncEngine>()),
    )
    // A singleton for the reason the others are, and one more: it owns the live
    // turn. A factory would give the chat screen a fresh instance on every
    // rebuild, and the `requestId` of the answer being streamed would go with
    // the old one — so the tokens would arrive, match nothing, and be dropped.
    ..registerSingleton<ChatCubit>(
      ChatCubit(
        sl<AppDatabase>(),
        sl<ApiClient>(),
        sl<SocketClient>(),
        sl<ChatOutbox>(),
        sl<SyncEngine>(),
        // Completing a card row goes through the context that owns the row, so
        // the recurrence and `pendingOp` rules live in one place. Same pair
        // `handleAlertAction` takes, and wired here for the same reason: this
        // is the one file where the chat and the two owning cubits are all
        // visible.
        onCardAction: completeFromChat,
      ),
    )
    ..registerSingleton<OnboardingRegistry>(OnboardingRegistry());

  sl<TasksCubit>().listenToSync();
  sl<RemindersCubit>().listenToSync();
  sl<MeetingsCubit>().listenToSync();
  sl<CalendarCubit>().listenToSync();
  sl<HomeCubit>().listenToSync();
  sl<AthleteCubit>().listenToSync();
  sl<ProgramsCubit>().listenToSync();
  sl<ConversationsCubit>().listenToSync();
  sl<ChatCubit>().listen();

  // The chat's own queue, drained on every pass. Registered here rather than
  // inside the engine because the outbox is a feature's and the engine is
  // shared: what the engine owes it is a signal, which is what `outcomes` is.
  //
  // Every pass, not only the ones that reached the server: `flush()` is latched
  // and returns immediately when there is nothing waiting, and a pass that
  // failed is exactly the moment the network may have just come back.
  sl<SyncEngine>().outcomes.listen((_) {
    // ignore: discarded_futures — fire-and-forget by design: a sync pass must
    // not wait for a batch of chat messages before reporting what it did.
    sl<ChatOutbox>().flush();
  });

  // Connectivity and app-resume triggers. The socket's own `connect` is the
  // connectivity signal: what the engine needs to know is not "this handset
  // has a network" but "the gateway is reachable".
  sl<SyncEngine>().watch(sl<SocketClient>());

  // Each feature registers its own walkthrough steps. Doing it here rather
  // than inside the onboarding page is what lets a later phase contribute one
  // without the walkthrough importing every feature to find it.
  registerIdentitySteps(sl<OnboardingRegistry>(), sl<ProfileMirror>());
  // P6's sports-and-slots step, at order 400 — after P1's three. A member who
  // already has slots is not asked again; see `athlete_steps.dart`.
  registerAthleteSteps(sl<OnboardingRegistry>(), sl<AthleteCubit>());

  // The API client discovers a dead session from inside an interceptor, where
  // it has no way to reach the cubit. Wired here, once, rather than passed
  // through three constructors that do not otherwise care.
  sl<ApiClient>().onAuthLost = () {
    // ignore: discarded_futures — fire-and-forget by design: the interceptor
    // must not wait for the UI to catch up before returning the 401.
    sl<AuthCubit>().onSessionLost();
  };
}

/// A tick on a chat card row, turned into a write.
///
/// The chat asked for an item to be completed and named which context owns it;
/// the write itself belongs to that context, because that is where the
/// recurrence rule and the `pendingOp` rule live. A chat feature that imported
/// the tasks feature to call this directly would be the cross-context reach the
/// constitution refuses, so the chat cubit takes it as a callback and this file
/// — the one place all three are visible — supplies it.
///
/// The kind is checked rather than trusted: an id routed to the wrong feature
/// would be looked up in the wrong table, find nothing, and silently do nothing
/// — a tick that appears not to work.
Future<void> completeFromChat(String kind, String id) async {
  switch (kind) {
    case 'task':
      await sl<TasksCubit>().complete(id);
    case 'reminder':
      await sl<RemindersCubit>().complete(id);
    case 'session':
      // A training session, from a chat card of kind `sessions` (FR-015). The
      // write belongs to the context that owns the row, as every other branch
      // here does — and "complete" is the only one of a session's three
      // outcomes a card can ask for: cancelling and skipping are decisions
      // about the future that belong on the session's own screen.
      await sl<AthleteCubit>().complete(id);
    case 'meeting':
      // "It happened" — the whole meeting, series included (FR-013). A chat
      // card names a meeting and never one of its dates, because an outcome
      // belongs to the meeting: the two things a member can say about one date
      // are "not this one" and "this one, later", and neither is a tick.
      await sl<MeetingsCubit>().complete(id);
    default:
      // A kind a newer gateway can produce and this build has no writer for.
      // Logged rather than thrown: a card of an unknown kind must not crash
      // the chat.
      debugPrint('no local writer for chat card kind $kind');
  }
}

/// A notification button, turned into a write.
///
/// The scheduler reports *what was pressed and about what* and nothing else —
/// the write belongs to the feature that owns the row, which is why this lives
/// here, where both cubits are reachable, rather than inside
/// `NotificationScheduler`.
///
/// The payload's `kind` is what decides which cubit is called, and it is
/// checked rather than assumed: a `complete` routed to the wrong feature would
/// look up a task id in the reminders table, find nothing, and do silently
/// nothing — a button that appears not to work.
Future<void> handleAlertAction(String actionId, String payload) async {
  final alert = decodeAlertPayload(payload);
  if (alert == null) return;

  switch ((alert.kind, actionId)) {
    case ('task', AlertActions.complete):
      await sl<TasksCubit>().complete(alert.id);
    case ('reminder', AlertActions.complete):
      await sl<RemindersCubit>().complete(alert.id);
    case ('reminder', AlertActions.snooze):
      await sl<RemindersCubit>().snooze(alert.id);
    case ('session', AlertActions.complete):
      // The training reminder's own button. A session has no snooze either,
      // for the reason a meeting has none: the moment it carries is when it
      // starts, and moving that is a move of the session rather than a delay
      // to a warning.
      await sl<AthleteCubit>().complete(alert.id);
    case ('meeting', AlertActions.complete):
      // The whole meeting, as everywhere else (FR-013). A meeting alert
      // carries the occurrence in its payload, and completing "this
      // occurrence" is deliberately not a thing: within a series a date is
      // skipped or moved, never completed.
      await sl<MeetingsCubit>().complete(alert.id);
    case ('meeting', AlertActions.snooze):
      // A meeting has no snooze of its own, for the reason a task has none:
      // the moment it carries is when it starts, and moving that is a move of
      // the occurrence rather than a delay to a warning. The shade's tap opens
      // the meeting instead, where the joining link is.
      break;
    case ('task', AlertActions.snooze):
      // A task has no snooze of its own: the moment it carries is its due
      // time, and moving that is a defer, not a delay to a warning. Deferring
      // it by ten minutes would be a lie about when it is due, so the button
      // does nothing here and the shade's tap opens the task instead.
      break;
    default:
      debugPrint('unhandled alert action $actionId for ${alert.kind}');
  }

  // The rows changed, so the plan changed. Both cubits kick the engine on a
  // write, which re-arms; this only covers the branches above that did not
  // write anything.
  await sl<NotificationScheduler>().rescheduleAll(sl<AppDatabase>());
}

/// A notification's body, tapped.
///
/// The payload carries the alert's `deepLink` (`encodeAlertPayload`), which the
/// router turns into a location. Wired at boot in `main`, next to the action
/// handler and for the same reason: a tap can be delivered on a **cold start**,
/// before any screen exists, so a handler registered in a widget's `initState`
/// would miss exactly the case the notification is for.
///
/// Which is also why the route can arrive before the router does. `main` builds
/// the router after `NotificationScheduler.init`, so a cold-start tap is
/// resolved here and parked; `main` picks it up with [takePendingRoute] once
/// there is something to navigate. Navigating into a router that does not exist
/// yet is how this kind of handler usually fails — silently, on the one path
/// nobody tests by hand.
Future<void> handleAlertTap(String payload) async {
  final alert = decodeAlertPayload(payload);
  final link = alert?.deepLink;
  if (link == null || link.isEmpty) return;

  final route = routeForDeepLink(link);
  if (route == null) {
    // A link for something this build has no screen for — a newer gateway
    // planning an alert for a later phase's feature. Logged rather than guessed
    // at: navigating "somewhere near it" drops the member on an unrelated page
    // with no way to know why.
    debugPrint('no route for deep link $link');
    return;
  }

  if (sl.isRegistered<GoRouter>()) {
    sl<GoRouter>().go(route);
  } else {
    _pendingRoute = route;
  }
}

String? _pendingRoute;

/// The route a cold-start notification tap asked for, once and then forgotten.
///
/// Cleared on read so a later hot restart does not re-open a sheet the member
/// has already dealt with.
String? takePendingRoute() {
  final route = _pendingRoute;
  _pendingRoute = null;
  return route;
}
