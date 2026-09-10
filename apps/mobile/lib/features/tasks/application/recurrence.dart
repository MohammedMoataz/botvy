import 'dart:convert';

import 'package:timezone/timezone.dart' as tz;

import '../../../core/notifications/alert_plan.dart' show memberZone;

/// A repeating task's rule, as the row stores it.
///
/// The rule and its exceptions, never expanded rows: `dtstart`, an RRULE
/// string, the mode that decides what "next" means, and the occurrences the
/// member removed. Storing occurrences would make a moved one an edit to the
/// series instead of an override, and a series has no bottom.
class Recurrence {
  const Recurrence({
    required this.dtstart,
    required this.rrule,
    required this.mode,
    this.exdates = const [],
  });

  /// From the `recurrenceJson` column, or null when there is no rule or the
  /// JSON is not one.
  ///
  /// Null rather than a throw: an unreadable rule reaches here from a row a
  /// newer client wrote, and one bad rule must not take a list render down.
  static Recurrence? decode(String? encoded) {
    if (encoded == null || encoded.isEmpty) return null;
    try {
      final decoded = jsonDecode(encoded);
      if (decoded is! Map) return null;
      final dtstart = DateTime.tryParse('${decoded['dtstart']}');
      final rrule = decoded['rrule'];
      if (dtstart == null || rrule is! String || rrule.isEmpty) return null;
      return Recurrence(
        dtstart: dtstart.toUtc(),
        rrule: rrule,
        mode: decoded['mode'] == 'completion'
            ? RecurrenceMode.completion
            : RecurrenceMode.schedule,
        exdates: [
          for (final raw in (decoded['exdates'] as List? ?? const []))
            if (DateTime.tryParse('$raw') != null)
              DateTime.parse('$raw').toUtc(),
        ],
      );
    } catch (_) {
      return null;
    }
  }

  final DateTime dtstart;
  final String rrule;
  final RecurrenceMode mode;
  final List<DateTime> exdates;

  String encode() => jsonEncode({
    'dtstart': dtstart.toUtc().toIso8601String(),
    'rrule': rrule,
    'mode': mode.name,
    'exdates': [for (final d in exdates) d.toUtc().toIso8601String()],
  });

  /// `FREQ=WEEKLY;INTERVAL=2` → the pieces, upper-cased and keyed.
  Map<String, String> get parts => {
    for (final piece in rrule.split(';'))
      if (piece.contains('='))
        piece.split('=').first.trim().toUpperCase():
            piece.split('=').last.trim().toUpperCase(),
  };

  /// The next occurrence strictly after a completion, or null when there is
  /// none — the series ended, or this build cannot read the rule.
  ///
  /// The two modes are the member's own words, and the difference is the whole
  /// reason the field exists:
  ///
  /// * **schedule** — "water the plants every Tuesday". Tuesday comes whether or
  ///   not last Tuesday's watering happened, so the step is measured from the
  ///   *scheduled* occurrence.
  /// * **completion** — "every two weeks from when I actually do it". The step
  ///   is applied to the day the work was done, keeping the series' own time of
  ///   day: a task ticked off at 23:50 must not drift into the night.
  ///
  /// The arithmetic is done on calendar fields in the member's own zone rather
  /// than by adding a [Duration]. A day is not always 24 hours, and "every
  /// Tuesday at 08:00" across a daylight-saving boundary lands at 07:00 or
  /// 09:00 if it is — which is exactly the shift the member is least likely to
  /// forgive.
  ///
  /// ponytail: FREQ and INTERVAL and UNTIL, which is precisely what the repeat
  /// picker can produce. A rule carrying BYDAY, BYMONTHDAY or COUNT — one the
  /// web app or the chat extractor made — answers null, and the task then
  /// simply completes without advancing. Upgrade to a real RRULE package on the
  /// day one of those rules can be created on the phone; until then the
  /// dependency would parse grammar nothing here can write.
  DateTime? nextAfterCompleting({
    required DateTime completedAt,
    required DateTime? dueAt,
    String? timezone,
  }) {
    final fields = parts;
    if (fields.containsKey('BYDAY') ||
        fields.containsKey('BYMONTHDAY') ||
        fields.containsKey('COUNT')) {
      return null;
    }
    final interval = int.tryParse(fields['INTERVAL'] ?? '1') ?? 1;
    if (interval < 1) return null;
    final freq = fields['FREQ'];
    if (freq == null) return null;

    final zone = memberZone(timezone);
    final from = tz.TZDateTime.from(
      mode == RecurrenceMode.completion
          ? completedAt
          : (dueAt ?? dtstart),
      zone,
    );
    // In completion mode the step lands on the day the work was done, at the
    // series' own hour — not at the hour it happened to be ticked off.
    final timeOf = tz.TZDateTime.from(dueAt ?? dtstart, zone);
    final until = _until(fields['UNTIL']);

    // Walked rather than taken in one step, because an exdate is an occurrence
    // that was removed and the one after it is what the member expects next.
    // Two hundred steps is four years of weekly; beyond that the rule is not
    // one this build should be guessing at.
    for (var step = 1; step <= 200; step++) {
      final candidate = _advance(from, timeOf, freq, interval * step, zone);
      if (candidate == null) return null;
      final instant = DateTime.fromMillisecondsSinceEpoch(
        candidate.millisecondsSinceEpoch,
        isUtc: true,
      );
      if (!instant.isAfter(completedAt.toUtc())) continue;
      if (until != null && instant.isAfter(until)) return null;
      if (exdates.any((e) => e.isAtSameMomentAs(instant))) continue;
      return instant;
    }
    return null;
  }

