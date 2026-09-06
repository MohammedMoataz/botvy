import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/foundation.dart';

import 'api/api_client.dart';
import 'db/database.dart';
import 'notifications/local_notifications.dart';

/// Server-initiated messages: the evening check-in, the daily briefing, an
/// alert the device could not have scheduled itself, and silent nudges that
/// tell the app its local copy is stale.
///
/// Alerts themselves are scheduled on the device (see [NotificationScheduler]);
/// push is the fallback, not the mechanism. Every call is wrapped, because an
/// unconfigured Firebase must degrade to "no push" rather than stop the app
/// from starting — which is exactly what a `--flavor dev` build has, since
/// `google-services.json` ships only with the release flavour.
class PushService {
  PushService(this._api, this._db, this._scheduler);

  final ApiClient _api;
  final AppDatabase _db;
  final NotificationScheduler _scheduler;

  bool _started = false;

  /// Called when a data-only message says something changed elsewhere. The
  /// sync loop arrives in P2; until then this is where it hooks in. A nudge
  /// that writes a flag nothing reads is a nudge that does nothing at all.
  void Function()? onSyncNudge;

  /// Call once the user is signed in: registration needs a bearer token, and
  /// an unauthenticated device row has nobody to notify.
  Future<void> start() async {
    if (_started) return;
    _started = true;

    try {
      await Firebase.initializeApp();
      final messaging = FirebaseMessaging.instance;
      await messaging.requestPermission();

      final token = await messaging.getToken();
      if (token != null) await _register(token);
      messaging.onTokenRefresh.listen(_register);

      // Android does not draw an FCM banner while the app is foregrounded, so
      // the app draws it, on the same channel as its own alarms.
      FirebaseMessaging.onMessage.listen(_onMessage);
      FirebaseMessaging.onMessageOpenedApp.listen((message) {
        if (message.data['type'] == 'sync') onSyncNudge?.call();
      });
    } catch (e) {
      debugPrint('Push unavailable (Firebase not configured?): $e');
    }
  }

  Future<void> _onMessage(RemoteMessage message) async {
    // A data-only message is a nudge: something changed elsewhere, so pull and
    // re-arm the local alarms. The user should see nothing.
    if (message.notification == null && message.data['type'] == 'sync') {
      onSyncNudge?.call();
      return;
    }

    final notification = message.notification;
    if (notification == null) return;
    await _scheduler.show(
      notification.title ?? 'Botvy',
      notification.body ?? '',
      payload: message.data['type'] as String?,
    );
  }

  Future<void> _register(String token) async {
    try {
      await _db.setValue(DbKeys.fcmToken, token);
      await _api.registerDevice(
        installId: await stableInstallId(_db),
        platform: defaultTargetPlatform.name,
        fcmToken: token,
      );
    } catch (e) {
      // Nothing is lost: every sync re-registers, so a failure here is
      // corrected on the next pass.
      debugPrint('Device registration deferred: $e');
    }
  }

  /// Sign-out: this device should stop receiving another account's pushes.
  Future<void> unregister() async {
    _started = false;
    try {
      await _api.unregisterDevice(await stableInstallId(_db));
    } catch (e) {
      debugPrint('Device unregistration failed: $e');
    }
  }
}
