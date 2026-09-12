import 'dart:convert';

import 'package:rrule/rrule.dart';
import 'package:timezone/timezone.dart' as tz;

import '../db/database.dart';
import '../notifications/alert_plan.dart' show memberZone;

/// The phone's own recurrence expander.
///
/// **A deliberate second implementation.** The server has one, in
/// `backend/src/contexts/meetings/domain/recurrence-expander.ts`, and this
/// is a port of it — because the calendar and the today card have to work with
/// the network off (FR-010), and there is no server answer available on a
/// plane. Shipping expanded occurrences down the sync channel instead is
/// exactly the materialisation FR-006 forbids, and would flood a device with a
/// series that has no end.
///
/// What stops the two diverging is one fixture table, written out case for case
/// in `meetings-recurrence.spec.ts` and again in
/// `test/recurrence_expander_test.dart` with the same test names, so a reader
/// can diff the two files and a divergence fails here.
///
/// ## Wall time, not a fixed offset (FR-007, SC-005)
///
/// `rrule` has no notion of a zone: it treats a `DateTime` as a bag of fields
/// and steps them, and it insists every one of them is UTC. Handing it a real
/// instant therefore makes every occurrence a fixed *UTC* offset from the
/// first, so a weekly 18:00 meeting becomes 17:00 the week the clocks move. So
/// the rule is evaluated on **floating** dates — a `DateTime.utc` whose fields
/// hold the member's wall clock — and each result is resolved back through the
/// `timezone` package, which knows what that zone's clock read on that day.
///
/// This is also why nothing here uses `DateTime.now().timeZoneOffset` or
/// `toLocal()`: the handset's own zone is not the member's, and reading it once
/// shifted every extracted reminder in v1 by three hours.
///
/// ## Two zones, and they are not the same question (FR-007)
///
/// **Which digits** — 18:00 — comes from `lockTimezone ?? authoredTimezone`:
/// the zone the series' wall clock was written in, which never changes.
/// **Which clock those digits are read on** comes from `lockTimezone ?? zone`,
/// `zone` being the member's own right now. So a pinned series keeps its
/// instants when the member flies ("keep this on Cairo's clock"), and an
/// unpinned one keeps its digits and moves its instants — the member's 18:00
/// routine is at 18:00 wherever they are.
///
/// A stored instant does not remember what the member typed: "18:00" in Cairo
/// read in Berlin is 17:00, so a series expanded from the instant alone lands a
/// member who has flown at 17:00 — neither the 18:00 they asked for nor the
/// Cairo time they might have wanted. Recovering "18:00" needs the instant
/// *and* the zone it was written in, which is what [Repeating.authoredTimezone]
/// is for.

/// A day, in milliseconds. Used to widen a scan window, never to add a
/// calendar day — a day is not always 24 hours and the wall-clock arithmetic
/// above is where that is handled.
const int _dayMs = 86400000;

/// How many rule dates one expansion will read before it stops.
///
/// A guard and not a feature: a window is at most a year here and the widest
/// rule anybody can create on the phone is daily, so 2000 is two orders of
/// magnitude of headroom. It exists because `getInstances` on an unbounded rule
/// is a lazy infinite sequence, and a bug in the bounds — a `before` that is
/// never reached — would otherwise hang the frame rather than draw a wrong
/// calendar.
const int _maxRuleDates = 2000;

/// Where a meeting is. At least one half is always present — a meeting with
/// neither is refused at the write (FR-001) — and both may be, because a room
/// that is also dialled into is one meeting rather than two.
class MeetingLocation {
  const MeetingLocation({this.onlineLink, this.address});

  static const MeetingLocation empty = MeetingLocation();

  /// From the `locationJson` column. Anything unreadable answers [empty]
  /// rather than throwing: one malformed row must not take a list render down.
  static MeetingLocation decode(String? encoded) {
    if (encoded == null || encoded.isEmpty) return empty;
    try {
      final decoded = jsonDecode(encoded);
      if (decoded is! Map) return empty;
      return MeetingLocation(
        onlineLink: _trimToNull(decoded['onlineLink']),
        address: _trimToNull(decoded['address']),
      );
    } catch (_) {
      return empty;
    }
  }

