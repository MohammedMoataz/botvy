import 'dart:async';
import 'dart:convert';

// Imported whole rather than by name: `Value` and the `&` of the query builder
// are extension members, and an extension only applies when its library is
// imported outright.
import 'package:drift/drift.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:uuid/uuid.dart';

import '../../../core/api/api_client.dart';
import '../../../core/db/database.dart';
import '../../../core/sync/sync_engine.dart';

const Uuid _uuid = Uuid();

/// The five parts of a day a meal can belong to.
///
/// `any` is first because it is the default and a real answer rather than an
/// absence: a member whose lunch and dinner are the same four dishes should not
/// have to enter each of them twice, and the server's rotator treats an `any`
/// meal as eligible for every slot.
const List<String> mealKinds = <String>[
  'any',
  'breakfast',
  'lunch',
  'dinner',
  'snack',
];

/// Today's food half, as the card draws it.
///
/// Both halves come from the **local** `daily_plans` row, which is the whole
/// point: the line and the reason are two synced columns, so the card renders
/// on a plane. The reason used to need a GraphQL round trip, which meant a
/// member with no network saw an unexplained blank.
class TodayMeals {
  const TodayMeals({this.line, this.reason, this.count = 0});

  /// The names joined, or null when there are none.
  final String? line;

  /// `allergen` | `empty_library` | `model_unavailable`, or null.
  ///
  /// Null with a null line is a day nothing has chosen yet — not a refusal, and
  /// the card must not word it like one.
  final String? reason;

  /// How many meals the line names, for the "use one of mine" picker's slots.
  final int count;

  bool get hasMeals => line != null && line!.isNotEmpty;
}

class NutritionState {
  const NutritionState({
    this.loading = true,
    this.meals = const [],
    this.kind,
    this.today = const TodayMeals(),
    this.mode = 'llm',
    this.busy = false,
    this.problem,
  });

  final bool loading;

  /// The member's own meals, by name — the same order the server rotates in.
  final List<LocalMeal> meals;

  /// A kind to show alone, or null for everything.
  final String? kind;

  final TodayMeals today;

  /// `library` | `llm`, mirrored from preferences.
  final String mode;

  /// True while a day command is in flight, so a second tap does nothing.
  final bool busy;

  final String? problem;

  NutritionState copyWith({
    bool? loading,
    List<LocalMeal>? meals,
    String? kind,
    bool clearKind = false,
    TodayMeals? today,
    String? mode,
    bool? busy,
    String? problem,
    bool clearProblem = false,
  }) => NutritionState(
    loading: loading ?? this.loading,
    meals: meals ?? this.meals,
    kind: clearKind ? null : (kind ?? this.kind),
    today: today ?? this.today,
    mode: mode ?? this.mode,
    busy: busy ?? this.busy,
    problem: clearProblem ? null : (problem ?? this.problem),
  );
}

/// The member's meals, and what today says about food (P8).
///
/// ## Everything it draws is local
///
/// The library is the `meals` table and the day's half is two columns of the
/// `daily_plans` row the rhythm already syncs — so the screen renders with the
/// network off and a meal added on a plane appears immediately. Nothing here
/// fetches over GraphQL, which is the difference from `KnowledgeCubit`: a
/// summary is sixty thousand characters and a meal line is a sentence.
///
/// ## Editing is a row and regenerating is a command
///
/// Adding, editing and deleting write a local row with a `pendingOp` and let
/// the sync engine push it — which is what makes them work offline, and what
/// makes a retried push a no-op, because the id is minted here.
///
/// **Regenerating is REST**, and not a local write, because the answer is not
/// this device's to compute: it is a rotation seeded on the server, or a call
/// to a language model that lives beside it. A phone that wrote its own line
/// would show the member one thing and the next sync pass another.
class NutritionCubit extends Cubit<NutritionState> {
  NutritionCubit(this._db, this._sync, this._api)
    : super(const NutritionState());

  final AppDatabase _db;
  final SyncEngine _sync;
  final ApiClient _api;

  StreamSubscription<SyncOutcome>? _passes;

  /// Refreshes after every pass: the day's half is written by the server —
  /// the evening touch, the morning briefing, a profile change — with nothing
  /// on this device doing anything.
  void listenToSync() {
    _passes ??= _sync.outcomes.listen((_) => unawaited(refresh()));
  }

  @override
  Future<void> close() async {
    await _passes?.cancel();
    return super.close();
  }

  void clearProblem() => emit(state.copyWith(clearProblem: true));

  Future<void> showOnly(String? kind) async {
    emit(kind == null ? state.copyWith(clearKind: true) : state.copyWith(kind: kind));
    await refresh();
  }

  Future<void> refresh() async {
    if (isClosed) return;

    final rows = await (_db.select(_db.meals)
          ..where(
            (r) =>
                r.deletedAt.isNull() &
                notPendingOp(r.pendingOp, PendingOps.purge),
          )
          // By name, which is the order the server's rotation reads them in.
          // Sorting by recency here would show the member a different order
          // from the one their day was built from.
          ..orderBy([(r) => OrderingTerm(expression: r.name)]))
        .get();

    final kind = state.kind;
    final meals = kind == null
        ? rows
        : [
            for (final row in rows)
              // `any` belongs to every filter, for the same reason the server's
              // `listFor` admits it: it is a real answer, not an absence.
              if (row.kind == kind || row.kind == 'any') row,
          ];

    final today = await _todayHalf();
    final mode = await _mode();

    if (isClosed) return;
    emit(
      state.copyWith(loading: false, meals: meals, today: today, mode: mode),
    );
  }

