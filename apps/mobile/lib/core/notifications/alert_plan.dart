import 'dart:convert';

// Imported whole rather than by name: the query builder's `&` and
// `isBiggerThanValue` are extension members, and an extension only applies when
// its library is imported outright.
import 'package:drift/drift.dart';
import 'package:timezone/timezone.dart' as tz;

import '../db/database.dart';

/// What the phone will actually alarm, and how it is worked out.
///
/// Alerts fire from the phone. The device plans them from its own rows so they
/// work with no network, no server and no Google reachability; the server's
/// sweep is the fallback and skips a device that has already synced. That makes
/// the two planners a matched pair: the set this file produces has to be the set
/// the server's saga produces for the same member, row for row, or the member is
/// either told twice or not at all. Every rule here therefore mirrors a rule on
/// the server, and the comments say which.
///
/// Nothing in this file touches the plugin, so the whole plan is testable
/// without a platform channel — see `test/alert_plan_test.dart`.

/// Android tolerates hundreds of pending alarms and iOS caps at 64. Scheduling
/// the nearest window and rolling it forward on every sync costs nothing and
/// stays under both.
const int kMaxScheduled = 50;

/// How far "snooze" pushes an alert from the notification shade.
///
/// A member-chosen delay, so the moment it lands on is the member's own and
/// quiet hours never move it — the same rule the server applies to
/// `snoozedUntil`.
const Duration kSnoozeFor = Duration(minutes: 10);

/// The label the server gives the alert at the moment the member chose
/// themselves — a reminder's own moment, a task's own due time.
///
/// This is the one distinction quiet hours turn on, which is why it is a
/// constant and not a comparison written out at each site.
const String kOwnMomentLabel = '0m';

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

/// One alarm, planned but not yet armed.
class PlannedAlert {
  const PlannedAlert({
    required this.sourceKind,
    required this.sourceId,
    required this.label,
    required this.notifyAt,
    required this.title,
    this.occurrenceAt,
    this.body = '',
    this.deepLink = '',
  });

  /// `reminder` | `task` | `meeting` | `rhythm` | `suggestion`.
  final String sourceKind;
  final String sourceId;

  /// Which occurrence of a recurring source this is, or null for a one-off.
  final DateTime? occurrenceAt;

  /// The server's own label: `0m`, `1h`, `prep`, `evening`, `morning`,
  /// `suggestion`. Display text would have been friendlier and is not an
  /// option — half the notification id is derived from this string, so two
  /// sides spelling it differently means a cancel that misses and an alarm
  /// that fires for something the member has dealt with.
  final String label;

  final DateTime notifyAt;
  final String title;
  final String body;
  final String deepLink;

  /// True when this is the moment the member chose themselves. Quiet hours
  /// may never move it; everything else here Botvy derived and may.
  bool get isMemberChosen => label == kOwnMomentLabel;

  /// The server's unique key for an alert, and therefore the key this side
  /// de-duplicates on: an alert the phone derived and the same alert the
  /// server sent are one alarm, not two.
  String get key =>
      '$sourceKind|$sourceId|${occurrenceAt?.toUtc().toIso8601String() ?? '-'}|$label';

  int get notificationId => notificationIdFor(sourceId, label);

  @override
  String toString() => 'PlannedAlert($key at ${notifyAt.toIso8601String()})';
}

/// The window in which a system-generated alert waits.
///
/// Wall-clock times, not instants: "22:00 to 07:00" means those hours wherever
/// the member is, which is why the shift is resolved against a [tz.Location]
/// and never against a UTC offset frozen at read time.
class QuietHours {
  const QuietHours(this.fromMinute, this.toMinute);

  /// Parses the `HH:mm` pair the preferences row holds. Anything unparseable
  /// is treated as "no quiet hours": a malformed preference must not silently
  /// hold every alert until a time nobody can name.
  factory QuietHours.parse(String from, String to) =>
      QuietHours(_minuteOfDay(from) ?? 0, _minuteOfDay(to) ?? 0);

  static const QuietHours none = QuietHours(0, 0);

  final int fromMinute;
  final int toMinute;

  /// An empty window — `from == to` — is off. It is also what a member gets by
  /// setting both ends the same, which is the natural way to ask for no quiet
  /// hours at all.
  bool get isOff => fromMinute == toMinute;

