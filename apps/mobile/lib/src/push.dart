import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/foundation.dart';

/// ===========================================================================
/// PUSH IS OFF. No Firebase project exists for Botvy yet.
///
/// `initPush()` is a no-op unless the app is built with
/// `--dart-define=BOTVY_PUSH=true`, and even then every call is wrapped so a
/// missing google-services.json degrades to "no push" instead of a crash on
/// launch. Nothing here is wired to the gateway: there is no endpoint to
/// register a device token against yet, so the token is only logged.
///
/// To turn it on later:
///   1. Create the Firebase project, run `flutterfire configure`.
///   2. Drop android/app/google-services.json in place and add the
///      google-services Gradle plugin.
///   3. Add a token-registration endpoint to the gateway and POST `token`
///      to it where marked below.
///   4. Build with --dart-define=BOTVY_PUSH=true.
/// ===========================================================================
const bool kPushEnabled = bool.fromEnvironment('BOTVY_PUSH');

Future<void> initPush() async {
  if (!kPushEnabled) return;

  try {
    await Firebase.initializeApp();
    final messaging = FirebaseMessaging.instance;
    await messaging.requestPermission();

    final token = await messaging.getToken();
    // TODO(botvy): POST `token` to the gateway once a device-registration
    // endpoint exists. The frozen contract has no such endpoint today.
    debugPrint('FCM token: $token');
  } catch (e) {
    // Unconfigured Firebase must never block the app from starting.
    debugPrint('Push disabled (Firebase not configured): $e');
  }
}
