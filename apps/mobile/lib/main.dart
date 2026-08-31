import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'src/api/api_client.dart';
import 'src/app_providers.dart';
import 'src/features/auth/auth_controller.dart';
import 'src/features/auth/auth_screens.dart';
import 'src/features/chat/chat_screen.dart';
import 'src/features/reminders/reminders_screen.dart';

/// Lets a tapped notification open a screen from outside the widget tree.
final navigatorKey = GlobalKey<NavigatorState>();

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();

  // Read persisted state once, up front, so the rest of the app can treat the
  // base URL and the signed-in flag as plain synchronous values -- no async
  // providers, no login-screen flash for a returning user.
  final store = TokenStore(kSecureStorage);
  final baseUrl = await store.readBaseUrl();
  final signedIn = (await store.readRefresh()) != null;
  final email = await store.readEmail();

  runApp(ProviderScope(
    overrides: [
      initialBaseUrlProvider.overrideWithValue(baseUrl),
      initialAuthProvider.overrideWithValue(
        AuthState(signedIn: signedIn, email: email),
      ),
    ],
    child: const BotvyApp(),
  ));
}

class BotvyApp extends StatelessWidget {
  const BotvyApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Botvy',
      navigatorKey: navigatorKey,
      debugShowCheckedModeBanner: false,
      theme: ThemeData(
        useMaterial3: true,
        colorSchemeSeed: Colors.indigo,
      ),
      darkTheme: ThemeData(
        useMaterial3: true,
        brightness: Brightness.dark,
        colorSchemeSeed: Colors.indigo,
      ),
      home: const _Root(),
    );
  }
}

class _Root extends ConsumerStatefulWidget {
  const _Root();

  @override
  ConsumerState<_Root> createState() => _RootState();
}

class _RootState extends ConsumerState<_Root> {
  bool _started = false;

  @override
  void initState() {
    super.initState();
    // Notifications are set up regardless of sign-in state: a scheduled alarm
    // must still be delivered and tappable on a cold start.
    ref.read(notificationSchedulerProvider).init(onTap: _openFromNotification);
  }

  /// Push registration and syncing need a bearer token, so they begin only
  /// once there is a session, and stop when it ends.
  void _syncSession(bool signedIn) {
    if (signedIn && !_started) {
      _started = true;
      final scheduler = ref.read(notificationSchedulerProvider);
      scheduler.requestPermissions();
      ref.read(pushServiceProvider).start();
      ref.read(syncServiceProvider)
        ..watchConnectivity()
        ..kick();
    } else if (!signedIn && _started) {
      _started = false;
    }
  }

  void _openFromNotification(String payload) {
    if (!payload.contains('reminder')) return;
    navigatorKey.currentState?.push(
      MaterialPageRoute<void>(builder: (_) => const RemindersScreen()),
    );
  }

  @override
  Widget build(BuildContext context) {
    final signedIn = ref.watch(authControllerProvider.select((s) => s.signedIn));
    _syncSession(signedIn);
    return signedIn ? const ChatScreen() : const LoginScreen();
  }
}
