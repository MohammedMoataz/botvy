import 'dart:async';

import 'package:drift/drift.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:timezone/timezone.dart' as tz;

import '../../../core/db/database.dart';
import '../../../core/notifications/alert_plan.dart'
    show memberDate, memberZone;
import '../../../core/sync/sync_engine.dart';
import '../../calendar/application/agenda.dart';
import '../../rhythm/application/daily_plan.dart';
import '../../tasks/application/tasks_cubit.dart';

/// How many days of adherence the strip shows.
///
/// Seven, and the seven *ending today* rather than the calendar week the
/// member's `weekStartsOn` preference names. A calendar week is one to seven
/// dots depending on the day it is read, so on a Monday morning the strip is a
/// single dot and reads as a broken widget; a trailing week is always seven and
/// always says the same thing — "the last seven days". The preference still
/// governs everything that is genuinely about a week boundary, which this is
/// not.
const int kAdherenceDays = 7;

/// Whether the member followed the plan on one day, in three states.
///
/// Three, not two, and the third is the one that gets dropped: a day with no
/// check-in row — or a row whose `adhered` is null because the member gave a
/// mood and no verdict — is **not** a missed day. Modelling this as a `bool`
/// tells somebody who was travelling that they broke a streak they never broke,
/// and there is no way to recover the distinction once it has been flattened.
enum Adherence { adhered, missed, unanswered }

/// One dot on the strip.
class AdherenceDay {
  const AdherenceDay(this.date, this.adherence);

  /// `YYYY-MM-DD` in the member's own zone.
  final String date;
  final Adherence adherence;
}

class HomeState {
  const HomeState({
    this.loading = true,
    this.displayName,
    this.today = '',
    this.tomorrow = '',
    this.timezone,
    this.plan,
    this.planTasks = const [],
    this.training,
    this.mealLine,
    this.mealReason,
    this.draft,
    this.streakCurrent = 0,
    this.streakBest = 0,
    this.week = const [],
    this.awaitingCheckin = false,
    this.agenda = const [],
  });

  final bool loading;

  /// The member's own name, for the greeting. Null while the profile mirror is
  /// empty — a member who has just signed in on a plane — and the greeting then
  /// drops the name rather than saying "Hello, null".
  final String? displayName;

  /// The member's dates, resolved once by the pass that loaded this state.
  ///
  /// Carried rather than recomputed in `build`, for the reason `TasksState`
  /// gives about `dayStart`: a widget working the date out from
  /// `DateTime.now()` uses the *handset's* zone, which is the shift principle
  /// XI exists to stop and which cost v1 three hours once already.
  final String today;
  final String tomorrow;

  /// The member's IANA zone from the profile mirror, carried for the same
  /// reason [today] is: a widget that needs a day's window — the training row
  /// does — must resolve it against the *profile's* zone and never the
  /// handset's.
  final String? timezone;

  final LocalDailyPlan? plan;
  final List<PlanTask> planTasks;
  final TrainingSlot? training;
  final String? mealLine;

  /// Why there are no meals, as one of Nutrition's three **codes** — or null,
  /// which means either that there are meals or that nothing has chosen the day
  /// yet. The card renders the code in the member's own language, and it is a
  /// synced column, so the reason is readable with no network.
  final String? mealReason;

  /// Tomorrow's plan while it is still a draft awaiting an answer, which is
  /// what puts the "plan tomorrow" card on screen. Null once the member has
  /// confirmed or skipped it, and null before the 21:00 prompt has ever run —
  /// offering the card then would ask somebody to confirm a draft that does not
  /// exist.
  final LocalDailyPlan? draft;

  final int streakCurrent;
  final int streakBest;
  final List<AdherenceDay> week;

  /// Today's calendar — meetings and their preparation blocks, timed tasks,
  /// training sessions and personal events — in time order (FR-009).
  ///
  /// Read from drift and expanded on the device by `core/recurrence`, through
  /// the same `localAgenda` the calendar screen uses. **Never the GraphQL
  /// query**: FR-010 is that today's list is readable offline, the server's
  /// `AgendaQuery` serves the extension and the web calendar, and a request on
  /// this screen's critical path would break the promise SC-005 makes about it
  /// — silently, because a developer's phone always has wifi.
  final List<AgendaItem> agenda;

  /// Whether the end-of-day question is still open, from the mirrored rhythm
  /// state. The window it closes after is an operator setting the phone does
  /// not hold, so this is the server's flag and not a local expiry: the
  /// check-in sheet posts the answer and the server decides whether it still
  /// counts.
  final bool awaitingCheckin;

  int get doneCount => planTasks.where((t) => t.done).length;
  int get totalCount => planTasks.length;

  /// "Nothing planned, and no training either" — the case the spec insists is
  /// said plainly rather than drawn as an empty list (edge cases, FR-001a).
  bool get emptyDay => planTasks.isEmpty && training == null;

}

