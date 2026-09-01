import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/foundation.dart';

import 'api/api_client.dart';
import 'db/database.dart';
import 'notifications/local_notifications.dart';
import 'sync/sync_service.dart';

/// Server-initiated messages: the evening check-in, the daily program, a
/// reminder the device could not have scheduled itself, and silent nudges that
/// tell the app its local copy is stale.
///
/// Reminder pings themselves are scheduled on the device (see
/// [NotificationScheduler]); push is the fallback, not the mechanism. Every
/// call is wrapped, because an unconfigured Firebase must degrade to "no push"
/// rather than stop the app from starting.
class PushService {
  PushService(this._api, this._db, this._scheduler, this._sync);

  final ApiClient _api;
  final AppDatabase _db;
  final NotificationScheduler _scheduler;
  final SyncService _sync;

  bool _started = false;

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
      messaging.onTokenRefresh.listen((t) => _register(t));

      // Android does not draw an FCM banner while the app is foregrounded, so
      // the app draws it, on the same channel as its own alarms.
      FirebaseMessaging.onMessage.listen(_onMessage);
      FirebaseMessaging.onMessageOpenedApp.listen((message) {
        if (message.data['type'] == 'sync') _sync.kick();
      });
    } catch (e) {
      debugPrint('Push unavailable (Firebase not configured?): $e');
    }
  }

  Future<void> _onMessage(RemoteMessage message) async {
    // A data-only message is a nudge: something changed elsewhere, so pull and
    // re-arm the local alarms. The user should see nothing. This used to write
    // a flag that nothing read, which made the nudge do nothing at all.
    if (message.notification == null && message.data['type'] == 'sync') {
      _sync.kick();
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
      await _db.setValue('fcmToken', token);
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