  /// Whether a wall-clock minute falls inside the window.
  ///
  /// The window usually wraps midnight (22:00 → 07:00), so the comparison is
  /// an `or` in that case and an `and` in the other. Writing only the `and`
  /// half is the mistake that leaves the small hours unprotected.
  bool covers(int minuteOfDay) {
    if (isOff) return false;
    if (fromMinute < toMinute) {
      return minuteOfDay >= fromMinute && minuteOfDay < toMinute;
    }
    return minuteOfDay >= fromMinute || minuteOfDay < toMinute;
  }

  /// The end of the window as seen from [moment] — the instant the held-back
  /// alert is released.
  tz.TZDateTime endAfter(tz.TZDateTime moment) {
    final sameDay = tz.TZDateTime(
      moment.location,
      moment.year,
      moment.month,
      moment.day,
      toMinute ~/ 60,
      toMinute % 60,
    );
    if (sameDay.isAfter(moment)) return sameDay;
    // Tomorrow's 07:00, built from calendar fields rather than
    // `add(Duration(days: 1))`: a day is not 24 hours across a daylight-saving
    // boundary, and the duration form lands an hour off exactly when the
    // member is least likely to forgive it.
    return tz.TZDateTime(
      moment.location,
      moment.year,
      moment.month,
      moment.day + 1,
      toMinute ~/ 60,
      toMinute % 60,
    );
  }
}

/// A local row that can produce alerts: a timed task or an active reminder.
///
/// The two are reduced to this before planning, so the quiet-hours rule, the
/// lead-time expansion and the cap are written once. A third kind (a meeting,
/// in P5) is another mapper, not another planner.
class AlertSource {
  const AlertSource({
    required this.kind,
    required this.id,
    required this.title,
    required this.at,
    this.leadTimes = const [],
    this.deepLink = '',
  });

  final String kind;
  final String id;
  final String title;

  /// The moment the member chose. For a reminder this is `snoozedUntil ??
  /// remindAt` — the server's own `effectiveAt`, so a snooze needs no special
  /// case anywhere below.
  final DateTime at;

  /// This source's own lead times; empty means the member's defaults.
  final List<String> leadTimes;

  final String deepLink;
}

/// Expands lead times the way the server does, so a task or reminder created
/// offline is alarmed immediately instead of waiting for its first sync.
///
/// Ported from v1's `planPings`, with one deliberate change: the label is the
/// normalised offset (`1h`, `30m`, `0m`) rather than v1's display text ("1 hour
/// before"). The server stores exactly these strings as an alert's `label`, and
/// the notification id is derived from it — v1 could afford prose because
/// nothing on the server shared the key.
///
/// An offset already in the past is dropped, except the at-the-moment one,
/// which always survives here: this function plans *rows*, and whether an
/// instant may still be armed is [planLocalAlerts]'s decision, taken once for
/// every alert rather than per offset.
List<({DateTime notifyAt, String label})> planPings(
  DateTime remindAt,
  List<String> leadTimes, {
  DateTime? now,
}) {
  final notBefore = now ?? DateTime.now();
  final planned = <({DateTime notifyAt, String label})>[];
  final seen = <String>{};

  for (final offset in leadTimes) {
    final match = RegExp(
      r'^(\d+)(m|h|d)$',
    ).firstMatch(offset.trim().toLowerCase());
    if (match == null) continue;
    final value = int.parse(match.group(1)!);
    final unit = match.group(2)!;
    final minutes = value * switch (unit) {
      'm' => 1,
      'h' => 60,
      _ => 1440,
    };

    // `0h` and `0d` are the same alert as `0m`; the server normalises them to
    // one lead time too, and two labels for one instant would be two alarms.
    final label = minutes == 0 ? kOwnMomentLabel : '$value$unit';
    if (!seen.add(label)) continue;

    planned.add((
      notifyAt: remindAt.subtract(Duration(minutes: minutes)),
      label: label,
    ));
  }

  planned.sort((a, b) => a.notifyAt.compareTo(b.notifyAt));
  return planned
      .where((p) => p.label == kOwnMomentLabel || p.notifyAt.isAfter(notBefore))
      .toList();
}

