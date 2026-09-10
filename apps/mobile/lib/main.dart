import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:go_router/go_router.dart';

import 'app/di.dart';
import 'app/l10n/app_localizations.dart';
import 'app/router.dart';
import 'app/theme.dart';
import 'core/api/api_client.dart';
import 'core/notifications/local_notifications.dart';
import 'features/auth/application/auth_cubit.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();

  // Read the persisted server URL once, up front, so the rest of the app can
  // treat it as a plain synchronous value.
  final baseUrl =
      await TokenStore(const SecureSecretStore(kSecureStorage)).readBaseUrl();
  await configureDependencies(baseUrl: baseUrl);

  // Notifications are set up regardless of sign-in state: a scheduled alarm
  // must still be delivered and tappable on a cold start.
  //
  // `onAction` is wired here, at boot, and not by a screen. The two buttons
  // arrive from the platform channel whenever the OS decides to deliver them —
  // including on a cold start, before any screen exists — so a handler
  // registered in a widget's `initState` would miss exactly the case the
  // buttons are for.
  await sl<NotificationScheduler>().init(
    onAction: (actionId, payload) =>
        // ignore: discarded_futures — fire-and-forget by design: the platform
        // callback must return promptly, and the write re-arms the plan itself.
        unawaited(handleAlertAction(actionId, payload)),
  );

  // Before the first frame. The router redirects on the session, so deciding
  // it afterwards is what makes a returning member watch the sign-in form
  // appear and vanish.
  await sl<AuthCubit>().restore();

  runApp(BotvyApp(router: buildRouter(sl<AuthCubit>())));
}

class BotvyApp extends StatelessWidget {
  const BotvyApp({super.key, required this.router});

  final GoRouter router;

  @override
  Widget build(BuildContext context) {
    // The one place the cubit reaches the widget tree.
    //
    // `.value`, not a builder: it is a singleton from the container, already
    // restored before the first frame, and letting BlocProvider construct one
    // would give the screens a different instance from the one the router's
    // redirect reads — so a sign-in would update one and navigate on the other.
    return BlocProvider<AuthCubit>.value(
      value: sl<AuthCubit>(),
      child: MaterialApp.router(
        title: 'Botvy',
        debugShowCheckedModeBanner: false,
        routerConfig: router,
        theme: AppTheme.light,
        darkTheme: AppTheme.dark,
        localizationsDelegates: const [
          AppLocalizations.delegate,
          GlobalMaterialLocalizations.delegate,
          GlobalWidgetsLocalizations.delegate,
          GlobalCupertinoLocalizations.delegate,
        ],
        supportedLocales: AppLocalizations.supportedLocales,
        // The direction follows the locale, and is stated rather than inherited:
        // Arabic reads right to left and every screen below here has to agree,
        // including the ones a plugin or a dialog inserts.
        builder: (context, child) => Directionality(
          textDirection: AppLocalizations.of(context).textDirection,
          child: child ?? const SizedBox.shrink(),
        ),
      ),
    );
  }
}
