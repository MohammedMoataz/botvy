import 'package:botvy/core/db/database.dart';
import 'package:botvy/features/athlete/application/athlete.dart';
import 'package:drift/drift.dart' show Value;
import 'package:flutter_test/flutter_test.dart';
import 'package:timezone/data/latest_all.dart' as tzdata;
import 'package:timezone/timezone.dart' as tz;

/// The phone's copy of the two clock rules, graded against the server's own
/// fixture cases.
///
/// ## Why this file exists at all
///
/// The next-practice card, the week view and Today's training row are drawn
/// from the phone's `sessions` table so they work in a gym basement, which
/// means the *phone* decides what "next" is and what "missed" is. Two
/// implementations of one rule is the situation this codebase has been bitten
/// by more than once, and the mitigation is here rather than in a comment: this
/// is a **case-for-case port** of the `nextPractice` and `Session.isMissed`
/// groups in `backend/src/contexts/training/training-clock.spec.ts`, with
/// the same group names, the same test names, in the same order. The two files
/// diff by eye, so a case added on one side and not the other reads as a
/// missing line instead of as a silent difference in behaviour.
///
/// Deliberately not "generate one from the other": the two languages' fixtures
/// do not share a shape, and a generator would be a third thing to keep in
/// step.
///
/// ## Every calendar here is built from `DateTime.now()`
///
/// The plan asks for it and this codebase has paid for the alternative: a
/// fixture carrying a written date passes until the day the clock reaches it.
/// So the fourteen-day sweep starts today and nothing below contains a literal
/// date. `Africa/Cairo` is the fixed test zone the plan names — it is ahead of
/// UTC, which is the half that used to be got wrong, and it observes daylight
/// saving.
void main() {
  // Before anything asks for a zone, and not in a `setUpAll`: the helpers
  // below are called while `main` runs, which is earlier than any hook.
  tzdata.initializeTimeZones();

  final cairo = tz.getLocation('Africa/Cairo');
  const cutoff = '21:00';

  /// `YYYY-MM-DD` at `HH:mm`, read on the member's own clock.
  ///
  /// The server's `at()`, which resolves a wall clock through `shared/time`.
  /// Handed back as a plain [DateTime] because that is what every column here
  /// holds — a `TZDateTime` written to one appends its zone and the row can be
  /// inserted and never read back.
  DateTime at(String date, String hhmm) {
    final parts = date.split('-').map(int.parse).toList();
    final clock = hhmm.split(':').map(int.parse).toList();
    final wall = tz.TZDateTime(
      cairo,
      parts[0],
      parts[1],
      parts[2],
      clock[0],
      clock[1],
    );
    return DateTime.fromMillisecondsSinceEpoch(
      wall.millisecondsSinceEpoch,
      isUtc: true,
    );
  }

  /// The member's local date today. The server's `today()`.
  String today() {
    final now = tz.TZDateTime.now(cairo);
    return '${now.year}-${now.month.toString().padLeft(2, '0')}-'
        '${now.day.toString().padLeft(2, '0')}';
  }

  /// [days] calendar days from [date]. The server's `addDays`.
  ///
  /// Built through the zone's constructor rather than by adding a duration,
  /// which is not the same thing twice a year.
  String addDays(String date, int days) {
    final parts = date.split('-').map(int.parse).toList();
    final shifted = tz.TZDateTime(cairo, parts[0], parts[1], parts[2] + days);
    return '${shifted.year}-${shifted.month.toString().padLeft(2, '0')}-'
        '${shifted.day.toString().padLeft(2, '0')}';
  }

  /// A session row. The server's `session()` factory, as a drift row.
  ///
  /// A row and not an aggregate, because that is what the phone's rule reads
  /// and the difference matters: the aggregate can refuse a bad transition and
  /// a row cannot, so the phone's copy of the rule has to be correct about rows
  /// it is simply handed.
  LocalSession session({
    String id = 'session-1',
    DateTime? plannedAt,
    int durationMin = 60,
    String sport = 'gym',
    String title = 'Push day',
    String status = 'planned',
    DateTime? completedAt,
    DateTime? deletedAt,
    String exercisesJson = '[]',
  }) {
    final when = plannedAt ?? at(today(), '18:00');
    return LocalSession(
      id: id,
      plannedAt: when,
      durationMin: durationMin,
      sport: sport,
      title: title,
      focus: null,
      programId: null,
      weekIndex: null,
      slotId: 'slot-gym',
      suggestionId: null,
      exercisesJson: exercisesJson,
      status: status,
      completedAt: completedAt,
      notes: null,
      createdAt: when,
      updatedAt: when,
      baseUpdatedAt: null,
      pendingOp: null,
      pushAttempts: 0,
      deletedAt: deletedAt,
    );
  }

  // --------------------------------------------------------- missed status

  group('Session.isMissed (FR-018)', () {
    test('is true once a planned session has finished with nothing logged', () {
      final date = today();
      final past = session(plannedAt: at(date, '06:00'), durationMin: 60);
      expect(isMissed(past, at(date, '08:00')), isTrue);
    });

    test('is false while the session is still under way', () {
      // A session in progress is not missed. The duration is in the comparison
      // for exactly this, and the spec's last edge case depends on it.
      final date = today();
      final running = session(plannedAt: at(date, '18:00'), durationMin: 60);
      expect(isMissed(running, at(date, '18:30')), isFalse);
      expect(isMissed(running, at(date, '17:00')), isFalse);
    });

    test('is false for anything the member has dealt with', () {
      final date = today();
      for (final status in ['completed', 'cancelled', 'skipped']) {
        final dealt = session(
          plannedAt: at(date, '06:00'),
          status: status,
          completedAt: status == 'completed' ? at(date, '07:00') : null,
        );
        expect(
          isMissed(dealt, at(date, '20:00')),
          isFalse,
          reason: 'a $status session is not missed',
        );
      }
    });

    test('needs no correction before a late log, because nothing stored it', () {
      /*
       * FR-018's point. "Missed" is a reading of the clock, so logging the
       * session late is an ordinary log — there is no status to un-set first,
       * and the reading changes by itself because the session is no longer
       * `planned`. Had it been swept into the row, this test would need a
       * repair step, and the row would need a column for the repair to write.
       */
      final date = today();
      final late = session(
        plannedAt: at(date, '06:00'),
        exercisesJson:
            '[{"id":"e1","name":"Squat","notes":null,"mediaRefs":[],"sets":[]}]',
      );
      expect(isMissed(late, at(date, '20:00')), isTrue);

      // The log and the completion, as the cubit writes them: the sets go into
      // `exercisesJson` and the status moves. Nothing touches a missed flag,
      // because there is not one.
      final logged = late.copyWith(
        exercisesJson:
            '[{"id":"e1","name":"Squat","notes":null,"mediaRefs":[],'
            '"sets":[{"targetReps":5,"actualReps":5,"actualWeightKg":100,'
            '"done":true}]}]',
        status: 'completed',
        completedAt: Value(at(date, '20:05')),
      );

      expect(isMissed(logged, at(date, '20:10')), isFalse);
      expect(logged.status, 'completed');
      // And the row really does carry the log, so this is a session that was
      // recorded late rather than one that was merely re-stamped.
      final sets = decodeExercises(logged.exercisesJson).single.sets;
      expect(sets.single.actualWeightKg, 100);
      expect(sets.single.isLogged, isTrue);
    });

    test('is false for a deleted session, whatever the clock says', () {
      // The phone's own case, and it has no server twin because the server's
      // scoped read cannot hand a tombstone to the rule. Here it can: the
      // sessions table keeps tombstones — a delete never touches the status,
      // which is the only record of whether the session was completed,
      // cancelled or never dealt with — and the Deleted view must not badge
      // them all as missed.
      final date = today();
      final gone = session(
        plannedAt: at(date, '06:00'),
        deletedAt: at(date, '07:00'),
      );
      expect(isMissed(gone, at(date, '20:00')), isFalse);
    });
  });

  // ------------------------------------------------------------ the cut-off

  group('nextPractice across fourteen days (SC-002)', () {
    test('shows today before the cut-off and tomorrow after it, every day', () {
      /*
       * Story 2's own example, swept over a fortnight: at 20:00 the card shows
       * today's session and at 21:30 the next one. Fourteen days rather than
       * one because the failure this guards is a comparison that works on some
       * weekdays — a string compare of `HH:mm` is right, and the arithmetic
       * versions of it are wrong at the ends of the day.
       */
      final start = today();

      for (var offset = 0; offset < 14; offset++) {
        final date = addDays(start, offset);
        final todays = [
          session(id: 'today-$offset', plannedAt: at(date, '18:00')),
        ];
        final upcoming = [
          session(
            id: 'next-$offset',
            plannedAt: at(addDays(date, 2), '18:00'),
          ),
        ];

        final before = nextPractice(
          todays,
          upcoming,
          at(date, '20:00'),
          cairo,
          cutoff,
        );
        expect(
          before.reason,
          NextPracticeReason.today,
          reason: '$date at 20:00',
        );
        expect(before.session?.id, 'today-$offset');

        final after = nextPractice(
          todays,
          upcoming,
          at(date, '21:30'),
          cairo,
          cutoff,
        );
        expect(
          after.reason,
          NextPracticeReason.afterCutoff,
          reason: '$date at 21:30',
        );
        expect(after.session?.id, 'next-$offset');
      }
    });

    test("keeps today's session after the cut-off when it has not happened yet",
        () {
      /*
       * The spec's last edge case, and the one the rule as first written gets
       * wrong: a 22:00 session, a 21:00 cut-off, and a member opening the card
       * at 21:30. Showing them tomorrow's would hide a session they are about
       * to do.
       */
      final date = today();
      final late = session(id: 'tonight', plannedAt: at(date, '22:00'));
      final tomorrow = session(
        id: 'tomorrow',
        plannedAt: at(addDays(date, 1), '18:00'),
      );

      final answer = nextPractice(
        [late],
        [tomorrow],
        at(date, '21:30'),
        cairo,
        cutoff,
      );
      expect(answer.reason, NextPracticeReason.today);
      expect(answer.session?.id, 'tonight');
    });

    test("shows today's session whatever its status, before the cut-off", () {
      // Story 2 scenario 1. A completed morning session is what the member
      // wants to see at noon, not tomorrow's — filtering to `planned` here
      // would make the card jump forward the moment they ticked it off.
      final date = today();
      final done = session(
        id: 'this-morning',
        plannedAt: at(date, '07:00'),
        status: 'completed',
        completedAt: at(date, '08:00'),
      );

      final answer = nextPractice(
        [done],
        [session(id: 'later', plannedAt: at(addDays(date, 1), '18:00'))],
        at(date, '12:00'),
        cairo,
        cutoff,
      );
      expect(answer.reason, NextPracticeReason.today);
      expect(answer.session?.id, 'this-morning');
    });

    test('skips a cancelled or skipped future session when looking ahead', () {
      // After the cut-off the question is "what is next", and the member has
      // already said these are not happening.
      final date = today();
      final cancelled = session(
        id: 'cancelled',
        plannedAt: at(addDays(date, 1), '18:00'),
        status: 'cancelled',
      );
      final skipped = session(
        id: 'skipped',
        plannedAt: at(addDays(date, 2), '18:00'),
        status: 'skipped',
      );
      final real = session(
        id: 'real',
        plannedAt: at(addDays(date, 3), '18:00'),
      );

      final answer = nextPractice(
        const [],
        [cancelled, skipped, real],
        at(date, '21:30'),
        cairo,
        cutoff,
      );
      expect(answer.session?.id, 'real');
    });

    test('says so plainly when there is nothing at all (story 2 scenario 3)',
        () {
      final answer = nextPractice(
        const [],
        const [],
        DateTime.now().toUtc(),
        cairo,
        cutoff,
      );
      expect(answer.session, isNull);
      expect(answer.reason, NextPracticeReason.noneScheduled);
    });

    test('still shows this morning at night when nothing is ahead', () {
      // A member whose only session was this morning has had a training day.
      // Telling them at 22:00 that they have nothing scheduled is true about
      // the future and useless about the day they just had.
      final date = today();
      final done = session(
        id: 'morning',
        plannedAt: at(date, '07:00'),
        status: 'completed',
        completedAt: at(date, '08:00'),
      );

      final answer = nextPractice(
        [done],
        const [],
        at(date, '22:00'),
        cairo,
        cutoff,
      );
      expect(answer.reason, NextPracticeReason.today);
      expect(answer.session?.id, 'morning');
    });

    test('picks the unfinished one when the member trains twice in a day', () {
      // The assumptions allow two slots in a day, so the card has to choose.
      final date = today();
      final morning = session(
        id: 'swim',
        plannedAt: at(date, '07:00'),
        status: 'completed',
        completedAt: at(date, '08:00'),
      );
      final evening = session(id: 'gym', plannedAt: at(date, '18:00'));

      final answer = nextPractice(
        [morning, evening],
        const [],
        at(date, '12:00'),
        cairo,
        cutoff,
      );
      expect(answer.session?.id, 'gym');
    });

    test('honours a cut-off the member changed', () {
      // FR-007: the cut-off is a preference, so the rule reads it rather than
      // knowing it. At 19:30 a member with an 18:00 cut-off is already looking
      // ahead, where the default would still show them today.
      final date = today();
      final todays = [
        session(
          id: 'today',
          plannedAt: at(date, '06:00'),
          status: 'completed',
          completedAt: at(date, '07:00'),
        ),
      ];
      final upcoming = [
        session(id: 'next', plannedAt: at(addDays(date, 1), '18:00')),
      ];

      expect(
        nextPractice(todays, upcoming, at(date, '19:30'), cairo, '21:00').reason,
        NextPracticeReason.today,
      );
      expect(
        nextPractice(todays, upcoming, at(date, '19:30'), cairo, '18:00').reason,
        NextPracticeReason.afterCutoff,
      );
    });
  });

  // ------------------------------------------------------- the set shapes

  /// [setShapeFor] is the third port, and the one the editor's whole layout
  /// hangs off: it decides which pair of controls a set shows. Asserted here
  /// rather than in a widget test because it is a rule with a server twin, and
  /// this is the file the two are diffed in.
  group('setShapeFor', () {
    test('reps and weight for the lifting sports', () {
      for (final sport in ['gym', 'calisthenics', 'crossfit']) {
        expect(setShapeFor(sport), SetShape.reps, reason: sport);
      }
    });

    test('distance and duration for the endurance sports', () {
      for (final sport in ['swimming', 'running', 'cycling']) {
        expect(setShapeFor(sport), SetShape.distance, reason: sport);
      }
    });

    test('duration alone for a game', () {
      expect(setShapeFor('football'), SetShape.duration);
    });

    test("the member's own word falls to reps, not to an error", () {
      // "Other" in the picker is a text field and not a bucket, so this
      // function is handed words nobody wrote down: a member who typed `padel`
      // is most likely counting something, and refusing to answer would leave
      // their editor with no controls at all.
      expect(setShapeFor('padel'), SetShape.reps);
      expect(setShapeFor(''), SetShape.reps);
    });

    test('the seven known sports are the seven the server knows', () {
      // A list two implementations share, so it is worth one line: a sport in
      // the picker that the server does not recognise is a sport whose set
      // shape the two disagree about.
      expect(kKnownSports, [
        'gym',
        'football',
        'crossfit',
        'calisthenics',
        'swimming',
        'running',
        'cycling',
      ]);
    });
  });
}