/// The alerts the phone's own rows imply.
///
/// Two rules do the work, and they are the two the spec singles out:
///
/// * Quiet hours hold back an alert **Botvy generated** — every lead-time
///   warning — to the end of the window, and never move a moment the member
///   chose. A task due at 08:30 with an hour's warning and quiet hours until
///   08:00 alarms at 08:00 and at 08:30, not at 07:30 and 08:30.
/// * Nothing that has already happened is armed. A moment that passed while the
///   handset was off is gone; firing it late tells the member about a meeting
///   they have already missed and makes every stale alarm look like a bug.
List<PlannedAlert> planLocalAlerts({
  required List<AlertSource> sources,
  required List<String> defaultLeadTimes,
  required QuietHours quietHours,
  required tz.Location zone,
  required DateTime now,
}) {
  final planned = <PlannedAlert>[];

  for (final source in sources) {
    final leads = source.leadTimes.isEmpty
        ? defaultLeadTimes
        : source.leadTimes;

    // The member's own moment is **always** planned, whether or not `0m` is
    // among the lead times, and the server does the same: `desiredFor` in
    // `contexts/notifications/domain/alert-plan.ts` seeds the set with
    // `MEMBER_CHOSEN_LABEL` and then adds one alert per *non-zero* lead time.
    //
    // Prepending it here rather than falling back to it only when the list is
    // empty. The fallback shape was wrong in a way that was invisible for the
    // default preferences (`['1h','0m']`, which contains `0m` already) and
    // silent for anything else: a member whose lead times were `['1h']`, or a
    // reminder carrying its own `['15m']`, had the moment they actually asked
    // for planned by the server and *not* by the phone — so a handset that had
    // synced was skipped by the sweep and nobody was told at all. `planPings`
    // de-duplicates by label, so passing it twice costs nothing.
    //
    // A member who cleared their lead times asked for fewer warnings, not for
    // silence, and this is also what answers that: an empty or unreadable
    // preferences row still alarms the moment they chose.
    for (final ping in planPings(
      source.at,
      [kOwnMomentLabel, ...leads],
      now: now,
    )) {
      final notifyAt = ping.label == kOwnMomentLabel
          ? ping.notifyAt
          : _heldToWindowEnd(ping.notifyAt, quietHours, zone);

      // No retroactive firing — after the shift, because the shift can only
      // move an instant later and a held alert may now be in range again.
      if (!notifyAt.isAfter(now)) continue;

      planned.add(
        PlannedAlert(
          sourceKind: source.kind,
          sourceId: source.id,
          label: ping.label,
          notifyAt: notifyAt,
          title: source.title,
          body: leadText(ping.label),
          deepLink: source.deepLink,
        ),
      );
    }
  }

  return planned;
}

/// The union of what the phone worked out and what the server sent, capped.
///
/// De-duplicated on the server's own alert key, keeping the **local** row where
/// both sides have one. The phone's rows are at least as fresh as the last
/// sync's answer — the member may have edited the task since — and both sides
/// apply the same rule to the same moment, so preferring local costs no
/// accuracy and means an offline edit is alarmed correctly straight away.
/// What only the server can know (a meeting occurrence, an evening prompt, a
/// suggestion) has no local counterpart and simply survives.
List<PlannedAlert> mergeAlerts(
  List<PlannedAlert> local,
  List<PlannedAlert> fromServer, {
  int cap = kMaxScheduled,
}) {
  final byKey = <String, PlannedAlert>{};
  for (final alert in fromServer) {
    byKey[alert.key] = alert;
  }
  for (final alert in local) {
    byKey[alert.key] = alert;
  }

  final merged = byKey.values.toList()
    ..sort((a, b) => a.notifyAt.compareTo(b.notifyAt));

  // The nearest [cap] and no more. The rest are not lost: every sync, resume
  // and local edit re-plans from the rows, so the window rolls forward and
  // tomorrow's alerts are armed long before they matter.
  return merged.length <= cap ? merged : merged.sublist(0, cap);
}

/// The whole plan for this device, read from the database.
///
/// One function so that the scheduler and the parity test see the same set:
/// a test that reproduces the planning inline proves only that the test agrees
/// with itself.
Future<List<PlannedAlert>> plannedAlertsFor(
  AppDatabase db, {
  DateTime? now,
  int cap = kMaxScheduled,
}) async {
  final from = now ?? DateTime.now();

  final preferences = await (db.select(db.userPreferences)..limit(1))
      .getSingleOrNull();
  final profile = await (db.select(db.profiles)..limit(1)).getSingleOrNull();

  final quietHours = preferences == null
      ? QuietHours.none
      : QuietHours.parse(preferences.quietFrom, preferences.quietTo);
  final defaultLeadTimes = preferences == null
      ? const ['1h', kOwnMomentLabel]
      : decodeStringList(preferences.leadTimesJson);

  return mergeAlerts(
    planLocalAlerts(
      sources: await _alertSources(db, from, cap),
      defaultLeadTimes: defaultLeadTimes,
      quietHours: quietHours,
      zone: memberZone(profile?.timezone),
      now: from,
    ),
    await _serverAlerts(db, from, cap),
    cap: cap,
  );
}