  final String? onlineLink;
  final String? address;

  bool get isEmpty => onlineLink == null && address == null;

  String encode() =>
      jsonEncode({'onlineLink': onlineLink, 'address': address});

  Map<String, dynamic> toJson() => {
    'onlineLink': onlineLink,
    'address': address,
  };
}

/// One occurrence the member changed, keyed by the moment the *rule* produced.
///
/// [originalStart] is the key and it never moves. That is the whole design: a
/// moved occurrence stays attached to the date the rule generated, so editing
/// the series later can still find it, and moving the same occurrence twice
/// updates one override rather than accumulating two.
///
/// Every other field is null for "unchanged". A skip is *not* an override with
/// no `startAt` — it is an entry in [MeetingRecurrence.exdates], because a skip
/// has nothing left to say about the occurrence and an override would keep a
/// row alive to describe an absence.
class OccurrenceOverride {
  const OccurrenceOverride({
    required this.originalStart,
    this.startAt,
    this.durationMin,
    this.title,
    this.location,
  });

  final DateTime originalStart;
  final DateTime? startAt;
  final int? durationMin;
  final String? title;
  final MeetingLocation? location;

  Map<String, dynamic> toJson() => {
    'originalStart': originalStart.toUtc().toIso8601String(),
    if (startAt != null) 'startAt': startAt!.toUtc().toIso8601String(),
    if (durationMin != null) 'durationMin': durationMin,
    if (title != null) 'title': title,
    if (location != null) 'location': location!.toJson(),
  };
}

/// A repeat, as stored: a start, a rule, the dates the member removed and the
/// occurrences they moved. Never expanded into rows (FR-006), so a series of
/// any length costs one row.
class MeetingRecurrence {
  const MeetingRecurrence({
    required this.dtstart,
    required this.rrule,
    this.exdates = const [],
    this.overrides = const [],
  });

  /// From a `recurrenceJson` column, or null when there is no rule or the JSON
  /// is not one.
  ///
  /// Null rather than a throw, for the reason `MeetingLocation.decode` gives.
  /// Note that an *unreadable RRULE string* is a different case and is not
  /// refused here: it decodes fine and [expandOccurrences] degrades it to its
  /// single first occurrence, because a meeting the member can see and fix
  /// beats a meeting that vanished.
  static MeetingRecurrence? decode(String? encoded) {
    if (encoded == null || encoded.isEmpty) return null;
    try {
      final decoded = jsonDecode(encoded);
      if (decoded is! Map) return null;
      final dtstart = _date(decoded['dtstart']);
      final rrule = decoded['rrule'];
      if (dtstart == null || rrule is! String || rrule.isEmpty) return null;
      return MeetingRecurrence(
        dtstart: dtstart,
        rrule: rrule,
        exdates: [
          for (final raw in (decoded['exdates'] as List? ?? const []))
            if (_date(raw) != null) _date(raw)!,
        ],
        overrides: [
          for (final raw in (decoded['overrides'] as List? ?? const []))
            if (raw is Map && _date(raw['originalStart']) != null)
              OccurrenceOverride(
                originalStart: _date(raw['originalStart'])!,
                startAt: _date(raw['startAt']),
                durationMin: raw['durationMin'] as int?,
                title: raw['title'] as String?,
                location: raw['location'] == null
                    ? null
                    : MeetingLocation.decode(jsonEncode(raw['location'])),
              ),
        ],
      );
    } catch (_) {
      return null;
    }
  }

  final DateTime dtstart;

  /// RFC 5545, without the `DTSTART` line — [dtstart] carries it.
  final String rrule;

  final List<DateTime> exdates;
  final List<OccurrenceOverride> overrides;

  Map<String, dynamic> toJson() => {
    'dtstart': dtstart.toUtc().toIso8601String(),
    'rrule': rrule,
    'exdates': [for (final date in exdates) date.toUtc().toIso8601String()],
    'overrides': [for (final override in overrides) override.toJson()],
  };

