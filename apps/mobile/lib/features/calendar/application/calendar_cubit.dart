import 'dart:async';

import 'package:drift/drift.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:timezone/timezone.dart' as tz;
import 'package:uuid/uuid.dart';

import '../../../core/db/database.dart';
import '../../../core/notifications/alert_plan.dart'
    show memberDate, memberZone;
import '../../../core/recurrence/expander.dart';
import '../../../core/sync/sync_engine.dart';
import 'agenda.dart';

const Uuid _uuid = Uuid();

/// Month, week or day (story 3).
enum CalendarMode { month, week, day }

class CalendarState {
  const CalendarState({
    this.mode = CalendarMode.month,
    this.focus,
    this.selected = '',
    this.byDay = const {},
    this.busy = const {},
    this.loading = true,
    this.timezone,
    this.weekStartsOn = 'monday',
    this.problem,
  });

  final CalendarMode mode;

  /// Any instant inside the month that is loaded. What "next month" steps from.
  final DateTime? focus;

  /// The member's local date the day view shows and the month view highlights.
  final String selected;

  /// The loaded window's items, grouped by local date. The day and week views
  /// are slices of this rather than loads of their own — see `agenda.dart` on
  /// why one expansion per window is what SC-003 measures.
  final Map<String, List<AgendaItem>> byDay;

  /// How many items each local date holds. A date present here at all is a
  /// busy day (FR-009).
  final Map<String, int> busy;

  final bool loading;
  final String? timezone;

  /// `monday` | `sunday`, from the preferences mirror. The week view's column
  /// order and `table_calendar`'s own first column both follow it.
  final String weekStartsOn;

  final String? problem;

  List<AgendaItem> get today => byDay[selected] ?? const [];

  /// The seven dates of the week the selection sits in.
  List<String> get week =>
      weekDates(_selectedInstant(), timezone, weekStartsOn: weekStartsOn);

  DateTime _selectedInstant() {
    if (selected.isEmpty) return focus ?? DateTime.now().toUtc();
    return dayWindow(selected, timezone).from;
  }

  CalendarState copyWith({
    CalendarMode? mode,
    DateTime? focus,
    String? selected,
    Map<String, List<AgendaItem>>? byDay,
    Map<String, int>? busy,
    bool? loading,
    String? timezone,
    String? weekStartsOn,
    String? problem,
    bool clearProblem = false,
  }) => CalendarState(
    mode: mode ?? this.mode,
    focus: focus ?? this.focus,
    selected: selected ?? this.selected,
    byDay: byDay ?? this.byDay,
    busy: busy ?? this.busy,
    loading: loading ?? this.loading,
    timezone: timezone ?? this.timezone,
    weekStartsOn: weekStartsOn ?? this.weekStartsOn,
    problem: clearProblem ? null : (problem ?? this.problem),
  );
}

/// One calendar, read entirely from drift (FR-010).
///
/// It also owns the writes for **personal events** (FR-011), which is where
/// they fit: an event has no list of its own — it exists to appear on the
/// calendar — and the create/edit path is reached from the day it belongs on.
/// A `features/events` slice would be a feature whose only screen is a sheet
/// the calendar opens.
///
/// Meetings are not written here. `MeetingsCubit` owns that table, so the
/// `pendingOp` rule that keeps a queued `create` a `create`, and the rule that
/// a local edit never touches `baseUpdatedAt`, are written down once — the same
/// reason Home delegates ticking a task off to `TasksCubit`.
class CalendarCubit extends Cubit<CalendarState> {
  CalendarCubit(this._db, this._sync) : super(const CalendarState());

  final AppDatabase _db;
  final SyncEngine _sync;

  StreamSubscription<SyncOutcome>? _passes;

  void listenToSync() {
    _passes ??= _sync.outcomes.listen((outcome) {
      unawaited(refresh());
      final refused = outcome.rejections
          .where((r) => r.entity == 'calendar_events')
          .toList();
      if (refused.isEmpty || isClosed) return;
      emit(state.copyWith(problem: refused.first.message));
    });
  }

  @override
  Future<void> close() async {
    await _passes?.cancel();
    return super.close();
  }

