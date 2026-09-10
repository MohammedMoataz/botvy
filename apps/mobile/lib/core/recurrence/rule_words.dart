/// The repeat picker's vocabulary: what the member chose, and the RRULE it
/// means.
///
/// Two directions and both are needed. The editor builds a rule from taps, and
/// re-opening a meeting has to put those taps back — so the string is parsed as
/// well as written, and a rule this build cannot express is shown verbatim
/// rather than being silently rewritten into something the member did not ask
/// for.
///
/// It lives in `core/` because two editors want it: a meeting's and a personal
/// event's (FR-011 — a repeating event ends, skips and moves exactly as a
/// repeating meeting does). The third copy is what would have drifted.
///
/// ## Why the picker asks about the 31st rather than working it out
///
/// `BYMONTHDAY=31` is RFC 5545 for "the 31st", and February has no 31st — the
/// rule skips the month, which is the standard's answer and the right one for
/// "pay the rent on the 31st, and February has its own arrangement".
/// `BYMONTHDAY=-1` is "the last day of the month" and lands on the 28th or
/// 29th. Both are correct rules and they are different intentions, so
/// [MonthlyMode] makes the member say which. Guessing from the start date is
/// how a meeting either disappears in February or silently moves for somebody
/// who meant the 31st.
library;

import '../i18n/counted.dart';

/// How often. Yearly is deliberately absent from the picker: FR-004 lists
/// daily, weekly on chosen days and monthly, and a yearly rule that arrives
/// from the web app or the chat still expands — [describeRule] falls back to
/// the raw string rather than refusing to draw it.
enum RepeatFreq { daily, weekly, monthly }

/// Which of the two monthly rules the member meant. See the library note.
enum MonthlyMode { dayOfMonth, lastDay }

/// When the series stops (FR-004).
enum RepeatEnd { never, afterCount, onDate }

/// `MO`, `TU`, … indexed by `DateTime.monday`..`DateTime.sunday`.
const List<String> kByDayCodes = [
  'MO',
  'TU',
  'WE',
  'TH',
  'FR',
  'SA',
  'SU',
];

/// Short weekday names, in the same order, for the picker's chips and for
/// [RepeatSpec.describe].
const List<String> kWeekdayNames = [
  'Mon',
  'Tue',
  'Wed',
  'Thu',
  'Fri',
  'Sat',
  'Sun',
];

/// The same days in Arabic, and they are the **full** names on purpose.
///
/// English abbreviates because "Mon" is a convention every reader knows;
/// Arabic has no equivalent short form in general use, so an invented one
/// ("الاث") would read as a typo. These match the three day names the
/// localisation table already carries (`monday`, `saturday`, `sunday`), so the
/// preferences screen and the repeat picker say the same word.
const List<String> kWeekdayNamesAr = [
  'الاثنين',
  'الثلاثاء',
  'الأربعاء',
  'الخميس',
  'الجمعة',
  'السبت',
  'الأحد',
];

/// One weekday's name in `lang` — Arabic for `ar`, English for anything else.
String weekdayName(int weekday, [String lang = 'en']) =>
    (lang == 'ar' ? kWeekdayNamesAr : kWeekdayNames)[weekday - 1];

/// One repeat, as the member set it up.
class RepeatSpec {
  const RepeatSpec({
    required this.freq,
    this.interval = 1,
    this.byDays = const <int>{},
    this.monthly = MonthlyMode.dayOfMonth,
    this.monthDay,
    this.end = RepeatEnd.never,
    this.count,
    this.until,
  });