  String encode() => jsonEncode(toJson());

  MeetingRecurrence copyWith({
    DateTime? dtstart,
    String? rrule,
    List<DateTime>? exdates,
    List<OccurrenceOverride>? overrides,
  }) => MeetingRecurrence(
    dtstart: dtstart ?? this.dtstart,
    rrule: rrule ?? this.rrule,
    exdates: exdates ?? this.exdates,
    overrides: overrides ?? this.overrides,
  );
}

/// What the expander produces. Derived on read, never stored.
class Occurrence {
  const Occurrence({
    required this.originalStart,
    required this.startAt,
    required this.endAt,
    required this.durationMin,
    required this.title,
    required this.location,
    required this.moved,
  });

  /// The rule's own moment: the override key, and what a client sends back
  /// when it skips or moves this date.
  final DateTime originalStart;

  /// Where it actually sits, after any override.
  final DateTime startAt;
  final DateTime endAt;
  final int durationMin;
  final String title;
  final MeetingLocation location;

  /// True when an override moved it, so a screen can mark it.
  final bool moved;
}

/// Everything the expander needs, from a meeting or from a personal event.
class Repeating {
  const Repeating({
    required this.title,
    required this.startAt,
    required this.durationMin,
    required this.authoredTimezone,
    this.location = MeetingLocation.empty,
    this.recurrence,
    this.lockTimezone,
  });

  /// One meeting row, as the expander reads it.
  ///
  /// Here rather than in a feature, because three callers want it — the
  /// calendar, the today card and the meetings list — and a fourth copy of
  /// "which column holds the rule" is a fourth place it can be got wrong.
  factory Repeating.ofMeeting(LocalMeeting row) => Repeating(
    title: row.title,
    startAt: row.startAt,
    durationMin: row.durationMin,
    location: MeetingLocation.decode(row.locationJson),
    recurrence: MeetingRecurrence.decode(row.recurrenceJson),
    lockTimezone: row.lockTimezone,
    authoredTimezone: row.authoredTimezone,
  );

  /// One personal event, through the same expander (FR-011).
  ///
  /// `lockTimezone: null` always — an event follows the member. A birthday is a
  /// date rather than an instant, so pinning it to a zone would put somebody
  /// who flew on the wrong day of their own birthday. The length comes from the
  /// stored window, which is what the server's `CalendarEvent.durationMin`
  /// does.
  factory Repeating.ofEvent(LocalCalendarEvent row) => Repeating(
    title: row.title,
    startAt: row.startAt,
    durationMin: eventDurationMin(row),
    recurrence: MeetingRecurrence.decode(row.recurrenceJson),
    authoredTimezone: row.authoredTimezone,
  );

  final String title;
  final DateTime startAt;
  final int durationMin;
  final MeetingLocation location;
  final MeetingRecurrence? recurrence;

  /// The zone the series is pinned to, or null to follow the member (FR-007).
  final String? lockTimezone;

  /// The zone whose clock the member was reading when they wrote this. Never
  /// changed afterwards; see the file's own two-zones note.
  final String authoredTimezone;
}

/// Minutes from an event's start to its end, at least one.
///
/// Mirrors `CalendarEvent.durationMin` on the server, which the expander needs
/// because it works in lengths and the row stores two instants.
int eventDurationMin(LocalCalendarEvent row) {
  final span = row.endAt.difference(row.startAt).inMinutes;
  return span < 1 ? 1 : span;
}

