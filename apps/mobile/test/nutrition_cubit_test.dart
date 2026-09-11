import 'dart:convert';

import 'package:botvy/core/api/api_client.dart';
import 'package:botvy/core/db/database.dart';
import 'package:botvy/core/notifications/local_notifications.dart';
import 'package:botvy/core/sync/sync_engine.dart';
import 'package:botvy/features/nutrition/application/nutrition_cubit.dart';
import 'package:drift/drift.dart' show Value;
import 'package:drift/native.dart';
import 'package:flutter_test/flutter_test.dart';

/// Meals on the phone (T841), against the real drift database in memory.
///
/// In memory rather than mocked, for the reason every other cubit test in this
/// suite gives: what this cubit *is* is a set of queries and a set of
/// `pendingOp` rules, and a mocked repository would assert that the cubit calls
/// the methods the cubit calls.
///
/// The split worth stating for this feature: the **library** is the phone's,
/// and the **day** is not. Adding a meal is a local row that syncs; choosing
/// what today says is a rotation seeded on the server or a call to a model
/// beside it, so it is a command and the screen re-reads the store afterwards.
void main() {
  late AppDatabase db;
  late _FakeApi api;
  late SyncEngine engine;
  late NutritionCubit cubit;

  setUp(() {
    db = AppDatabase.forTesting(NativeDatabase.memory());
    api = _FakeApi();
    engine = SyncEngine(api, db, _SilentScheduler());
    cubit = NutritionCubit(db, engine, api);
  });

  tearDown(() async {
    // Join whatever pass is in flight before closing anything: every write
    // kicks the engine fire-and-forget. `await engine.sync()` joins the running
    // pass rather than starting a second one.
    await engine.sync();
    engine.dispose();
    await cubit.close();
    await db.close();
  });

  /// Today's plan row, as the server would have written it.
  Future<void> planToday({String? line, String? reason}) async {
    final now = DateTime.now();
    final date =
        '${now.year}-${now.month.toString().padLeft(2, '0')}-'
        '${now.day.toString().padLeft(2, '0')}';
    await db.into(db.dailyPlans).insert(
      DailyPlansCompanion.insert(
        id: 'member:$date',
        date: date,
        mealLine: Value(line),
        mealReason: Value(reason),
        updatedAt: now.toUtc(),
      ),
    );
  }

  group('the library, which works offline', () {
    test('writes a pending create with a client-minted id', () async {
      final id = await cubit.add(
        'koshari',
        kind: 'lunch',
        ingredients: const ['rice', 'lentils'],
      );

      final row = await (db.select(db.meals)
            ..where((r) => r.id.equals(id!)))
          .getSingle();

      expect(row.name, 'koshari');
      expect(row.kind, 'lunch');
      expect(jsonDecode(row.ingredientsJson), ['rice', 'lentils']);
      // The id exists before the server has heard of the meal, which is what
      // makes a retried push a no-op rather than a duplicate.
      expect(row.pendingOp, PendingOps.create);
    });

    test('defaults a meal to every part of the day', () async {
      final id = await cubit.add('koshari');
      final row =
          await (db.select(db.meals)..where((r) => r.id.equals(id!))).getSingle();

      // Not `breakfast`: a member whose lunch and dinner are the same four
      // dishes should not have to enter each of them twice.
      expect(row.kind, 'any');
    });

    test('keeps a create a create when the member edits before it syncs', () async {
      final id = await cubit.add('koshari');
      await cubit.edit(id!, name: 'koshari with salad');

      final row =
          await (db.select(db.meals)..where((r) => r.id.equals(id))).getSingle();

      expect(row.name, 'koshari with salad');
      // Turning it into an update would push an edit for a row the server has
      // never seen.
      expect(row.pendingOp, PendingOps.create);
    });

    test('tombstones rather than deleting', () async {
      final id = await cubit.add('koshari');
      await cubit.remove(id!);

      final row =
          await (db.select(db.meals)..where((r) => r.id.equals(id))).getSingle();

      // Deletions reach the member's other devices as tombstones or they do not
      // reach them at all: the client's delete sweep runs only against a full
      // snapshot.
      expect(row.deletedAt, isNotNull);
      expect(row.pendingOp, PendingOps.delete);
      expect(cubit.state.meals, isEmpty);
    });

    test('a kind filter keeps the meals that fit anywhere', () async {
      await cubit.add('ful medames', kind: 'breakfast');
      await cubit.add('koshari');
      await cubit.add('grilled fish', kind: 'dinner');

      await cubit.showOnly('breakfast');

      // `any` belongs to every filter, for the same reason the server's
      // `listFor` admits it: it is a real answer, not an absence.
      expect(
        cubit.state.meals.map((meal) => meal.name),
        containsAll(<String>['ful medames', 'koshari']),
      );
      expect(
        cubit.state.meals.map((meal) => meal.name),
        isNot(contains('grilled fish')),
      );
    });

    test('lists by name, which is the order the day was built from', () async {
      await cubit.add('zaatar manakish');
      await cubit.add('ful medames');
      await cubit.add('koshari');

      expect(cubit.state.meals.map((meal) => meal.name), [
        'ful medames',
        'koshari',
        'zaatar manakish',
      ]);
    });
  });

  group('today’s half, read from the synced plan', () {
    test('shows the line the server chose', () async {
      await planToday(line: 'ful medames, koshari, lentil soup');
      await cubit.refresh();

      expect(cubit.state.today.hasMeals, isTrue);
      expect(cubit.state.today.count, 3);
      expect(cubit.state.today.reason, isNull);
    });

    test('carries the withholding code, not a sentence', () async {
      await planToday(reason: 'model_unavailable');
      await cubit.refresh();

      // A code, so the screen renders it in the member's own language — and
      // from a synced column, so it reads the same with no network. P3 stored
      // the English sentence itself.
      expect(cubit.state.today.hasMeals, isFalse);
      expect(cubit.state.today.reason, 'model_unavailable');
    });

    test('says nothing at all for a day nobody has chosen', () async {
      await planToday();
      await cubit.refresh();

      // Not a refusal, and the card must not word it as one.
      expect(cubit.state.today.hasMeals, isFalse);
      expect(cubit.state.today.reason, isNull);
    });

    test('ignores a plan that is not today’s', () async {
      await db.into(db.dailyPlans).insert(
        DailyPlansCompanion.insert(
          id: 'member:2020-01-01',
          date: '2020-01-01',
          mealLine: const Value('something from years ago'),
          updatedAt: DateTime.utc(2020),
        ),
      );
      await cubit.refresh();

      expect(cubit.state.today.hasMeals, isFalse);
    });
  });

  group('the day, which is a command', () {
    test('regenerating asks the server rather than choosing locally', () async {
      await planToday(line: 'ful medames');
      await cubit.regenerateToday();

      // A phone that wrote its own line would show the member one thing and the
      // next sync pass another.
      expect(api.regenerated, 1);
    });

    test('replacing names the slot by position', () async {
      await planToday(line: 'ful medames, koshari');
      final id = await cubit.add('grilled fish', kind: 'dinner');

      await cubit.replaceToday(1, id!);

      // By position rather than by kind: two `any` meals can share a kind, and
      // the member tapped a row rather than a category.
      expect(api.replaced, [(index: 1, mealId: id)]);
    });

    test('reports a refusal rather than swallowing it', () async {
      api.refuse = 'That day has already happened.';
      await cubit.regenerateToday();

      expect(cubit.state.problem, 'That day has already happened.');
      expect(cubit.state.busy, isFalse);
    });
  });
}

class _FakeApi extends ApiClient {
  _FakeApi()
    : super(
        TokenStore(InMemorySecretStore()),
        baseUrl: 'http://example.invalid',
      );

  int regenerated = 0;
  final List<({int index, String mealId})> replaced = [];
  String? refuse;

  @override
  Future<Map<String, dynamic>> sync({
    required String installId,
    required List<String> entities,
    String? since,
    int? lastSeq,
    Map<String, dynamic> push = const {},
  }) async => const {};

  @override
  Future<void> regenerateTodayMeals() async {
    if (refuse != null) throw ApiException(refuse!);
    regenerated += 1;
  }

  @override
  Future<void> replaceTodayMeal(int index, String mealId) async {
    if (refuse != null) throw ApiException(refuse!);
    replaced.add((index: index, mealId: mealId));
  }
}

class _SilentScheduler extends NotificationScheduler {
  @override
  Future<int> rescheduleAll(AppDatabase db, {DateTime? now}) async => 0;
}
