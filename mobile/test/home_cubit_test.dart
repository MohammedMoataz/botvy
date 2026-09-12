import 'dart:convert';

import 'package:botvy/app/l10n/app_localizations.dart';
import 'package:botvy/core/db/database.dart';
import 'package:botvy/core/notifications/alert_plan.dart' show memberDate;
import 'package:botvy/core/sync/sync_engine.dart';
import 'package:botvy/features/athlete/application/athlete_cubit.dart';
import 'package:botvy/features/home/application/home_cubit.dart';
import 'package:botvy/features/home/presentation/home_dials.dart';
import 'package:botvy/features/home/presentation/home_page.dart';
import 'package:botvy/features/rhythm/application/rhythm_cubit.dart';
import 'package:botvy/features/tasks/application/tasks_cubit.dart';
import 'package:drift/drift.dart' show Value;
import 'package:drift/native.dart';
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:timezone/data/latest_all.dart' as tzdata;
import 'package:timezone/timezone.dart' as tz;

import 'fakes.dart';

/// Home, against the real drift database in memory.
///
/// In memory rather than mocked, because what this screen *is* is a set of
/// queries: which plan is today's, which of its tasks are done, and what the
/// last seven days say. A mocked repository would assert that the cubit calls
/// the methods the cubit calls.
///
/// Every fixture is relative to `DateTime.now()` and resolved in the member's
/// own zone. Home is entirely about "today", so a pinned date is a test that
/// starts failing on a particular Tuesday — and a date taken from the runner's
/// clock instead of the profile's zone is the three-hour shift principle XI
/// exists to stop.
void main() {
  tzdata.initializeTimeZones();

  /// Neither UTC nor (usually) the runner's, so a boundary resolved against the
  /// wrong clock fails here rather than passing by luck.
  const timezone = 'Africa/Cairo';
  final cairo = tz.getLocation(timezone);

  late AppDatabase db;
  late SyncEngine engine;
  late TasksCubit tasks;
  late HomeCubit cubit;

  setUp(() {
    db = AppDatabase.forTesting(NativeDatabase.memory());
    engine = offlineEngine(db);
    tasks = TasksCubit(db, engine, OfflineApi());
    cubit = HomeCubit(db, engine, tasks);
  });

  tearDown(() async {
    // Every write kicks the engine, and the kick is deliberately
    // fire-and-forget. Awaiting one more pass joins whichever is in flight, so
    // the teardown does not close the database from under a pass still reading
    // it.
    await engine.sync();
    await cubit.close();
    await tasks.close();
    engine.dispose();
    await db.close();
  });

  String dateOf({int addDays = 0}) =>
      memberDate(DateTime.now(), cairo, addDays: addDays);

  Future<void> seedMember({String? displayName = 'Mona'}) =>
      db.into(db.profiles).insert(
        ProfilesCompanion.insert(
          userId: 'member-1',
          displayName: Value(displayName),
          timezone: timezone,
          locale: 'en',
          fetchedAt: DateTime.now().toUtc(),
        ),
      );

  /// A task row, as a pull would have written it.
  Future<void> seedTask(
    String id,
    String title, {
    String status = 'open',
    int priority = 2,
    int deferCount = 0,
  }) => db.into(db.tasks).insert(
    TasksCompanion.insert(
      id: id,
      title: title,
      status: Value(status),
      priority: Value(priority),
      deferCount: Value(deferCount),
      updatedAt: DateTime.now().toUtc(),
      createdAt: DateTime.now().toUtc(),
    ),
  );

  /// A plan for [date], with a snapshot naming [taskIds].
  Future<void> seedPlan({
    required String date,
    required List<String> taskIds,
    String status = 'confirmed',
    Map<String, dynamic>? training,
    String? mealLine,
  }) => db.into(db.dailyPlans).insert(
    DailyPlansCompanion.insert(
      id: 'member-1:$date',
      date: date,
      status: Value(status),
      tasksJson: Value(
        jsonEncode([
          for (final id in taskIds)
            {'id': id, 'title': 'snapshot $id', 'priority': 2, 'deferCount': 0},
        ]),
      ),
      trainingJson: Value(training == null ? null : jsonEncode(training)),
      mealLine: Value(mealLine),
      updatedAt: DateTime.now().toUtc(),
    ),
  );

  Future<void> seedCheckin(String date, {bool? adhered, int? mood}) =>
      db.into(db.checkins).insert(
        CheckinsCompanion.insert(
          id: 'member-1:$date',
          date: date,
          mood: Value(mood),
          adhered: Value(adhered),
          updatedAt: DateTime.now().toUtc(),
        ),
      );

  // ── the day ────────────────────────────────────────────────────────────────

  group('today', () {
    test('reads the plan for the member\'s own date, not the handset\'s',
        () async {
      await seedMember();
      await seedTask('t-1', 'Pay the electricity bill');
      await seedPlan(date: dateOf(), taskIds: ['t-1']);
      // A plan for a *neighbouring* date, which is what a screen resolving the
      // day against the wrong clock would pick up somewhere in the world.
      await seedPlan(date: dateOf(addDays: -1), taskIds: []);

      await cubit.refresh();

      expect(cubit.state.today, dateOf());
      expect(cubit.state.plan?.date, dateOf());
      expect(cubit.state.planTasks.map((t) => t.id), ['t-1']);
    });

    test('the greeting carries the name, and drops it when there is none',
        () async {
      await seedMember();
      await cubit.refresh();
      expect(cubit.state.displayName, 'Mona');

      await db.delete(db.profiles).go();
      await cubit.refresh();
      expect(cubit.state.displayName, isNull);
    });

    test('the ring counts done against the snapshot, not against what is left',
        () async {
      await seedMember();
      await seedTask('t-1', 'One', status: 'completed');
      await seedTask('t-2', 'Two');
      await seedTask('t-3', 'Three');
      await seedPlan(date: dateOf(), taskIds: ['t-1', 't-2', 't-3']);

      await cubit.refresh();

      expect(cubit.state.doneCount, 1);
      expect(cubit.state.totalCount, 3);
    });

    test('a task deleted after the plan was set still counts in the total',
        () async {
      // The denominator must not shrink. A member who finished four of five and
      // then erased the fifth has done four of five, and a ring reading 4/4
      // would tell them they finished a day they did not.
      await seedMember();
      await seedTask('t-1', 'One', status: 'completed');
      await seedPlan(date: dateOf(), taskIds: ['t-1', 't-gone']);

      await cubit.refresh();

      expect(cubit.state.totalCount, 2);
      expect(cubit.state.doneCount, 1);
      // And the row the phone has never seen is not silently "done".
      expect(
        cubit.state.planTasks.firstWhere((t) => t.id == 't-gone').done,
        isFalse,
      );
    });

    test('an empty day says so rather than drawing an empty list', () async {
      await seedMember();
      await seedPlan(date: dateOf(), taskIds: []);

      await cubit.refresh();

      expect(cubit.state.emptyDay, isTrue);
      expect(cubit.state.training, isNull);
    });

    test('a day with training only is not an empty day', () async {
      await seedMember();
      await seedPlan(
        date: dateOf(),
        taskIds: [],
        training: {'title': 'Upper body', 'sport': 'gym'},
        mealLine: 'Oats, chicken salad, lentil soup',
      );

      await cubit.refresh();

      expect(cubit.state.emptyDay, isFalse);
      expect(cubit.state.training?.title, 'Upper body');
      expect(cubit.state.mealLine, 'Oats, chicken salad, lentil soup');
    });

    test('a plan with no meal line reads correctly (FR-012)', () async {
      // The nutrition feature lands in P8, and until then every plan has a
      // null meal line. So does any plan whose line the model failed to draft.
      await seedMember();
      await seedTask('t-1', 'One');
      await seedPlan(date: dateOf(), taskIds: ['t-1']);

      await cubit.refresh();

      expect(cubit.state.mealLine, isNull);
      expect(cubit.state.planTasks, hasLength(1));
    });

    test('ticking a task off moves the ring on the same pass', () async {
      await seedMember();
      await seedTask('t-1', 'One');
      await seedTask('t-2', 'Two');
      await seedPlan(date: dateOf(), taskIds: ['t-1', 't-2']);
      await cubit.refresh();
      expect(cubit.state.doneCount, 0);

      await cubit.toggleTask('t-1', done: true);
      expect(cubit.state.doneCount, 1);

      await cubit.toggleTask('t-1', done: false);
      expect(cubit.state.doneCount, 0);
    });

    test('an unreadable training slot is dropped, not thrown', () async {
      await seedMember();
      await db.into(db.dailyPlans).insert(
        DailyPlansCompanion.insert(
          id: 'member-1:${dateOf()}',
          date: dateOf(),
          tasksJson: const Value('not json at all'),
          trainingJson: const Value('{{{'),
          updatedAt: DateTime.now().toUtc(),
        ),
      );

      await cubit.refresh();

      expect(cubit.state.training, isNull);
      expect(cubit.state.planTasks, isEmpty);
      // The screen still opened, which is the point.
      expect(cubit.state.loading, isFalse);
    });
  });

  // ── the draft ──────────────────────────────────────────────────────────────

  group('plan tomorrow', () {
    test('a draft for tomorrow is offered', () async {
      await seedMember();
      await seedPlan(date: dateOf(addDays: 1), taskIds: [], status: 'draft');

      await cubit.refresh();

      expect(cubit.state.draft?.date, dateOf(addDays: 1));
    });

    test('a plan already confirmed or skipped is not offered again', () async {
      // Re-offering it would let a second confirm overwrite the first, which is
      // the member's own answer being discarded by the screen that asked for it.
      await seedMember();
      await seedPlan(
        date: dateOf(addDays: 1),
        taskIds: [],
        status: 'confirmed',
      );
      await cubit.refresh();
      expect(cubit.state.draft, isNull);

      await (db.update(db.dailyPlans)).write(
        const DailyPlansCompanion(status: Value('skipped')),
      );
      await cubit.refresh();
      expect(cubit.state.draft, isNull);
    });

    test('no draft before the prompt has ever run', () async {
      await seedMember();
      await cubit.refresh();
      expect(cubit.state.draft, isNull);
    });
  });

  // ── the streak and the week ────────────────────────────────────────────────

  group('the week', () {
    test('has one dot per day, oldest first and today last', () async {
      await seedMember();
      await cubit.refresh();

      expect(cubit.state.week, hasLength(kAdherenceDays));
      expect(cubit.state.week.first.date, dateOf(addDays: -6));
      expect(cubit.state.week.last.date, dateOf());
    });

    test('an unanswered day is not a missed day', () async {
      // The whole reason `Adherence` has three values and the week is not a
      // `List<bool>`: a member who was travelling on Wednesday did not break a
      // streak on Wednesday, and a two-state strip cannot say that.
      await seedMember();
      await seedCheckin(dateOf(addDays: -2), adhered: true);
      await seedCheckin(dateOf(addDays: -1), adhered: false);
      // Nothing at all for today.

      await cubit.refresh();

      final byDate = {for (final day in cubit.state.week) day.date: day};
      expect(byDate[dateOf(addDays: -2)]!.adherence, Adherence.adhered);
      expect(byDate[dateOf(addDays: -1)]!.adherence, Adherence.missed);
      expect(byDate[dateOf()]!.adherence, Adherence.unanswered);
      expect(byDate[dateOf(addDays: -5)]!.adherence, Adherence.unanswered);
    });

    test('a mood with no verdict is unanswered, not a miss', () async {
      // A row *exists*, so a query that treated "has a check-in" as "answered
      // the question" would call this a miss. `adhered` is null and null is the
      // absence of an answer.
      await seedMember();
      await seedCheckin(dateOf(), mood: 40);

      await cubit.refresh();

      expect(cubit.state.week.last.adherence, Adherence.unanswered);
    });

    test('a mood of nought is a real answer and survives as one', () async {
      await seedMember();
      await seedCheckin(dateOf(), mood: 0, adhered: true);

      await cubit.refresh();

      expect(cubit.state.week.last.adherence, Adherence.adhered);
      final row = (await db.select(db.checkins).get()).single;
      expect(row.mood, 0);
    });

    test('the streak and the best come from the mirrored rhythm state',
        () async {
      await seedMember();
      await db.into(db.rhythmState).insert(
        RhythmStateCompanion.insert(
          userId: 'member-1',
          awaitingCheckin: const Value(true),
          streakCurrent: const Value(4),
          streakBest: const Value(11),
        ),
      );

      await cubit.refresh();

      expect(cubit.state.streakCurrent, 4);
      expect(cubit.state.streakBest, 11);
      expect(cubit.state.awaitingCheckin, isTrue);
    });

    test('a member with no rhythm row reads as a zero streak, not a crash',
        () async {
      await seedMember();
      await cubit.refresh();

      expect(cubit.state.streakCurrent, 0);
      expect(cubit.state.awaitingCheckin, isFalse);
    });
  });

  // ── the screen ─────────────────────────────────────────────────────────────

  group('the screen', () {
    /*
     * The two cubits Home needs besides its own, held rather than constructed
     * inline — because one of them has to be *closed*.
     *
     * P6's training row is a `StreamBuilder` over a drift `watch()`, and drift
     * schedules a timer to coalesce stream updates. A subscription still open
     * when the test body ends leaves that timer pending, and
     * `flutter_test`'s own invariant check fails the test with *"A Timer is
     * still pending even after the widget tree was disposed"* — which is what
     * took out all four widget cases in this file, and which reads nothing like
     * its cause.
     *
     * So: one instance per test, closed in `tearDown`, and every widget case
     * ends by unmounting through [unmount] so the subscription is cancelled
     * inside the body where it still counts.
     */
    late RhythmCubit rhythm;
    late AthleteCubit athlete;

    setUp(() {
      rhythm = RhythmCubit(db, OfflineApi(), engine);
      athlete = AthleteCubit(db, engine);
    });

    tearDown(() async {
      await rhythm.close();
      await athlete.close();
    });

    Widget page() => MaterialApp(
      localizationsDelegates: const [AppLocalizations.delegate],
      home: MultiBlocProvider(
        providers: [
          BlocProvider<HomeCubit>.value(value: cubit),
          BlocProvider<RhythmCubit>.value(value: rhythm),
          // P6's training row watches the `sessions` table through this cubit
          // (T642). Provided here because Home builds it unconditionally: the
          // row draws nothing on a day with no session, which is the case
          // every fixture in this file is.
          BlocProvider<AthleteCubit>.value(value: athlete),
        ],
        child: const HomePage(),
      ),
    );

    /// Unmounts and lets drift's timers drain. See [drainStreams].
    Future<void> unmount(WidgetTester tester) => drainStreams(tester);

    testWidgets('draws the greeting, the plan, the ring and the strip',
        (tester) async {
      await seedMember();
      await seedTask('t-1', 'Pay the electricity bill', status: 'completed');
      await seedTask('t-2', 'Renew the passport', deferCount: 3);
      await seedPlan(
        date: dateOf(),
        taskIds: ['t-1', 't-2'],
        training: {'title': 'Upper body'},
        mealLine: 'Oats, chicken salad, lentil soup',
      );
      await seedCheckin(dateOf(addDays: -1), adhered: true);
      await cubit.refresh();

      await tester.pumpWidget(page());
      await tester.pump();

      expect(find.text('Hello, Mona'), findsOneWidget);
      expect(find.text('Renew the passport'), findsOneWidget);
      expect(find.text('1/2'), findsOneWidget);
      expect(find.byType(CompletionRing), findsOneWidget);
      expect(find.byType(AdherenceStrip), findsOneWidget);
      // The carried-over badge, from the live row's own defer count.
      expect(find.text('Carried over 3×'), findsOneWidget);
      expect(find.textContaining('Upper body'), findsOneWidget);
      expect(find.textContaining('Oats'), findsOneWidget);
      await unmount(tester);
    });

    testWidgets('says a quiet day plainly and draws no ring', (tester) async {
      await seedMember();
      await seedPlan(date: dateOf(), taskIds: []);
      await cubit.refresh();

      await tester.pumpWidget(page());
      await tester.pump();

      expect(
        find.text('Nothing planned for today, and no training either.'),
        findsOneWidget,
      );
      // 0/0 is a shape that says nothing next to a sentence that says it all.
      expect(find.byType(CompletionRing), findsNothing);
      await unmount(tester);
    });

    testWidgets('offers the draft card only while one awaits', (tester) async {
      await seedMember();
      await seedPlan(date: dateOf(addDays: 1), taskIds: [], status: 'draft');
      await cubit.refresh();

      await tester.pumpWidget(page());
      await tester.pump();
      expect(find.text('Plan tomorrow'), findsOneWidget);

      await (db.update(db.dailyPlans)).write(
        const DailyPlansCompanion(status: Value('confirmed')),
      );
      await cubit.refresh();
      await tester.pump();
      expect(find.text('Plan tomorrow'), findsNothing);
      await unmount(tester);
    });
  });

  // ── SC-005 ─────────────────────────────────────────────────────────────────

  group('SC-005', () {
    testWidgets('Home renders a full day offline in under 300 ms',
        (tester) async {
      await seedMember();

      final page = MaterialApp(
        localizationsDelegates: const [AppLocalizations.delegate],
        home: MultiBlocProvider(
          providers: [
            BlocProvider<HomeCubit>.value(value: cubit),
            BlocProvider<RhythmCubit>.value(
              value: RhythmCubit(db, OfflineApi(), engine),
            ),
            BlocProvider<AthleteCubit>.value(value: AthleteCubit(db, engine)),
          ],
          child: const HomePage(),
        ),
      );

      /// One open of Home, best of three.
      ///
      /// Best of three because a single wall-clock sample of a garbage
      /// collected runtime is noise: the pass that allocates the rows hands the
      /// collection bill to whichever frame happens to be next, and that lands
      /// inside or outside the clock depending on nothing the code controls.
      Future<int> openHome() async {
        var best = 1 << 30;
        for (var attempt = 0; attempt < 3; attempt++) {
          final clock = Stopwatch()..start();
          await cubit.refresh();
          await tester.pump();
          clock.stop();
          if (clock.elapsedMilliseconds < best) best = clock.elapsedMilliseconds;
        }
        return best;
      }

      // ── the baseline ───────────────────────────────────────────────────────
      //
      // Home with nothing on it, timed. Subtracted from the measurement below,
      // and the subtraction is what makes the number mean anything.
      //
      // `flutter test` runs on `flutter_tester`, a JIT debug VM with no AOT
      // snapshot, where a `tester.pump()` of any screen costs a couple of
      // hundred milliseconds of framework and first-time code generation
      // whatever is on it — a phone runs the same screen from an AOT snapshot
      // and pays almost none of that. An absolute wall-clock assertion here
      // would therefore assert a property of the test runner: it would pass or
      // fail on a laptop's temperature and say nothing about the member's day.
      //
      // What SC-005 is about is whether Home stays fast *with a real day on
      // it*, so that is what is measured: the cost the day **adds**. It is a
      // strict test rather than a lenient one — the moment Home starts
      // querying per task, or decoding the snapshot per candidate, or building
      // a widget per row it holds, this goes to seconds and fails.
      await tester.pumpWidget(page);
      await tester.pump();
      final baseline = await openHome();

      // ── a full day, on a phone that has been in use ────────────────────────
      //
      // Twelve tasks in the plan, training, a meal line, the week answered, and
      // five hundred unrelated tasks in the table so the snapshot's `id IN
      // (…)` lookup has to discriminate rather than return everything.
      final planIds = [for (var i = 0; i < 12; i++) 'plan-$i'];
      await db.batch((batch) {
        final now = DateTime.now().toUtc();
        batch
          ..insertAll(db.tasks, [
            for (var i = 0; i < 12; i++)
              TasksCompanion.insert(
                id: 'plan-$i',
                title: 'Planned task $i',
                status: Value(i % 3 == 0 ? 'completed' : 'open'),
                priority: Value((i % 4) + 1),
                deferCount: Value(i % 5),
                updatedAt: now,
                createdAt: now,
              ),
          ])
          ..insertAll(db.tasks, [
            for (var i = 0; i < 500; i++)
              TasksCompanion.insert(
                id: 'other-$i',
                title: 'Unrelated task $i',
                status: Value(i % 7 == 0 ? 'completed' : 'open'),
                priority: Value((i % 4) + 1),
                updatedAt: now,
                createdAt: now,
              ),
          ]);
      });
      await seedPlan(
        date: dateOf(),
        taskIds: planIds,
        training: {'title': 'Upper body', 'sport': 'gym'},
        mealLine: 'Oats, chicken salad, lentil soup',
      );
      await seedPlan(date: dateOf(addDays: 1), taskIds: planIds, status: 'draft');
      for (var back = 0; back < kAdherenceDays; back++) {
        await seedCheckin(
          dateOf(addDays: -back),
          adhered: back.isEven,
          mood: back * 10,
        );
      }
      await db.into(db.rhythmState).insert(
        RhythmStateCompanion.insert(
          userId: 'member-1',
          awaitingCheckin: const Value(true),
          streakCurrent: const Value(9),
          streakBest: const Value(14),
        ),
      );

      final total = await openHome();
      final added = total - baseline;

      // The database read on its own, so the report can say which half of the
      // time is where — and so the part that grows with the member's history is
      // held to the budget with no baseline subtracted from it at all.
      final query = Stopwatch()..start();
      await cubit.refresh();
      query.stop();

      // Something real was drawn, so the numbers are a frame rather than the
      // time an empty screen takes.
      expect(cubit.state.planTasks, hasLength(12));
      expect(cubit.state.doneCount, 4);
      expect(find.byType(CompletionRing), findsOneWidget);
      expect(find.text('Planned task 1'), findsOneWidget);

      // SC-005 itself, held **absolutely** and not only against the baseline.
      //
      // The subtraction is the honest way to measure a screen whose cost grows
      // with the member's backlog — which is how `tasks_cubit_test` measures
      // Today, where the framework's own frame is the bulk of the number. Home
      // is not that screen: it draws a fixed handful of cards and a plan capped
      // by `rhythm.draftTopN`, so it comes in an order of magnitude under the
      // budget and an absolute assertion is meaningful rather than a property
      // of the runner. It is also the assertion that cannot be satisfied by
      // accident: `added` can come out at or below zero when the day costs
      // nothing measurable, and a budget a negative number passes is a budget
      // that has stopped testing anything.
      expect(
        total,
        lessThan(300),
        reason:
            'SC-005: Home renders today\'s plan offline in under 300 ms. A '
            'full day took $total ms all in, of which $added ms was the day '
            'itself over an empty-screen baseline of $baseline ms.',
      );
      expect(
        query.elapsedMilliseconds,
        lessThan(300),
        reason:
            'SC-005: the database read behind Home — the plan, the snapshot '
            'join, the week and the rhythm row — took '
            '${query.elapsedMilliseconds} ms',
      );

      // Printed as well as asserted, so the phase gate's evidence carries the
      // numbers rather than only the verdict.
      // ignore: avoid_print
      print(
        'SC-005: Home over a full day (12 planned tasks, 512 rows in the '
        'table, a week of check-ins) opened in $total ms, of which '
        '${query.elapsedMilliseconds} ms was the database; the same screen '
        'with nothing on it takes $baseline ms, so a full day added $added ms.',
      );

      // Unmounted before the body ends, for the reason the note beside `page`
      // in the group above gives: the training row's drift stream leaves a
      // pending timer otherwise, and `flutter_test` fails the case with a
      // message that reads nothing like its cause. Inline rather than through
      // that group's helper, because this group has its own `page`.
      await drainStreams(tester);
    });
  });
}

/// Unmounts the tree and lets drift's real timers drain.
///
/// A `StreamBuilder` over a drift `watch()` that has actually **emitted**
/// leaves a real timer behind — drift coalesces stream updates through one —
/// and `flutter_test` then fails the case with *"A Timer is still pending even
/// after the widget tree was disposed"*, which reads nothing like its cause.
///
/// `pumpWidget` with an empty tree cancels the subscription, but the timer is
/// already scheduled and the fake clock will never fire it. `runAsync` steps
/// outside the fake clock so it can, which is why a plain `pump()` is not
/// enough — and why only the cases whose stream had data were failing.
Future<void> drainStreams(WidgetTester tester) async {
  await tester.pumpWidget(const SizedBox.shrink());
  // Two pumps, on the *fake* clock. Cancelling the subscription is a microtask
  // behind the unmount, and drift schedules its cleanup with `Timer.run` — so
  // the first pump gets the cancel through and the second runs the timer it
  // scheduled. `runAsync` was tried here and does not do it: it steps outside
  // the fake clock entirely, which is the one clock the pending timer is on.
  await tester.pump();
  await tester.pump(const Duration(milliseconds: 50));
}