/// Occurrences inside a window, in the member's own wall clock.
///
/// [zone] is the member's IANA zone from the profile mirror, or null to fall
/// back to the handset's — the fallback of last resort, exactly as
/// `memberZone` treats it.
///
/// ## Monthly on the 31st, both ways (spec story 2, scenario 1)
///
/// Not decided here, deliberately. `BYMONTHDAY=31` is RFC 5545 for "the 31st",
/// and the 31st does not exist in February — `rrule` skips the month, which is
/// the standard's answer and the right one for "pay the rent on the 31st, and
/// February has its own arrangement". `BYMONTHDAY=-1` is "the last day of the
/// month" and lands on the 28th or 29th. Both are expanded correctly below
/// because both are ordinary rules; the *choice* belongs to the editor, which
/// says it in the member's words ("monthly on the last day") rather than
/// guessing from the start date. Guessing is how a meeting either disappears in
/// February or silently moves for somebody who meant the 31st.
///
/// ## A rule the library refuses still shows its first occurrence
///
/// Writes validate the rule, so an unreadable one here means a row written by a
/// newer build or repaired by hand. It expands to the single occurrence at
/// [Repeating.startAt] rather than to nothing.
List<Occurrence> expandOccurrences(
  Repeating item,
  DateTime from,
  DateTime to,
  String? zone,
) {
  final digits = item.lockTimezone ?? item.authoredTimezone;
  final expansion = item.lockTimezone ?? zone;

  final recurrence = item.recurrence;
  if (recurrence == null) {
    /*
     * A one-off follows the same rule as a series, deliberately.
     *
     * Its single occurrence is re-read in the member's current zone, so a
     * meeting written as 10:00 in Cairo is 10:00 in Berlin once they land —
     * unless it is pinned, which is what pinning is for. One rule rather than
     * two: a one-off that behaved differently from a series of one would be a
     * distinction the member cannot see in the editor and cannot predict.
     */
    final startAt = _reread(item.startAt, digits, expansion);
    return _withinWindow(
      [_occurrenceOf(item, startAt, startAt, null)],
      from,
      to,
    );
  }

  final rule = _parseRule(recurrence.rrule);
  final overrides = <int, OccurrenceOverride>{
    for (final override in recurrence.overrides)
      _key(override.originalStart): override,
  };

  /*
   * The window is widened before the rule is asked, and narrowed after.
   *
   * Two reasons, and both are occurrences the naive window would lose. An
   * occurrence that *starts* before `from` and runs into the window is part of
   * the day the caller asked about — a meeting from 09:30 to 10:30 belongs on
   * an agenda for 10:00 onwards. And an override may have moved an occurrence
   * *into* the window from a rule date outside it, which the wider scan catches
   * for a short move.
   *
   * A day either side is enough for the first and is a deliberate bound on the
   * second: an override that moved an occurrence more than a day is found
   * through [_orphansIntoWindow], which reads the override list directly and so
   * has no bound at all.
   */
  final scanFrom = _shift(from, -_dayMs);
  final scanTo = _shift(to, _dayMs);

  final ruleDates = rule == null
      ? <DateTime>[item.startAt]
      : _ruleDatesBetween(
          rule,
          recurrence.dtstart,
          digits,
          expansion,
          scanFrom,
          scanTo,
        );

  final found = <Occurrence>[];
  for (final originalStart in ruleDates) {
    if (_isExcluded(recurrence.exdates, originalStart)) continue;
    found.add(
      _occurrenceOf(
        item,
        originalStart,
        originalStart,
        overrides[_key(originalStart)],
      ),
    );
  }

  found.addAll(_orphansIntoWindow(item, recurrence, ruleDates, from, to));

  return _withinWindow(found, from, to)
    ..sort((left, right) => left.startAt.compareTo(right.startAt));
}

/// The next occurrence at or after [at], or null when the series has run out.
DateTime? nextOccurrenceAfter(
  Repeating item,
  DateTime at,
  String? zone, {
  int horizonDays = 400,
}) {
  final found = expandOccurrences(
    item,
    at,
    _shift(at, horizonDays * _dayMs),
    zone,
  );
  return found.isEmpty ? null : found.first.startAt;
}

