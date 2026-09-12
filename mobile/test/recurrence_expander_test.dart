import 'package:botvy/core/recurrence/expander.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:timezone/data/latest_all.dart' as tzdata;
import 'package:timezone/timezone.dart' as tz;

/// The recurrence table, the phone's half.
///
/// **The same table, case for case, as the server's
/// `backend/src/contexts/meetings/meetings-recurrence.spec.ts`** — the
/// group and test names are deliberately identical so the two files can be
/// diffed by eye. Two expanders exist because the calendar has to work with the
/// network off (FR-010), and one fixture table is what stops them diverging: a
/// divergence must fail *here*.
///
/// ## Every date is computed from the clock, never written down
///
/// `DateTime.now()` is the anchor for all of it: the next 31st, the next offset
/// change in a zone that observes daylight saving, tomorrow's weekday. A
/// fixture pinned to a real date is a time bomb — it passes until the day the
/// clock reaches it, and the month-end and clock-change cases are exactly the
/// ones whose literal dates rot. `nextOffsetChange` finds the transition by
/// asking the zone rather than by knowing when Europe moves its clocks, so a
/// rule change in some future year is a fixture that keeps working.
///
/// The server's fixtures go through `Meeting.schedule`, whose status branch
/// ("expands to nothing once completed, cancelled or deleted") lives in the
/// aggregate. The phone has no aggregate — the status filter is in the query
/// that feeds the agenda — so that one case is asserted in
/// `test/meetings_cubit_test.dart` instead, against the cubit that owns it.
const String cairo = 'Africa/Cairo';
const String berlin = 'Europe/Berlin';
const int dayMs = 86400000;

