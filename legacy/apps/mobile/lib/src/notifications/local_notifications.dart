import 'dart:convert';

import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart' show PlatformException;
import 'package:flutter_local_notifications/flutter_local_notifications.dart';
import 'package:flutter_timezone/flutter_timezone.dart';
import 'package:timezone/data/latest_all.dart' as tzdata;
import 'package:timezone/timezone.dart' as tz;

import '../db/database.dart';

/// The channel both local alarms and server pushes land on, so a user has one
/// switch to control rather than two. Must match the FCM default-channel
/// meta-data in AndroidManifest.xml.
const String kReminderChannelId = 'botvy_reminders';

/// Android tolerates hundreds of pending alarms and iOS caps at 64. Scheduling
/// the nearest window and rolling it forward on every sync costs nothing and
/// stays under both.
const int kMaxScheduled = 50;

/// A stable 31-bit notification id for one ping.
///
/// FNV-1a over `reminderId|label`, which is the server's own unique key for a
/// ping — so the id survives the offline-create id swap, and cancelling works
/// even for a row the server has since renumbered. Dart's String.hashCode is
/// not stable across runs and cannot be used here.
int notificationIdFor(String reminderId, String label) {
  var hash = 0x811c9dc5;
  for (final unit in '$reminderId|$label'.codeUnits) {
    hash ^= unit;
    hash = (hash * 0x01000193) & 0xffffffff;
  }
  return hash & 0x7fffffff;
}

/// Schedules the device's own reminder alarms.
class NotificationScheduler {
  NotificationScheduler(this._db, {FlutterLocalNotificationsPlugin? plugin})
      : _plugin = plugin ?? FlutterLocalNotificationsPlugin();

  final AppDatabase _db;
  final FlutterLocalNotificationsPlugin _plugin;

  bool _ready = false;
  bool _exactAllowed = true;

  /// True when the OS refused exact alarms — reminders still fire, but the
  /// system may batch them by some minutes. Surfaced in Settings.
  bool get exactAlarmsAllowed => _exactAllowed;

  Future<void> init({void Function(String payload)? onTap}) async {
    if (_ready) return;

    tzdata.initializeTimeZones();
    tz.setLocalLocation(tz.getLocation(await deviceTimezone()));

    await _plugin.initialize(
      const InitializationSettings(
        android: AndroidInitializationSettings('@mipmap/ic_launcher'),
        iOS: DarwinInitializationSettings(),
      ),
      onDidReceiveNotificationResponse: (response) {
        final payload = response.payload;
        if (payload != null && onTap != null) onTap(payload);
      },
    );

    final android =
        _plugin.resolvePlatformSpecificImplementation<AndroidFlutterLocalNotificationsPlugin>();
    await android?.createNotificationChannel(
      const AndroidNotificationChannel(
        kReminderChannelId,
        'Reminders',
        description: 'Reminder pings, check-ins and daily programs.',
        importance: Importance.high,
      ),
    );

    _ready = true;
  }

  /// Asks for what the OS requires before anything can be shown or scheduled.
  Future<void> requestPermissions() async {
    final android =
        _plugin.resolvePlatformSpecificImplementation<AndroidFlutterLocalNotificationsPlugin>();
    if (android != null) {
      // Android 13+: without this the notification is posted and silently
      // dropped, which is indistinguishable from a broken scheduler.
      await android.requestNotificationsPermission();
      _exactAllowed = await android.canScheduleExactNotifications() ?? true;
      if (!_exactAllowed) {
        // Opens a system screen. If the user declines we fall back to inexact
        // delivery rather than not reminding them at all.
        await android.requestExactAlarmsPermission();
        _exactAllowed = await android.canScheduleExactNotifications() ?? false;
      }
    }
    await _plugin
        .resolvePlatformSpecificImplementation<IOSFlutterLocalNotificationsPlugin>()
        ?.requestPermissions(alert: true, badge: true, sound: true);
  }

  /// Shows something immediately — used for FCM messages that arrive while the
  /// app is foregrounded, which Android otherwise does not draw.
  Future<void> show(String title, String body, {String? payload}) async {
    await _plugin.show(
      DateTime.now().millisecondsSinceEpoch & 0x7fffffff,
      title,
      body,
      _details(),
      payload: payload,
    );
  }

  /// Cancels everything and re-schedules from the database.
  ///
  /// One entry point on purpose: edits, cancellations, deletions and server
  /// syncs all just change rows and call this. Tracking which individual ids
  /// to cancel per operation is the kind of bookkeeping that eventually leaves
  /// an alarm firing for a reminder the user deleted.
  Future<int> rescheduleAll({DateTime? now}) async {
    if (!_ready) return 0;
    final from = now ?? DateTime.now();

    await _plugin.cancelAll();

    final pings = await _db.upcomingPings(from);
    var scheduled = 0;
    for (final ping in pings.take(kMaxScheduled)) {
      final reminder = await _db.findReminder(ping.reminderId);
      if (reminder == null) continue;

      final label = ping.label == 'now' ? '' : ' (${ping.label})';
      try {
        await _plugin.zonedSchedule(
          notificationIdFor(ping.reminderId, ping.label),
          'Reminder',
          '${reminder.title}$label',
          tz.TZDateTime.from(ping.notifyAt, tz.local),
          _details(),
          androidScheduleMode: _exactAllowed
              ? AndroidScheduleMode.exactAllowWhileIdle
              : AndroidScheduleMode.inexactAllowWhileIdle,
          payload: jsonEncode({'type': 'reminder', 'id': ping.reminderId}),
        );
        scheduled++;
      } on PlatformException catch (e) {
        // Losing exact-alarm permission mid-flight must not take the sync down.
        debugPrint('could not schedule ${ping.id}: $e');
        _exactAllowed = false;
      }
    }
    return scheduled;
  }

  Future<void> cancelAll() => _plugin.cancelAll();

  NotificationDetails _details() => const NotificationDetails(
        android: AndroidNotificationDetails(
          kReminderChannelId,
          'Reminders',
          channelDescription: 'Reminder pings, check-ins and daily programs.',
          importance: Importance.high,
          priority: Priority.high,
        ),
        iOS: DarwinNotificationDetails(),
      );
}

/// The IANA zone the handset is in, e.g. `Africa/Cairo`.
Future<String> deviceTimezone() async {
  try {
    return await FlutterTimezone.getLocalTimezone();
  } catch (_) {
    return 'UTC';
  }
}