/// The zone the member's wall clock runs in.
///
/// The profile's zone, not the server's and not blindly the handset's: times
/// belong to the user. `tz.local` is the fallback, and it is only a fallback —
/// resolving a due time against the wrong zone once shifted every extracted
/// reminder in v1 by three hours.
tz.Location memberZone(String? timezone) {
  try {
    if (timezone == null || timezone.isEmpty) return tz.local;
    return tz.getLocation(timezone);
  } catch (_) {
    // `tz.local` throws a `LateInitializationError` until
    // `initializeTimeZones()` has run, so the fallback needs a fallback: UTC is
    // built in and cannot fail. Reached by anything that resolves a zone before
    // the scheduler has initialised — a query in a test, or a screen that draws
    // before `main` has finished — where the alternative is not a wrong hour
    // but a crash.
    return tz.UTC;
  }
}

/// The member's own calendar date for an instant, as `YYYY-MM-DD`.
///
/// The key the rhythm is filed under: `daily_plans`, `checkins` and the tick's
/// three claim dates are all keyed on a *local date*, and the server resolves
/// every one of them against the profile's zone. So the phone has to resolve it
/// the same way or it reads the wrong day's plan — a member in Cairo asking for
/// "today" at 01:00 gets yesterday's row if the date is taken from a UTC
/// instant, and the whole Home screen is then a day behind for the first three
/// hours of every morning.
///
/// It lives next to [memberZone] because it is the same principle wearing a
/// different hat, and both are wanted by every feature that reads a date.
/// [addDays] shifts by whole *calendar* days rather than by 24 hours, which is
/// not the same thing twice a year: `TZDateTime.add(Duration(days: 1))` on the
/// evening the clock goes back lands at 23:00 the same date, so "tomorrow"
/// would be today. Rebuilding the date and letting the constructor normalise
/// `day + n` is what makes the DST day behave — the same reason the task
/// queries build their day boundaries this way.
String memberDate(DateTime instant, tz.Location zone, {int addDays = 0}) {
  final now = tz.TZDateTime.from(instant, zone);
  final local = tz.TZDateTime(zone, now.year, now.month, now.day + addDays);
  final month = local.month.toString().padLeft(2, '0');
  final day = local.day.toString().padLeft(2, '0');
  return '${local.year}-$month-$day';
}

/// The offsets the member's rows are stored as, or the defaults if the JSON is
/// unreadable. A member with a corrupt preferences row still gets reminded.
List<String> decodeStringList(String encoded) {
  try {
    final decoded = jsonDecode(encoded);
    if (decoded is! List) return const [];
    return decoded.map((e) => e.toString()).toList();
  } catch (_) {
    return const [];
  }
}

/// "1 hour before", for the notification's second line. Display text, derived
/// from the label rather than stored beside it, so the two cannot disagree.
String leadText(String label) {
  if (label == kOwnMomentLabel) return 'now';
  final match = RegExp(r'^(\d+)(m|h|d)$').firstMatch(label);
  if (match == null) return label;
  final value = int.parse(match.group(1)!);
  final unit = switch (match.group(2)!) {
    'm' => 'minute',
    'h' => 'hour',
    _ => 'day',
  };
  return '$value $unit${value == 1 ? '' : 's'} before';
}

/// The payload an armed notification carries, so a tap or an action knows what
/// it is about. JSON rather than a delimited string because the id is a UUID
/// the member never sees and a title is free text.
String encodeAlertPayload(PlannedAlert alert) => jsonEncode({
  'kind': alert.sourceKind,
  'id': alert.sourceId,
  'label': alert.label,
  if (alert.deepLink.isNotEmpty) 'deepLink': alert.deepLink,
});

/// What a notification tap or action was about, or null when the payload came
/// from somewhere else — a push, or a version of the app that wrote a different
/// shape. A malformed payload must not throw inside a platform callback.
({String kind, String id, String label, String? deepLink})? decodeAlertPayload(
  String payload,
) {
  try {
    final decoded = jsonDecode(payload);
    if (decoded is! Map) return null;
    final kind = decoded['kind'];
    final id = decoded['id'];
    if (kind is! String || id is! String) return null;
    return (
      kind: kind,
      id: id,
      label: decoded['label'] is String ? decoded['label'] as String : '',
      deepLink: decoded['deepLink'] is String
          ? decoded['deepLink'] as String
          : null,
    );
  } catch (_) {
    return null;
  }
}