void main() {
  setUpAll(tzdata.initializeTimeZones);

  // ----------------------------------------------------------- clock helpers

  /// The instant a wall clock names in a zone, on a given local date.
  DateTime at(String date, String hhmm, String zone) {
    final parts = date.split('-').map(int.parse).toList();
    final time = hhmm.split(':').map(int.parse).toList();
    final resolved = tz.TZDateTime(
      tz.getLocation(zone),
      parts[0],
      parts[1],
      parts[2],
      time[0],
      time[1],
    );
    return DateTime.fromMillisecondsSinceEpoch(
      resolved.millisecondsSinceEpoch,
      isUtc: true,
    );
  }

  /// `YYYY-MM-DD` in a zone, for an instant.
  String localDate(DateTime instant, String zone) {
    final local = tz.TZDateTime.from(instant, tz.getLocation(zone));
    return '${local.year.toString().padLeft(4, '0')}-'
        '${local.month.toString().padLeft(2, '0')}-'
        '${local.day.toString().padLeft(2, '0')}';
  }

  /// `HH:mm` in a zone, for an instant.
  String localHhMm(DateTime instant, String zone) {
    final local = tz.TZDateTime.from(instant, tz.getLocation(zone));
    return '${local.hour.toString().padLeft(2, '0')}:'
        '${local.minute.toString().padLeft(2, '0')}';
  }

  String addLocalDays(String date, int days) {
    final parts = date.split('-').map(int.parse).toList();
    final moved = DateTime.utc(parts[0], parts[1], parts[2] + days);
    return moved.toIso8601String().substring(0, 10);
  }

  String today(String zone) => localDate(DateTime.now().toUtc(), zone);

  /// `MO`, `TU`, … for a local date, which is what an RRULE's `BYDAY` wants.
  String byDayOf(String date) {
    final parts = date.split('-').map(int.parse).toList();
    final weekday = DateTime.utc(parts[0], parts[1], parts[2], 12).weekday;
    return const ['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU'][weekday - 1];
  }

  /// The next local date on or after today whose day-of-month is [day].
  String nextDayOfMonth(int day, String zone) {
    var date = today(zone);
    for (var index = 0; index < 400; index++) {
      if (int.parse(date.substring(8, 10)) == day) return date;
      date = addLocalDays(date, 1);
    }
    throw StateError('no ${day}th within a year');
  }

  int offsetAtNoon(String date, String zone) {
    final parts = date.split('-').map(int.parse).toList();
    return at(date, '12:00', zone).millisecondsSinceEpoch -
        DateTime.utc(parts[0], parts[1], parts[2], 12).millisecondsSinceEpoch;
  }

  /// The next local date in [zone] whose UTC offset differs from the day
  /// before — a clock change, in whichever direction the zone is about to move.
  ///
  /// Found by comparing what 12:00 costs in UTC on consecutive days, so it
  /// needs no table of transition dates and stays correct through a rule
  /// change. Midday rather than midnight because a spring-forward gap can
  /// swallow 00:30 and make two adjacent days look identical.
  String? nextOffsetChange(String zone) {
    var date = today(zone);
    var previous = offsetAtNoon(date, zone);
    for (var index = 0; index < 430; index++) {
      final next = addLocalDays(date, 1);
      final offset = offsetAtNoon(next, zone);
      if (offset != previous) return next;
      previous = offset;
      date = next;
    }
    return null;
  }

  // ------------------------------------------------------------ the fixtures

  MeetingRecurrence rule(
    String rrule,
    DateTime dtstart, {
    List<DateTime> exdates = const [],
    List<OccurrenceOverride> overrides = const [],
  }) => MeetingRecurrence(
    dtstart: dtstart,
    rrule: rrule,
    exdates: exdates,
    overrides: overrides,
  );

  /// The phone's stand-in for `meetingFixture`. Same defaults: a 30-minute
  /// online standup at 18:00, authored in Cairo, unpinned.
  Repeating meetingFixture({
    DateTime? startAt,
    int durationMin = 30,
    MeetingRecurrence? recurrence,
    String? lockTimezone,
    String authoredTimezone = cairo,
  }) => Repeating(
    title: 'Standup',
    startAt: startAt ?? at(today(cairo), '18:00', cairo),
    durationMin: durationMin,
    location: const MeetingLocation(onlineLink: 'https://meet.example/abc'),
    recurrence: recurrence,
    lockTimezone: lockTimezone,
    authoredTimezone: authoredTimezone,
  );

  /// `repeating` on the server: the location is a room rather than a link,
  /// which is the only difference and is what the rule helpers exercise.
  Repeating repeating({
    required DateTime startAt,
    int durationMin = 30,
    MeetingRecurrence? recurrence,
    String? lockTimezone,
  }) => Repeating(
    title: 'Standup',
    startAt: startAt,
    durationMin: durationMin,
    location: const MeetingLocation(address: 'Room 1'),
    recurrence: recurrence,
    lockTimezone: lockTimezone,
    authoredTimezone: cairo,
  );

  DateTime shift(DateTime at, int ms) => DateTime.fromMillisecondsSinceEpoch(
    at.millisecondsSinceEpoch + ms,
    isUtc: true,
  );

  // ------------------------------------------------------------- the table

  group('a one-off meeting', () {
    test('appears in a window that contains it and not in one that does not',
        () {
      final date = today(cairo);
      final meeting = meetingFixture();

      final inside = expandOccurrences(
        meeting,
        at(date, '00:00', cairo),
        at(date, '23:59', cairo),
        cairo,
      );
      expect(inside, hasLength(1));
      expect(localHhMm(inside.first.startAt, cairo), '18:00');

      final after = expandOccurrences(
        meeting,
        at(addLocalDays(date, 3), '00:00', cairo),
        at(addLocalDays(date, 4), '00:00', cairo),
        cairo,
      );
      expect(after, isEmpty);
    });

    test('is included when it is already under way as the window opens', () {
      // A meeting from 17:45 to 18:15 belongs on an agenda for 18:00 onwards.
      // A window test on `startAt` alone would drop it, and the member would
      // read as free during a call they are on.
      final date = today(cairo);
      final meeting = meetingFixture(startAt: at(date, '17:45', cairo));

      final found = expandOccurrences(
        meeting,
        at(date, '18:00', cairo),
        at(date, '19:00', cairo),
        cairo,
      );
      expect(found, hasLength(1));
    });
  });

  group('a weekly series', () {
    test(
        'puts the first occurrence on the next matching day, not eight days out',
        () {
      // The spec's first edge case: a weekly meeting created on a Sunday for
      // "every Monday" starts tomorrow. Written with *tomorrow's* weekday
      // whatever day the suite runs, so it is the same assertion every day of
      // the week rather than one that only means something on Sundays.
      final start = today(cairo);
      final tomorrow = addLocalDays(start, 1);
      final anchor = at(start, '18:00', cairo);
      final meeting = meetingFixture(
        startAt: anchor,
        recurrence: rule('FREQ=WEEKLY;BYDAY=${byDayOf(tomorrow)}', anchor),
      );

      final found = expandOccurrences(
        meeting,
        at(start, '00:00', cairo),
        at(addLocalDays(start, 8), '00:00', cairo),
        cairo,
      );

      expect(localDate(found.first.startAt, cairo), tomorrow);
      expect(localHhMm(found.first.startAt, cairo), '18:00');
    });

    test('keeps its local wall time across a clock change (FR-007, SC-005)',
        () {
      final change = nextOffsetChange(berlin);
      if (change == null) {
        // A zone that has stopped observing daylight saving would make this
        // vacuous rather than failing, and saying so is better than a green
        // tick that proves nothing.
        expect(
          change,
          isNotNull,
          reason: 'Europe/Berlin no longer changes its clocks',
        );
        return;
      }

      // Anchored a fortnight before the change so the series crosses it.
      final start = addLocalDays(change, -14);
      final anchor = at(start, '18:00', berlin);
      final meeting = meetingFixture(
        // Written *in* Berlin, so Berlin is the authored zone. Passing Cairo
        // here would be a fixture describing a member who wrote a Berlin wall
        // clock while reading a Cairo one, which is not a state that exists —
        // and the expander would rightly re-read the digits as 19:00.
        authoredTimezone: berlin,
        startAt: anchor,
        recurrence: rule('FREQ=DAILY;COUNT=28', anchor),
      );

      final found = expandOccurrences(
        meeting,
        at(start, '00:00', berlin),
        at(addLocalDays(start, 28), '00:00', berlin),
        berlin,
      );

      expect(found.length, greaterThan(20));
      for (final occurrence in found) {
        expect(localHhMm(occurrence.startAt, berlin), '18:00');
      }
      // And the instants really do differ either side of the change —
      // otherwise the assertion above would also pass for a zone with no
      // transition at all.
      final before = found.firstWhere(
        (item) => localDate(item.startAt, berlin).compareTo(change) < 0,
      );
      final after = found.firstWhere(
        (item) => localDate(item.startAt, berlin).compareTo(change) >= 0,
      );
      final dayLength =
          (after.startAt.millisecondsSinceEpoch -
                  before.startAt.millisecondsSinceEpoch) %
              dayMs;
      expect(dayLength, isNot(0));
    });
  });

  group('a monthly series, both ways (spec story 2, scenario 1)', () {
    test('BYMONTHDAY=31 skips the months that have no 31st', () {
      final start = nextDayOfMonth(31, cairo);
      final anchor = at(start, '10:00', cairo);
      final meeting = meetingFixture(
        startAt: anchor,
        recurrence: rule('FREQ=MONTHLY;BYMONTHDAY=31', anchor),
      );

      final from = at(start, '00:00', cairo);
      final found = expandOccurrences(
        meeting,
        from,
        shift(from, 400 * dayMs),
        cairo,
      );

      expect(found.length, greaterThan(5));
      for (final occurrence in found) {
        final local = localDate(occurrence.startAt, cairo);
        expect(local.substring(8, 10), '31');
        expect(local.substring(5, 7), isNot('02'));
      }
    });

    test('BYMONTHDAY=-1 lands on the last day of February instead', () {
      final start = nextDayOfMonth(31, cairo);
      final anchor = at(start, '10:00', cairo);
      final meeting = meetingFixture(
        startAt: anchor,
        recurrence: rule('FREQ=MONTHLY;BYMONTHDAY=-1', anchor),
      );

      final from = at(start, '00:00', cairo);
      final found = expandOccurrences(
        meeting,
        from,
        shift(from, 400 * dayMs),
        cairo,
      );

      final februaries = [
        for (final occurrence in found)
          if (localDate(occurrence.startAt, cairo).substring(5, 7) == '02')
            localDate(occurrence.startAt, cairo),
      ];

      expect(februaries, isNotEmpty);
      expect(['28', '29'], contains(februaries.first.substring(8, 10)));
      // Exactly one, so a clamp has not doubled the month.
      expect(februaries, hasLength(1));
    });
  });

  group('skipping and moving one occurrence (FR-005)', () {
    DateTime anchor() => at(today(cairo), '18:00', cairo);

    Repeating weekly({MeetingRecurrence? recurrence}) => meetingFixture(
      startAt: anchor(),
      recurrence: recurrence ?? rule('FREQ=WEEKLY;COUNT=6', anchor()),
    );

    List<Occurrence> windowOf(Repeating item) {
      final from = at(today(cairo), '00:00', cairo);
      return expandOccurrences(item, from, shift(from, 60 * dayMs), cairo);
    }

    test(
        'a six-week series with one skip and one move renders five, one moved '
        '(SC-001)', () {
      var recurrence = rule('FREQ=WEEKLY;COUNT=6', anchor());
      final all = windowOf(weekly(recurrence: recurrence));
      expect(all, hasLength(6));

      recurrence = skipInRule(recurrence, all[2].originalStart);
      final movedTo = shift(all[4].originalStart, 3600000);
      recurrence = moveInRule(
        recurrence,
        all[4].originalStart,
        startAt: movedTo,
      );

      final after = windowOf(weekly(recurrence: recurrence));
      expect(after, hasLength(5));
      expect(after.where((o) => o.moved), hasLength(1));
      expect(
        after.firstWhere((o) => o.moved).startAt.millisecondsSinceEpoch,
        movedTo.millisecondsSinceEpoch,
      );

      // The rest are untouched: the series is a rule, and bending one date did
      // not rewrite it.
      final untouched = after.where((o) => !o.moved).toList();
      expect(untouched, hasLength(4));
      for (final occurrence in untouched) {
        expect(localHhMm(occurrence.startAt, cairo), '18:00');
      }
    });

    test('moving the occurrence that was skipped un-skips it (spec edge case)',
        () {
      // "An occurrence moved onto a date that is already skipped: the move wins
      // and the skip is cleared", read against what is actually stored.
      //
      // An exclusion is keyed by `originalStart` and the expander filters rule
      // dates through it *before* applying overrides. So the case that needs
      // the skip cleared is skipping week four and then moving **week four**:
      // without it the rule date is excluded, the override keyed to it is
      // never reached, and the member's drag silently does nothing.
      var recurrence = rule('FREQ=WEEKLY;COUNT=6', anchor());
      final all = windowOf(weekly(recurrence: recurrence));
      final skipped = all[3].originalStart;

      recurrence = skipInRule(recurrence, skipped);
      expect(windowOf(weekly(recurrence: recurrence)), hasLength(5));

      final movedTo = shift(skipped, 2 * 3600000);
      recurrence = moveInRule(recurrence, skipped, startAt: movedTo);

      final after = windowOf(weekly(recurrence: recurrence));
      expect(recurrence.exdates, isEmpty);
      expect(after, hasLength(6));
      expect(
        after.where(
          (o) => o.startAt.millisecondsSinceEpoch ==
              movedTo.millisecondsSinceEpoch,
        ),
        hasLength(1),
      );
    });

    test(
        'moving one occurrence onto another’s skipped date leaves that skip '
        'alone', () {
      // The reading this first shipped with, and it was wrong: clearing the
      // *destination* exclusion resurrects the occurrence the member cancelled,
      // so somebody who skipped week four and then dragged week two onto it
      // ended up with two meetings that day and the cancelled one back.
      //
      // Nothing needs clearing for the drag to land, because the override is
      // keyed to week two and the exclusion to week four.
      var recurrence = rule('FREQ=WEEKLY;COUNT=6', anchor());
      final all = windowOf(weekly(recurrence: recurrence));
      final skipped = all[3].originalStart;

      recurrence = skipInRule(recurrence, skipped);
      recurrence = moveInRule(
        recurrence,
        all[1].originalStart,
        startAt: skipped,
      );

      final after = windowOf(weekly(recurrence: recurrence));
      expect(recurrence.exdates, hasLength(1));
      expect(
        after.where(
          (o) => o.startAt.millisecondsSinceEpoch ==
              skipped.millisecondsSinceEpoch,
        ),
        hasLength(1),
      );
      // Six rule dates: week two moved away from its own, week four stays
      // skipped, and the drag occupies week four's slot.
      expect(after, hasLength(5));
    });

    test('skipping an occurrence drops the override that described it', () {
      var recurrence = rule('FREQ=WEEKLY;COUNT=6', anchor());
      final all = windowOf(weekly(recurrence: recurrence));
      recurrence = moveInRule(
        recurrence,
        all[2].originalStart,
        startAt: shift(all[2].originalStart, 3600000),
      );
      expect(recurrence.overrides, hasLength(1));

      recurrence = skipInRule(recurrence, all[2].originalStart);
      expect(recurrence.overrides, isEmpty);
      expect(windowOf(weekly(recurrence: recurrence)), hasLength(5));
    });

    test('includes an occurrence an override moved in from outside the window',
        () {
      // A member drags next week's meeting a month forward. The rule still
      // generates next week, so the override is not orphaned from the series —
      // it is orphaned from the *window*, and a month view of the month it
      // landed in would show nothing at all without the override list being
      // read directly.
      final start = anchor();
      final nextWeek = shift(start, 7 * dayMs);
      final landing = shift(start, 40 * dayMs);

      final item = repeating(
        startAt: start,
        recurrence: rule(
          'FREQ=WEEKLY;COUNT=4',
          start,
          overrides: [
            OccurrenceOverride(originalStart: nextWeek, startAt: landing),
          ],
        ),
      );

      final found = expandOccurrences(
        item,
        shift(landing, -dayMs),
        shift(landing, dayMs),
        cairo,
      );

      expect(found, hasLength(1));
      expect(
        found.first.startAt.millisecondsSinceEpoch,
        landing.millisecondsSinceEpoch,
      );
      expect(
        found.first.originalStart.millisecondsSinceEpoch,
        nextWeek.millisecondsSinceEpoch,
      );
      expect(found.first.moved, isTrue);
    });
  });

  group('a series edit that would orphan a moved occurrence', () {
    test('names the moments at stake', () {
      // The server's own version of this case goes through `Meeting.edit`,
      // which refuses the patch and carries the moments; the phone asks
      // `orphanedOverrides` before it writes and turns the answer into a
      // dialog. Same question, same answer, one screen closer to the member.
      final start = at(today(cairo), '18:00', cairo);
      var recurrence = rule('FREQ=WEEKLY;COUNT=6', start);
      final all = expandOccurrences(
        meetingFixture(startAt: start, recurrence: recurrence),
        start,
        shift(start, 60 * dayMs),
        cairo,
      );

      final weekFive = all[4].originalStart;
      recurrence = moveInRule(
        recurrence,
        weekFive,
        startAt: shift(weekFive, 3600000),
      );

      // Shortened to three: week five is no longer a date the rule produces.
      final shortened = recurrence.copyWith(rrule: 'FREQ=WEEKLY;COUNT=3');

      final orphans = orphanedOverrides(shortened, cairo);
      expect(
        [for (final o in orphans) o.originalStart.millisecondsSinceEpoch],
        [weekFive.millisecondsSinceEpoch],
      );
    });

    test('reports no orphan for an override the new rule still generates', () {
      final start = at(today(cairo), '18:00', cairo);
      final second = shift(start, 7 * dayMs);
      final recurrence = rule(
        'FREQ=WEEKLY;COUNT=6',
        start,
        overrides: [
          OccurrenceOverride(
            originalStart: second,
            startAt: shift(second, 60000),
          ),
        ],
      );
      expect(orphanedOverrides(recurrence, cairo), isEmpty);
    });
  });

  group('lockTimezone (FR-007)', () {
    test('keeps the series on its own clock when the member has moved', () {
      final start = at(today(cairo), '18:00', cairo);
      final pinned = meetingFixture(
        startAt: start,
        lockTimezone: cairo,
        recurrence: rule('FREQ=DAILY;COUNT=10', start),
      );
      final floating = meetingFixture(
        startAt: start,
        recurrence: rule('FREQ=DAILY;COUNT=10', start),
      );

      // Both were written in Cairo — `meetingFixture` authors in Cairo. The
      // member is now in Berlin.
      final to = shift(start, 10 * dayMs);
      final pinnedOccurrences = expandOccurrences(pinned, start, to, berlin);
      final floatingOccurrences =
          expandOccurrences(floating, start, to, berlin);

      // Pinned: still 18:00 on Cairo's clock, whatever the member's is.
      expect(
        {for (final o in pinnedOccurrences) localHhMm(o.startAt, cairo)},
        {'18:00'},
      );

      // Unpinned: 18:00 on the member's own clock — it followed them.
      expect(
        {for (final o in floatingOccurrences) localHhMm(o.startAt, berlin)},
        {'18:00'},
      );

      // And the two are genuinely different instants, which is the assertion
      // that would have caught the server's first implementation: it read the
      // stored instant's Berlin digits (17:00) and expanded those, so *both*
      // sets came back looking plausible while the unpinned series sat an hour
      // off what the member had asked for.
      expect(
        floatingOccurrences[1].startAt.millisecondsSinceEpoch,
        isNot(pinnedOccurrences[1].startAt.millisecondsSinceEpoch),
      );
    });

    test('re-reads a one-off in the member’s new zone, and not a pinned one',
        () {
      // FR-014's other half: the same rule applies to a meeting with no repeat,
      // because a one-off that behaved differently from a series of one would
      // be a distinction the member cannot see in the editor.
      final start = at(today(cairo), '10:00', cairo);
      final floating = meetingFixture(startAt: start);
      final pinned = meetingFixture(startAt: start, lockTimezone: cairo);

      final from = shift(start, -dayMs);
      final to = shift(start, dayMs);

      final moved = expandOccurrences(floating, from, to, berlin);
      expect(localHhMm(moved.first.startAt, berlin), '10:00');

      final stayed = expandOccurrences(pinned, from, to, berlin);
      expect(
        stayed.first.startAt.millisecondsSinceEpoch,
        start.millisecondsSinceEpoch,
      );
    });
  });

  group('a repeating personal event (FR-011)', () {
    test('expands to the same instants as the same rule on a meeting', () {
      final start = at(today(cairo), '09:00', cairo);

      final meeting = meetingFixture(
        startAt: start,
        recurrence: rule('FREQ=WEEKLY;COUNT=5', start),
      );
      // A personal event, through the same expander: no location, no lock, its
      // length taken from the stored window.
      final event = Repeating(
        title: 'Focus block',
        startAt: start,
        durationMin: 30,
        recurrence: rule('FREQ=WEEKLY;COUNT=5', start),
        authoredTimezone: cairo,
      );

      final to = shift(start, 60 * dayMs);
      final meetings = [
        for (final o in expandOccurrences(meeting, start, to, cairo))
          o.startAt.millisecondsSinceEpoch,
      ];
      final events = [
        for (final o in expandOccurrences(event, start, to, cairo))
          o.startAt.millisecondsSinceEpoch,
      ];

      expect(events, meetings);
      expect(events, hasLength(5));
    });

    test('skips and moves one occurrence exactly as a meeting does', () {
      final start = at(today(cairo), '09:00', cairo);
      var recurrence = rule('FREQ=YEARLY;COUNT=3', start);

      Repeating birthday() => Repeating(
        title: 'Birthday',
        startAt: start,
        durationMin: 24 * 60,
        recurrence: recurrence,
        authoredTimezone: cairo,
      );

      final to = shift(start, 3 * 366 * dayMs);
      final all = expandOccurrences(birthday(), start, to, cairo);
      expect(all, hasLength(3));

      recurrence = skipInRule(recurrence, all[1].originalStart);
      expect(expandOccurrences(birthday(), start, to, cairo), hasLength(2));

      recurrence = moveInRule(
        recurrence,
        all[2].originalStart,
        startAt: shift(all[2].originalStart, dayMs),
      );
      final after = expandOccurrences(birthday(), start, to, cairo);
      expect(after.where((o) => o.moved), hasLength(1));
    });
  });

  group('the rule helpers on their own', () {
    test('skipInRule is idempotent, so a redelivered skip writes nothing new',
        () {
      final start = at(today(cairo), '18:00', cairo);
      final once = skipInRule(rule('FREQ=DAILY', start), start);
      final twice = skipInRule(once, start);
      expect(twice.exdates, hasLength(1));
      expect(twice, same(once));
    });

    test('moveInRule updates one override rather than accumulating two', () {
      final start = at(today(cairo), '18:00', cairo);
      final first = moveInRule(
        rule('FREQ=DAILY', start),
        start,
        startAt: shift(start, 3600000),
      );
      final second = moveInRule(
        first,
        start,
        startAt: shift(start, 7200000),
      );

      expect(second.overrides, hasLength(1));
      expect(
        second.overrides.first.startAt!.millisecondsSinceEpoch,
        start.millisecondsSinceEpoch + 7200000,
      );
    });

    test('matches an exdate to the minute, not to the millisecond', () {
      // A client sending `10:00:00.000` and a stored `10:00:00.480` name the
      // same occurrence. Matching on the exact instant would silently fail to
      // skip it.
      final start = at(today(cairo), '18:00', cairo);
      final recurrence = rule(
        'FREQ=DAILY;COUNT=3',
        start,
        exdates: [shift(start, 480)],
      );
      final found = expandOccurrences(
        repeating(startAt: start, recurrence: recurrence),
        start,
        shift(start, 3 * dayMs),
        cairo,
      );
      expect(found, hasLength(2));
    });

    test('shows the first occurrence of a rule the library cannot read', () {
      // A row written by a newer build or repaired by hand. A meeting the
      // member can see and fix beats a meeting that vanished.
      final start = at(today(cairo), '18:00', cairo);
      final found = expandOccurrences(
        repeating(startAt: start, recurrence: rule('NONSENSE', start)),
        shift(start, -dayMs),
        shift(start, dayMs),
        cairo,
      );
      expect(found, hasLength(1));
      expect(
        found.first.startAt.millisecondsSinceEpoch,
        start.millisecondsSinceEpoch,
      );
      expect(isReadableRule('NONSENSE'), isFalse);
      expect(isReadableRule('FREQ=WEEKLY;COUNT=6'), isTrue);
    });

    test('a rule set is refused rather than read as a rule', () {
      // `rrulestr` on the server also parses an RRULESET, which carries its own
      // exception list and its own semantics for it — two exception lists
      // disagreeing about one series. The server refuses anything that is not
      // a plain RRULE; the Dart decoder refuses a non-RRULE content line
      // outright, and this is the assertion that says so rather than assuming.
      expect(isReadableRule('EXDATE:20260101T100000Z'), isFalse);
    });
  });

  group('the JSON the sync channel carries', () {
    test('a recurrence survives a round trip through the column', () {
      final start = at(today(cairo), '18:00', cairo);
      final original = rule(
        'FREQ=WEEKLY;COUNT=6',
        start,
        exdates: [shift(start, 7 * dayMs)],
        overrides: [
          OccurrenceOverride(
            originalStart: shift(start, 14 * dayMs),
            startAt: shift(start, 14 * dayMs + 3600000),
            durationMin: 45,
            title: 'Longer standup',
            location: const MeetingLocation(address: 'Room 2'),
          ),
        ],
      );

      final decoded = MeetingRecurrence.decode(original.encode())!;
      expect(decoded.rrule, 'FREQ=WEEKLY;COUNT=6');
      expect(decoded.exdates, hasLength(1));
      expect(decoded.overrides, hasLength(1));
      expect(decoded.overrides.first.durationMin, 45);
      expect(decoded.overrides.first.title, 'Longer standup');
      expect(decoded.overrides.first.location!.address, 'Room 2');
      // And the moment survives to the minute, which is what the exdate and
      // override keys are matched on.
      expect(
        decoded.overrides.first.originalStart.millisecondsSinceEpoch ~/ 60000,
        original.overrides.first.originalStart.millisecondsSinceEpoch ~/ 60000,
      );
    });

    test('an unreadable column decodes to null rather than throwing', () {
      // One malformed row must not take a calendar render down.
      expect(MeetingRecurrence.decode(null), isNull);
      expect(MeetingRecurrence.decode(''), isNull);
      expect(MeetingRecurrence.decode('not json'), isNull);
      expect(MeetingRecurrence.decode('{"rrule":"FREQ=DAILY"}'), isNull);
      expect(MeetingLocation.decode('not json').isEmpty, isTrue);
    });
  });
}
