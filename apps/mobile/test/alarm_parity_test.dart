import 'dart:convert';

import 'package:botvy/core/db/database.dart';
import 'package:botvy/core/notifications/alert_plan.dart';
import 'package:drift/drift.dart' show Value;
import 'package:drift/native.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:timezone/data/latest_all.dart' as tzdata;
import 'package:timezone/timezone.dart' as tz;

/// The phone's alarm plan against the server's.
///
/// **These two planners are a matched pair.** The device schedules its own
/// alarms from its local rows so they fire with no network and no Google
/// reachability; the server's sweep is the fallback and *skips a device that
/// has already synced*. So if the two sets differ, the member is either told
/// twice or — where the phone plans less than the server thought it would —
/// not at all, silently, because the sweep believed the handset had it.
///
/// The server's rules are transcribed below from
/// `apps/backend/src/contexts/notifications/domain/alert-plan.ts` (`desiredFor`,
/// `sendAt`, `isQuiet`, `endOfQuietHours`). A transcription and not an import,
/// because the two implementations are in different languages and there is no
/// way to run one from the other in a hermetic Dart test. What that buys is
/// still worth having: the transcription is short, it is annotated as a
/// transcription, and the phone's plan is compared against it row for row — so
/// a change to *either* planner that is not made to both fails here. What it
/// does not buy is protection against somebody editing the server file and this
/// one together without thinking, which is what code review is for.
///
/// Every fixture is relative to `Date.now()`. Where a wall clock matters —
/// quiet hours are wall-clock hours — the moment is "tomorrow at HH:MM in the
/// member's zone", which pins the clock face without pinning the date.
void main() {
  tzdata.initializeTimeZones();

  /// Not UTC and not the runner's zone, so a plan resolved against the wrong
  /// clock fails here rather than passing by coincidence.
  final cairo = tz.getLocation('Africa/Cairo');
  const timezone = 'Africa/Cairo';

  DateTime memberWallClock(int hour, int minute, {int inDays = 1}) {
    final today = tz.TZDateTime.now(cairo);
    final wall = tz.TZDateTime(
      cairo,
      today.year,
      today.month,
      today.day + inDays,
      hour,
      minute,
    );
    return DateTime.fromMillisecondsSinceEpoch(
      wall.millisecondsSinceEpoch,
      isUtc: true,
    );
  }

  late AppDatabase db;

  setUp(() => db = AppDatabase.forTesting(NativeDatabase.memory()));
  tearDown(() => db.close());

  Future<void> seedMember({
    List<String> leadTimes = const ['1h', '0m'],
    String quietFrom = '22:00',
    String quietTo = '07:00',
  }) async {
    await db.into(db.profiles).insert(
      ProfilesCompanion.insert(
        userId: 'member-1',
        timezone: timezone,
        locale: 'en',
        fetchedAt: DateTime.now().toUtc(),
      ),
    );
    await db.into(db.userPreferences).insert(
      UserPreferencesCompanion.insert(
        userId: 'member-1',
        planTomorrowTime: '21:00',
        endOfDayTime: '22:00',
        morningBriefingTime: '08:00',
        nextPracticeCutoff: '20:00',
        leadTimesJson: Value(jsonEncode(leadTimes)),
        quietFrom: quietFrom,
        quietTo: quietTo,
        weekStartsOn: 'monday',
        checkinEnabled: true,
        meetingDurationMin: 30,
        mealMode: 'llm',
        aiSuggestions: true,
        fetchedAt: DateTime.now().toUtc(),
      ),
    );
  }

  /// The plan, as `(label, notifyAt)` pairs — which is what has to match. The
  /// title and body are display text and may differ between a phone and a
  /// server without anybody being notified twice.
  Set<String> pairs(Iterable<({String label, DateTime notifyAt})> plan) => {
    for (final entry in plan)
      '${entry.label}@${entry.notifyAt.toUtc().toIso8601String()}',
  };

  Set<String> phonePairs(List<PlannedAlert> plan) => pairs([
    for (final alert in plan) (label: alert.label, notifyAt: alert.notifyAt),
  ]);

  group('a timed task', () {
    test('plans the same set as the saga', () async {
      await seedMember();
      final dueAt = memberWallClock(14, 0);
      await db.into(db.tasks).insert(
        TasksCompanion.insert(
          id: 'task-1',
          title: 'Call the dentist',
          dueAt: Value(dueAt),
          allDay: const Value(false),
          createdAt: DateTime.now().toUtc(),
          updatedAt: DateTime.now().toUtc(),
        ),
      );

      final phone = await plannedAlertsFor(db, now: DateTime.now().toUtc());
      final server = serverDesiredFor(
        moment: dueAt,
        leadTimes: const ['1h', '0m'],
        quiet: const (from: '22:00', to: '07:00'),
        zone: cairo,
        includeLeadTimes: true,
      );

      expect(phonePairs(phone), pairs(server));
      expect(phonePairs(phone).length, 2);
    });
  });

  group('a reminder carrying its own lead times', () {
    test('plans the member\'s own moment even when 0m is not among them',
        () async {
      // The case that was wrong. The server *seeds* the set with the
      // member-chosen moment and then adds one alert per non-zero lead time;
      // the phone used to derive `0m` only from the lead-time list, so a
      // reminder with `['15m','1h']` had the moment the member actually asked
      // for planned by the server and not by the phone — and the sweep skipped
      // the handset, so nobody was told at all.
      await seedMember();
      final remindAt = memberWallClock(15, 30);
      await db.into(db.reminders).insert(
        RemindersCompanion.insert(
          id: 'reminder-1',
          title: 'Take the bins out',
          remindAt: remindAt,
          leadTimesJson: const Value('["15m","1h"]'),
          createdAt: DateTime.now().toUtc(),
          updatedAt: DateTime.now().toUtc(),
        ),
      );

      final phone = await plannedAlertsFor(db, now: DateTime.now().toUtc());
      final server = serverDesiredFor(
        moment: remindAt,
        leadTimes: const ['15m', '1h'],
        quiet: const (from: '22:00', to: '07:00'),
        zone: cairo,
        includeLeadTimes: true,
      );

      expect(phonePairs(phone), pairs(server));
      expect(
        phonePairs(phone),
        contains('0m@${remindAt.toUtc().toIso8601String()}'),
      );
    });

    test('a snooze is planned from the new moment with the same leads',
        () async {
      await seedMember();
      final remindAt = memberWallClock(9, 0);
      final snoozedUntil = memberWallClock(11, 0);
      await db.into(db.reminders).insert(
        RemindersCompanion.insert(
          id: 'reminder-2',
          title: 'Ring the bank',
          remindAt: remindAt,
          snoozedUntil: Value(snoozedUntil),
          leadTimesJson: const Value('["1h"]'),
          createdAt: DateTime.now().toUtc(),
          updatedAt: DateTime.now().toUtc(),
        ),
      );

      final phone = await plannedAlertsFor(db, now: DateTime.now().toUtc());
      // `snoozedUntil ?? remindAt` is the server's own `effectiveAt`, which is
      // what the saga plans a `ReminderSnoozed` from.
      final server = serverDesiredFor(
        moment: snoozedUntil,
        leadTimes: const ['1h'],
        quiet: const (from: '22:00', to: '07:00'),
        zone: cairo,
        includeLeadTimes: true,
      );

      expect(phonePairs(phone), pairs(server));
    });
  });

  group('quiet hours', () {
    test('hold a derived warning to the end of the window and never move the '
        'member\'s own moment', () async {
      await seedMember();
      // 07:30 with an hour's warning: the warning lands at 06:30, inside a
      // 22:00–07:00 window, so it waits until 07:00. The moment the member
      // chose is 07:30 and stays 07:30.
      final remindAt = memberWallClock(7, 30);
      await db.into(db.reminders).insert(
        RemindersCompanion.insert(
          id: 'reminder-3',
          title: 'Leave for the airport',
          remindAt: remindAt,
          leadTimesJson: const Value('["1h","0m"]'),
          createdAt: DateTime.now().toUtc(),
          updatedAt: DateTime.now().toUtc(),
        ),
      );

      final phone = await plannedAlertsFor(db, now: DateTime.now().toUtc());
      final server = serverDesiredFor(
        moment: remindAt,
        leadTimes: const ['1h', '0m'],
        quiet: const (from: '22:00', to: '07:00'),
        zone: cairo,
        includeLeadTimes: true,
      );

      expect(phonePairs(phone), pairs(server));
      // Spelt out as well as compared, so the assertion says what the rule is
      // rather than only that the two agree about it.
      expect(
        phonePairs(phone),
        containsAll([
          '0m@${remindAt.toUtc().toIso8601String()}',
          '1h@${memberWallClock(7, 0).toUtc().toIso8601String()}',
        ]),
      );
    });

    test('a warning in the small hours waits for this morning, not tomorrow\'s',
        () async {
      await seedMember();
      // 04:00 with an hour's warning: 03:00 is inside the *early* half of the
      // wrapping window, so the window ends at 07:00 the same day. Comparing
      // against `from` is what tells the two halves apart, and getting it wrong
      // holds the alert a whole day.
      final remindAt = memberWallClock(4, 0);
      await db.into(db.reminders).insert(
        RemindersCompanion.insert(
          id: 'reminder-4',
          title: 'Night shift',
          remindAt: remindAt,
          leadTimesJson: const Value('["1h"]'),
          createdAt: DateTime.now().toUtc(),
          updatedAt: DateTime.now().toUtc(),
        ),
      );

      final phone = await plannedAlertsFor(db, now: DateTime.now().toUtc());
      final server = serverDesiredFor(
        moment: remindAt,
        leadTimes: const ['1h'],
        quiet: const (from: '22:00', to: '07:00'),
        zone: cairo,
        includeLeadTimes: true,
      );

      expect(phonePairs(phone), pairs(server));
      expect(
        phonePairs(phone),
        contains('1h@${memberWallClock(7, 0).toUtc().toIso8601String()}'),
      );
    });

    test('an empty window is off on both sides', () async {
      await seedMember(quietFrom: '00:00', quietTo: '00:00');
      final remindAt = memberWallClock(3, 0);
      await db.into(db.reminders).insert(
        RemindersCompanion.insert(
          id: 'reminder-5',
          title: 'Early start',
          remindAt: remindAt,
          leadTimesJson: const Value('["1h"]'),
          createdAt: DateTime.now().toUtc(),
          updatedAt: DateTime.now().toUtc(),
        ),
      );

      final phone = await plannedAlertsFor(db, now: DateTime.now().toUtc());
      final server = serverDesiredFor(
        moment: remindAt,
        leadTimes: const ['1h'],
        quiet: const (from: '00:00', to: '00:00'),
        zone: cairo,
        includeLeadTimes: true,
      );

      expect(phonePairs(phone), pairs(server));
      expect(
        phonePairs(phone),
        contains('1h@${memberWallClock(2, 0).toUtc().toIso8601String()}'),
      );
    });
  });

  group('the server\'s alert already applied its own quiet hours', () {
    test('a pulled alert is armed at the instant it arrived with', () async {
      await seedMember();
      // The saga shifted this one before sending it. Re-applying the window on
      // this side would move a system alert twice and a whole window late,
      // which is why `_serverAlerts` passes the rows through untouched.
      final notifyAt = memberWallClock(7, 0);
      await db.into(db.alertsLocal).insert(
        AlertsLocalCompanion.insert(
          id: 'meeting|m-1|-|1h',
          sourceKind: 'meeting',
          sourceId: 'm-1',
          label: '1h',
          notifyAt: notifyAt,
          title: 'Standup',
          fetchedAt: DateTime.now().toUtc(),
        ),
      );

      final phone = await plannedAlertsFor(db, now: DateTime.now().toUtc());

      expect(phone.single.notifyAt, notifyAt);
    });
  });
}

