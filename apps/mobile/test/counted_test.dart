import 'package:flutter/widgets.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:botvy/app/l10n/app_localizations.dart';
import 'package:botvy/core/i18n/counted.dart';

/// Number agreement, and the defect it was extracted to fix.
///
/// `homeStreakDays` rendered one template per language — `'{count} days'` and
/// `'{count} يومًا'` — so a one-day streak read "1 days" in English, and in
/// Arabic a two-day streak read `2 يومًا` where the dual is يومان and a
/// five-day streak read `5 يومًا` where the plural is أيام. P3 wrote the string;
/// P5 found it while building the repeat picker's Arabic, which needs the same
/// four forms one layer down.
///
/// The Arabic assertions pin the *categories* rather than claiming the wording
/// is the most idiomatic available: `يومان` versus `يومين` for a bare count is
/// on this phase's native-review list, and a test that asserted a specific word
/// would have to change when a native speaker corrects it. What must not change
/// is that 1, 2, 3-10 and 11+ are four different answers.
void main() {
  group('arabicCounted', () {
    const weeks = (
      one: 'أسبوع',
      two: 'أسبوعين',
      few: 'أسابيع',
      many: 'أسبوعًا',
    );

    String week(int n) => arabicCounted(
      n,
      one: weeks.one,
      two: weeks.two,
      few: weeks.few,
      many: weeks.many,
    );

    test('drops the number entirely at one', () {
      expect(week(1), 'أسبوع');
      expect(week(1), isNot(contains('1')));
    });

    test('uses the dual at two, and the dual is not two plus a plural', () {
      // The most visible error available here: `2 أسابيع` is the one a native
      // reader marks immediately.
      expect(week(2), 'أسبوعين');
      expect(week(2), isNot(contains('2')));
      expect(week(2), isNot(contains(weeks.few)));
    });

    test('takes the plural from three to ten', () {
      expect(week(3), '3 أسابيع');
      expect(week(10), '10 أسابيع');
    });

    test('returns to the singular at eleven and above', () {
      // Not a rounding of the rule above — the singular really does come back
      // (تمييز مفرد منصوب). 11 and 12 are two taps away in the picker, whose
      // interval dropdown runs to 12, so this is not a dead branch.
      expect(week(11), '11 أسبوعًا');
      expect(week(12), '12 أسبوعًا');
      expect(week(52), '52 أسبوعًا');
    });

    test('the four categories are four different answers', () {
      expect({week(1), week(2), week(3), week(11)}, hasLength(4));
    });
  });

  group('englishCounted', () {
    test('is singular at one and plural otherwise', () {
      // The literal bug: the old template said "1 days".
      expect(englishCounted(1, one: 'day', other: 'days'), '1 day');
      expect(englishCounted(2, one: 'day', other: 'days'), '2 days');
      expect(englishCounted(0, one: 'day', other: 'days'), '0 days');
    });
  });

  group('homeStreakDays reads correctly in both languages', () {
    const en = AppLocalizations(Locale('en'));
    const ar = AppLocalizations(Locale('ar'));

    test('English agrees with the number', () {
      expect(en.homeStreakDays(1), '1 day');
      expect(en.homeStreakDays(2), '2 days');
      expect(en.homeStreakDays(9), '9 days');
    });

    test('Arabic gives four distinct forms, none of them the old one', () {
      final forms = [
        ar.homeStreakDays(1),
        ar.homeStreakDays(2),
        ar.homeStreakDays(5),
        ar.homeStreakDays(11),
      ];
      expect(forms.toSet(), hasLength(4));

      // What the bug looked like: the 11+ form used for every count.
      expect(ar.homeStreakDays(2), isNot('2 يومًا'));
      expect(ar.homeStreakDays(5), isNot('5 يومًا'));
      // And the categories, without pinning the exact wording.
      expect(ar.homeStreakDays(1), isNot(contains('1')));
      expect(ar.homeStreakDays(2), isNot(contains('2')));
      expect(ar.homeStreakDays(5), startsWith('5 '));
      expect(ar.homeStreakDays(11), startsWith('11 '));
    });

    test('an unknown locale falls back to English rather than to a key', () {
      const other = AppLocalizations(Locale('fr'));
      expect(other.homeStreakDays(1), '1 day');
    });
  });
}
