import 'package:botvy/core/db/database.dart';
import 'package:botvy/core/notifications/alert_plan.dart';
import 'package:drift/drift.dart' show Value;
import 'package:drift/native.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:timezone/data/latest_all.dart' as tzdata;
import 'package:timezone/timezone.dart' as tz;

/// The phone's alarm plan.
///
/// Every fixture here is built from `DateTime.now()`, never from a pinned
/// calendar date: alert planning drops a moment that has already passed, so a
/// fixture dated in the future starts failing the day the clock reaches it, and
/// one dated in the past never tested anything at all.
///
/// Where a *wall clock* matters — quiet hours are wall-clock hours — the moment
/// is built as "tomorrow at 08:30 in the member's own zone", which pins the
/// clock face without pinning the date.
void main() {
  // Before anything asks for a zone, and not in a `setUpAll`: the fixtures
  // below are built while `main` runs, which is earlier than any hook.
  tzdata.initializeTimeZones();

  /// A zone that is not UTC and not the machine's, so a plan resolved against
  /// the server's or the runner's clock instead of the member's fails here.
  final cairo = tz.getLocation('Africa/Cairo');

  /// Tomorrow at [hour]:[minute], as the member's clock reads it.
  ///
  /// Returned as a plain [DateTime] rather than the [tz.TZDateTime] it was
  /// computed from: this database stores date-times as ISO text and
  /// `TZDateTime.toString()` appends the zone, so a TZDateTime written to a
  /// column goes in and never comes back out. Same instant, readable row.
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
    return DateTime.fromMillisecondsSinceEpoch(wall.millisecondsSinceEpoch);
  }

  group('notificationIdFor', () {
    test('is stable, 31-bit, and keyed by source and label', () {
      final id = notificationIdFor('reminder-1', '1h');

      expect(id, notificationIdFor('reminder-1', '1h'));
      expect(id, greaterThanOrEqualTo(0));
      expect(id, lessThan(0x80000000));
      // The label is half the key: two alerts for one source must not collide,
      // or arming the second cancels the first.
      expect(id, isNot(notificationIdFor('reminder-1', '0m')));
      expect(id, isNot(notificationIdFor('reminder-2', '1h')));
    });
  });

  group('planPings', () {
    test('labels each offset the way the server stores it', () {
      final at = DateTime.now().add(const Duration(days: 2));

      final pings = planPings(at, ['1d', '1h', '30m', '0m']);

      expect(
        pings.map((p) => p.label),
        ['1d', '1h', '30m', '0m'],
        reason: 'sorted by the moment they fire, earliest first',
      );
      expect(pings.last.notifyAt, at);
      expect(pings.first.notifyAt, at.subtract(const Duration(days: 1)));
    });

    test('drops a lead time that has already passed', () {
      final at = DateTime.now().add(const Duration(minutes: 10));

      final pings = planPings(at, ['1h', '0m']);

      // The hour's warning was due 50 minutes ago; the member's own moment is
      // still ahead and survives.
      expect(pings.map((p) => p.label), [kOwnMomentLabel]);
    });

    test('treats 0h and 0m as one alert', () {
      final at = DateTime.now().add(const Duration(hours: 3));

      expect(planPings(at, ['0h', '0m']).map((p) => p.label), [
        kOwnMomentLabel,
      ]);
    });

    test('ignores an offset that is not one', () {
      final at = DateTime.now().add(const Duration(hours: 3));

      expect(planPings(at, ['soon', '', '1h']).map((p) => p.label), ['1h']);
    });
  });

  group('quiet hours', () {
    final quiet = QuietHours.parse('22:00', '08:00');

    test('covers the hours either side of midnight', () {
      expect(quiet.covers(22 * 60), isTrue);
      expect(quiet.covers(3 * 60), isTrue);
      expect(quiet.covers(7 * 60 + 59), isTrue);
      expect(quiet.covers(8 * 60), isFalse);
      expect(quiet.covers(12 * 60), isFalse);
    });

    test('an empty window is off', () {
      expect(QuietHours.parse('22:00', '22:00').isOff, isTrue);
      expect(QuietHours.parse('22:00', '22:00').covers(23 * 60), isFalse);
    });

    test('an unreadable preference is off rather than silent', () {
      // The alternative — treating a malformed window as "all day" — would
      // hold every alert until a time nobody can name, and look like a broken
      // scheduler.
      expect(QuietHours.parse('not a time', 'nor this').isOff, isTrue);
    });

    /// The spec's own scenario (US6, acceptance 1), which is the whole rule:
    /// the derived warning is held, the member's moment is not.
    test('holds the derived warning and never the member\'s own moment', () {
      final due = memberWallClock(8, 30);

      final plan = planLocalAlerts(
        sources: [
          AlertSource(kind: 'task', id: 't-1', title: 'Standup', at: due),
        ],
        defaultLeadTimes: const ['1h', '0m'],
        quietHours: quiet,
        zone: cairo,
        now: DateTime.now(),
      );

      final byLabel = {for (final a in plan) a.label: a.notifyAt};
      expect(byLabel.keys, containsAll(['1h', kOwnMomentLabel]));
      // 07:30 was inside the window, so the warning waits for 08:00 …
      expect(tz.TZDateTime.from(byLabel['1h']!, cairo).hour, 8);
      expect(tz.TZDateTime.from(byLabel['1h']!, cairo).minute, 0);
      // … and the moment the member chose is untouched.
      expect(byLabel[kOwnMomentLabel], due);
    });

    test('leaves a member moment inside the window exactly where it is', () {
      final at = memberWallClock(23, 15);

      final plan = planLocalAlerts(
        sources: [
          AlertSource(
            kind: 'reminder',
            id: 'r-1',
            title: 'Take the medicine',
            at: at,
            leadTimes: const ['0m'],
          ),
        ],
        defaultLeadTimes: const ['1h'],
        quietHours: quiet,
        zone: cairo,
        now: DateTime.now(),
      );

      expect(plan, hasLength(1));
      expect(plan.single.notifyAt, at);
      expect(plan.single.isMemberChosen, isTrue);
    });

    test('releases a warning from the small hours the same morning', () {
      // 02:00 is deep inside a 22:00 → 08:00 window: the release is that day's
      // 08:00, not the next one. Getting the wrap-around backwards delays the
      // alert by a full day, which is indistinguishable from losing it.
      final due = memberWallClock(3, 0, inDays: 2);

      final plan = planLocalAlerts(
        sources: [
          AlertSource(kind: 'task', id: 't-2', title: 'Flight', at: due),
        ],
        defaultLeadTimes: const ['1h'],
        quietHours: quiet,
        zone: cairo,
        now: DateTime.now(),
      );

      final released = tz.TZDateTime.from(plan.single.notifyAt, cairo);
      expect(released.hour, 8);
      expect(released.day, tz.TZDateTime.from(due, cairo).day);
    });
  });

  group('planLocalAlerts', () {
    test('never arms a moment that has already passed', () {
      final now = DateTime.now();

      final plan = planLocalAlerts(
        sources: [
          AlertSource(
            kind: 'reminder',
            id: 'r-old',
            title: 'Yesterday',
            at: now.subtract(const Duration(hours: 2)),
            leadTimes: const ['1h', '0m'],
          ),
        ],
        defaultLeadTimes: const ['1h'],
        quietHours: QuietHours.none,
        zone: cairo,
        now: now,
      );

      expect(plan, isEmpty);
    });

    test('alarms the member\'s moment even with no lead times at all', () {
      final at = DateTime.now().add(const Duration(hours: 5));

      final plan = planLocalAlerts(
        sources: [
          AlertSource(kind: 'reminder', id: 'r-1', title: 'Call back', at: at),
        ],
        defaultLeadTimes: const [],
        quietHours: QuietHours.none,
        zone: cairo,
        now: DateTime.now(),
      );

      expect(plan.map((a) => a.label), [kOwnMomentLabel]);
    });
  });

  group('mergeAlerts', () {
    PlannedAlert alert(String id, String label, Duration ahead, String title) =>
        PlannedAlert(
          sourceKind: 'task',
          sourceId: id,
          label: label,
          notifyAt: DateTime.now().add(ahead),
          title: title,
        );

    test('keeps the local row where both sides have the same alert', () {
      final merged = mergeAlerts(
        [alert('t-1', '0m', const Duration(hours: 1), 'Renamed here')],
        [alert('t-1', '0m', const Duration(hours: 1), 'Stale server copy')],
      );

      expect(merged, hasLength(1));
      expect(merged.single.title, 'Renamed here');
    });

    test('keeps what only the server could know', () {
      final merged = mergeAlerts(
        [alert('t-1', '0m', const Duration(hours: 2), 'Local task')],
        [
          PlannedAlert(
            sourceKind: 'rhythm',
            sourceId: 'evening',
            label: 'evening',
            notifyAt: DateTime.now().add(const Duration(hours: 1)),
            title: 'Plan tomorrow',
          ),
        ],
      );

      expect(merged.map((a) => a.sourceKind), ['rhythm', 'task']);
    });

    test('arms the nearest 50 and no more', () {
      final many = [
        for (var i = 0; i < 70; i++)
          alert('t-$i', '0m', Duration(hours: i + 1), 'Task $i'),
      ];

      final merged = mergeAlerts(many, const []);

      expect(merged, hasLength(kMaxScheduled));
      expect(merged.first.sourceId, 't-0');
      expect(merged.last.sourceId, 't-49');
    });
  });

  group('plannedAlertsFor', () {
    late AppDatabase db;

    setUp(() async {
      db = AppDatabase.forTesting(NativeDatabase.memory());
      await db
          .into(db.profiles)
          .insert(
            ProfilesCompanion.insert(
              userId: 'u-1',
              timezone: 'Africa/Cairo',
              locale: 'en',
              fetchedAt: DateTime.now(),
            ),
          );
      await db
          .into(db.userPreferences)
          .insert(
            UserPreferencesCompanion.insert(
              userId: 'u-1',
              planTomorrowTime: '21:00',
              endOfDayTime: '22:00',
              morningBriefingTime: '08:00',
              nextPracticeCutoff: '21:00',
              leadTimesJson: const Value('["1h","0m"]'),
              quietFrom: '22:00',
              quietTo: '08:00',
              weekStartsOn: 'monday',
              checkinEnabled: true,
              meetingDurationMin: 30,
              mealMode: 'llm',
              aiSuggestions: true,
              fetchedAt: DateTime.now(),
            ),
          );
    });

    tearDown(() => db.close());

    Future<void> insertTask(
      String id, {
      required DateTime? dueAt,
      String status = 'open',
      bool allDay = false,
      DateTime? deletedAt,
    }) => db.into(db.tasks).insert(
      TasksCompanion.insert(
        id: id,
        title: 'Task $id',
        dueAt: Value(dueAt),
        allDay: Value(allDay),
        status: Value(status),
        deletedAt: Value(deletedAt),
        updatedAt: DateTime.now(),
        createdAt: DateTime.now(),
      ),
    );

    test('plans the member\'s rows and the server\'s alerts together', () async {
      final due = memberWallClock(14, 0);
      await insertTask('t-1', dueAt: due);
      await db
          .into(db.reminders)
          .insert(
            RemindersCompanion.insert(
              id: 'r-1',
              title: 'Ring the clinic',
              remindAt: due.add(const Duration(hours: 1)),
              leadTimesJson: const Value('["0m"]'),
              updatedAt: DateTime.now(),
              createdAt: DateTime.now(),
            ),
          );
      await db
          .into(db.alertsLocal)
          .insert(
            AlertsLocalCompanion.insert(
              id: 'meeting|m-1|-|prep',
              sourceKind: 'meeting',
              sourceId: 'm-1',
              label: 'prep',
              notifyAt: due.add(const Duration(hours: 2)),
              title: 'Standup',
              fetchedAt: DateTime.now(),
            ),
          );

      final plan = await plannedAlertsFor(db);

      expect(
        plan.map((a) => '${a.sourceKind}:${a.label}'),
        ['task:1h', 'task:0m', 'reminder:0m', 'meeting:prep'],
      );
    });

    test('a snoozed reminder is planned from the snooze, not the original',
        () async {
      final asked = DateTime.now().add(const Duration(minutes: 20));
      final snoozed = asked.add(const Duration(hours: 4));
      await db
          .into(db.reminders)
          .insert(
            RemindersCompanion.insert(
              id: 'r-1',
              title: 'Stretch',
              remindAt: asked,
              snoozedUntil: Value(snoozed),
              leadTimesJson: const Value('["0m"]'),
              updatedAt: DateTime.now(),
              createdAt: DateTime.now(),
            ),
          );

      final plan = await plannedAlertsFor(db);

      expect(plan.single.notifyAt, snoozed);
    });

    test('ignores what has nothing to alarm', () async {
      final due = memberWallClock(14, 0);
      // No time of day at all: waking somebody at midnight is not what "due
      // tomorrow" means.
      await insertTask('all-day', dueAt: due, allDay: true);
      // Dealt with, and cancelled — a delete never changed either status, so
      // the status is what has to be read here.
      await insertTask('done', dueAt: due, status: 'completed');
      await insertTask('cancelled', dueAt: due, status: 'cancelled');
      // Deleted, and still carrying its status for the Deleted view.
      await insertTask(
        'deleted',
        dueAt: due,
        deletedAt: DateTime.now(),
      );
      await insertTask('no-date', dueAt: null);

      expect(await plannedAlertsFor(db), isEmpty);
    });

    test('resolves quiet hours against the member\'s zone', () async {
      // 08:30 Cairo with an hour's warning, quiet until 08:00: the warning is
      // held to 08:00 Cairo. Resolved against UTC instead — the v1 three-hour
      // shift — it would have been left at 07:30 and woken them.
      await insertTask('t-1', dueAt: memberWallClock(8, 30));

      final plan = await plannedAlertsFor(db);
      final warning = plan.firstWhere((a) => a.label == '1h');

      final local = tz.TZDateTime.from(warning.notifyAt, tz.getLocation('Africa/Cairo'));
      expect(local.hour, 8);
      expect(local.minute, 0);
    });
  });
}