  /// Today's half, from the member's own local date.
  ///
  /// The date is taken from the **plan rows** rather than computed from this
  /// handset's clock: the server resolves the member's day in their own zone
  /// (principle XI), and a phone that computed its own would disagree with the
  /// server for the couple of hours after a flight.
  Future<TodayMeals> _todayHalf() async {
    final rows = await (_db.select(_db.dailyPlans)
          ..orderBy([
            (r) => OrderingTerm(expression: r.date, mode: OrderingMode.desc),
          ])
          ..limit(2))
        .get();
    if (rows.isEmpty) return const TodayMeals();

    final today = _localDate(DateTime.now());
    final plan = rows.firstWhere(
      (row) => row.date == today,
      orElse: () => rows.first,
    );
    if (plan.date != today) return const TodayMeals();

    final line = plan.mealLine;
    return TodayMeals(
      line: line,
      reason: plan.mealReason,
      count: line == null || line.isEmpty ? 0 : line.split(', ').length,
    );
  }

  Future<String> _mode() async {
    final row = await _db.select(_db.userPreferences).getSingleOrNull();
    return row?.mealMode ?? 'llm';
  }

  // ── the library, which works offline ─────────────────────────────────────

  /// Adds a meal (FR-001).
  ///
  /// The id is minted here, so the row exists before the server has heard of it
  /// and a retried push is a no-op rather than a duplicate.
  Future<String?> add(
    String name, {
    String kind = 'any',
    List<String> ingredients = const [],
    List<String> tags = const [],
  }) async {
    final trimmed = name.trim();
    if (trimmed.isEmpty) return null;

    final now = DateTime.now().toUtc();
    final id = _uuid.v7();
    await _db.into(_db.meals).insert(
      MealsCompanion.insert(
        id: id,
        name: trimmed,
        kind: Value(kind),
        ingredientsJson: Value(jsonEncode(ingredients)),
        tagsJson: Value(jsonEncode(tags)),
        createdAt: now,
        updatedAt: now,
        pendingOp: const Value(PendingOps.create),
      ),
    );

    await refresh();
    unawaited(_sync.sync());
    return id;
  }

  Future<void> edit(
    String id, {
    String? name,
    String? kind,
    List<String>? ingredients,
    List<String>? tags,
  }) async {
    final row = await (_db.select(_db.meals)
          ..where((r) => r.id.equals(id)))
        .getSingleOrNull();
    if (row == null) return;

    await (_db.update(_db.meals)..where((r) => r.id.equals(id))).write(
      MealsCompanion(
        name: name == null ? const Value.absent() : Value(name.trim()),
        kind: kind == null ? const Value.absent() : Value(kind),
        ingredientsJson: ingredients == null
            ? const Value.absent()
            : Value(jsonEncode(ingredients)),
        tagsJson: tags == null ? const Value.absent() : Value(jsonEncode(tags)),
        updatedAt: Value(DateTime.now().toUtc()),
        // A row still waiting to be created stays a create: turning it into an
        // update would push an edit for a row the server has never seen.
        pendingOp: Value(
          row.pendingOp == PendingOps.create
              ? PendingOps.create
              : PendingOps.update,
        ),
      ),
    );

    await refresh();
    unawaited(_sync.sync());
  }

  /// Tombstones a meal. Never a hard delete: deletions reach the member's other
  /// devices as tombstones or they do not reach them at all.
  Future<void> remove(String id) async {
    final now = DateTime.now().toUtc();
    await (_db.update(_db.meals)..where((r) => r.id.equals(id))).write(
      MealsCompanion(
        deletedAt: Value(now),
        updatedAt: Value(now),
        pendingOp: const Value(PendingOps.delete),
      ),
    );

    await refresh();
    unawaited(_sync.sync());
  }

  // ── the day, which does not ──────────────────────────────────────────────

  /// "Give me different meals for today" (FR-010).
  ///
  /// REST, with no date: the day is the member's own today and the server
  /// resolves it. A client that could name a date could regenerate a past one,
  /// and a past day keeps what it was given (FR-011).
  Future<void> regenerateToday() async {
    if (state.busy) return;
    emit(state.copyWith(busy: true, clearProblem: true));
    try {
      await _api.regenerateTodayMeals();
      // The command answers with the new half, and the row still has to come
      // down the sync pull — so the screen is refreshed from the store rather
      // than from the response, and what it shows is what every other surface
      // shows.
      await _sync.sync();
      await refresh();
    } on ApiException catch (error) {
      emit(state.copyWith(problem: error.message));
    } finally {
      if (!isClosed) emit(state.copyWith(busy: false));
    }
  }

  /// "Use one of mine instead" — one slot, by position (FR-010).
  ///
  /// By position rather than by kind, because two `any` meals can share a kind
  /// and the member tapped a row rather than a category.
  Future<void> replaceToday(int index, String mealId) async {
    if (state.busy) return;
    emit(state.copyWith(busy: true, clearProblem: true));
    try {
      await _api.replaceTodayMeal(index, mealId);
      await _sync.sync();
      await refresh();
    } on ApiException catch (error) {
      emit(state.copyWith(problem: error.message));
    } finally {
      if (!isClosed) emit(state.copyWith(busy: false));
    }
  }
}

/// `YYYY-MM-DD` on this handset's own clock.
///
/// The handset's zone is the member's zone in every ordinary case — they are
/// holding it — and the one case where it is not, the hours after a flight
/// before the profile catches up, is why this is only ever used to *match* a
/// plan row the server already dated rather than to ask for one.
String _localDate(DateTime at) {
  final local = at.toLocal();
  final month = local.month.toString().padLeft(2, '0');
  final day = local.day.toString().padLeft(2, '0');
  return '${local.year}-$month-$day';
}