/// The rule with one occurrence removed (FR-005).
///
/// Returns a new recurrence rather than mutating, because whether to keep it is
/// the caller's decision. The override for that date goes too: an occurrence
/// that is not happening has nothing left to say about its own title.
///
/// Idempotent — a second skip of the same date returns the same object — so a
/// tap that arrives twice writes nothing new.
MeetingRecurrence skipInRule(
  MeetingRecurrence recurrence,
  DateTime originalStart,
) {
  if (_isExcluded(recurrence.exdates, originalStart)) return recurrence;
  return recurrence.copyWith(
    exdates: [...recurrence.exdates, originalStart],
    overrides: [
      for (final override in recurrence.overrides)
        if (_key(override.originalStart) != _key(originalStart)) override,
    ],
  );
}

/// The rule with one occurrence moved (FR-005).
///
/// **Moving the occurrence that was skipped clears that skip** — the spec's
/// edge case, and the reading of it that is actually right, which took the
/// server one wrong turn to find.
///
/// Exceptions are keyed by `originalStart`, the moment the rule produced, and
/// [expandOccurrences] filters *rule dates* through `exdates` before it applies
/// overrides. So moving occurrence A onto occurrence B's instant needs nothing
/// done about B's exdate: A's override is keyed by A, B's exclusion by B, and
/// the move already wins. Clearing the *destination* instead resurrects B — so
/// a member who skipped Tuesday and then dragged another meeting onto Tuesday
/// would end up with two meetings and the one they had cancelled back.
///
/// The case that genuinely needs clearing is skipping A and then moving A:
/// without it the rule date is excluded, the override keyed to it is never
/// reached, and the member's drag silently does nothing.
MeetingRecurrence moveInRule(
  MeetingRecurrence recurrence,
  DateTime originalStart, {
  DateTime? startAt,
  int? durationMin,
  String? title,
  MeetingLocation? location,
}) {
  OccurrenceOverride? existing;
  for (final override in recurrence.overrides) {
    if (_key(override.originalStart) == _key(originalStart)) {
      existing = override;
    }
  }

  final merged = OccurrenceOverride(
    originalStart: originalStart,
    startAt: startAt ?? existing?.startAt,
    durationMin: durationMin ?? existing?.durationMin,
    title: title ?? existing?.title,
    location: location ?? existing?.location,
  );

  return recurrence.copyWith(
    exdates: [
      for (final exdate in recurrence.exdates)
        if (_key(exdate) != _key(originalStart)) exdate,
    ],
    overrides: [
      for (final override in recurrence.overrides)
        if (_key(override.originalStart) != _key(originalStart)) override,
      merged,
    ],
  );
}

/// Overrides the *new* rule no longer generates.
///
/// The spec's edge case: a series edited so that an already-moved occurrence
/// would fall outside the new rule warns the member before discarding it. This
/// answers "which ones"; the editor turns it into a dialog and the retry sends
/// the edit anyway.
///
/// The horizon is the rule's own reach — an override is orphaned when the rule
/// does not produce its `originalStart` at all, so the search runs from the
/// earliest override to the latest and asks the rule about exactly that span. A
/// `COUNT`-limited rule that no longer reaches an override's date is the
/// ordinary way this happens: "every week, six times" shortened to three.
List<OccurrenceOverride> orphanedOverrides(
  MeetingRecurrence recurrence,
  String? digitsZone, [
  String? expansionZone,
]) {
  if (recurrence.overrides.isEmpty) return const [];
  final rule = _parseRule(recurrence.rrule);
  if (rule == null) return const [];

  final expansion = expansionZone ?? digitsZone;
  final moments = [
    for (final override in recurrence.overrides)
      override.originalStart.millisecondsSinceEpoch,
  ];
  final from = DateTime.fromMillisecondsSinceEpoch(
    moments.reduce((a, b) => a < b ? a : b) - _dayMs,
    isUtc: true,
  );
  final to = DateTime.fromMillisecondsSinceEpoch(
    moments.reduce((a, b) => a > b ? a : b) + _dayMs,
    isUtc: true,
  );

  final generated = {
    for (final date in _ruleDatesBetween(
      rule,
      recurrence.dtstart,
      digitsZone,
      expansion,
      from,
      to,
    ))
      _key(date),
  };

  return [
    for (final override in recurrence.overrides)
      if (!generated.contains(_key(override.originalStart))) override,
  ];
}

