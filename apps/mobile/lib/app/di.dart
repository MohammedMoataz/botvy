import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:get_it/get_it.dart';

import '../core/api/api_client.dart';
import '../core/api/socket_client.dart';
import '../core/db/database.dart';
import '../core/notifications/local_notifications.dart';
import '../core/push.dart';
import '../core/sync/sync_engine.dart';
import '../features/auth/application/auth_cubit.dart';
import '../features/onboarding/application/identity_steps.dart';
import '../features/onboarding/application/onboarding_steps.dart';
import '../features/profile/data/profile_mirror.dart';
import '../features/reminders/application/reminders_cubit.dart';
import '../features/tasks/application/tasks_cubit.dart';

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
    ..registerSingleton<OnboardingRegistry>(OnboardingRegistry());

  sl<TasksCubit>().listenToSync();
  sl<RemindersCubit>().listenToSync();

  // Connectivity and app-resume triggers. The socket's own `connect` is the
  // connectivity signal: what the engine needs to know is not "this handset
  // has a network" but "the gateway is reachable".
  sl<SyncEngine>().watch(sl<SocketClient>());

  // Each feature registers its own walkthrough steps. Doing it here rather
  // than inside the onboarding page is what lets a later phase contribute one
  // without the walkthrough importing every feature to find it.
  registerIdentitySteps(sl<OnboardingRegistry>(), sl<ProfileMirror>());

  // The API client discovers a dead session from inside an interceptor, where
  // it has no way to reach the cubit. Wired here, once, rather than passed
  // through three constructors that do not otherwise care.
  sl<ApiClient>().onAuthLost = () {
    // ignore: discarded_futures — fire-and-forget by design: the interceptor
    // must not wait for the UI to catch up before returning the 401.
    sl<AuthCubit>().onSessionLost();
  };
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