  /// A rule string read back into taps, or null when this build cannot express
  /// it.
  ///
  /// Null rather than a lossy approximation: the editor shows the raw rule and
  /// leaves it alone, because a `BYSETPOS` rule silently rewritten as "every
  /// month" would move a meeting the member never touched. Anything the picker
  /// itself wrote round-trips.
  static RepeatSpec? parse(String rrule) {
    final parts = <String, String>{};
    for (final piece in rrule.split(';')) {
      final at = piece.indexOf('=');
      if (at <= 0) continue;
      parts[piece.substring(0, at).trim().toUpperCase()] =
          piece.substring(at + 1).trim().toUpperCase();
    }

    final freq = switch (parts['FREQ']) {
      'DAILY' => RepeatFreq.daily,
      'WEEKLY' => RepeatFreq.weekly,
      'MONTHLY' => RepeatFreq.monthly,
      _ => null,
    };
    if (freq == null) return null;

    // Anything the picker cannot produce is refused outright rather than
    // dropped, because dropping a rule part changes which dates the series
    // lands on.
    const expressible = {
      'FREQ',
      'INTERVAL',
      'BYDAY',
      'BYMONTHDAY',
      'COUNT',
      'UNTIL',
      'WKST',
    };
    if (parts.keys.any((key) => !expressible.contains(key))) return null;

    final byDays = <int>{};
    for (final code in (parts['BYDAY'] ?? '').split(',')) {
      final index = kByDayCodes.indexOf(code.trim());
      // A prefixed day — `2MO`, "the second Monday" — is not a plain weekday
      // and is not something the picker offers.
      if (code.trim().isEmpty) continue;
      if (index < 0) return null;
      byDays.add(index + 1);
    }
    if (freq != RepeatFreq.weekly && byDays.isNotEmpty) return null;

    var monthly = MonthlyMode.dayOfMonth;
    int? monthDay;
    final rawMonthDay = parts['BYMONTHDAY'];
    if (rawMonthDay != null) {
      if (freq != RepeatFreq.monthly) return null;
      final value = int.tryParse(rawMonthDay);
      if (value == null) return null;
      if (value == -1) {
        monthly = MonthlyMode.lastDay;
      } else if (value >= 1 && value <= 31) {
        monthDay = value;
      } else {
        return null;
      }
    }

    final count = int.tryParse(parts['COUNT'] ?? '');
    final until = _parseUntil(parts['UNTIL']);
    if (count != null && until != null) return null;

    return RepeatSpec(
      freq: freq,
      interval: int.tryParse(parts['INTERVAL'] ?? '1') ?? 1,
      byDays: byDays,
      monthly: monthly,
      monthDay: monthDay,
      end: count != null
          ? RepeatEnd.afterCount
          : (until != null ? RepeatEnd.onDate : RepeatEnd.never),
      count: count,
      until: until,
    );
  }

  final RepeatFreq freq;
  final int interval;

  /// `DateTime.monday`..`DateTime.sunday`. Empty means "the day the series
  /// starts on", which is what RFC 5545 says a weekly rule with no `BYDAY`
  /// means and what both expanders do.
  final Set<int> byDays;

  final MonthlyMode monthly;

  /// 1..31, for [MonthlyMode.dayOfMonth]. Null means "the day the series
  /// starts on", again the standard's own default.
  final int? monthDay;

  final RepeatEnd end;
  final int? count;

  /// The **local date** the series stops on, as a date and not an instant: only
  /// its year, month and day are read.
  final DateTime? until;

  RepeatSpec copyWith({
    RepeatFreq? freq,
    int? interval,
    Set<int>? byDays,
    MonthlyMode? monthly,
    int? monthDay,
    bool clearMonthDay = false,
    RepeatEnd? end,
    int? count,
    DateTime? until,
  }) => RepeatSpec(
    freq: freq ?? this.freq,
    interval: interval ?? this.interval,
    byDays: byDays ?? this.byDays,
    monthly: monthly ?? this.monthly,
    monthDay: clearMonthDay ? null : (monthDay ?? this.monthDay),
    end: end ?? this.end,
    count: count ?? this.count,
    until: until ?? this.until,
  );

  /// The RFC 5545 rule, without a `DTSTART` line — the recurrence object
  /// carries that separately, exactly as the server stores it.
  ///
  /// `UNTIL` is written as `…T235959Z`, and the `Z` is a compromise worth
  /// naming. Both expanders evaluate the rule on **floating** dates — a date
  /// whose fields hold the member's wall clock — so the `UNTIL` they compare
  /// against is read as a wall clock too. Writing the end of the member's
  /// chosen local day is therefore the value that means "up to and including
  /// that day" on both sides; a real UTC instant would cut the series a few
  /// hours early or late depending on the member's offset. The suffix is there
  /// because the `rrule` package refuses a floating `UNTIL` outright.
  String toRrule() {
    final parts = <String>['FREQ=${_freqCode(freq)}'];
    if (interval > 1) parts.add('INTERVAL=$interval');

    if (freq == RepeatFreq.weekly && byDays.isNotEmpty) {
      final ordered = byDays.toList()..sort();
      parts.add(
        'BYDAY=${ordered.map((day) => kByDayCodes[day - 1]).join(',')}',
      );
    }

    if (freq == RepeatFreq.monthly) {
      if (monthly == MonthlyMode.lastDay) {
        parts.add('BYMONTHDAY=-1');
      } else if (monthDay != null) {
        parts.add('BYMONTHDAY=$monthDay');
      }
    }

    switch (end) {
      case RepeatEnd.afterCount:
        if (count != null && count! > 0) parts.add('COUNT=$count');
      case RepeatEnd.onDate:
        final date = until;
        if (date != null) {
          parts.add(
            'UNTIL=${date.year.toString().padLeft(4, '0')}'
            '${date.month.toString().padLeft(2, '0')}'
            '${date.day.toString().padLeft(2, '0')}T235959Z',
          );
        }
      case RepeatEnd.never:
        break;
    }

    return parts.join(';');
  }