/// True for a rule string `rrule` can read. The editor refuses anything else
/// before it saves, so the member is told rather than left with a series whose
/// occurrences nothing can compute.
bool isReadableRule(String rrule) => _parseRule(rrule) != null;

// ------------------------------------------------------------------ internals

/// Overrides whose rule date the scan did not reach, but whose moved moment
/// lands in the window.
///
/// The case is a member who dragged next Tuesday's meeting into the following
/// month. The rule still generates next Tuesday, so the override is not
/// orphaned from the *series* — it is orphaned from this *window*, and a month
/// view of the following month would show nothing at all without this pass. It
/// reads the override list rather than widening the scan because there is no
/// distance an override cannot have travelled, and a scan wide enough for the
/// worst case would be a scan of the whole series on every read.
List<Occurrence> _orphansIntoWindow(
  Repeating item,
  MeetingRecurrence recurrence,
  List<DateTime> ruleDates,
  DateTime from,
  DateTime to,
) {
  final seen = {for (final date in ruleDates) _key(date)};
  final found = <Occurrence>[];

  for (final override in recurrence.overrides) {
    if (seen.contains(_key(override.originalStart))) continue;
    final startAt = override.startAt ?? override.originalStart;
    if (startAt.isBefore(from) || startAt.isAfter(to)) continue;
    // An excluded rule date whose override moved it here: the move wins, which
    // is the rule [moveInRule] enforces by clearing the exdate. A row written
    // before that rule existed is read the same way rather than being shown
    // twice or not at all.
    found.add(_occurrenceOf(item, override.originalStart, startAt, override));
  }

  return found;
}

/// The rule's own moments inside a widened window, as real instants.
///
/// [digitsZone] floats the `dtstart` — the zone the member's "18:00" was
/// written in — and [expansionZone] floats the window and reads the results
/// back. They are the same zone unless the member has travelled with an
/// unpinned series, which is exactly the case FR-007's travel clause is about.
List<DateTime> _ruleDatesBetween(
  RecurrenceRule rule,
  DateTime dtstart,
  String? digitsZone,
  String? expansionZone,
  DateTime scanFrom,
  DateTime scanTo,
) {
  final start = _toFloating(dtstart, digitsZone);
  final after = _toFloating(scanFrom, expansionZone);
  final before = _toFloating(scanTo, expansionZone);

  // `getInstances` asserts both bounds are at or after the rule's start, and an
  // assertion is a crash in a debug build. A window entirely before the series
  // began holds none of it; a window that merely *starts* before it is asked
  // from the series' own beginning.
  if (before.isBefore(start)) return const [];

  final dates = <DateTime>[];
  for (final floating in rule.getInstances(
    start: start,
    after: after.isBefore(start) ? null : after,
    includeAfter: true,
    before: before,
    includeBefore: true,
  )) {
    dates.add(_fromFloating(floating, expansionZone));
    if (dates.length >= _maxRuleDates) break;
  }
  return dates;
}

/// The rule, or null when this build cannot read it.
///
/// `rrule` wants the `RRULE:` content line, so a bare `FREQ=…` is prefixed —
/// which is the shape both the server stores and the editor writes. An
/// `RRULE:`-prefixed or `DTSTART`-carrying string is passed through so a row
/// from another client still reads.
RecurrenceRule? _parseRule(String rrule) {
  final trimmed = rrule.trim();
  if (trimmed.isEmpty) return null;
  try {
    return RecurrenceRule.fromString(
      trimmed.toUpperCase().startsWith('RRULE:') ? trimmed : 'RRULE:$trimmed',
    );
  } catch (_) {
    // A bare `catch`, on purpose. `FormatException` is what the decoder
    // documents, and `AssertionError` is what it throws for a rule that parses
    // into a combination RFC 5545 forbids — a debug build turns the second
    // into a throw where a release build would carry a wrong rule, so a
    // `FormatException`-only clause would crash the calendar in exactly the
    // build the suite runs in.
    return null;
  }
}

