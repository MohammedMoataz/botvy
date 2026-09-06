import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';

import 'app/di.dart';
import 'app/l10n/app_localizations.dart';
import 'app/router.dart';
import 'app/theme.dart';
import 'core/api/api_client.dart';
import 'core/notifications/local_notifications.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();

  // Read the persisted server URL once, up front, so the rest of the app can
  // treat it as a plain synchronous value.
  final baseUrl = await TokenStore(kSecureStorage).readBaseUrl();
  await configureDependencies(baseUrl: baseUrl);

  // Notifications are set up regardless of sign-in state: a scheduled alarm
  // must still be delivered and tappable on a cold start.
  await sl<NotificationScheduler>().init();

  runApp(const BotvyApp());
}

class BotvyApp extends StatelessWidget {
  const BotvyApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp.router(
      title: 'Botvy',
      debugShowCheckedModeBanner: false,
      routerConfig: appRouter,
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
    );
  }
}