  /// The rule in the member's own words: "every week on Mon, Wed", "monthly on
  /// the last day", "every 2 days, 6 times".
  ///
  /// The confirmation line, and the reason the picker is trustworthy: a member
  /// who reads "monthly on the 31st" knows February will be skipped, where
  /// "monthly" alone tells them nothing about the choice that was made for
  /// them.
  ///
  /// `lang` is a language code — `ar` for Arabic, English for anything else —
  /// and the caller passes `Localizations.localeOf(context).languageCode`,
  /// which is the same signal every other screen reads. It defaults to English
  /// so that a caller with no context (a log line, a test) still gets a
  /// sentence rather than a required argument it cannot answer.
  ///
  /// ## Why the Arabic lives here and not in `app_localizations.dart`
  ///
  /// Because it is agreement logic, not a string. Arabic counts in four cases
  /// — bare singular, dual, plural for 3–10, singular accusative for 11 and up
  /// — and `AppLocalizations._f` only substitutes `{name}` placeholders, so it
  /// has no way to *choose* between them. Putting the words there and the
  /// choice here would leave the dual form in one file and the rule that
  /// reaches for it in another, which is exactly how a picker ends up saying
  /// كل ٢ أسابيع. The alternative — a general plural-category resolver in the
  /// localisation file — is a framework for two locales and one caller.
  ///
  /// The cost of the choice is that `core/` now holds member-facing prose. It
  /// is paid for by this file staying **pure Dart with no Flutter import**:
  /// `app_localizations.dart` imports `package:flutter/widgets.dart`, and
  /// taking an `AppLocalizations` here would drag the widget layer into the
  /// recurrence core, which both expanders and their tests are free of today.
  /// Hence a language *code* and not a `Locale` or a delegate.
  ///
  /// Numbers are Western digits in both languages, which is what the app
  /// already does with every number that comes from data: `homeStreakDays` is
  /// `'{count} يومًا'` and the count is substituted as `'$count'`. Only digits
  /// hand-written into an Arabic sentence are Arabic-Indic (`passwordTooShort`
  /// says ٨). Mixing the two by locale would make this the one screen that
  /// disagrees with the rest.
  String describe([String lang = 'en']) =>
      lang == 'ar' ? _describeAr() : _describeEn();

  String _describeEn() {
    final every = switch (freq) {
      RepeatFreq.daily => interval == 1 ? 'every day' : 'every $interval days',
      RepeatFreq.weekly =>
        interval == 1 ? 'every week' : 'every $interval weeks',
      RepeatFreq.monthly =>
        interval == 1 ? 'every month' : 'every $interval months',
    };

    final where = switch (freq) {
      RepeatFreq.weekly when byDays.isNotEmpty => () {
        final ordered = byDays.toList()..sort();
        return ' on ${ordered.map((day) => kWeekdayNames[day - 1]).join(', ')}';
      }(),
      RepeatFreq.monthly when monthly == MonthlyMode.lastDay =>
        ' on the last day',
      RepeatFreq.monthly when monthDay != null =>
        ' on the ${_ordinal(monthDay!)}',
      _ => '',
    };

    final stops = switch (end) {
      RepeatEnd.afterCount when count != null => ', $count times',
      RepeatEnd.onDate when until != null => ', until ${_untilIso()}',
      _ => '',
    };

    return '$every$where$stops';
  }

