import 'dart:math';

import 'package:botvy/app/l10n/app_localizations.dart';
import 'package:botvy/core/api/api_client.dart';
import 'package:botvy/core/db/database.dart';
import 'package:botvy/core/notifications/local_notifications.dart';
import 'package:botvy/core/sync/sync_engine.dart';
import 'package:botvy/features/athlete/application/athlete.dart';
import 'package:botvy/features/athlete/application/athlete_cubit.dart';
import 'package:botvy/features/athlete/application/programs_cubit.dart';
import 'package:botvy/features/athlete/presentation/session_page.dart';
import 'package:botvy/features/home/widgets/training_row.dart';
import 'package:drift/drift.dart' show Value;
import 'package:drift/native.dart';
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:timezone/data/latest_all.dart' as tzdata;
import 'package:timezone/timezone.dart' as tz;

/// The athlete's week, against the real drift database in memory (T654).
///
/// In memory rather than mocked, for the reason `home_cubit_test.dart` gives:
/// what this cubit *is* is a set of queries and a set of `pendingOp` rules, and
/// a mocked repository would assert that the cubit calls the methods the cubit
/// calls.
///
/// Every fixture is relative to `DateTime.now()` and resolved in the member's
/// own zone. This whole feature is about "today" and "this week", so a pinned
/// date is a test that starts failing on a particular Tuesday.
void main() {
  tzdata.initializeTimeZones();

  /// Neither UTC nor (usually) the runner's, so a day boundary resolved against
  /// the wrong clock fails here rather than passing by luck.
  const timezone = 'Africa/Cairo';
  final cairo = tz.getLocation(timezone);

  late AppDatabase db;
  late _FakeApi api;
  late SyncEngine engine;
  late AthleteCubit cubit;

  setUp(() {
    db = AppDatabase.forTesting(NativeDatabase.memory());
    api = _FakeApi();
    engine = SyncEngine(api, db, _SilentScheduler());
    cubit = AthleteCubit(db, engine);
  });

  tearDown(() async {
    /*
     * Join whatever pass is in flight **before** closing anything.
     *
     * Every write kicks the engine fire-and-forget — a member logging a set
     * must not wait for a round trip to see it — so at teardown there is
     * usually a `_run` part way through a read. Closing the database under it
     * throws `Can't re-open a database after closing it` from inside the
     * engine, which surfaces as an unhandled async error and fails whichever
     * test happens to be next. It took out ten cases in this file before the
     * suite was ever run.
     *
     * `await engine.sync()` joins the running pass rather than starting a
     * second, which is the same fix `meetings_cubit_test.dart` carries and for
     * the same reason. `dispose()` is not awaitable and cannot do this itself.
     */
    await engine.sync();
    await cubit.close();
    engine.dispose();
    await db.close();
  });

  /// The member, their zone and their cut-off. Without the profile mirror every
  /// date in this file would be resolved against the runner's clock.
  Future<void> seedMember() async {
    await db.setValue(DbKeys.userId, 'user-1');
    await db.into(db.profiles).insert(
      ProfilesCompanion.insert(
        userId: 'user-1',
        displayName: const Value('Nour'),
        timezone: timezone,
        locale: 'en',
        fetchedAt: DateTime.now().toUtc(),
      ),
    );
    await db.into(db.userPreferences).insert(
      UserPreferencesCompanion.insert(
        userId: 'user-1',
        planTomorrowTime: '21:00',
        endOfDayTime: '22:00',
        morningBriefingTime: '08:00',
        nextPracticeCutoff: '21:00',
        quietFrom: '22:00',
        quietTo: '07:00',
        weekStartsOn: 'monday',
        checkinEnabled: true,
        meetingDurationMin: 30,
        mealMode: 'llm',
        aiSuggestions: true,
        fetchedAt: DateTime.now().toUtc(),
      ),
    );
  }

  /// An instant on the member's own clock, [addDays] from today at [hhmm].
  DateTime memberClock(String hhmm, {int addDays = 0}) {
    final now = tz.TZDateTime.now(cairo);
    final clock = hhmm.split(':').map(int.parse).toList();
    final wall = tz.TZDateTime(
      cairo,
      now.year,
      now.month,
      now.day + addDays,
      clock[0],
      clock[1],
    );
    return DateTime.fromMillisecondsSinceEpoch(
      wall.millisecondsSinceEpoch,
      isUtc: true,
    );
  }

  Future<List<LocalSession>> allSessions() => db.select(db.sessions).get();

  // ── SC-004: exactly once ───────────────────────────────────────────────────

  group('SC-004 — a session logged offline appears exactly once', () {
    /// The requirement this whole feature's write path is shaped by.
    ///
    /// The guarantee is the **client-minted UUIDv7**: the phone mints the id,
    /// the server accepts it, and the push is an upsert on a row the server has
    /// never seen — so a request that half-arrived and was retried writes the
    /// same row twice and leaves one session. Anything that minted the id
    /// server-side would make the retry a second session, and the member's own
    /// history is the last place a duplicate is acceptable.
    test('logging offline then syncing produces one session, not two', () async {
      await seedMember();
      api.fail = true;

      // The gym basement: a session created and logged with no network at all.
      final id = await cubit.createSession(
        plannedAt: memberClock('18:00'),
        sport: 'gym',
        title: 'Push day',
      );
      await cubit.saveExercises(id, [
        TrainingExercise(
          id: 'e1',
          name: 'Squat',
          sets: const [
            TrainingSet(targetReps: 5, actualReps: 5, actualWeightKg: 100,
                done: true),
            TrainingSet(targetReps: 5, actualReps: 5, actualWeightKg: 100,
                done: true),
          ],
        ),
      ]);
      await engine.sync();

      // One row, and it is still the member's own unsent edit.
      expect(await allSessions(), hasLength(1));
      expect((await allSessions()).single.pendingOp, PendingOps.create);
      // A queued `create` stays a `create` through the second edit: pushing
      // `update` for a row the server has never seen is refused as `gone`,
      // which tells the client to delete its local copy — so the member's
      // logged session would be erased by their own second tap.
      expect(
        (await allSessions()).single.exercisesJson,
        contains('actualWeightKg'),
      );

      // The network returns. The server applies the push and answers with its
      // own copy of the row in the same response, which is exactly what a
      // gateway does — `cursor = now - 5 s` is deliberately lagged so a
      // transaction committing just after the pull's read arrives twice rather
      // than never.
      api.fail = false;
      api.next = _reply(
        accepted: {'sessions': [id]},
        pull: {'sessions': [_serverSession(id, memberClock('18:00'))]},
      );
      await engine.sync();

      final afterSync = await allSessions();
      expect(afterSync, hasLength(1), reason: 'one session, never two');
      expect(afterSync.single.id, id);
      // Reconciled: nothing left to push, and the server's own timestamp is in
      // `baseUpdatedAt` so the next edit is accepted with no clock consulted.
      expect(afterSync.single.pendingOp, isNull);
      expect(afterSync.single.baseUpdatedAt, isNotNull);

      // And the pass that carried it up pushed the log as an **object**, not as
      // a JSON string: the server's adapter reads
      // `fields.exercises[].sets[].actualReps`, so a string would arrive as a
      // session with no sets and the member's whole log would be dropped with
      // no error anywhere.
      final pushed = api.calls
          .map((call) => call['sessions'])
          .whereType<List>()
          .expand((rows) => rows)
          .whereType<Map>()
          .toList();
      expect(pushed, isNotEmpty);
      final data = pushed.last['data'] as Map;
      expect(data['exercises'], isA<List>());
      expect(
        ((data['exercises'] as List).single as Map)['sets'],
        isA<List>(),
      );
      expect(pushed.last['op'], PendingOps.create);
      expect(pushed.last['id'], id);
      // Never the local edit time in `baseUpdatedAt` — that column is the
      // server's own value for the version this device last pulled, and a local
      // clock there makes every offline edit fall through to a comparison a
      // slow handset loses.
      expect(pushed.last['baseUpdatedAt'], isNull);
    });

    test('a redelivered pull of the same row is still one session', () async {
      await seedMember();
      final id = await cubit.createSession(
        plannedAt: memberClock('18:00'),
        sport: 'gym',
        title: 'Push day',
      );

      final row = _serverSession(id, memberClock('18:00'));
      api.next = _reply(accepted: {'sessions': [id]}, pull: {'sessions': [row]});
      await engine.sync();
      api.next = _reply(pull: {'sessions': [row]});
      await engine.sync();

      expect(await allSessions(), hasLength(1));
    });
  });

  // ── the member's own patch ─────────────────────────────────────────────────

  group('the athlete profile is pushed as a patch', () {
    test('sports and slots go up under `patch`, not as a row', () async {
      await seedMember();
      api.fail = true;

      await cubit.setSports(['gym', 'padel']);
      await cubit.setSlots([
        const WeeklySlot(
          id: 'slot-gym',
          weekday: DateTime.monday,
          start: '18:00',
          durationMin: 60,
          sport: 'gym',
        ),
      ]);

      api.fail = false;
      api.next = _reply(accepted: {'athlete_profile': ['user-1']});
      await engine.sync();

      final push = api.calls.last['athlete_profile'];
      // `sync.md`'s own shape. A list here is a patch the server reads as
      // absent, and the member's sports would stay pending for ever — silently,
      // because a push nobody applies is not a rejection either.
      expect(push, isA<Map>());
      final patch = (push as Map)['patch'] as Map;
      expect(patch['sports'], ['gym', 'padel']);
      expect((patch['slots'] as List).single, isA<Map>());
      // The allowlist and nothing else: a field the server is contractually
      // obliged to drop reads on this side as a write that happened.
      expect(patch.keys, ['sports', 'slots']);

      // Accepted, so the local patch is cleared.
      final profile = await db.select(db.athleteProfile).getSingle();
      expect(profile.pendingOp, isNull);
      expect(decodeSlots(profile.slotsJson), hasLength(1));
    });

    test("keeps the member's own word rather than the bucket 'other'", () async {
      await seedMember();
      await cubit.setSports(['padel', '  ', 'padel', 'gym']);

      // Trimmed, de-duplicated, and `padel` survives: "other" in the picker is
      // a text field and not a bucket, so storing the literal would lose the
      // one thing the member told us.
      expect(cubit.state.sports, ['padel', 'gym']);
    });
  });

  // ── FR-018: missed ─────────────────────────────────────────────────────────

  group('FR-018 — a missed session', () {
    test('reads as missed and can still be logged, with no correction first',
        () async {
      await seedMember();
      // This morning, unlogged. Relative to now, so it is genuinely in the
      // past whenever this runs.
      final id = await cubit.createSession(
        plannedAt: DateTime.now().toUtc().subtract(const Duration(hours: 3)),
        sport: 'gym',
        title: 'Push day',
        durationMin: 60,
      );
      await cubit.refresh();

      final missed = (await cubit.byId(id))!;
      expect(isMissed(missed, DateTime.now().toUtc()), isTrue);
      // And it is still `planned` — nothing wrote a fifth status, because
      // there is not one.
      expect(missed.status, 'planned');

      // Logged late. No repair step, because nothing stored the reading.
      await cubit.saveExercises(id, [
        TrainingExercise(
          id: 'e1',
          name: 'Squat',
          sets: const [TrainingSet(actualReps: 5, actualWeightKg: 100,
              done: true)],
        ),
      ]);
      await cubit.complete(id);

      final logged = (await cubit.byId(id))!;
      expect(logged.status, 'completed');
      expect(isMissed(logged, DateTime.now().toUtc()), isFalse);
      expect(decodeExercises(logged.exercisesJson).single.sets.single.done,
          isTrue);
    });
  });

  // ── the week ───────────────────────────────────────────────────────────────

  group('the week', () {
    test('groups by the local date and leaves a rest day absent', () async {
      await seedMember();
      await cubit.createSession(
        plannedAt: memberClock('18:00'),
        sport: 'gym',
        title: 'Push day',
      );
      await cubit.refresh();

      expect(cubit.state.week, hasLength(7));
      expect(cubit.state.sessionsByDate[cubit.state.today], hasLength(1));
      // FR-013: nothing is stored for a rest day, so its absence *is* the
      // representation — and the screen has to be able to tell the difference
      // between "no entry" and "an empty list".
      final restDays = cubit.state.week
          .where((date) => !cubit.state.sessionsByDate.containsKey(date));
      expect(restDays, isNotEmpty);
    });

    test('invites the member to set slots when there are none', () async {
      await seedMember();
      await cubit.refresh();
      // Story 1 scenario 3, as a state the screen branches on rather than as a
      // count a widget re-derives.
      expect(cubit.state.noSlots, isTrue);

      await cubit.setSlots([
        const WeeklySlot(
          id: 'slot-gym',
          weekday: DateTime.monday,
          start: '18:00',
          durationMin: 60,
          sport: 'gym',
        ),
      ]);
      expect(cubit.state.noSlots, isFalse);
    });

    test('a deleted session keeps its status and leaves the week', () async {
      await seedMember();
      final id = await cubit.createSession(
        plannedAt: memberClock('18:00'),
        sport: 'gym',
        title: 'Push day',
      );
      await cubit.skip(id);
      await cubit.delete(id);

      final row = (await cubit.byId(id))!;
      // Deleting must not touch the status: the status is the only record of
      // whether it was completed, cancelled or never dealt with, and the
      // Deleted view exists to show exactly that.
      expect(row.status, 'skipped');
      expect(row.deletedAt, isNotNull);
      await cubit.refresh();
      expect(cubit.state.sessionsByDate[cubit.state.today] ?? const [], isEmpty);
    });
  });

  // ── the logger's own rules ─────────────────────────────────────────────────

  group('the set logger', () {
    test('"repeat last" reads the last completed session by exercise name',
        () async {
      await seedMember();

      // Last week, completed, with a squat in it.
      final old = await cubit.createSession(
        plannedAt: memberClock('18:00', addDays: -7),
        sport: 'gym',
        title: 'Push day',
      );
      await cubit.saveExercises(old, [
        TrainingExercise(
          id: 'old-1',
          name: 'Back Squat',
          sets: const [
            TrainingSet(targetReps: 5, actualReps: 5, actualWeightKg: 100,
                done: true),
          ],
        ),
      ]);
      await cubit.complete(old);

      // Matched on the **name** and case-folded: ids are minted per session, so
      // Monday's squat and Thursday's squat are two ids and one name.
      final found = await cubit.lastLogged('back squat');
      expect(found, hasLength(1));
      expect(found!.single.actualWeightKg, 100);

      // A session that was planned and never logged is not a record of
      // anything: repeating a set the member never did would put a target they
      // abandoned back on screen as though they had achieved it.
      final planned = await cubit.createSession(
        plannedAt: memberClock('18:00', addDays: -3),
        sport: 'gym',
        title: 'Legs',
      );
      await cubit.saveExercises(planned, [
        const TrainingExercise(
          id: 'p-1',
          name: 'Deadlift',
          sets: [TrainingSet(targetReps: 3, targetWeightKg: 140)],
        ),
      ]);
      expect(await cubit.lastLogged('Deadlift'), isNull);
      expect(await cubit.lastLogged('nothing like this'), isNull);
    });

    test('reordering takes the final index, not the pre-removal one', () async {
      await seedMember();
      final id = await cubit.createSession(
        plannedAt: memberClock('18:00'),
        sport: 'gym',
        title: 'Push day',
      );
      final three = [
        for (final name in ['A', 'B', 'C'])
          TrainingExercise(id: 'e-$name', name: name),
      ];
      await cubit.saveExercises(id, three);

      // A dragged downwards. `onReorderItem` hands the index the item ends up
      // at, so moving index 0 to index 2 puts A last — the deprecated
      // `onReorder` reported 3 for the same gesture, and subtracting one from
      // an already-adjusted index lands an exercise one place short of where
      // the member let go of it.
      await cubit.reorderExercises(id, three, 0, 2);

      final after = decodeExercises((await cubit.byId(id))!.exercisesJson);
      expect(after.map((e) => e.name), ['B', 'C', 'A']);
    });

    test('a library workout is copied with fresh ids and no actuals', () async {
      await seedMember();
      final now = DateTime.now().toUtc();
      await db.into(db.workouts).insert(
        WorkoutsCompanion.insert(
          id: 'workout-1',
          name: 'Leg day',
          sport: 'gym',
          exercisesJson: const Value(
            '[{"id":"lib-1","name":"Squat","notes":null,"mediaRefs":[],'
            '"sets":[{"targetReps":5,"targetWeightKg":100,"actualReps":5,'
            '"done":true}]}]',
          ),
          createdAt: now,
          updatedAt: now,
        ),
      );

      final id = await cubit.createSession(
        plannedAt: memberClock('18:00'),
        sport: 'gym',
        title: 'Legs',
      );
      await cubit.applyWorkout(id, 'workout-1');

      final copied = decodeExercises((await cubit.byId(id))!.exercisesJson);
      expect(copied, hasLength(1));
      // A fresh id, because editing the session must not rewrite the library
      // entry — and a shared id would make the session's reorder a reorder of
      // the workout too.
      expect(copied.single.id, isNot('lib-1'));
      expect(copied.single.name, 'Squat');
      // The targets travel; the actuals do not. A template is what to do, not
      // what somebody once did.
      expect(copied.single.sets.single.targetWeightKg, 100);
      expect(copied.single.sets.single.actualReps, isNull);
      expect(copied.single.sets.single.done, isFalse);
    });
  });

  // ── T642: Today's training row ─────────────────────────────────────────────

  group("T642 — Today's training row", () {
    Widget row() => MaterialApp(
      localizationsDelegates: const [AppLocalizations.delegate],
      home: BlocProvider<AthleteCubit>.value(
        value: cubit,
        child: Scaffold(
          body: TrainingRow(date: cubit.state.today, timezone: timezone),
        ),
      ),
    );

    testWidgets('is present, and cannot be completed as a task (FR-010)',
        (tester) async {
      await seedMember();
      await cubit.createSession(
        plannedAt: memberClock('18:00'),
        sport: 'gym',
        title: 'Push day',
      );
      await cubit.refresh();

      await tester.pumpWidget(row());
      await tester.pumpAndSettle();

      expect(find.text('Push day'), findsOneWidget);
      // Story 6 scenario 1, asserted as the **absence** of a control rather
      // than trusted to nobody adding one: a session is completed, cancelled or
      // skipped, and a tick on Today would flatten three outcomes into "done"
      // on the screen where the member is least likely to have meant it.
      expect(find.byType(CheckboxListTile), findsNothing);
      expect(find.byType(Checkbox), findsNothing);
      // It is a row that opens the session instead.
      expect(find.byType(ListTile), findsOneWidget);
      expect(find.byIcon(Icons.chevron_right), findsOneWidget);
      await drainStreams(tester);
    });

    testWidgets('stays present and reads as skipped after a skip',
        (tester) async {
      await seedMember();
      final id = await cubit.createSession(
        plannedAt: memberClock('18:00'),
        sport: 'gym',
        title: 'Push day',
      );
      await cubit.refresh();

      await tester.pumpWidget(row());
      await tester.pumpAndSettle();
      expect(find.text('Planned'), findsOneWidget);

      await cubit.skip(id);
      // No sync pass and no new plan: the row watches the `sessions` table, so
      // the change arrives on the stream. Drawing it from the night's
      // `daily_plans` snapshot instead would leave "Planned" on screen until
      // tomorrow's plan — and offline, for ever.
      await tester.pumpAndSettle();

      expect(find.text('Push day'), findsOneWidget, reason: 'FR-005: the row '
          'stays in the day, marked, rather than disappearing');
      expect(find.text('Skipped'), findsOneWidget);
      expect(find.text('Planned'), findsNothing);
      await drainStreams(tester);
    });

    testWidgets('draws a past unlogged session as missed', (tester) async {
      await seedMember();

      /*
       * Two conditions, and the fixture has to satisfy both at any hour the
       * suite runs at. It must have **ended** before now, which is what
       * `isMissed` asks; and it must have **started** on the member's own day,
       * because the row draws today's sessions and nothing else.
       *
       * It was `now - 3h` with a fixed hour of duration, which satisfies the
       * first and silently breaks the second: three hours before 02:40 in Cairo
       * is the previous local date, the row correctly draws nothing, and the
       * test fails every night between midnight and 03:00. A red line that
       * depends on the hour the suite runs at teaches whoever sees it to ignore
       * red, which costs more than the case is worth.
       *
       * So the end is pinned a minute back from now and the start is clamped to
       * the member's midnight, with the duration falling out of the two. Early
       * in the member's day that is a short session rather than no session.
       */
      final midnight = memberClock('00:00');
      final endedAt = DateTime.now().toUtc().subtract(
        const Duration(minutes: 1),
      );
      final startedAt = endedAt.subtract(const Duration(minutes: 60));
      final plannedAt = startedAt.isAfter(midnight) ? startedAt : midnight;

      await cubit.createSession(
        plannedAt: plannedAt,
        sport: 'gym',
        title: 'Push day',
        // Never negative: in the first minute of the member's day the clamp
        // puts the start after `endedAt`, and a zero-length session at midnight
        // still reads as missed for every instant after it.
        durationMin: max(0, endedAt.difference(plannedAt).inMinutes),
      );
      await cubit.refresh();

      await tester.pumpWidget(row());
      await tester.pumpAndSettle();

      expect(find.text('Missed'), findsOneWidget);
      await drainStreams(tester);
    });

    testWidgets('draws nothing at all on a rest day', (tester) async {
      await seedMember();
      await cubit.refresh();

      await tester.pumpWidget(row());
      await tester.pumpAndSettle();

      // FR-013: a rest day is stored as nothing, and Home's plan card already
      // says when the day is quiet. A second widget saying it again reads as a
      // broken screen.
      expect(find.byType(ListTile), findsNothing);
      expect(find.byType(Card), findsNothing);
      await drainStreams(tester);
    });
  });

  // ── SC-003 ─────────────────────────────────────────────────────────────────

  group('SC-003', () {
    /// A full gym session logged in under ninety seconds is a claim about
    /// *taps*, which no test can make. What a test can hold is the part that
    /// would make those taps impossible: a logger that took a render to seconds
    /// on a six-exercise session, which is what a database write on every
    /// stepper tap produces — twenty-four sets is upwards of seventy writes,
    /// each with its own `pendingOp` and its own alarm re-plan.
    ///
    /// So this opens the real screen on a session of six exercises and four
    /// sets each — twenty-four rows of controls — and then measures a stepper
    /// tap's reframe. The ceiling has an order of magnitude of headroom over
    /// the number measured here, because an absolute millisecond budget
    /// calibrated on one machine is flaky by construction on another.
    /// **Measured on the machine this was written on: see the reason strings
    /// below.** The ceiling still catches the regression it was written for.
    testWidgets('the logger opens and reframes quickly with 24 sets',
        (tester) async {
      await seedMember();
      final id = await cubit.createSession(
        plannedAt: memberClock('18:00'),
        sport: 'gym',
        title: 'Push day',
      );

      final six = [
        for (var exercise = 0; exercise < 6; exercise++)
          TrainingExercise(
            id: 'e-$exercise',
            name: 'Exercise $exercise',
            sets: [
              for (var set = 0; set < 4; set++)
                const TrainingSet(targetReps: 8, targetWeightKg: 60),
            ],
          ),
      ];
      await cubit.saveExercises(id, six);

      expect(
        decodeExercises((await cubit.byId(id))!.exercisesJson)
            .expand((e) => e.sets)
            .length,
        24,
        reason: 'the fixture must really hold twenty-four sets',
      );

      Widget logger() => MaterialApp(
        localizationsDelegates: const [AppLocalizations.delegate],
        home: MultiBlocProvider(
          providers: [
            BlocProvider<AthleteCubit>.value(value: cubit),
            BlocProvider<ProgramsCubit>.value(
              value: ProgramsCubit(db, engine, api),
            ),
          ],
          child: SessionPage(sessionId: id),
        ),
      );

      // Best of three. A single wall-clock sample of a garbage-collected
      // runtime is noise: the pass that allocates twenty-four sets hands the
      // collection bill to whichever frame happens to be next, and that lands
      // inside or outside the clock depending on nothing the code controls.
      var open = 1 << 30;
      for (var attempt = 0; attempt < 3; attempt++) {
        final clock = Stopwatch()..start();
        await tester.pumpWidget(logger());
        await tester.pumpAndSettle();
        clock.stop();
        if (clock.elapsedMilliseconds < open) open = clock.elapsedMilliseconds;
      }

      // Something real was drawn, so the number is a frame rather than the
      // time an empty screen takes.
      expect(find.text('Exercise 5'), findsOneWidget);

      // One stepper tap, which is the gesture SC-003 is seventy of. It is a
      // `setState` on the draft and **not** a write, which is the whole design:
      // the write is debounced, so the tap costs a rebuild and nothing else.
      var tap = 1 << 30;
      for (var attempt = 0; attempt < 3; attempt++) {
        final clock = Stopwatch()..start();
        await tester.tap(find.byIcon(Icons.add).first);
        await tester.pump();
        clock.stop();
        if (clock.elapsedMilliseconds < tap) tap = clock.elapsedMilliseconds;
      }

      expect(
        open,
        lessThan(2000),
        reason: 'opening the logger on 24 sets: measured $open ms here',
      );
      /*
       * 2500 ms, and the number is about the machine rather than the widget.
       *
       * This was 600 ms, which is what the tap costs when this file runs on
       * its own — and the full suite runs four files at once, where the best
       * of three came out at 1125 ms on this hardware. A ceiling calibrated
       * without the contention the suite actually creates is flaky by
       * construction, and a flaky budget gets raised in a hurry by whoever it
       * blocks, which is how a budget stops meaning anything.
       *
       * It still catches what it was written for. The failure is a *database
       * write per tap* instead of a `setState` on the draft, and SC-003 is
       * seventy of these gestures: at a write each, the loop below takes
       * seconds, so 2500 ms leaves the regression an order of magnitude of
       * room to be caught in and leaves the suite none to be flaky in.
       */
      expect(
        tap,
        lessThan(2500),
        reason: 'a per-tap database write takes this to seconds; '
            'measured $tap ms here',
      );
      await drainStreams(tester);
    });
  });
}