/// Moves a system-generated instant to the end of the quiet window, if it lands
/// inside one. The member's own moments never reach here.
DateTime _heldToWindowEnd(
  DateTime notifyAt,
  QuietHours quietHours,
  tz.Location zone,
) {
  if (quietHours.isOff) return notifyAt;
  final local = tz.TZDateTime.from(notifyAt, zone);
  if (!quietHours.covers(local.hour * 60 + local.minute)) return notifyAt;

  // Handed back as a plain DateTime, not the TZDateTime the shift computed.
  // This database stores date-times as ISO text, and `TZDateTime.toString()`
  // appends the zone (`…+0300 +03:00`), which `DateTime.parse` then refuses:
  // a TZDateTime written to any drift column here is a row that can be
  // inserted and never read back. The instant is identical either way.
  final shifted = quietHours.endAfter(local);
  return DateTime.fromMillisecondsSinceEpoch(shifted.millisecondsSinceEpoch);
}

/// The local rows worth alarming: open timed tasks and active reminders.
///
/// Bounded by [cap] per kind rather than read whole. The plan only ever arms
/// the nearest [kMaxScheduled], so reading a member's whole backlog to throw
/// most of it away is work done on the UI thread for nothing.
Future<List<AlertSource>> _alertSources(
  AppDatabase db,
  DateTime from,
  int cap,
) async {
  final taskRows =
      await (db.select(db.tasks)
            ..where(
              (t) =>
                  t.deletedAt.isNull() &
                  t.status.equals('open') &
                  t.allDay.equals(false) &
                  t.dueAt.isNotNull() &
                  t.dueAt.isBiggerThanValue(from),
            )
            ..orderBy([(t) => OrderingTerm.asc(t.dueAt)])
            ..limit(cap))
          .get();

  final reminderRows =
      await (db.select(db.reminders)
            ..where(
              (r) => r.deletedAt.isNull() & r.status.equals('active'),
            )
            ..orderBy([(r) => OrderingTerm.asc(r.remindAt)]))
          .get();

  return [
    for (final task in taskRows)
      AlertSource(
        kind: 'task',
        id: task.id,
        title: task.title,
        at: task.dueAt!,
        deepLink: '/tasks/${task.id}',
      ),
    for (final reminder in reminderRows)
      // `snoozedUntil ?? remindAt` — the server's `effectiveAt`. A snoozed
      // reminder is planned from the new moment with the same lead times, which
      // is exactly what the saga does with a `ReminderSnoozed` event.
      if ((reminder.snoozedUntil ?? reminder.remindAt).isAfter(from))
        AlertSource(
          kind: 'reminder',
          id: reminder.id,
          title: reminder.title,
          at: reminder.snoozedUntil ?? reminder.remindAt,
          leadTimes: decodeStringList(reminder.leadTimesJson),
          deepLink: '/reminders/${reminder.id}',
        ),
  ];
}

/// The server's own planned alerts, as the last `/sync` returned them.
///
/// Passed through untouched: the saga already applied the member's quiet hours
/// before sending these, so shifting them again would hold a system alert twice
/// and move it a whole window late.
Future<List<PlannedAlert>> _serverAlerts(
  AppDatabase db,
  DateTime from,
  int cap,
) async {
  final rows =
      await (db.select(db.alertsLocal)
            ..where((a) => a.notifyAt.isBiggerThanValue(from))
            ..orderBy([(a) => OrderingTerm.asc(a.notifyAt)])
            ..limit(cap))
          .get();

  return [
    for (final row in rows)
      PlannedAlert(
        sourceKind: row.sourceKind,
        sourceId: row.sourceId,
        occurrenceAt: row.occurrenceAt,
        label: row.label,
        notifyAt: row.notifyAt,
        title: row.title,
        body: row.body,
        deepLink: row.deepLink,
      ),
  ];
}

/// Parses `HH:mm`, or null if it is not one.
int? _minuteOfDay(String value) {
  final match = RegExp(r'^(\d{1,2}):(\d{2})$').firstMatch(value.trim());
  if (match == null) return null;
  final hour = int.parse(match.group(1)!);
  final minute = int.parse(match.group(2)!);
  if (hour > 23 || minute > 59) return null;
  return hour * 60 + minute;
}