  /// The same rule in Arabic.
  ///
  /// Every number here goes through [arabicCounted], because Arabic agreement is
  /// the whole substance of this method: كل أسبوعين is not كل ٢ أسابيع, and a
  /// picker that says the second reads as broken Arabic to a native reader.
  String _describeAr() {
    final every = switch (freq) {
      // The plural of شهر is given as أشهر rather than شهور: both are
      // correct, أشهر is the one in ordinary written use.
      RepeatFreq.daily =>
        'كل '
            '${arabicCounted(interval, one: 'يوم', two: 'يومين', few: 'أيام', many: 'يومًا')}',
      RepeatFreq.weekly =>
        'كل '
            '${arabicCounted(interval, one: 'أسبوع', two: 'أسبوعين', few: 'أسابيع', many: 'أسبوعًا')}',
      RepeatFreq.monthly =>
        'كل '
            '${arabicCounted(interval, one: 'شهر', two: 'شهرين', few: 'أشهر', many: 'شهرًا')}',
    };

    final where = switch (freq) {
      RepeatFreq.weekly when byDays.isNotEmpty => () {
        final ordered = byDays.toList()..sort();
        // يوم for one day and أيام for several — the same singular/plural
        // question as the interval, one step down. The separator is the Arabic
        // comma ، (U+060C); a Latin comma in Arabic text is a foreign mark.
        final head = ordered.length == 1 ? 'يوم' : 'أيام';
        return ' $head '
            '${ordered.map((day) => kWeekdayNamesAr[day - 1]).join('، ')}';
      }(),
      RepeatFreq.monthly when monthly == MonthlyMode.lastDay =>
        ' في آخر يوم من الشهر',
      // A cardinal with يوم, not an ordinal. Arabic ordinals inflect for
      // gender and case — "the 31st" written out is اليوم الحادي والثلاثين —
      // which is a heavier register than a picker wants and one more thing to
      // get wrong for each of thirty-one days. `يوم 31 من الشهر` is what a
      // calendar says, and it cannot disagree with itself. The English side
      // keeps `_ordinal`, because "the 31st" is how English says this.
      RepeatFreq.monthly when monthDay != null => ' في يوم $monthDay من الشهر',
      _ => '',
    };

    final stops = switch (end) {
      RepeatEnd.afterCount when count != null =>
        '، '
            '${arabicCounted(count!, one: 'مرة واحدة', two: 'مرتين', few: 'مرات', many: 'مرةً')}',
      RepeatEnd.onDate when until != null => '، حتى ${_untilIso()}',
      _ => '',
    };

    return '$every$where$stops';
  }

  /// `2026-12-31`, shared by both languages: an ISO date carries no words to
  /// translate, and it is the shape the rest of the app writes a bare date in.
  String _untilIso() =>
      '${until!.year}-${until!.month.toString().padLeft(2, '0')}'
      '-${until!.day.toString().padLeft(2, '0')}';
}


/// A stored rule in plain words, or the rule itself when this build cannot
/// read it.
///
/// The fallback is deliberate: a rule from the web app or the chat extractor
/// still has to render *something* on a list row, and the raw string is honest
/// where "every month" would be a guess.
String describeRule(String rrule, [String lang = 'en']) =>
    RepeatSpec.parse(rrule)?.describe(lang) ?? rrule;

String _freqCode(RepeatFreq freq) => switch (freq) {
  RepeatFreq.daily => 'DAILY',
  RepeatFreq.weekly => 'WEEKLY',
  RepeatFreq.monthly => 'MONTHLY',
};

/// `20261231T235959Z` and the handful of shapes around it, as a local date.
///
/// Only the date is kept, because that is all [RepeatSpec.until] means — see
/// [RepeatSpec.toRrule] for why the time is always the end of the day.
DateTime? _parseUntil(String? raw) {
  if (raw == null || raw.isEmpty) return null;
  final match = RegExp(
    r'^(\d{4})(\d{2})(\d{2})(?:T\d{6}Z?)?$',
  ).firstMatch(raw);
  if (match == null) {
    final parsed = DateTime.tryParse(raw);
    if (parsed == null) return null;
    return DateTime(parsed.year, parsed.month, parsed.day);
  }
  return DateTime(
    int.parse(match.group(1)!),
    int.parse(match.group(2)!),
    int.parse(match.group(3)!),
  );
}

String _ordinal(int day) {
  if (day >= 11 && day <= 13) return '${day}th';
  return switch (day % 10) {
    1 => '${day}st',
    2 => '${day}nd',
    3 => '${day}rd',
    _ => '${day}th',
  };
}