  static DateTime? _until(String? raw) {
    if (raw == null || raw.isEmpty) return null;
    // `20261231T235959Z`, the RRULE spelling. Punctuated back into something
    // `DateTime.parse` accepts rather than parsed by hand.
    final match = RegExp(
      r'^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})Z?)?$',
    ).firstMatch(raw);
    if (match == null) return DateTime.tryParse(raw)?.toUtc();
    final g = match.groups([1, 2, 3, 4, 5, 6]);
    return DateTime.utc(
      int.parse(g[0]!),
      int.parse(g[1]!),
      int.parse(g[2]!),
      int.parse(g[3] ?? '0'),
      int.parse(g[4] ?? '0'),
      int.parse(g[5] ?? '0'),
    );
  }

  /// [count] steps of [freq] from [from], at [timeOf]'s hour.
  ///
  /// Built from calendar fields — `tz.TZDateTime(zone, y, m, d, h, min)` — so
  /// the zone library resolves the wall clock, including a day that is 23 or 25
  /// hours long and a time that a daylight-saving gap skips.
  static tz.TZDateTime? _advance(
    tz.TZDateTime from,
    tz.TZDateTime timeOf,
    String freq,
    int count,
    tz.Location zone,
  ) => switch (freq) {
    'DAILY' => tz.TZDateTime(
      zone,
      from.year,
      from.month,
      from.day + count,
      timeOf.hour,
      timeOf.minute,
    ),
    'WEEKLY' => tz.TZDateTime(
      zone,
      from.year,
      from.month,
      from.day + count * 7,
      timeOf.hour,
      timeOf.minute,
    ),
    'MONTHLY' => tz.TZDateTime(
      zone,
      from.year,
      from.month + count,
      from.day,
      timeOf.hour,
      timeOf.minute,
    ),
    'YEARLY' => tz.TZDateTime(
      zone,
      from.year + count,
      from.month,
      from.day,
      timeOf.hour,
      timeOf.minute,
    ),
    _ => null,
  };
}

/// What "next" is measured from. See [Recurrence.nextAfterCompleting].
enum RecurrenceMode { schedule, completion }

/// The repeats the editor offers, as the RRULE each one means.
///
/// A fixed set rather than a rule builder: these four cover what a task list is
/// for, and every one of them is a rule [Recurrence.nextAfterCompleting] can
/// advance without a parser. Offering a grammar the phone cannot walk would be
/// offering a repeat that silently stops repeating.
const Map<String, String> kRepeatChoices = {
  'Every day': 'FREQ=DAILY;INTERVAL=1',
  'Every week': 'FREQ=WEEKLY;INTERVAL=1',
  'Every 2 weeks': 'FREQ=WEEKLY;INTERVAL=2',
  'Every month': 'FREQ=MONTHLY;INTERVAL=1',
  'Every year': 'FREQ=YEARLY;INTERVAL=1',
};