  /// Loads the month [focus] falls in, keeping the selection when it is still
  /// inside the window.
  Future<void> load({DateTime? focus, String? select}) async {
    if (isClosed) return;

    final profile = await (_db.select(_db.profiles)..limit(1))
        .getSingleOrNull();
    final preferences = await (_db.select(_db.userPreferences)..limit(1))
        .getSingleOrNull();
    final timezone = profile?.timezone;
    final zone = memberZone(timezone);

    final anchor = focus ?? state.focus ?? DateTime.now().toUtc();
    final window = monthWindow(anchor, timezone);
    final items = await localAgenda(
      _db,
      from: window.from,
      to: window.to,
      timezone: timezone,
    );

    if (isClosed) return;
    emit(
      state.copyWith(
        focus: anchor,
        selected: select ??
            (state.selected.isEmpty
                ? memberDate(DateTime.now().toUtc(), zone)
                : state.selected),
        byDay: groupByDay(items, timezone: timezone),
        busy: busyDays(items, timezone: timezone),
        loading: false,
        timezone: timezone,
        weekStartsOn: preferences?.weekStartsOn ?? 'monday',
      ),
    );
  }

  /// Re-reads the window already loaded, after a write or a sync pass.
  Future<void> refresh() => load();

  void setMode(CalendarMode mode) => emit(state.copyWith(mode: mode));

  /// Selects a date, loading its month first when the tap left the window —
  /// which is what tapping a busy day in the trailing cells of a month grid
  /// does (story 3, scenario 3).
  Future<void> select(String date) async {
    if (state.byDay.containsKey(date) || state.busy.containsKey(date)) {
      emit(state.copyWith(selected: date));
      return;
    }
    await load(focus: dayWindow(date, state.timezone).from, select: date);
  }

  /// Steps the visible period, forward or back (story 3, scenario 4).
  ///
  /// One method for all three modes rather than three, because the *unit* is
  /// the only difference and the reload is the same: a month step reloads the
  /// window, and a week or day step usually does not need to but is allowed to
  /// — `load` is a query against a local database and costs less than the
  /// branch that would avoid it.
  Future<void> step(int by) async {
    final timezone = state.timezone;
    final zone = memberZone(timezone);
    final anchor = state.selected.isEmpty
        ? (state.focus ?? DateTime.now().toUtc())
        : dayWindow(state.selected, timezone).from;
    final local = memberDate(anchor, zone);
    final parts = local.split('-').map(int.parse).toList();

    // Built from calendar fields in the member's zone, not by adding hours: a
    // week is not always 168 hours and a month is never a fixed length.
    final moved = switch (state.mode) {
      CalendarMode.month => memberDate(
        _instant(parts[0], parts[1] + by, 1, zone),
        zone,
      ),
      CalendarMode.week => memberDate(
        _instant(parts[0], parts[1], parts[2] + by * 7, zone),
        zone,
      ),
      CalendarMode.day => memberDate(
        _instant(parts[0], parts[1], parts[2] + by, zone),
        zone,
      ),
    };

    await load(focus: dayWindow(moved, timezone).from, select: moved);
  }

  Future<void> goToToday() async {
    final today = memberDate(
      DateTime.now().toUtc(),
      memberZone(state.timezone),
    );
    await load(focus: DateTime.now().toUtc(), select: today);
  }

  // ── personal events (FR-011) ───────────────────────────────────────────────

  Future<LocalCalendarEvent?> eventById(String id) =>
      (_db.select(_db.calendarEvents)..where((r) => r.id.equals(id)))
          .getSingleOrNull();

  /// A birthday, a holiday, a block of focus time.
  ///
  /// [endAt] is required rather than derived from a length, because an event's
  /// two shapes are a stretch of the day and a whole day and the caller is the
  /// one that knows which — the sheet builds midnight-to-midnight for the
  /// second. The server refuses an end at or before the start and anything
  /// longer than a year, so a sheet that got this wrong is refused as `invalid`
  /// rather than drawing a block across every agenda between two dates.
  Future<String> createEvent({
    required String title,
    required DateTime startAt,
    required DateTime endAt,
    bool allDay = false,
    String? color,
    String? notes,
    MeetingRecurrence? recurrence,
  }) async {
    final id = _uuid.v7();
    final now = DateTime.now().toUtc();

    await _db.into(_db.calendarEvents).insert(
      CalendarEventsCompanion.insert(
        id: id,
        title: title.trim(),
        notes: Value(_trimToNull(notes)),
        startAt: startAt.toUtc(),
        endAt: endAt.toUtc(),
        allDay: Value(allDay),
        color: Value(color),
        recurrenceJson: Value(recurrence?.encode()),
        // The member's own zone at the moment of writing, kept for ever. The
        // server overwrites it from the profile on the push — it refuses to
        // read a client's copy — so this only has to hold until the first sync.
        authoredTimezone: Value(state.timezone ?? ''),
        createdAt: now,
        updatedAt: now,
        baseUpdatedAt: const Value(null),
        pendingOp: const Value(PendingOps.create),
      ),
    );

    await _afterWrite();
    return id;
  }

