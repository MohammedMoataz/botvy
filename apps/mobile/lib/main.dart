import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'src/api/api_client.dart';
import 'src/features/auth/auth_controller.dart';
import 'src/features/auth/auth_screens.dart';
import 'src/features/chat/chat_screen.dart';
import 'src/push.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();

  // Read persisted state once, up front, so the rest of the app can treat the
  // base URL and the signed-in flag as plain synchronous values -- no async
  // providers, no login-screen flash for a returning user.
  final store = TokenStore(kSecureStorage);
  final baseUrl = await store.readBaseUrl();
  final signedIn = (await store.readRefresh()) != null;
  final email = await store.readEmail();

  await initPush(); // no-op unless built with --dart-define=BOTVY_PUSH=true

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

class _Root extends ConsumerWidget {
  const _Root();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final signedIn =
        ref.watch(authControllerProvider.select((s) => s.signedIn));
    return signedIn ? const ChatScreen() : const LoginScreen();
  }
}