Occurrence _occurrenceOf(
  Repeating item,
  DateTime originalStart,
  DateTime ruleStart,
  OccurrenceOverride? override,
) {
  final startAt = override?.startAt ?? ruleStart;
  final durationMin = override?.durationMin ?? item.durationMin;
  return Occurrence(
    originalStart: originalStart,
    startAt: startAt,
    endAt: _shift(startAt, durationMin * 60000),
    durationMin: durationMin,
    title: override?.title ?? item.title,
    location: override?.location ?? item.location,
    moved: override?.startAt != null &&
        !override!.startAt!.isAtSameMomentAs(originalStart),
  );
}

/// An occurrence is in the window when any part of it is.
///
/// `startAt <= to && endAt >= from` rather than `startAt` alone, so a meeting
/// already under way when the window opens is on the agenda. A day view that
/// dropped it would show a member as free during a call they are on.
List<Occurrence> _withinWindow(
  List<Occurrence> items,
  DateTime from,
  DateTime to,
) => [
  for (final item in items)
    if (!item.startAt.isAfter(to) && !item.endAt.isBefore(from)) item,
];

/// Minute granularity, which is how an exdate and an override key are matched.
///
/// Nothing here schedules to the second, and carrying a field no feature reads
/// would only be a place for two representations of one moment to disagree — a
/// client sending `10:00:00.000` and a stored `10:00:00.123` would otherwise
/// name different occurrences.
int _key(DateTime at) => at.millisecondsSinceEpoch ~/ 60000;

bool _isExcluded(List<DateTime> exdates, DateTime occurrence) {
  final target = _key(occurrence);
  for (final exdate in exdates) {
    if (_key(exdate) == target) return true;
  }
  return false;
}

/// The same wall clock, read on a different zone's clock.
///
/// `2026-09-10T18:00` written in Cairo, re-read in Berlin, is a different
/// instant naming the same digits. That is the whole of FR-007's travel clause
/// for a non-repeating meeting, and it is one round trip through the floating
/// representation rather than any arithmetic on offsets — which is the form of
/// this that goes wrong across a clock change.
DateTime _reread(DateTime instant, String? from, String? to) {
  if (from == to) return instant;
  return _fromFloating(_toFloating(instant, from), to);
}

/// A `DateTime.utc` whose fields hold the member's wall clock.
DateTime _toFloating(DateTime instant, String? timezone) {
  final local = tz.TZDateTime.from(instant, memberZone(timezone));
  return DateTime.utc(
    local.year,
    local.month,
    local.day,
    local.hour,
    local.minute,
  );
}

/// The inverse. A floating date's fields are read as a wall clock and resolved
/// against the zone, so a 25-hour day and a 23-hour one both come out right.
DateTime _fromFloating(DateTime floating, String? timezone) {
  final resolved = tz.TZDateTime(
    memberZone(timezone),
    floating.year,
    floating.month,
    floating.day,
    floating.hour,
    floating.minute,
  );
  return DateTime.fromMillisecondsSinceEpoch(
    resolved.millisecondsSinceEpoch,
    isUtc: true,
  );
}

/// [by] milliseconds from [at], as a UTC instant.
///
/// Only ever used on *instants* — a window bound, an occurrence's end — never
/// to move a wall clock, which is what [_fromFloating] is for. `DateTime.add`
/// on a local date across a clock change is precisely the bug this file exists
/// to avoid, so the arithmetic is kept where it is honest.
DateTime _shift(DateTime at, int by) => DateTime.fromMillisecondsSinceEpoch(
  at.millisecondsSinceEpoch + by,
  isUtc: true,
);

DateTime? _date(Object? raw) {
  if (raw == null) return null;
  if (raw is DateTime) return raw.toUtc();
  return DateTime.tryParse('$raw')?.toUtc();
}

String? _trimToNull(Object? raw) {
  if (raw == null) return null;
  final trimmed = '$raw'.trim();
  return trimmed.isEmpty ? null : trimmed;
}
