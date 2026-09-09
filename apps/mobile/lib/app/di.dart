import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:get_it/get_it.dart';

import '../core/api/api_client.dart';
import '../core/api/socket_client.dart';
import '../core/db/database.dart';
import '../core/notifications/local_notifications.dart';
import '../core/push.dart';
import '../features/auth/application/auth_cubit.dart';
import '../features/onboarding/application/identity_steps.dart';
import '../features/onboarding/application/onboarding_steps.dart';
import '../features/profile/data/profile_mirror.dart';

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
    ..registerSingleton<OnboardingRegistry>(OnboardingRegistry());

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