/// A response, with everything defaulted so a test names only its own part.
Map<String, dynamic> _reply({
  Map<String, dynamic> pull = const {},
  Map<String, dynamic> accepted = const {},
  List<Map<String, dynamic>> rejections = const [],
}) => {
  'now': DateTime.now().toUtc().toIso8601String(),
  'full': false,
  'pull': pull,
  'accepted': accepted,
  'rejections': rejections,
  'pendingAlerts': const <dynamic>[],
};

/// The server's own copy of a session, as the pull carries it.
Map<String, dynamic> _serverSession(String id, DateTime plannedAt) => {
  'id': id,
  'plannedAt': plannedAt.toUtc().toIso8601String(),
  'durationMin': 60,
  'sport': 'gym',
  'title': 'Push day',
  'focus': null,
  'programId': null,
  'weekIndex': null,
  'slotId': null,
  'suggestionId': null,
  'exercises': [
    {
      'id': 'e1',
      'name': 'Squat',
      'notes': null,
      'mediaRefs': const <dynamic>[],
      'sets': [
        {
          'targetReps': 5,
          'actualReps': 5,
          'actualWeightKg': 100,
          'done': true,
        },
      ],
    },
  ],
  'status': 'planned',
  'completedAt': null,
  'notes': null,
  'createdAt': plannedAt.toUtc().toIso8601String(),
  'updatedAt': DateTime.now().toUtc().toIso8601String(),
  'deletedAt': null,
};

class _FakeApi extends ApiClient {
  _FakeApi()
    : super(
        TokenStore(InMemorySecretStore()),
        baseUrl: 'http://example.invalid',
      );

  /// Every push body this test sent, so the payload's *shape* can be asserted
  /// rather than the consumer's behaviour — which passes with a fallback in
  /// place.
  final List<Map<String, dynamic>> calls = [];
  Map<String, dynamic> next = const {};

  /// Offline, which is the normal state of this application rather than an
  /// error.
  bool fail = false;

  @override
  Future<Map<String, dynamic>> sync({
    required String installId,
    required List<String> entities,
    String? since,
    int? lastSeq,
    Map<String, dynamic> push = const {},
  }) async {
    calls.add(push);
    if (fail) throw ApiException('offline', isOffline: true);
    return next;
  }
}

class _SilentScheduler extends NotificationScheduler {
  @override
  Future<int> rescheduleAll(AppDatabase db, {DateTime? now}) async => 0;
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
/// outside the fake clock so it can. That is also why only the cases whose
/// stream had data were failing: a day with no session emits nothing and
/// schedules nothing.
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
