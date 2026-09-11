import 'package:drift/drift.dart';
import 'package:timezone/timezone.dart' as tz;

import '../../../core/db/database.dart';
import '../../../core/notifications/alert_plan.dart'
    show memberDate, memberZone;
import '../../../core/recurrence/expander.dart';

/// The day, as the phone already holds it.
///
/// **Reads drift and nothing else.** No request, no GraphQL, no wait on a
/// socket: FR-010 is that the calendar and today's list are readable offline,
/// *including* working out where a repeating meeting falls, and the only way to
/// promise that is for these screens to have no network on their critical path
/// at all. The server has `AgendaQuery` and `MonthOverviewQuery` for the same
/// merge; they serve the extension and the web calendar, which are online by
/// construction. Calling one of them from here would break FR-010 the first
/// time the phone lost signal — and it would break it *silently*, because a
/// developer's phone always has wifi.
///
/// One window is expanded per load and the day and week views slice it, rather
/// than each of them expanding its own. That is the difference SC-003's
/// benchmark measures: a month of 200 occurrences is one expansion, and a week
/// view that re-expanded per day would do it seven times for the same rows.

/// What an agenda row is, so a screen can draw it as itself (FR-009).
///
/// [AgendaKind.preparation] is derived rather than stored: FR-002 says a
/// meeting's preparation time appears as its own block *before* the meeting,
/// which is one row on the screen and no row anywhere else.
///
/// [AgendaKind.training] is produced by nothing yet. P6 owns the Training
/// context and the `training_sessions` table; the kind exists here so the merge
/// and the legend are written once, and the day it starts arriving the screens
/// do not change. That is the phone's half of the null-safe `SessionsInRange`
/// stub the server binds for the same reason.
enum AgendaKind { meeting, preparation, task, training, event }

/// One row on a day.
class AgendaItem {
  const AgendaItem({
    required this.kind,
    required this.id,
    required this.title,
    required this.startAt,
    required this.endAt,
    this.originalStart,
    this.allDay = false,
    this.color,
    this.location = MeetingLocation.empty,
    this.moved = false,
    this.notes,
  });

  final AgendaKind kind;

  /// The owning row's id — a meeting's, a task's, an event's. What a tap opens.
  final String id;

  /// For an occurrence of a series: the moment the *rule* produced, which is
  /// what a skip or a move names. Null for a one-off and for anything that is
  /// not a meeting or an event.
  ///
  /// It is the id *and* this that identify an occurrence, which is why the two
  /// travel together: skipping "the meeting" is not a thing a member can do
  /// from a day view, and skipping "the meeting on this date" needs the date.
  final DateTime? originalStart;

  final String title;
  final DateTime startAt;
  final DateTime endAt;

  /// A whole-day personal event. Drawn apart from the timed items (story 4,
  /// scenario 1) rather than stretched across the day, because a birthday at
  /// "00:00–23:59" reads as an all-day meeting.
  final bool allDay;

  /// `#rrggbb` for a personal event, or null for the theme's own.
  final String? color;

  final MeetingLocation location;

  /// True when an override moved this occurrence, so the row can say so.
  final bool moved;

  final String? notes;

  /// True when this occurrence belongs to a repeating series, which is what
  /// decides whether skip and move are offered at all.
  bool get isOccurrence => originalStart != null;
}

/// Every item between two instants, in time order.
///
/// [timezone] is the member's IANA zone from the profile mirror. It is passed
/// down to the expander, which needs it for two different questions — see
/// `core/recurrence/expander.dart`'s two-zones note — and is never taken from
/// the handset here.
Future<List<AgendaItem>> localAgenda(
  AppDatabase db, {
  required DateTime from,
  required DateTime to,
  String? timezone,
}) async {
  final items = <AgendaItem>[
    ...await _meetings(db, from, to, timezone),
    ...await _events(db, from, to, timezone),
    ...await _timedTasks(db, from, to),
    ...await _trainingSessions(db, from, to),
  ];

  items.sort((left, right) {
    // All-day first, then by instant. Two sorts in one comparator because a
    // whole-day event's `startAt` is midnight and sorting on the instant alone
    // would bury it under an 00:30 alarm-clock task.
    if (left.allDay != right.allDay) return left.allDay ? -1 : 1;
    final byStart = left.startAt.compareTo(right.startAt);
    if (byStart != 0) return byStart;
    // A preparation block and its meeting can share a start when the member
    // set no preparation minutes; the block comes first, because that is what
    // it is for.
    return left.kind.index.compareTo(right.kind.index);
  });

  return items;
}

