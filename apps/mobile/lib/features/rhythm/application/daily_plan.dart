import 'dart:convert';

// Imported whole rather than by name: the `&` of the query builder is an
// extension member, and an extension only applies when its library is
// imported outright.
import 'package:drift/drift.dart';

import '../../../core/db/database.dart';

/// The plan as the screens want it: the snapshot decoded, and the live rows
/// joined onto it.
///
/// Here rather than in `features/home` because the rhythm owns the plan and
/// Home reads it. Both the confirm sheet and the Home card need the same three
/// things — the snapshot's task list, the carried-over counts and the training
/// slot — and a second copy of the decoding would be the place the two screens
/// started disagreeing about what a plan says.

/// One task as the plan snapshotted it, plus whether it has since been done.
///
/// Two sources on purpose. The title, priority and carried-over count come from
/// `daily_plans.tasksJson`, which is what the plan *chose*; [done] comes from
/// the live `tasks` row, which is what has since *happened*. Reading the
/// snapshot for both would show a plan that never completes, and reading the
/// live rows for both would silently shrink the completion ring's denominator
/// whenever a task in the plan was deleted — so a member who finished four of
/// five would see four of four.
class PlanTask {
  const PlanTask({
    required this.id,
    required this.title,
    required this.priority,
    required this.done,
    this.dueAt,
    this.deferCount = 0,
  });

  final String id;
  final String title;

  /// 1 highest … 4 none, as the server numbers them.
  final int priority;

  final DateTime? dueAt;

  /// How many times this task has already been carried to another day — the
  /// number the confirm sheet badges, so a task on its fourth deferral is
  /// visible as one (FR-002).
  final int deferCount;

  final bool done;
}

/// The training slot, when there is one.
///
/// Absent until P6 lands the Training context, and absent again for any member
/// who answered "no training tomorrow" — which is why every reader of this is a
/// null check and never a `!`. The plan reads correctly without it (spec
/// Assumptions), and a card that threw on a missing slot would make Home
/// unopenable for every member until P6 shipped.
class TrainingSlot {
  const TrainingSlot({required this.title, this.sport, this.startAt});

  final String title;
  final String? sport;
  final DateTime? startAt;
}

/// One day's plan, by its local date, or null.
///
/// Queried on the `date` column rather than by rebuilding the server's
/// `"<userId>:<date>"` id: the phone holds one account's rows, so the date is
/// already unique here, and assembling the composite would need the user id on
/// screens that otherwise do not care whose rows they are.
///
/// `deletedAt.isNull()` and deliberately not a `pendingOp` filter — these
/// tables are pull-only mirrors, so nothing local is ever on its way out and a
/// `notPendingOp` here would be a filter over a column nothing writes.
Future<LocalDailyPlan?> planForDate(AppDatabase db, String date) =>
    (db.select(db.dailyPlans)
          ..where((r) => r.date.equals(date) & r.deletedAt.isNull())
          ..limit(1))
        .getSingleOrNull();

/// The plan's tasks, each with whether it is done.
///
/// One query for the live rows rather than one per task: a plan of five would
/// otherwise be five round trips to sqlite on every rebuild, and ticking one
/// off rebuilds.
Future<List<PlanTask>> decodePlanTasks(
  AppDatabase db,
  LocalDailyPlan? plan,
) async {
  if (plan == null) return const [];

  final snapshot = decodePlanSnapshot(plan.tasksJson);
  if (snapshot.isEmpty) return const [];

  final ids = <String>[
    for (final entry in snapshot)
      if (entry['id'] is String) entry['id'] as String,
  ];

  final live = await (db.select(db.tasks)..where((r) => r.id.isIn(ids))).get();
  final byId = {for (final row in live) row.id: row};

  final out = <PlanTask>[];
  for (final entry in snapshot) {
    final id = entry['id'];
    if (id is! String) continue;
    final row = byId[id];
    out.add(
      PlanTask(
        id: id,
        // The live row's title when there is one, the snapshot's otherwise: a
        // task renamed after the plan was set is the same task, and the member
        // expects the name they can see in their list.
        title: row?.title ?? (entry['title'] as String? ?? ''),
        priority: row?.priority ?? _asInt(entry['priority'], 4),
        dueAt: row?.dueAt ?? _asDate(entry['dueAt']),
        deferCount: row?.deferCount ?? _asInt(entry['deferCount'], 0),
        // A task the phone has no row for counts as **not** done. It cannot
        // count as done: the plan would then complete itself as rows aged out
        // of the device, and the ring would fill without the member touching
        // anything.
        done: row?.status == 'completed',
      ),
    );
  }
  return out;
}

/// The training slot on a plan, or null when there is none or it is unreadable.
TrainingSlot? decodeTraining(LocalDailyPlan? plan) {
  final raw = plan?.trainingJson;
  if (raw == null || raw.isEmpty) return null;
  try {
    final decoded = jsonDecode(raw);
    if (decoded is! Map) return null;
    final title = decoded['title'];
    return TrainingSlot(
      // A slot with no session name is still a slot: "there is training" is the
      // fact the card exists for, and the sport on its own reads fine.
      title: title is String && title.isNotEmpty
          ? title
          : (decoded['sport'] as String? ?? ''),
      sport: decoded['sport'] as String?,
      startAt: _asDate(decoded['startAt']),
    );
  } catch (_) {
    // A slot the phone cannot read is a slot it does not draw. The rest of the
    // plan is still good, and Home refusing to open would be worse than Home
    // without a training line.
    return null;
  }
}

/// The `[{id,title,priority,dueAt,deferCount}]` snapshot, decoded.
///
/// Never throws: a snapshot the phone cannot parse draws as an empty plan
/// rather than taking the screen down with it. The server's copy is
/// authoritative and the next pull replaces it.
List<Map<String, dynamic>> decodePlanSnapshot(String encoded) {
  if (encoded.isEmpty) return const [];
  try {
    final decoded = jsonDecode(encoded);
    if (decoded is! List) return const [];
    return [
      for (final entry in decoded.whereType<Map>())
        Map<String, dynamic>.from(entry),
    ];
  } catch (_) {
    return const [];
  }
}

int _asInt(Object? value, int fallback) => switch (value) {
  final int i => i,
  final String s => int.tryParse(s) ?? fallback,
  _ => fallback,
};

DateTime? _asDate(Object? value) {
  if (value is DateTime) return value;
  if (value is! String || value.isEmpty) return null;
  return DateTime.tryParse(value)?.toUtc();
}
