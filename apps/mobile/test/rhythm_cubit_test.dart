import 'dart:async';
import 'dart:convert';

import 'package:botvy/app/router.dart';
import 'package:botvy/core/api/api_client.dart';
import 'package:botvy/core/db/database.dart';
// `local_notifications.dart` re-exports `alert_plan.dart`, so `memberDate`
// arrives with the scheduler rather than needing its own import.
import 'package:botvy/core/notifications/local_notifications.dart';
import 'package:botvy/core/sync/sync_engine.dart';
import 'package:botvy/features/rhythm/application/daily_plan.dart';
import 'package:botvy/features/rhythm/application/rhythm_cubit.dart';
import 'package:drift/drift.dart' show Value;
import 'package:drift/native.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:timezone/data/latest_all.dart' as tzdata;
import 'package:timezone/timezone.dart' as tz;

/// Confirming tomorrow, recording a check-in, and the pull that mirrors both.
///
/// Three things are being asserted and they are worth separating:
///
/// * The **commands** go out as REST and are only written locally once the
///   server has accepted them, so a refusal never leaves a plan on screen that
///   the server has never heard of.
/// * The **pull** writes all three tables, and writes null where the server
///   sent null — the mood and the verdict must not be collapsed into zeros.
/// * The **deep links** resolve to the routes the notification taps need.
///
/// Fixtures are relative to `DateTime.now()` and dates are resolved in the
/// member's zone, for the reason `home_cubit_test.dart` gives at length.
void main() {
  tzdata.initializeTimeZones();

  const timezone = 'Africa/Cairo';
  final cairo = tz.getLocation(timezone);

  late AppDatabase db;
  late _RecordingApi api;
  late SyncEngine engine;
  late RhythmCubit cubit;

  setUp(() {
    db = AppDatabase.forTesting(NativeDatabase.memory());
    api = _RecordingApi();
    engine = SyncEngine(api, db, _SilentScheduler());
    cubit = RhythmCubit(db, api, engine);
  });

  tearDown(() async {
    // Every accepted command kicks the engine, and the kick is deliberately
    // fire-and-forget: the sheet must not wait for a round trip it has already
    // had. Awaiting one more pass here joins whichever one is in flight —
    // including the single queued re-run behind it — so the teardown does not
    // close the database from under a pass that is still reading it.
    await engine.sync();
    await cubit.close();
    engine.dispose();
    await db.close();
  });

  String dateOf({int addDays = 0}) =>
      memberDate(DateTime.now(), cairo, addDays: addDays);

  Future<void> seedMember() => db.into(db.profiles).insert(
    ProfilesCompanion.insert(
      userId: 'member-1',
      timezone: timezone,
      locale: 'en',
      fetchedAt: DateTime.now().toUtc(),
    ),
  );

  Future<void> seedTask(
    String id,
    String title, {
    int priority = 2,
    int deferCount = 0,
    String status = 'open',
    String? pendingOp,
  }) => db.into(db.tasks).insert(
    TasksCompanion.insert(
      id: id,
      title: title,
      priority: Value(priority),
      deferCount: Value(deferCount),
      status: Value(status),
      pendingOp: Value(pendingOp),
      updatedAt: DateTime.now().toUtc(),
      createdAt: DateTime.now().toUtc(),
    ),
  );

  Future<void> seedDraft(String date, List<String> taskIds) =>
      db.into(db.dailyPlans).insert(
        DailyPlansCompanion.insert(
          id: 'member-1:$date',
          date: date,
          status: const Value('draft'),
          tasksJson: Value(
            jsonEncode([
              for (final id in taskIds)
                {'id': id, 'title': 'snapshot $id', 'priority': 2},
            ]),
          ),
          trainingJson: const Value('{"title":"Upper body"}'),
          updatedAt: DateTime.now().toUtc(),
          baseUpdatedAt: Value(DateTime.now().toUtc()),
        ),
      );

  // ── the confirm sheet ──────────────────────────────────────────────────────

  group('confirming tomorrow', () {
    test('opens on tomorrow when no date is given', () async {
      await seedMember();
      await seedDraft(dateOf(addDays: 1), ['t-1']);
      await seedTask('t-1', 'Pay the electricity bill');

      await cubit.openPlan();

      expect(cubit.state.date, dateOf(addDays: 1));
      expect(cubit.state.plan?.status, 'draft');
    });

    test('opens on the date it was given, whatever the hour of the tap',
        () async {
      // The 21:00 notification is about a specific day. A member who reads it
      // at 00:30 must still confirm that day, and a sheet that worked
      // "tomorrow" out from the moment of the tap would confirm the wrong one.
      await seedMember();
      final target = dateOf(addDays: 1);
      await seedDraft(target, ['t-1']);

      await cubit.openPlan(date: target);

      expect(cubit.state.date, target);
    });

    test('offers the draft first, then the other open tasks', () async {
      await seedMember();
      await seedTask('t-1', 'In the draft', priority: 4);
      await seedTask('t-2', 'Not in the draft', priority: 1);
      await seedDraft(dateOf(addDays: 1), ['t-1']);

      await cubit.openPlan();

      // The draft leads even though `t-2` has the higher priority: that order
      // is the server's answer to "the highest-priority tasks", and re-sorting
      // it here would be the phone second-guessing the draft.
      expect(cubit.state.candidates.map((t) => t.id), ['t-1', 't-2']);
    });

    test('a task queued for purge is not offered', () async {
      // The filter behind this is `pendingOp.isNull() |
      // pendingOp.equals('purge').not()`. Written the naive way it is NULL for
      // a clean row, and NULL is falsy — so the list comes back holding only
      // the rows that *have* a pending operation, which is nearly none of them.
      // Shipped twice in this codebase; see `test/pending_op_test.dart`.
      await seedMember();
      await seedTask('t-clean', 'An ordinary task');
      await seedTask('t-gone', 'On its way out', pendingOp: PendingOps.purge);
      await seedDraft(dateOf(addDays: 1), []);

      await cubit.openPlan();

      final ids = cubit.state.candidates.map((t) => t.id).toList();
      expect(ids, contains('t-clean'));
      expect(ids, isNot(contains('t-gone')));
    });

    test('carries the deferral count through to the sheet', () async {
      await seedMember();
      await seedTask('t-1', 'Renew the passport', deferCount: 4);
      await seedDraft(dateOf(addDays: 1), ['t-1']);

      await cubit.openPlan();

      expect(cubit.state.candidates.single.deferCount, 4);
    });

    test('sends the chosen ids to the REST command and stores the result',
        () async {
      await seedMember();
      await seedTask('t-1', 'One');
      await seedTask('t-2', 'Two');
      await seedDraft(dateOf(addDays: 1), ['t-1', 't-2']);
      await cubit.openPlan();

      await cubit.confirm(taskIds: ['t-1']);

      expect(api.confirms, hasLength(1));
      expect(api.confirms.single.date, dateOf(addDays: 1));
      expect(api.confirms.single.taskIds, ['t-1']);
      // Not a sync push: the endpoint is the permanent path, because it is what
      // the notification action calls.
      expect(api.pushed, isEmpty);

      final stored = (await db.select(db.dailyPlans).get()).single;
      expect(stored.status, 'confirmed');
      expect(stored.autoConfirmed, isFalse);
      expect(stored.confirmedAt, isNotNull);
      // Re-snapshotted to what the member ticked.
      expect(
        decodePlanSnapshot(stored.tasksJson).map((e) => e['id']),
        ['t-1'],
      );
      expect(cubit.state.settled, RhythmOutcome.confirmed);
    });

    test('a local confirm never touches baseUpdatedAt', () async {
      // `updatedAt` is when *this device* edited the row; `baseUpdatedAt` is
      // the server's own value for the version last pulled. Overwriting the
      // second with a local clock is what makes a later push fall through to a
      // clock comparison that a slow handset loses. Nothing pushes this row
      // today, and the rule holds anyway.
      await seedMember();
      await seedDraft(dateOf(addDays: 1), []);
      final before = (await db.select(db.dailyPlans).get()).single;
      await cubit.openPlan();

      await cubit.confirm(taskIds: []);

      final after = (await db.select(db.dailyPlans).get()).single;
      expect(after.baseUpdatedAt, before.baseUpdatedAt);
      expect(after.updatedAt.isAfter(before.updatedAt), isTrue);
    });

    test('training: false clears the slot the draft proposed', () async {
      await seedMember();
      await seedDraft(dateOf(addDays: 1), []);
      await cubit.openPlan();
      expect(cubit.state.plan?.trainingJson, isNotNull);

      await cubit.confirm(taskIds: [], training: false);

      expect(api.confirms.single.training, isFalse);
      expect((await db.select(db.dailyPlans).get()).single.trainingJson, isNull);
    });

    test('training left unsaid is not sent, and leaves the slot alone',
        () async {
      await seedMember();
      await seedDraft(dateOf(addDays: 1), []);
      await cubit.openPlan();

      await cubit.confirm(taskIds: []);

      expect(api.confirms.single.training, isNull);
      expect(
        (await db.select(db.dailyPlans).get()).single.trainingJson,
        isNotNull,
      );
    });

    test('skipping keeps the draft\'s tasks and marks it skipped', () async {
      // A skip is not an empty plan: it is the member declining to plan, and
      // the summary still names tomorrow's training (US1 acceptance 5).
      await seedMember();
      await seedDraft(dateOf(addDays: 1), ['t-1']);
      await cubit.openPlan();

      await cubit.skip();

      expect(api.skips, [dateOf(addDays: 1)]);
      final stored = (await db.select(db.dailyPlans).get()).single;
      expect(stored.status, 'skipped');
      expect(stored.confirmedAt, isNull);
      expect(decodePlanSnapshot(stored.tasksJson), hasLength(1));
      expect(stored.trainingJson, isNotNull);
    });

    test('a refusal leaves the stored plan untouched and says why', () async {
      // The whole reason the command goes out before the local write. An
      // optimistic write here would show a confirmed plan the server has never
      // heard of, and lose it on the next pull with no explanation.
      await seedMember();
      await seedDraft(dateOf(addDays: 1), ['t-1']);
      await cubit.openPlan();
      api.fail = ApiException('offline', isOffline: true);

      await cubit.confirm(taskIds: ['t-1']);

      expect((await db.select(db.dailyPlans).get()).single.status, 'draft');
      expect(cubit.state.problem, RhythmCubit.offlineProblem);
      expect(cubit.state.settled, isNull);
      expect(cubit.state.busy, isFalse);
    });

    test('a server refusal is reported in the server\'s own words', () async {
      await seedMember();
      await seedDraft(dateOf(addDays: 1), []);
      await cubit.openPlan();
      api.fail = ApiException('That day is already set.', statusCode: 409);

      await cubit.confirm(taskIds: []);

      expect(cubit.state.problem, 'That day is already set.');
    });
  });

  // ── the check-in sheet ─────────────────────────────────────────────────────

  group('the check-in', () {
    test('posts today\'s date in the member\'s zone', () async {
      await seedMember();
      await cubit.openCheckin();

      await cubit.recordCheckin(mood: 70, adhered: true, note: 'Good day');

      expect(api.checkins.single.date, dateOf());
      expect(api.checkins.single.mood, 70);
      expect(api.checkins.single.adhered, isTrue);
      expect(api.checkins.single.note, 'Good day');
      expect(cubit.state.settled, RhythmOutcome.checkedIn);
    });

    test('a mood of nought is sent, not dropped as falsy', () async {
      await seedMember();
      await cubit.openCheckin();

      await cubit.recordCheckin(mood: 0, adhered: false);

      expect(api.checkins.single.mood, 0);
      expect(api.checkins.single.adhered, isFalse);
    });

    test('an unanswered field is sent as absent, not as a default', () async {
      // The distinction the week strip depends on. A `mood: 0` or an
      // `adhered: false` invented here would record the member's worst day and
      // break a streak they never broke.
      await seedMember();
      await cubit.openCheckin();

      await cubit.recordCheckin(note: 'Slept badly');

      expect(api.checkins.single.mood, isNull);
      expect(api.checkins.single.adhered, isNull);
      expect(api.checkins.single.note, 'Slept badly');
    });

    test('nothing is written locally: the streak is the server\'s arithmetic',
        () async {
      // Recomputing the streak here would be a second implementation of
      // `adherence.ts` on a device that holds only the last seven days, and the
      // two would disagree the first time somebody was offline for a week.
      await seedMember();
      await cubit.openCheckin();

      await cubit.recordCheckin(mood: 80, adhered: true);

      expect(await db.select(db.checkins).get(), isEmpty);
      expect(await db.select(db.rhythmState).get(), isEmpty);
    });

    test('a second tap while one is in flight sends nothing', () async {
      await seedMember();
      await cubit.openCheckin();
      api.hold = true;

      final first = cubit.recordCheckin(mood: 50);
      await cubit.recordCheckin(mood: 90);
      api.release();
      await first;

      expect(api.checkins, hasLength(1));
      expect(api.checkins.single.mood, 50);
    });
  });

  // ── the pull ───────────────────────────────────────────────────────────────

  group('the pull', () {
    Map<String, dynamic> reply(Map<String, dynamic> pull) => {
      'now': DateTime.now().toUtc().toIso8601String(),
      'full': true,
      'pull': {
        'labels': const <dynamic>[],
        'tasks': const <dynamic>[],
        'reminders': const <dynamic>[],
        ...pull,
      },
      'accepted': const <String, dynamic>{},
      'rejections': const <dynamic>[],
      'pendingAlerts': const <dynamic>[],
    };

    test('asks for the three rhythm entities', () async {
      api.next = reply({});
      await engine.sync();

      expect(
        api.entities,
        containsAll(['daily_plans', 'checkins', 'rhythm_state']),
      );
      // After `tasks`: the plan carries a snapshot of the tasks it chose, and a
      // plan written first would draw a ring with a denominator and no
      // numerator until something else touched the screen.
      expect(
        api.entities!.indexOf('daily_plans'),
        greaterThan(api.entities!.indexOf('tasks')),
      );
    });

    test('writes a plan, re-encoding the snapshot as JSON', () async {
      api.next = reply({
        'daily_plans': [
          {
            'id': 'member-1:2026-09-11',
            'date': '2026-09-11',
            'status': 'confirmed',
            'autoConfirmed': true,
            'tasks': [
              {'id': 't-1', 'title': 'One', 'priority': 1, 'deferCount': 2},
            ],
            'training': {'title': 'Upper body'},
            'mealLine': 'Oats',
            'promptedAt': DateTime.now().toUtc().toIso8601String(),
            'updatedAt': DateTime.now().toUtc().toIso8601String(),
          },
        ],
      });

      await engine.sync();

      final stored = (await db.select(db.dailyPlans).get()).single;
      expect(stored.status, 'confirmed');
      expect(stored.autoConfirmed, isTrue);
      expect(stored.mealLine, 'Oats');
      expect(stored.promptedAt, isNotNull);
      // Real JSON, decodable again. `'$list'` would store Dart's own
      // `[{id: t-1}]` toString, which is not JSON and comes back empty.
      final snapshot = decodePlanSnapshot(stored.tasksJson);
      expect(snapshot.single['id'], 't-1');
      expect(snapshot.single['deferCount'], 2);
      // The server's own value, kept apart from any local edit time.
      expect(stored.baseUpdatedAt, stored.updatedAt);
    });

    test('writes a check-in with nulls where the server sent nulls', () async {
      api.next = reply({
        'checkins': [
          {
            'id': 'member-1:2026-09-10',
            'date': '2026-09-10',
            'mood': null,
            'adhered': null,
            'source': 'app',
            'updatedAt': DateTime.now().toUtc().toIso8601String(),
          },
          {
            'id': 'member-1:2026-09-09',
            'date': '2026-09-09',
            'mood': 0,
            'adhered': false,
            'updatedAt': DateTime.now().toUtc().toIso8601String(),
          },
        ],
      });

      await engine.sync();

      final rows = {
        for (final row in await db.select(db.checkins).get()) row.date: row,
      };
      expect(rows['2026-09-10']!.mood, isNull);
      expect(rows['2026-09-10']!.adhered, isNull);
      // And nought stays nought rather than becoming null on the way in.
      expect(rows['2026-09-09']!.mood, 0);
      expect(rows['2026-09-09']!.adhered, isFalse);
    });

    test('writes the rhythm state, which arrives with no id at all', () async {
      // `rhythm_state` is a singleton *patch*, like `profile` — the server
      // sends the record with no `id` and no `userId`, because the response is
      // already scoped to the principal. Read straight from `row['id']` the
      // apply loop dropped it silently: no error, no log, just a streak on Home
      // that never moved. The key comes from the signed-in account instead.
      await db.setValue(DbKeys.userId, 'member-1');
      api.next = reply({
        'rhythm_state': {
          'lastPlanPromptDate': '2026-09-10',
          'lastEndOfDayDate': '2026-09-10',
          'awaitingCheckin': true,
          'awaitingSince': DateTime.now().toUtc().toIso8601String(),
          'streak': {'current': 5, 'best': 12, 'lastAdheredDate': '2026-09-10'},
        },
      });

      await engine.sync();

      final stored = (await db.select(db.rhythmState).get()).single;
      expect(stored.userId, 'member-1');
      expect(stored.lastPlanPromptDate, '2026-09-10');
      expect(stored.lastMorningBriefingDate, isNull);
      expect(stored.awaitingCheckin, isTrue);
      // Flat here and nested on the server: all three are read together, and a
      // JSON column for three integers would be a decode on every Home build.
      expect(stored.streakCurrent, 5);
      expect(stored.streakBest, 12);
      expect(stored.lastAdheredDate, '2026-09-10');
    });

    test('a gateway that does send a userId is honoured over the local one',
        () async {
      await db.setValue(DbKeys.userId, 'member-1');
      api.next = reply({
        'rhythm_state': {'userId': 'member-2', 'streak': {'current': 1}},
      });

      await engine.sync();

      expect((await db.select(db.rhythmState).get()).single.userId, 'member-2');
    });

    test('an unkeyed rhythm state with nobody signed in is skipped', () async {
      // Rather than stored under a sentinel that the next account to sign in on
      // this handset would then read as its own streak.
      api.next = reply({
        'rhythm_state': {'streak': {'current': 7}},
      });

      await engine.sync();

      expect(await db.select(db.rhythmState).get(), isEmpty);
    });

    test('a full snapshot does not sweep the rhythm tables', () async {
      // `sync.md` marks the delete sweep "n/a" for these. A member offline for
      // a fortnight pulls a delta mentioning none of their history, and a sweep
      // against that would erase the week the streak is drawn from.
      await db.into(db.checkins).insert(
        CheckinsCompanion.insert(
          id: 'member-1:2026-01-01',
          date: '2026-01-01',
          adhered: const Value(true),
          updatedAt: DateTime.now().toUtc(),
        ),
      );
      await db.into(db.rhythmState).insert(
        RhythmStateCompanion.insert(
          userId: 'member-1',
          streakCurrent: const Value(3),
        ),
      );

      api.next = reply({});
      await engine.sync();

      expect(await db.select(db.checkins).get(), hasLength(1));
      expect(await db.select(db.rhythmState).get(), hasLength(1));
    });

    test('never pushes a rhythm row, however the mirror was edited', () async {
      // Pull-only. If one of these ever grew a `pendingOp`, pushing it would
      // send the server an entity shape it has no push handler for.
      await db.into(db.dailyPlans).insert(
        DailyPlansCompanion.insert(
          id: 'member-1:2026-09-11',
          date: '2026-09-11',
          pendingOp: const Value(PendingOps.update),
          updatedAt: DateTime.now().toUtc(),
        ),
      );

      api.next = reply({});
      await engine.sync();

      expect(api.pushed, isEmpty);
    });
  });

  // ── notification taps ──────────────────────────────────────────────────────

  group('deep links', () {
    test('the two rhythm links resolve to their routes', () {
      expect(
        routeForDeepLink('botvy://rhythm/plan/2026-09-11'),
        '${Routes.rhythmPlan}/2026-09-11',
      );
      expect(
        routeForDeepLink('botvy://rhythm/checkin'),
        Routes.rhythmCheckin,
      );
    });

    test('a bare path works as well as the scheme', () {
      // The alerts this phone derives for itself carry a bare path; the ones
      // the server plans carry the scheme. One table has to cover both.
      expect(
        routeForDeepLink('/rhythm/plan/2026-09-11'),
        '${Routes.rhythmPlan}/2026-09-11',
      );
      expect(routeForDeepLink('/tasks/abc-123'), Routes.tasks);
      expect(routeForDeepLink('botvy://reminders/abc'), Routes.reminders);
    });

    test('an unknown link resolves to nothing rather than to somewhere near',
        () {
      // A newer gateway can plan an alert for a feature this build has no
      // screen for. Navigating "somewhere near it" drops the member on an
      // unrelated page with no way to know why.
      expect(routeForDeepLink('botvy://meetings/abc'), isNull);
      expect(routeForDeepLink(''), isNull);
      expect(routeForDeepLink('   '), isNull);
      expect(routeForDeepLink('botvy://'), isNull);
    });
  });
}