// ───────────────────────────────────────────────────────────────────────────────
// The server's rules, transcribed.
//
// From `apps/backend/src/contexts/notifications/domain/alert-plan.ts`. Kept as
// close to the original as Dart allows — same function names, same order of
// checks — so a diff between the two files is readable rather than a
// translation exercise.
// ───────────────────────────────────────────────────────────────────────────────

typedef ServerQuietHours = ({String from, String to});

/// `leadMinutes` — a lead time in minutes, or null for anything unreadable.
int? serverLeadMinutes(String lead) {
  final match = RegExp(r'^(\d{1,3})([mhd])$').firstMatch(lead.trim().toLowerCase());
  if (match == null) return null;
  final count = int.parse(match.group(1)!);
  return switch (match.group(2)!) {
    'd' => count * 1440,
    'h' => count * 60,
    _ => count,
  };
}

/// `isQuiet` — a wall clock inside the window. `from > to` wraps midnight,
/// which is the normal case, so the comparison is a union at that end of the
/// day rather than a range.
bool serverIsQuiet(String hhmm, ServerQuietHours quiet) {
  if (quiet.from == quiet.to) return false;
  if (quiet.from.compareTo(quiet.to) < 0) {
    return hhmm.compareTo(quiet.from) >= 0 && hhmm.compareTo(quiet.to) < 0;
  }
  return hhmm.compareTo(quiet.from) >= 0 || hhmm.compareTo(quiet.to) < 0;
}

