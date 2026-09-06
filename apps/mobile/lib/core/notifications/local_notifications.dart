import 'package:flutter/foundation.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';
import 'package:flutter_timezone/flutter_timezone.dart';
import 'package:timezone/data/latest_all.dart' as tzdata;
import 'package:timezone/timezone.dart' as tz;

/// The channel both local alarms and server pushes land on, so a user has one
/// switch to control rather than two. Must match the FCM default-channel
/// meta-data in AndroidManifest.xml.
const String kReminderChannelId = 'botvy_reminders';

/// Android tolerates hundreds of pending alarms and iOS caps at 64. Scheduling
/// the nearest window and rolling it forward on every sync costs nothing and
/// stays under both.
const int kMaxScheduled = 50;

/// A stable 31-bit notification id for one alert.
///
/// FNV-1a over `sourceId|label`, which is the server's own unique key for an
/// alert — so the id survives the offline-create id swap, and cancelling works
/// even for a row the server has since renumbered. Dart's String.hashCode is
/// not stable across runs and cannot be used here.
int notificationIdFor(String sourceId, String label) {
  var hash = 0x811c9dc5;
  for (final unit in '$sourceId|$label'.codeUnits) {
    hash ^= unit;
    hash = (hash * 0x01000193) & 0xffffffff;
  }
  return hash & 0x7fffffff;
}

/// Owns the device's own alarms.
///
/// Alerts fire from the phone: the device schedules them from its local
/// database so they work offline, and the server sweep is only the fallback.
///
/// ponytail: P0 has no synced tables yet, so this ships init / permissions /
/// show / cancel — everything push and a cold start need. `rescheduleAll`,
/// which reads the alert rows and arms `zonedSchedule`, lands with those tables
/// in P2; [tz] and [kMaxScheduled] are set up here so that is a method, not a
/// rewrite.
class NotificationScheduler {
  NotificationScheduler({FlutterLocalNotificationsPlugin? plugin})
    : _plugin = plugin ?? FlutterLocalNotificationsPlugin();

  final FlutterLocalNotificationsPlugin _plugin;

  bool _ready = false;
  bool _exactAllowed = true;

  bool get isReady => _ready;

  /// True when the OS refused exact alarms — alerts still fire, but the system
  /// may batch them by some minutes. Surfaced in Settings.
  bool get exactAlarmsAllowed => _exactAllowed;

  /// The IANA zone the handset is in, resolved once at init. Times belong to
  /// the user: nothing here reads a server clock or a server zone.
  tz.Location get location => tz.local;

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

    final android = _plugin
        .resolvePlatformSpecificImplementation<
          AndroidFlutterLocalNotificationsPlugin
        >();
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
    final android = _plugin
        .resolvePlatformSpecificImplementation<
          AndroidFlutterLocalNotificationsPlugin
        >();
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
        .resolvePlatformSpecificImplementation<
          IOSFlutterLocalNotificationsPlugin
        >()
        ?.requestPermissions(alert: true, badge: true, sound: true);
  }

  /// Shows something immediately — used for FCM messages that arrive while the
  /// app is foregrounded, which Android otherwise does not draw.
  Future<void> show(String title, String body, {String? payload}) async {
    await _plugin.show(
      DateTime.now().millisecondsSinceEpoch & 0x7fffffff,
      title,
      body,
      details,
      payload: payload,
    );
  }

  Future<void> cancelAll() => _plugin.cancelAll();

  /// The delivery mode to schedule with: exact while the OS allows it,
  /// inexact once it does not, rather than nothing at all.
  AndroidScheduleMode get scheduleMode => _exactAllowed
      ? AndroidScheduleMode.exactAllowWhileIdle
      : AndroidScheduleMode.inexactAllowWhileIdle;

  static const NotificationDetails details = NotificationDetails(
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
  } catch (e) {
    debugPrint('could not read the device time zone, assuming UTC: $e');
    return 'UTC';
  }
}