  Future<void> editEvent(
    String id, {
    String? title,
    String? notes,
    DateTime? startAt,
    DateTime? endAt,
    bool? allDay,
    String? color,
    bool clearColor = false,
    MeetingRecurrence? recurrence,
    bool clearRecurrence = false,
  }) => _writeEvent(
    id,
    CalendarEventsCompanion(
      title: title == null ? const Value.absent() : Value(title.trim()),
      notes: notes == null ? const Value.absent() : Value(_trimToNull(notes)),
      startAt: startAt == null ? const Value.absent() : Value(startAt.toUtc()),
      endAt: endAt == null ? const Value.absent() : Value(endAt.toUtc()),
      allDay: allDay == null ? const Value.absent() : Value(allDay),
      color: clearColor
          ? const Value(null)
          : (color == null ? const Value.absent() : Value(color)),
      // Three states again: absent leaves the repeat alone, an object replaces
      // it, and [clearRecurrence] is the only way to say "this no longer
      // repeats". Collapsing them would make a title-only edit erase the
      // member's series.
      recurrenceJson: clearRecurrence
          ? const Value(null)
          : (recurrence == null
                ? const Value.absent()
                : Value(recurrence.encode())),
    ),
  );

  /// Skip and move on a repeating event, through the same helpers a meeting
  /// uses (FR-011). One implementation of the hardest logic in the phase.
  Future<void> skipEventOccurrence(String id, DateTime originalStart) =>
      _rewriteEventRule(id, (rule) => skipInRule(rule, originalStart));

  Future<void> moveEventOccurrence(
    String id,
    DateTime originalStart,
    DateTime startAt,
  ) => _rewriteEventRule(
    id,
    (rule) => moveInRule(rule, originalStart, startAt: startAt.toUtc()),
  );

  Future<void> deleteEvent(String id) => _writeEvent(
    id,
    CalendarEventsCompanion(deletedAt: Value(DateTime.now().toUtc())),
    op: PendingOps.delete,
  );

  Future<void> restoreEvent(String id) => _writeEvent(
    id,
    const CalendarEventsCompanion(deletedAt: Value(null)),
    op: PendingOps.restore,
  );

  void clearProblem() => emit(state.copyWith(clearProblem: true));

  Future<void> _rewriteEventRule(
    String id,
    MeetingRecurrence Function(MeetingRecurrence rule) change,
  ) async {
    final row = await eventById(id);
    final rule = MeetingRecurrence.decode(row?.recurrenceJson);
    if (row == null || rule == null) return;
    await _writeEvent(
      id,
      CalendarEventsCompanion(recurrenceJson: Value(change(rule).encode())),
    );
  }

  Future<void> _writeEvent(
    String id,
    CalendarEventsCompanion patch, {
    String op = PendingOps.update,
  }) async {
    final row = await eventById(id);
    if (row == null) return;

    await (_db.update(_db.calendarEvents)..where((r) => r.id.equals(id))).write(
      patch.copyWith(
        updatedAt: Value(DateTime.now().toUtc()),
        // A row the server has never seen stays a `create`, for the reason
        // `MeetingsCubit._write` gives: an `update` for a missing row is
        // refused `gone`, and the client's obligation on a `gone` is to delete
        // its local copy.
        pendingOp: Value(
          row.pendingOp == PendingOps.create ? PendingOps.create : op,
        ),
        pushAttempts: const Value(0),
      ),
    );
    await _afterWrite();
  }

  Future<void> _afterWrite() async {
    await refresh();
    _sync.kick();
  }
}

/// A local calendar date in [zone], as a UTC instant.
///
/// `tz.TZDateTime` normalises out-of-range fields — month 13 is January of the
/// next year, day 0 is the last day of the previous month — which is what lets
/// [CalendarCubit.step] be plain arithmetic on the fields instead of three
/// special cases about month lengths and leap years.
DateTime _instant(int year, int month, int day, tz.Location zone) =>
    DateTime.fromMillisecondsSinceEpoch(
      tz.TZDateTime(zone, year, month, day).millisecondsSinceEpoch,
      isUtc: true,
    );

String? _trimToNull(String? value) {
  final trimmed = (value ?? '').trim();
  return trimmed.isEmpty ? null : trimmed;
}