/// Records the three commands, answers the sync, and can refuse.
class _RecordingApi extends ApiClient {
  _RecordingApi()
    : super(
        TokenStore(InMemorySecretStore()),
        baseUrl: 'http://example.invalid',
      );

  final List<({String date, List<String> taskIds, bool? training})> confirms =
      [];
  final List<String> skips = [];
  final List<({String? date, int? mood, bool? adhered, String? note})>
  checkins = [];

  Map<String, dynamic> next = const {};
  Map<String, dynamic> pushed = const {};
  List<String>? entities;

  /// The refusal the next command gets, or null to accept.
  ApiException? fail;

  /// Holds a command open, so a second tap can be attempted while the first is
  /// still in flight.
  bool hold = false;
  final List<void Function()> _held = [];

  void release() {
    for (final resume in _held) {
      resume();
    }
    _held.clear();
    hold = false;
  }

  Future<void> _maybeHold() async {
    if (!hold) return;
    final gate = Completer<void>();
    _held.add(gate.complete);
    await gate.future;
  }

  @override
  Future<Map<String, dynamic>> sync({
    required String installId,
    required List<String> entities,
    String? since,
    Map<String, dynamic> push = const {},
  }) async {
    this.entities = entities;
    pushed = push;
    if (next.isEmpty) throw ApiException('offline', isOffline: true);
    return next;
  }

  @override
  Future<void> confirmPlan(
    String date, {
    required List<String> taskIds,
    bool? training,
  }) async {
    await _maybeHold();
    if (fail != null) throw fail!;
    confirms.add((date: date, taskIds: taskIds, training: training));
  }

  @override
  Future<void> skipPlan(String date) async {
    await _maybeHold();
    if (fail != null) throw fail!;
    skips.add(date);
  }

  @override
  Future<void> recordCheckin({
    String? date,
    int? mood,
    bool? adhered,
    String? note,
  }) async {
    await _maybeHold();
    if (fail != null) throw fail!;
    checkins.add((date: date, mood: mood, adhered: adhered, note: note));
  }
}

class _SilentScheduler extends NotificationScheduler {
  @override
  Future<int> rescheduleAll(AppDatabase db, {DateTime? now}) async => 0;
}
