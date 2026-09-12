import 'package:botvy/core/recurrence/rule_words.dart';
import 'package:flutter_test/flutter_test.dart';

/// The repeat picker's words, in both languages.
///
/// Arabic number agreement is the substance of this file. The forms are four
/// and not two — bare singular, dual, plural for 3–10, singular accusative for
/// 11 and up — and the dual is the one a native reader notices immediately: a
/// picker that says كل ٢ أسابيع instead of كل أسبوعين reads as broken Arabic.
/// So every branch is pinned by an assertion rather than by the reviewer's
/// memory of which case applies.
///
/// The English half is pinned too, as a fence: this change added a second
/// language and must not have altered the first one by a character.
void main() {
  group('the interval, in Arabic', () {
    // A singular interval drops the number entirely. "every 1 day" is not
    // something Arabic says.
    test('one is the bare noun, with no number', () {
      expect(const RepeatSpec(freq: RepeatFreq.daily).describe('ar'), 'كل يوم');
      expect(
        const RepeatSpec(freq: RepeatFreq.weekly).describe('ar'),
        'كل أسبوع',
      );
      expect(
        const RepeatSpec(freq: RepeatFreq.monthly).describe('ar'),
        'كل شهر',
      );
    });

    // The one that matters most. Two is its own grammatical number in Arabic,
    // not "2" followed by a plural.
    test('two is the dual, and the number disappears into it', () {
      expect(
        const RepeatSpec(freq: RepeatFreq.daily, interval: 2).describe('ar'),
        'كل يومين',
      );
      expect(
        const RepeatSpec(freq: RepeatFreq.weekly, interval: 2).describe('ar'),
        'كل أسبوعين',
      );
      expect(
        const RepeatSpec(freq: RepeatFreq.monthly, interval: 2).describe('ar'),
        'كل شهرين',
      );

      // Named explicitly, because it is the failure this test exists for.
      for (final spec in [
        const RepeatSpec(freq: RepeatFreq.daily, interval: 2),
        const RepeatSpec(freq: RepeatFreq.weekly, interval: 2),
        const RepeatSpec(freq: RepeatFreq.monthly, interval: 2),
      ]) {
        expect(spec.describe('ar'), isNot(contains('2')));
      }
    });

    test('three to ten take the plural of the counted noun', () {
      expect(
        const RepeatSpec(freq: RepeatFreq.daily, interval: 5).describe('ar'),
        'كل 5 أيام',
      );
      expect(
        const RepeatSpec(freq: RepeatFreq.weekly, interval: 3).describe('ar'),
        'كل 3 أسابيع',
      );
      expect(
        const RepeatSpec(freq: RepeatFreq.monthly, interval: 4).describe('ar'),
        'كل 4 أشهر',
      );

      // The boundaries of the band, both ends.
      expect(
        const RepeatSpec(freq: RepeatFreq.weekly, interval: 10).describe('ar'),
        'كل 10 أسابيع',
      );
    });

    // Reachable: the picker's interval dropdown runs 1..12, so 11 and 12 are
    // two taps away and not a theoretical case.
    test('eleven and above take the singular, in the accusative', () {
      expect(
        const RepeatSpec(freq: RepeatFreq.daily, interval: 11).describe('ar'),
        'كل 11 يومًا',
      );
      expect(
        const RepeatSpec(freq: RepeatFreq.weekly, interval: 12).describe('ar'),
        'كل 12 أسبوعًا',
      );
      expect(
        const RepeatSpec(freq: RepeatFreq.monthly, interval: 11).describe('ar'),
        'كل 11 شهرًا',
      );
    });
  });

  group('the count of occurrences, in Arabic', () {
    String after(int count) => RepeatSpec(
      freq: RepeatFreq.daily,
      end: RepeatEnd.afterCount,
      count: count,
    ).describe('ar');

    // Same four cases as the interval, one noun down. مرة is feminine, so the
    // dual is مرتين and the plural مرات.
    test('one, two, few and many each have their own form', () {
      expect(after(1), 'كل يوم، مرة واحدة');
      expect(after(2), 'كل يوم، مرتين');
      expect(after(6), 'كل يوم، 6 مرات');
      expect(after(10), 'كل يوم، 10 مرات');
      // The count is a free text field, so a member typing 52 is ordinary.
      expect(after(12), 'كل يوم، 12 مرةً');
      expect(after(52), 'كل يوم، 52 مرةً');
    });

    test('two does not carry its digit', () {
      expect(after(2), isNot(contains('2')));
    });

    test('the clause separator is the Arabic comma', () {
      expect(after(6), contains('،'));
      expect(after(6), isNot(contains(',')));
    });
  });

  group('weekdays, in Arabic', () {
    test('one day is يوم and several are أيام', () {
      expect(
        const RepeatSpec(
          freq: RepeatFreq.weekly,
          byDays: {DateTime.monday},
        ).describe('ar'),
        'كل أسبوع يوم الاثنين',
      );
      expect(
        const RepeatSpec(
          freq: RepeatFreq.weekly,
          byDays: {DateTime.monday, DateTime.wednesday},
        ).describe('ar'),
        'كل أسبوع أيام الاثنين، الأربعاء',
      );
    });

    test('the list separator is ، and never a Latin comma', () {
      const everyDay = RepeatSpec(
        freq: RepeatFreq.weekly,
        byDays: {1, 2, 3, 4, 5, 6, 7},
      );
      final words = everyDay.describe('ar');
      expect(words, isNot(contains(',')));
      // Six separators for seven days.
      expect('،'.allMatches(words).length, 6);
      expect(
        words,
        'كل أسبوع أيام الاثنين، الثلاثاء، الأربعاء، الخميس، الجمعة، السبت، '
            'الأحد',
      );
    });

    test('every day has an Arabic name, and it is the app\'s own name', () {
      // The table the preferences screen uses says الاثنين, السبت and الأحد;
      // if these three ever disagree with it the same day has two names in
      // one app.
      expect(weekdayName(DateTime.monday, 'ar'), 'الاثنين');
      expect(weekdayName(DateTime.saturday, 'ar'), 'السبت');
      expect(weekdayName(DateTime.sunday, 'ar'), 'الأحد');
      expect(kWeekdayNamesAr.length, 7);
      for (final name in kWeekdayNamesAr) {
        expect(name, isNotEmpty);
        expect(RegExp(r'^[؀-ۿ ]+$').hasMatch(name), isTrue,
            reason: name);
      }
      // And the English list is still the English list.
      expect(weekdayName(DateTime.monday), 'Mon');
      expect(weekdayName(DateTime.sunday, 'en'), 'Sun');
    });
  });

  group('the monthly rules, in both languages', () {
    // The two rules are different intentions — BYMONTHDAY=31 skips February,
    // BYMONTHDAY=-1 lands on the 28th — so both have to be sayable in both
    // languages or the confirmation line stops being the reason the picker is
    // trustworthy.
    const onThe31st = RepeatSpec(freq: RepeatFreq.monthly, monthDay: 31);
    const lastDay = RepeatSpec(
      freq: RepeatFreq.monthly,
      monthly: MonthlyMode.lastDay,
    );

    test('the last day', () {
      expect(lastDay.describe(), 'every month on the last day');
      expect(lastDay.describe('ar'), 'كل شهر في آخر يوم من الشهر');
    });

    test('a named day of the month uses a cardinal in Arabic', () {
      // English keeps its ordinal; Arabic ordinals inflect for gender and
      // case, and يوم 31 من الشهر is the register a calendar uses.
      expect(onThe31st.describe(), 'every month on the 31st');
      expect(onThe31st.describe('ar'), 'كل شهر في يوم 31 من الشهر');
      expect(
        const RepeatSpec(
          freq: RepeatFreq.monthly,
          monthDay: 1,
        ).describe('ar'),
        'كل شهر في يوم 1 من الشهر',
      );
    });

    test('the interval and the day agree at the same time', () {
      expect(
        const RepeatSpec(
          freq: RepeatFreq.monthly,
          interval: 2,
          monthly: MonthlyMode.lastDay,
        ).describe('ar'),
        'كل شهرين في آخر يوم من الشهر',
      );
      expect(
        const RepeatSpec(
          freq: RepeatFreq.monthly,
          interval: 3,
          monthDay: 15,
        ).describe('ar'),
        'كل 3 أشهر في يوم 15 من الشهر',
      );
    });
  });

  group('an end date', () {
    test('is the same ISO date in both languages', () {
      // Relative to now, never a literal year: a fixture pinned to a real date
      // starts failing the day the clock reaches it.
      final end = DateTime.now().add(const Duration(days: 200));
      final spec = RepeatSpec(
        freq: RepeatFreq.weekly,
        end: RepeatEnd.onDate,
        until: end,
      );
      final iso =
          '${end.year}-${end.month.toString().padLeft(2, '0')}'
          '-${end.day.toString().padLeft(2, '0')}';

      expect(spec.describe(), 'every week, until $iso');
      expect(spec.describe('ar'), 'كل أسبوع، حتى $iso');
    });
  });

  group('the English words are unchanged', () {
    // A fence, not a feature. Adding Arabic must not have moved a character of
    // the language that was already there.
    test('every form the picker can produce', () {
      final until = DateTime.now().add(const Duration(days: 90));
      final iso =
          '${until.year}-${until.month.toString().padLeft(2, '0')}'
          '-${until.day.toString().padLeft(2, '0')}';

      expect(const RepeatSpec(freq: RepeatFreq.daily).describe(), 'every day');
      expect(
        const RepeatSpec(freq: RepeatFreq.daily, interval: 2).describe(),
        'every 2 days',
      );
      expect(
        const RepeatSpec(freq: RepeatFreq.weekly).describe(),
        'every week',
      );
      expect(
        const RepeatSpec(freq: RepeatFreq.weekly, interval: 11).describe(),
        'every 11 weeks',
      );
      expect(
        const RepeatSpec(freq: RepeatFreq.monthly).describe(),
        'every month',
      );
      expect(
        const RepeatSpec(
          freq: RepeatFreq.weekly,
          interval: 2,
          byDays: {DateTime.monday, DateTime.wednesday},
        ).describe(),
        'every 2 weeks on Mon, Wed',
      );
      expect(
        const RepeatSpec(
          freq: RepeatFreq.monthly,
          monthly: MonthlyMode.lastDay,
          end: RepeatEnd.afterCount,
          count: 6,
        ).describe(),
        'every month on the last day, 6 times',
      );
      expect(
        const RepeatSpec(
          freq: RepeatFreq.monthly,
          monthDay: 2,
        ).describe(),
        'every month on the 2nd',
      );
      expect(
        const RepeatSpec(freq: RepeatFreq.monthly, monthDay: 11).describe(),
        'every month on the 11th',
      );
      expect(
        RepeatSpec(
          freq: RepeatFreq.daily,
          end: RepeatEnd.onDate,
          until: until,
        ).describe(),
        'every day, until $iso',
      );
    });

    test('an unknown language falls back to English rather than to a key', () {
      const spec = RepeatSpec(freq: RepeatFreq.weekly, interval: 2);
      expect(spec.describe('fr'), 'every 2 weeks');
      expect(spec.describe(), spec.describe('en'));
      expect(describeRule('FREQ=DAILY', 'fr'), 'every day');
    });
  });

  group('describeRule', () {
    test('round-trips through the rule string in both languages', () {
      // Re-opening a meeting parses the stored rule and describes *that*, so a
      // description that differs from the one the picker showed when the rule
      // was written is a member seeing their own choice change on reopen.
      final specs = <RepeatSpec>[
        const RepeatSpec(freq: RepeatFreq.daily),
        const RepeatSpec(freq: RepeatFreq.daily, interval: 2),
        const RepeatSpec(freq: RepeatFreq.daily, interval: 11),
        const RepeatSpec(freq: RepeatFreq.weekly, interval: 3),
        const RepeatSpec(
          freq: RepeatFreq.weekly,
          byDays: {DateTime.tuesday, DateTime.friday},
          end: RepeatEnd.afterCount,
          count: 2,
        ),
        const RepeatSpec(
          freq: RepeatFreq.weekly,
          interval: 12,
          byDays: {DateTime.sunday},
          end: RepeatEnd.afterCount,
          count: 52,
        ),
        const RepeatSpec(freq: RepeatFreq.monthly, interval: 2, monthDay: 31),
        const RepeatSpec(
          freq: RepeatFreq.monthly,
          monthly: MonthlyMode.lastDay,
        ),
        RepeatSpec(
          freq: RepeatFreq.monthly,
          interval: 4,
          monthly: MonthlyMode.lastDay,
          end: RepeatEnd.onDate,
          // Relative to now, never a literal year.
          until: DateTime.now().add(const Duration(days: 400)),
        ),
      ];

      for (final spec in specs) {
        final rule = spec.toRrule();
        for (final lang in ['en', 'ar']) {
          expect(
            RepeatSpec.parse(rule)?.describe(lang),
            spec.describe(lang),
            reason: '$rule ($lang)',
          );
          expect(describeRule(rule, lang), spec.describe(lang), reason: rule);
        }
      }
    });

    test('a rule this build cannot read stays verbatim in Arabic too', () {
      // The fallback is the honest answer in either language: a BYSETPOS rule
      // rendered as كل شهر would be a guess about which dates the series
      // lands on.
      const raw = 'FREQ=MONTHLY;BYDAY=MO;BYSETPOS=2';
      expect(describeRule(raw, 'ar'), raw);
      expect(describeRule('FREQ=YEARLY', 'ar'), 'FREQ=YEARLY');
    });
  });
}