/// Today, as the phone already holds it.
///
/// **Reads the local database and nothing else.** No request, no GraphQL, no
/// wait on a socket: SC-005 is that Home renders today's plan offline in under
/// 300 ms, and the only way to promise that is for the screen to have no
/// network on its critical path at all. Everything here arrives through the
/// sync engine's pull — the three rhythm tables are pull-only mirrors — so a
/// member on a plane opens Home and sees the same day they saw on the ground.
///
/// The one write it does is ticking a task off, and that is delegated to
/// [TasksCubit] rather than written here. Planning owns the `tasks` table: a
/// second writer would have to re-derive the recurrence roll-forward, the
/// `pendingOp` rule that keeps a queued `create` a `create`, and the fact that
/// `baseUpdatedAt` must never be touched by a local edit — three rules that are
/// already written down once, and whose second copy would drift.
class HomeCubit extends Cubit<HomeState> {
  HomeCubit(this._db, this._sync, this._tasks) : super(const HomeState());

  final AppDatabase _db;
  final SyncEngine _sync;
  final TasksCubit _tasks;

  StreamSubscription<SyncOutcome>? _passes;

  /// Re-reads after every sync pass, so the 22:00 summary and the plan it set
  /// appear on Home without the member pulling to refresh.
  void listenToSync() {
    _passes ??= _sync.outcomes.listen((_) => unawaited(refresh()));
  }

  @override
  Future<void> close() async {
    await _passes?.cancel();
    return super.close();
  }

  Future<void> refresh() async {
    if (isClosed) return;

    final profile = await (_db.select(_db.profiles)..limit(1))
        .getSingleOrNull();
    final zone = memberZone(profile?.timezone);
    final now = DateTime.now();
    final today = memberDate(now, zone);
    final tomorrow = memberDate(now, zone, addDays: 1);

    final window = dayWindow(today, profile?.timezone);
    final plan = await planForDate(_db, today);
    final draft = await planForDate(_db, tomorrow);
    final rhythm = await (_db.select(_db.rhythmState)..limit(1))
        .getSingleOrNull();

    if (isClosed) return;
    emit(
      HomeState(
        loading: false,
        displayName: profile?.displayName,
        today: today,
        tomorrow: tomorrow,
        timezone: profile?.timezone,
        plan: plan,
        planTasks: await decodePlanTasks(_db, plan),
        training: decodeTraining(plan),
        mealLine: plan?.mealLine,
        mealReason: plan?.mealReason,
        // Only a draft is offered. A plan the member already confirmed or
        // skipped is settled, and re-offering it would let a second confirm
        // overwrite the first — which is the member's own answer being
        // discarded by the screen that asked for it.
        draft: draft?.status == 'draft' ? draft : null,
        streakCurrent: rhythm?.streakCurrent ?? 0,
        streakBest: rhythm?.streakBest ?? 0,
        week: await _week(now, zone),
        awaitingCheckin: rhythm?.awaitingCheckin ?? false,
        // One day's window, resolved against the *profile's* zone rather than
        // the handset's — a member in Cairo asking for "today" at 01:00 gets
        // yesterday's day if the boundary is taken from a UTC instant.
        agenda: await localAgenda(
          _db,
          from: window.from,
          to: window.to,
          timezone: profile?.timezone,
        ),
      ),
    );
  }

  /// Ticks a task off, or puts it back.
  ///
  /// Through [TasksCubit] so there is one writer for the `tasks` table, and
  /// then a local re-read: US5 acceptance 2 is that the plan and the list agree
  /// *immediately*, which means the ring has to move on this frame rather than
  /// after the next sync pass. The write is already local and immediate, so
  /// this costs one query.
  Future<void> toggleTask(String id, {required bool done}) async {
    if (done) {
      await _tasks.complete(id);
    } else {
      await _tasks.reopen(id);
    }
    await refresh();
  }

  // ── reads ──────────────────────────────────────────────────────────────────

  /// The last [kAdherenceDays] days, oldest first, today last.
  ///
  /// Built from the *dates* rather than from the rows, so a day with no
  /// check-in is present as [Adherence.unanswered] instead of missing from the
  /// list. A strip assembled by iterating the rows would silently be four dots
  /// wide in a week the member answered four times, and the gap would look like
  /// a shorter week rather than an unanswered day.
  Future<List<AdherenceDay>> _week(DateTime now, tz.Location zone) async {
    final dates = [
      for (var back = kAdherenceDays - 1; back >= 0; back--)
        memberDate(now, zone, addDays: -back),
    ];

    final rows = await (_db.select(_db.checkins)
          ..where((r) => r.date.isIn(dates) & r.deletedAt.isNull()))
        .get();
    final byDate = {for (final row in rows) row.date: row};

    return [
      for (final date in dates)
        AdherenceDay(date, switch (byDate[date]?.adhered) {
          // `null` covers both "no row at all" and "a row that recorded a mood
          // and no verdict". Both are days on which the member did not say
          // whether they followed the plan, and neither is a miss.
          true => Adherence.adhered,
          false => Adherence.missed,
          null => Adherence.unanswered,
        }),
    ];
  }
}