/// The local dates in [items] that hold at least one item of any kind (FR-009).
///
/// "Of any kind" is the requirement verbatim, and it is why this counts items
/// rather than meetings: a day with one timed task and nothing else is a busy
/// day, and a month view that only marked meetings would tell a member their
/// Thursday was free.
///
/// Derived from an already-expanded list rather than from its own query, so the
/// month markers and the day agenda can never disagree about which days are
/// busy.
Map<String, int> busyDays(
  List<AgendaItem> items, {
  String? timezone,
}) {
  final zone = memberZone(timezone);
  final counts = <String, int>{};
  for (final item in items) {
    // A preparation block is not a separate engagement — it is part of the
    // meeting it precedes — so it does not make a day busy on its own. It
    // never can: a block only exists where a meeting does, and that meeting is
    // in the same list.
    if (item.kind == AgendaKind.preparation) continue;
    final date = memberDate(item.startAt, zone);
    counts[date] = (counts[date] ?? 0) + 1;
  }
  return counts;
}

/// The instants a member's local day begins and ends.
///
/// Built from calendar fields rather than by adding 24 hours, which is not the
/// same thing twice a year: on the evening the clock goes back,
/// `add(Duration(days: 1))` lands at 23:00 the same date and "tomorrow" would
/// be today. The same reason the task queries build their boundaries this way.
({DateTime from, DateTime to}) dayWindow(String date, String? timezone) {
  final zone = memberZone(timezone);
  final parts = date.split('-').map(int.parse).toList();
  final start = tz.TZDateTime(zone, parts[0], parts[1], parts[2]);
  final end = tz.TZDateTime(zone, parts[0], parts[1], parts[2] + 1);
  return (from: _utc(start), to: _utc(end).subtract(const Duration(seconds: 1)));
}

/// The window covering a whole month, widened by a week either side.
///
/// The widening is not slack: `table_calendar` draws the days either side of
/// the month to fill its grid, and a member stepping to the next month sees
/// those cells before the load for it lands. A week is what the widest grid
/// shows.
({DateTime from, DateTime to}) monthWindow(
  DateTime anyDayInMonth,
  String? timezone,
) {
  final zone = memberZone(timezone);
  final local = tz.TZDateTime.from(anyDayInMonth, zone);
  final start = tz.TZDateTime(zone, local.year, local.month, 1 - 7);
  final end = tz.TZDateTime(zone, local.year, local.month + 1, 1 + 7);
  return (from: _utc(start), to: _utc(end));
}

/// The seven days of the week [anyDayInWeek] falls in, as local dates.
///
/// [weekStartsOn] is the member's own preference (`monday` or `sunday`), so a
/// member who reads weeks as starting on Sunday gets seven columns in that
/// order rather than a Monday grid with Sunday on the far end.
List<String> weekDates(
  DateTime anyDayInWeek,
  String? timezone, {
  String weekStartsOn = 'monday',
}) {
  final zone = memberZone(timezone);
  final local = tz.TZDateTime.from(anyDayInWeek, zone);
  final firstWeekday = weekStartsOn == 'sunday' ? DateTime.sunday : DateTime.monday;
  // `weekday` is 1..7 with Monday 1; the shift back to the week's own first day
  // is the same arithmetic either way once the start is expressed that way.
  final back = (local.weekday - firstWeekday + 7) % 7;
  return [
    for (var index = 0; index < 7; index++)
      memberDate(
        _utc(tz.TZDateTime(zone, local.year, local.month, local.day - back + index)),
        zone,
      ),
  ];
}

/// [items] grouped by the member's local date, ready for a week or month view.
Map<String, List<AgendaItem>> groupByDay(
  List<AgendaItem> items, {
  String? timezone,
}) {
  final zone = memberZone(timezone);
  final grouped = <String, List<AgendaItem>>{};
  for (final item in items) {
    grouped.putIfAbsent(memberDate(item.startAt, zone), () => []).add(item);
  }
  return grouped;
}

// ------------------------------------------------------------------ internals

Future<List<AgendaItem>> _meetings(
  AppDatabase db,
  DateTime from,
  DateTime to,
  String? timezone,
) async {
  // `status = 'scheduled'` is the one place a meeting's status touches the
  // calendar, and it mirrors `Meeting.occurrencesBetween` refusing to expand a
  // completed, cancelled or deleted one: a cancelled series shows nothing on
  // any future date (story 2, scenario 4). `notPendingOp` because a row on its
  // way out must not be drawn — and it has to be written that way, since
  // `NOT (pending_op = 'purge')` is NULL for every clean row and NULL is falsy.
  final rows = await (db.select(db.meetings)..where(
    (r) =>
        r.deletedAt.isNull() &
        r.status.equals('scheduled') &
        notPendingOp(r.pendingOp, PendingOps.purge),
  )).get();

  final items = <AgendaItem>[];
  for (final row in rows) {
    for (final occurrence in expandOccurrences(
      Repeating.ofMeeting(row),
      from,
      to,
      timezone,
    )) {
      items.add(
        AgendaItem(
          kind: AgendaKind.meeting,
          id: row.id,
          originalStart: occurrence.originalStart,
          title: occurrence.title,
          startAt: occurrence.startAt,
          endAt: occurrence.endAt,
          location: occurrence.location,
          moved: occurrence.moved,
          notes: row.description,
        ),
      );

      // The preparation block, before the meeting (FR-002). Derived here and
      // stored nowhere: it is one row on a screen and has no life of its own.
      if (row.prepMinutes > 0) {
        items.add(
          AgendaItem(
            kind: AgendaKind.preparation,
            id: row.id,
            originalStart: occurrence.originalStart,
            title: 'Prepare: ${occurrence.title}',
            startAt: occurrence.startAt.subtract(
              Duration(minutes: row.prepMinutes),
            ),
            endAt: occurrence.startAt,
            notes: row.prepNotes,
          ),
        );
      }
    }
  }
  return items;
}