/// `endOfQuietHours` — the end of the window, on whichever day that lands.
DateTime serverEndOfQuietHours(
  DateTime notifyAt,
  ServerQuietHours quiet,
  tz.Location zone,
) {
  final local = tz.TZDateTime.from(notifyAt, zone);
  final nowHhMm = _hhmm(local);
  // Inside the late half of a wrapping window (23:00 with 22:00–07:00) the
  // window ends tomorrow; inside the early half (03:00) it ends today.
  final endsTomorrow =
      quiet.from.compareTo(quiet.to) > 0 && nowHhMm.compareTo(quiet.from) >= 0;
  final parts = quiet.to.split(':');
  final end = tz.TZDateTime(
    zone,
    local.year,
    local.month,
    local.day + (endsTomorrow ? 1 : 0),
    int.parse(parts.first),
    int.parse(parts.last),
  );
  return DateTime.fromMillisecondsSinceEpoch(
    end.millisecondsSinceEpoch,
    isUtc: true,
  );
}

/// `sendAt` — a moment the member chose is never moved; every warning Botvy
/// derived may be.
DateTime serverSendAt(
  DateTime notifyAt,
  String label,
  ServerQuietHours quiet,
  tz.Location zone,
) {
  if (label == '0m') return notifyAt;
  if (!serverIsQuiet(_hhmm(tz.TZDateTime.from(notifyAt, zone)), quiet)) {
    return notifyAt;
  }
  return serverEndOfQuietHours(notifyAt, quiet, zone);
}

/// `desiredFor` — the moment itself, plus one alert per non-zero lead time,
/// de-duplicated by label.
List<({String label, DateTime notifyAt})> serverDesiredFor({
  required DateTime moment,
  required List<String> leadTimes,
  required ServerQuietHours quiet,
  required tz.Location zone,
  required bool includeLeadTimes,
}) {
  final desired = <String, DateTime>{
    '0m': serverSendAt(moment, '0m', quiet, zone),
  };
  if (!includeLeadTimes) {
    return [for (final e in desired.entries) (label: e.key, notifyAt: e.value)];
  }

  for (final lead in leadTimes) {
    if (lead == '0m') continue; // already there, as the moment itself
    final minutes = serverLeadMinutes(lead);
    if (minutes == null || minutes == 0) continue;
    final raw = moment.subtract(Duration(minutes: minutes));
    desired[lead] = serverSendAt(raw, lead, quiet, zone);
  }

  return [for (final e in desired.entries) (label: e.key, notifyAt: e.value)];
}

String _hhmm(tz.TZDateTime moment) =>
    '${moment.hour.toString().padLeft(2, '0')}:'
    '${moment.minute.toString().padLeft(2, '0')}';
