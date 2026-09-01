import 'package:botvy/src/features/history/streak.dart';
import 'package:flutter_test/flutter_test.dart';

/// The same cases as the gateway's `test/adherence.spec.ts`, deliberately.
///
/// The device computes these itself so the history screen is right the moment
/// a check-in is answered offline. That is only safe while the two agree, so
/// the fixtures are copied across rather than reinvented — if one side changes
/// its mind about what a streak is, this file fails.
CheckinDay yes(String date) => (date: date, adhered: true);
CheckinDay no(String date) => (date: date, adhered: false);

void main() {
  group('currentStreak', () {
    test('counts consecutive adhered days ending today', () {
      expect(
        currentStreak([yes('2026-08-30'), yes('2026-08-29'), yes('2026-08-28')], '2026-08-30'),
        3,
      );
    });

    test('stops at a missed day', () {
      expect(
        currentStreak([yes('2026-08-30'), no('2026-08-29'), yes('2026-08-28')], '2026-08-30'),
        1,
      );
    });

    test('does not treat an unanswered today as a break', () {
      expect(currentStreak([yes('2026-08-29'), yes('2026-08-28')], '2026-08-30'), 2);
    });

    test('is zero when today is answered as a miss', () {
      expect(currentStreak([no('2026-08-30'), yes('2026-08-29')], '2026-08-30'), 0);
    });

    test('is zero with no history', () {
      expect(currentStreak(const [], '2026-08-30'), 0);
    });

    test('counts across a month boundary', () {
      // The date maths is string-based; this is where an off-by-one would show.
      expect(currentStreak([yes('2026-09-01'), yes('2026-08-31')], '2026-09-01'), 2);
    });
  });

  group('completionRatio', () {
    test('is the share of answered days that were adhered', () {
      final checkins = [yes('2026-08-30'), no('2026-08-29'), yes('2026-08-28'), yes('2026-08-27')];
      expect(completionRatio(checkins, '2026-08-30'), closeTo(3 / 4, 1e-9));
    });

    test('ignores days outside the window', () {
      expect(completionRatio([yes('2026-08-30'), no('2026-08-01')], '2026-08-30'), 1);
    });

    test('is zero rather than NaN with nothing answered', () {
      expect(completionRatio(const [], '2026-08-30'), 0);
    });
  });

  group('answeredCount', () {
    test('counts only the days inside the window', () {
      final checkins = [yes('2026-08-30'), no('2026-08-29'), yes('2026-08-01')];
      expect(answeredCount(checkins, '2026-08-30'), 2);
    });
  });

  test('todayLocal reads the device calendar, zero-padded', () {
    expect(todayLocal(DateTime(2026, 9, 1)), '2026-09-01');
  });
}
