import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart' show PlatformException;
import 'package:flutter_local_notifications/flutter_local_notifications.dart';
import 'package:flutter_timezone/flutter_timezone.dart';
import 'package:timezone/data/latest_all.dart' as tzdata;
import 'package:timezone/timezone.dart' as tz;

import '../db/database.dart';
import 'alert_plan.dart';

/// The plan and the ids belong to `alert_plan.dart`, which knows nothing about
/// the plugin. Re-exported so a caller needs one import to arm an alarm and to
/// read what was armed.
export 'alert_plan.dart';

/// The channel both local alarms and server pushes land on, so a user has one
/// switch to control rather than two. Must match the FCM default-channel
/// meta-data in AndroidManifest.xml.
const String kReminderChannelId = 'botvy_reminders';

/// The iOS category the two actions hang off. iOS attaches buttons by
/// category, registered once at init; Android attaches them per notification.
const String kAlertCategoryId = 'botvy_alert';

/// The two things a member can do without opening the app.
abstract final class AlertActions {
  static const String complete = 'complete';
  static const String snooze = 'snooze';
}

/// Owns the device's own alarms.
///
/// Alerts fire from the phone: the device schedules them from its local
/// database so they work offline, and the server sweep is only the fallback.
/// [rescheduleAll] is the single entry point — edits, completions, deletions
/// and syncs all just change rows and call it. Tracking which individual ids to
/// cancel per operation is the bookkeeping that eventually leaves an alarm
/// firing for something the member dealt with days ago.
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

  /// [onAction] is called for a notification button — complete or snooze, one
  /// of [AlertActions] — and [onTap] for the body of the notification. The
  /// writes themselves belong to the feature that owns the row, so this only
  /// reports what was pressed and about what.
  Future<void> init({
    void Function(String payload)? onTap,
    void Function(String actionId, String payload)? onAction,
  }) async {
    if (_ready) return;

    tzdata.initializeTimeZones();
    tz.setLocalLocation(tz.getLocation(await deviceTimezone()));

    await _plugin.initialize(
      settings: InitializationSettings(
        android: const AndroidInitializationSettings('@mipmap/ic_launcher'),
        iOS: DarwinInitializationSettings(
          // Registered at init and never later: iOS reads the category list
          // once, so a category added after the fact gets a notification with
          // no buttons on it and no error anywhere.
          notificationCategories: [
            DarwinNotificationCategory(
              kAlertCategoryId,
              actions: [
                DarwinNotificationAction.plain(
                  AlertActions.complete,
                  'Complete',
                ),
                DarwinNotificationAction.plain(AlertActions.snooze, 'Snooze'),
              ],
            ),
          ],
        ),
      ),
      onDidReceiveNotificationResponse: (response) {
        final payload = response.payload;
        if (payload == null) return;
        final actionId = response.actionId;
        if (actionId != null && actionId.isNotEmpty && onAction != null) {
          onAction(actionId, payload);
          return;
        }
        onTap?.call(payload);
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
      id: DateTime.now().millisecondsSinceEpoch & 0x7fffffff,
      title: title,
      body: body,
      notificationDetails: details,
      payload: payload,
    );
  }

  /// Re-reads whether the OS still allows exact alarms.
  ///
  /// Worth calling when the app comes back to the foreground: the permission
  /// screen [requestPermissions] opens is a system Activity, and the answer is
  /// only known once the member returns from it. Android may also revoke it
  /// later, on its own, for an app it considers idle — which is why this is a
  /// question asked repeatedly rather than a fact learned at install.
  Future<bool> refreshExactAlarms() async {
    final android = _plugin
        .resolvePlatformSpecificImplementation<
          AndroidFlutterLocalNotificationsPlugin
        >();
    if (android == null) return _exactAllowed;
    _exactAllowed = await android.canScheduleExactNotifications() ?? true;
    return _exactAllowed;
  }

  /// Cancels every armed alarm and arms the plan again from the database.
  ///
  /// Cancel-then-arm rather than a diff: the ids are derived from
  /// `(sourceId, label)`, so re-arming an alert that is still in the plan
  /// replaces it in place, and anything that left the plan — completed,
  /// cancelled, deleted, moved out of the window — is simply not re-armed.
  /// A diff would have to remember what it armed last time, and the one thing
  /// that memory can do is disagree with the rows.
  ///
  /// Called after every sync pass, on resume, and after any local edit. That
  /// is also what makes the [kMaxScheduled] cap safe: the nearest 50 are armed
  /// now, and the window rolls forward long before the 51st matters.
  Future<int> rescheduleAll(AppDatabase db, {DateTime? now}) async {
    if (!_ready) return 0;

    final plan = await plannedAlertsFor(db, now: now);

    await _plugin.cancelAll();

    var armed = 0;
    for (final alert in plan) {
      try {
        await _plugin.zonedSchedule(
          id: alert.notificationId,
          title: alert.title,
          body: alert.body,
          scheduledDate: tz.TZDateTime.from(alert.notifyAt, tz.local),
          notificationDetails: details,
          androidScheduleMode: scheduleMode,
          payload: encodeAlertPayload(alert),
        );
        armed++;
      } on PlatformException catch (e) {
        // Losing exact-alarm permission mid-flight must not take the sync down,
        // and must not stop the rest of the plan from being armed inexactly.
        debugPrint('could not schedule ${alert.key}: $e');
        _exactAllowed = false;
      }
    }
    return armed;
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
      actions: [
        // `showsUserInterface: true` on both, so the tap wakes the app and the
        // response arrives in the foreground handler.
        //
        // ponytail: the alternative is a background isolate
        // (`onDidReceiveBackgroundNotificationResponse`), which would need its
        // own database handle and its own push queue to write a completion
        // while the app is dead — a second copy of the sync path for two
        // buttons. Upgrade to it if members complain about the app opening;
        // until then the shade is one tap from a screen that can undo.
        AndroidNotificationAction(
          AlertActions.complete,
          'Complete',
          showsUserInterface: true,
        ),
        AndroidNotificationAction(
          AlertActions.snooze,
          'Snooze',
          showsUserInterface: true,
        ),
      ],
    ),
    iOS: DarwinNotificationDetails(categoryIdentifier: kAlertCategoryId),
  );
}

/// The IANA zone the handset is in, e.g. `Africa/Cairo`.
Future<String> deviceTimezone() async {
  try {
    // flutter_timezone 5 answers with a TimezoneInfo; the identifier is the
    // part that names an IANA zone.
    final info = await FlutterTimezone.getLocalTimezone();
    return info.identifier;
  } catch (e) {
    debugPrint('could not read the device time zone, assuming UTC: $e');
    return 'UTC';
  }
}