Future<List<AgendaItem>> _events(
  AppDatabase db,
  DateTime from,
  DateTime to,
  String? timezone,
) async {
  final rows = await (db.select(db.calendarEvents)..where(
    (r) =>
        r.deletedAt.isNull() & notPendingOp(r.pendingOp, PendingOps.purge),
  )).get();

  return [
    for (final row in rows)
      for (final occurrence in expandOccurrences(
        Repeating.ofEvent(row),
        from,
        to,
        timezone,
      ))
        AgendaItem(
          kind: AgendaKind.event,
          id: row.id,
          originalStart: occurrence.originalStart,
          title: occurrence.title,
          startAt: occurrence.startAt,
          endAt: occurrence.endAt,
          allDay: row.allDay,
          color: row.color,
          notes: row.notes,
        ),
  ];
}

/// Tasks with a *time*, which is the whole of what the calendar shows of them.
///
/// `allDay = false` and `dueAt` not null: an all-day task has a date and no
/// moment, so it has no place in a day laid out by the clock — it belongs on
/// the Today list, which is where it already is. Putting it at midnight would
/// draw the member's whole day list before their 07:00 alarm.
///
/// The recurrence column is deliberately not expanded. Planning stores a
/// repeating task as a rule plus a single live `dueAt` and rolls it forward on
/// completion — the next occurrence does not exist until this one is ticked
/// off, so there is nothing to expand and expanding it would show dates the
/// member has not reached.
Future<List<AgendaItem>> _timedTasks(
  AppDatabase db,
  DateTime from,
  DateTime to,
) async {
  final rows = await (db.select(db.tasks)..where(
    (r) =>
        r.deletedAt.isNull() &
        r.status.equals('open') &
        r.allDay.equals(false) &
        r.dueAt.isNotNull() &
        r.dueAt.isBiggerOrEqualValue(from) &
        r.dueAt.isSmallerOrEqualValue(to) &
        notPendingOp(r.pendingOp, PendingOps.purge),
  )).get();

  return [
    for (final row in rows)
      AgendaItem(
        kind: AgendaKind.task,
        id: row.id,
        title: row.title,
        startAt: row.dueAt!,
        // A task is a moment rather than a stretch. `estimatedMinutes` is the
        // member's guess at how long it takes and is deliberately not used as
        // a length here: drawing a two-hour block for an estimate would claim
        // the member is busy from a number they entered as a note to
        // themselves.
        endAt: row.dueAt!,
        color: row.labelColor,
        notes: row.notes,
      ),
  ];
}

/// Training sessions, beside the meetings (FR-011, story 6).
///
/// Read straight from the phone's `sessions` rows and not expanded: a session
/// is a materialised row rather than a rule, because the timetable's expansion
/// happens on the server where the alerts and the program filling are — so
/// there is nothing here for `core/recurrence` to do.
///
/// Cancelled and skipped sessions are drawn rather than filtered, unlike a
/// cancelled meeting. That asymmetry is deliberate and it is the honest half of
/// FR-005: a skipped session **stays in the week marked skipped**, and a
/// calendar that quietly dropped it would make the record a list of the days
/// that went well. The row's status is what says which it is, and `isMissed` in
/// `features/athlete/application/athlete.dart` is what says a planned one has
/// passed.
Future<List<AgendaItem>> _trainingSessions(
  AppDatabase db,
  DateTime from,
  DateTime to,
) async {
  final rows = await (db.select(db.sessions)..where(
    (r) =>
        r.deletedAt.isNull() &
        notPendingOp(r.pendingOp, PendingOps.purge) &
        r.plannedAt.isBiggerOrEqualValue(from) &
        r.plannedAt.isSmallerOrEqualValue(to),
  )).get();

  return [
    for (final row in rows)
      AgendaItem(
        kind: AgendaKind.training,
        id: row.id,
        // A session with no name is still a session, and the sport reads fine
        // on its own — the sport is not translated here because this list is
        // built without a `BuildContext`; the screens translate it.
        title: row.title.isEmpty ? row.sport : row.title,
        startAt: row.plannedAt,
        // A real length, unlike a task: a session occupies the member's evening
        // and the day view should show it doing so.
        endAt: row.plannedAt.add(Duration(minutes: row.durationMin)),
        notes: row.focus,
      ),
  ];
}

DateTime _utc(tz.TZDateTime at) =>
    DateTime.fromMillisecondsSinceEpoch(at.millisecondsSinceEpoch, isUtc: true);
