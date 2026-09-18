import 'package:botvy/app/l10n/app_localizations.dart';
import 'package:botvy/core/recurrence/rule_words.dart';
import 'package:botvy/features/meetings/presentation/repeat_picker.dart';
import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_test/flutter_test.dart';

/// The meetings chrome, in Arabic (E-015).
///
/// Two halves, and the second is the one that could not have been asserted
/// before: the picker's own labels now come from the tables, so an Arabic
/// screen can be checked for *Arabic* rather than for the single translated
/// sentence at the bottom.
///
/// The counted nouns are asserted directly on [AppLocalizations] rather than
/// through the widget, because what can go wrong with them is arithmetic —
/// `2 أسابيع` instead of `أسبوعين` — and a widget test that found the right
/// string would only prove the right call was made once.
void main() {
  const en = AppLocalizations(Locale('en'));
  const ar = AppLocalizations(Locale('ar'));

  group('the picker counts in Arabic', () {
    test('an interval agrees with its number in all four cases', () {
      // The noun alone: the digit is in the dropdown standing beside it.
      expect(ar.repeatWeekUnit(1), 'أسبوع');
      expect(ar.repeatWeekUnit(2), 'أسبوعين', reason: 'the dual is its own word');
      expect(ar.repeatWeekUnit(3), 'أسابيع');
      expect(ar.repeatWeekUnit(10), 'أسابيع');
      expect(ar.repeatWeekUnit(11), 'أسبوعًا', reason: 'the singular returns');
      expect(ar.repeatWeekUnit(12), 'أسبوعًا');

      expect(ar.repeatDayUnit(1), 'يوم');
      expect(ar.repeatDayUnit(2), 'يومين');
      expect(ar.repeatMonthUnit(2), 'شهرين');
      expect(ar.repeatMonthUnit(5), 'أشهر');
    });

    test('no unit carries the number the control already shows', () {
      // The whole point of the unit form. `arabicCounted` prefixes the count to
      // the plural cases and `englishCounted` to everything; beside a dropdown
      // reading "3" that would render "3 3 أسابيع".
      for (var n = 1; n <= 30; n++) {
        for (final unit in [
          ar.repeatWeekUnit(n),
          ar.repeatDayUnit(n),
          ar.repeatMonthUnit(n),
          ar.repeatTimesUnit(n),
          en.repeatWeekUnit(n),
          en.repeatTimesUnit(n),
        ]) {
          expect(
            unit.contains('$n'),
            isFalse,
            reason: 'the unit label must not repeat the number: "$unit"',
          );
        }
      }
    });

    test('"times" uses the rule\'s own four forms', () {
      // E-015's caveat: the same words the confirmation line uses, reached
      // through the same call rather than spelled a second time.
      expect(ar.repeatTimesUnit(1), 'مرة');
      expect(ar.repeatTimesUnit(2), 'مرتين');
      expect(ar.repeatTimesUnit(6), 'مرات');
      expect(ar.repeatTimesUnit(20), 'مرةً');

      // And the sentence underneath, which `rule_words` writes, agrees with it.
      const twice = RepeatSpec(
        freq: RepeatFreq.weekly,
        end: RepeatEnd.afterCount,
        count: 2,
      );
      expect(twice.describe('ar'), contains('مرتين'));
    });

    test('English still says "1 day" and not "1 days"', () {
      expect(en.repeatDayUnit(1), 'day');
      expect(en.repeatDayUnit(2), 'days');
      expect(en.repeatTimesUnit(1), 'time');
      expect(en.repeatTimesUnit(3), 'times');
    });
  });

  group('the meeting editor counts too', () {
    test('a length agrees with its number', () {
      // These carry their own number — they are not beside a control holding
      // it — so the whole phrase is asserted.
      expect(ar.meetingMinutes(15), '15 دقيقةً');
      expect(ar.meetingMinutes(5), '5 دقائق');
      expect(ar.meetingMinutes(2), 'دقيقتين');
      expect(ar.meetingHours(2), 'ساعتين');
      expect(ar.meetingHours(4), '4 ساعات');
      expect(en.meetingMinutes(30), '30 min');
      expect(en.meetingHours(2), '2 h');
    });

    test('the discard warning counts the dates it is about', () {
      expect(ar.meetingDiscardBody(2), contains('تاريخين'));
      expect(ar.meetingDiscardBody(4), contains('4 تواريخ'));
      expect(en.meetingDiscardBody(1), contains('1 date'));
      expect(en.meetingDiscardBody(3), contains('3 dates'));
    });

    test('a lead time is built from the counted minutes', () {
      expect(ar.meetingAlertMinutesBefore(10), 'قبل 10 دقائق');
      expect(en.meetingAlertMinutesBefore(30), '30 min before');
    });
  });

  group('the repeat picker on an Arabic screen', () {
    /// Opens the picker inside an Arabic app, the way the meeting editor does.
    ///
    /// The locale is what turns the direction right to left — the app never
    /// sets `TextDirection` itself — so forcing a `Directionality` here would
    /// be a test of its own wrapper.
    Future<void> open(WidgetTester tester, {required DateTime startAt}) async {
      await tester.pumpWidget(
        MaterialApp(
          locale: const Locale('ar'),
          localizationsDelegates: const [
            AppLocalizations.delegate,
            GlobalMaterialLocalizations.delegate,
            GlobalWidgetsLocalizations.delegate,
            GlobalCupertinoLocalizations.delegate,
          ],
          supportedLocales: AppLocalizations.supportedLocales,
          home: Builder(
            builder: (context) => Scaffold(
              body: TextButton(
                onPressed: () => showRepeatPicker(context, startAt: startAt),
                child: const Text('افتح'),
              ),
            ),
          ),
        ),
      );
      // The delegate loads asynchronously, so the first frame carries no
      // strings at all — a `tap` before this finds an empty screen.
      await tester.pumpAndSettle();
      await tester.tap(find.text('افتح'));
      await tester.pumpAndSettle();
    }

    testWidgets('its chrome is Arabic, not one Arabic line in an English form',
        (tester) async {
      await open(tester, startAt: DateTime(2026, 3, 10));

      expect(find.text('التكرار'), findsOneWidget);
      expect(find.text('يوميًا'), findsOneWidget);
      expect(find.text('أسبوعيًا'), findsOneWidget);
      expect(find.text('شهريًا'), findsOneWidget);
      expect(find.text('كل'), findsOneWidget);
      expect(find.text('ينتهي'), findsOneWidget);
      expect(find.text('بلا تكرار'), findsOneWidget);
      expect(find.text('اضبط التكرار'), findsOneWidget);

      // The state this enhancement exists to end.
      for (final english in const [
        'Repeat',
        'Daily',
        'Weekly',
        'Monthly',
        'Every',
        'Ends',
        'Never',
        'After',
        'On date',
        'Does not repeat',
        'Set repeat',
      ]) {
        expect(
          find.text(english),
          findsNothing,
          reason: '"$english" is still hard-coded English',
        );
      }
    });

    testWidgets('the form runs right to left', (tester) async {
      await open(tester, startAt: DateTime(2026, 3, 10));

      final sheet = tester.element(find.text('كل'));
      expect(Directionality.of(sheet), TextDirection.rtl);

      // "كل" leads the row, so on an Arabic screen it is the *rightmost* of
      // the three — a `Row` is direction-aware and a hard `Alignment.centerLeft`
      // or an `EdgeInsets.only(left:)` anywhere in it would reverse this.
      final every = tester.getRect(find.text('كل'));
      final unit = tester.getRect(find.text('أسبوع'));
      expect(
        every.left,
        greaterThan(unit.left),
        reason: 'the interval label must start on the reading-start edge, '
            'which in Arabic is the right',
      );

      // And the sheet itself is inside the screen rather than pushed off it by
      // a fixed left inset.
      final screen = tester.getSize(find.byType(Scaffold).first).width;
      expect(every.right, lessThanOrEqualTo(screen));
    });

    testWidgets('the unit beside the dropdown follows the interval',
        (tester) async {
      await open(tester, startAt: DateTime(2026, 3, 10));

      // One week to start with.
      expect(find.text('أسبوع'), findsOneWidget);

      await tester.tap(find.byType(DropdownButton<int>));
      await tester.pumpAndSettle();
      // The menu repeats every number; the second entry is "2".
      await tester.tap(find.text('2').last);
      await tester.pumpAndSettle();

      expect(find.text('أسبوعين'), findsOneWidget);
      expect(
        find.text('2 أسابيع'),
        findsNothing,
        reason: 'the dual is the error a native reader notices first',
      );
    });

    testWidgets('the February line explains the rule rather than naming a date',
        (tester) async {
      // The 31st: the case the picker exists for.
      await open(tester, startAt: DateTime(2026, 1, 31));
      await tester.tap(find.text('شهريًا'));
      await tester.pumpAndSettle();

      expect(find.text('يوم 31'), findsOneWidget);
      expect(find.text('تُتخطّى الأشهر التي ليس فيها يوم 31.'), findsOneWidget);

      await tester.tap(find.text('آخر يوم'));
      await tester.pumpAndSettle();
      expect(find.text('في فبراير يقع على 28 أو 29.'), findsOneWidget);
    });
  });
}
