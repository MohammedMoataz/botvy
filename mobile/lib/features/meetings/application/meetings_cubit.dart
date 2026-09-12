import 'dart:async';

import 'package:drift/drift.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:uuid/uuid.dart';

import '../../../core/db/database.dart';
import '../../../core/notifications/alert_plan.dart' show decodeStringList;
import '../../../core/recurrence/expander.dart';
import '../../../core/sync/sync_engine.dart';

const Uuid _uuid = Uuid();

/// The three lists a member reads meetings in.
///
/// No "overdue": a meeting is not something you have or have not done until
/// you do it, it is something that was in the diary and either happened or did
/// not. A past meeting sits in [MeetingView.past] once it has been completed or
/// cancelled, and stays in [MeetingView.upcoming] until then — because "the
/// review last Tuesday, which I never marked" is exactly the row a member goes
/// looking for.
enum MeetingView { upcoming, past, deleted }

class MeetingsState {
  const MeetingsState({
    this.view = MeetingView.upcoming,
    this.meetings = const [],
    this.nextOccurrences = const {},
    this.loading = true,
    this.timezone,
    this.defaultDurationMin = 30,
    this.defaultReminderOffsets = const [1440, 30],
    this.problem,
    this.blocked = const {},
  });

  final MeetingView view;
  final List<LocalMeeting> meetings;

  /// The next occurrence of each row, or null for a series that has run out.
  ///
  /// Computed by the cubit and carried, not worked out in `build`: it costs an
  /// expansion per row and a widget that recomputed it would pay that on every
  /// frame — which is the per-item cost SC-003's benchmark exists to catch.
  final Map<String, DateTime?> nextOccurrences;

  final bool loading;

  /// The member's own zone, resolved once by the pass that loaded this state.
  ///
  /// Carried rather than read in `build` for the reason every other screen
  /// carries its dates: a widget resolving it from `DateTime.now()` uses the
  /// *handset's* zone, and that shift cost v1 three hours once already.
  final String? timezone;

  /// `defaults.meetingDurationMin` from the preferences mirror. FR-001: a
  /// member who names no length gets their own default, and a hard-coded 30
  /// here would be the hard-coded default constitution XII calls a bug — so
  /// this is seeded from the mirror and only falls back when there is no
  /// mirror yet.
  final int defaultDurationMin;

  /// The member's `defaults.leadTimes` preference, in minutes before, furthest
  /// first (FR-003).
  ///
  /// Minutes rather than the `1h`/`30m` labels the preference row stores,
  /// because a meeting's `reminderOffsets` are minutes on the wire and in the
  /// column — the conversion happens once, here, instead of in the editor and
  /// again wherever else a default is wanted.
  ///
  /// The editor seeds a *new* meeting from this and an existing one from its
  /// own stored offsets. That asymmetry is the server's rule too: the offsets
  /// are resolved at creation and kept, so a member who set up a standing call
  /// and later changed their global warning does not find the call's warnings
  /// had moved with it.
  final List<int> defaultReminderOffsets;

  final String? problem;

  /// Ids the sync engine has stopped re-sending, so the row can be badged and
  /// tapped to retry.
  final Set<String> blocked;

  MeetingsState copyWith({
    MeetingView? view,
    List<LocalMeeting>? meetings,
    Map<String, DateTime?>? nextOccurrences,
    bool? loading,
    String? timezone,
    int? defaultDurationMin,
    List<int>? defaultReminderOffsets,
    String? problem,
    Set<String>? blocked,
    bool clearProblem = false,
  }) => MeetingsState(
    view: view ?? this.view,
    meetings: meetings ?? this.meetings,
    nextOccurrences: nextOccurrences ?? this.nextOccurrences,
    loading: loading ?? this.loading,
    timezone: timezone ?? this.timezone,
    defaultDurationMin: defaultDurationMin ?? this.defaultDurationMin,
    defaultReminderOffsets:
        defaultReminderOffsets ?? this.defaultReminderOffsets,
    problem: clearProblem ? null : (problem ?? this.problem),
    blocked: blocked ?? this.blocked,
  );
}

/// The member's meetings, local-first exactly as the tasks are.
///
/// ## Everything is a row edit, and that is the point (FR-010)
///
/// Skipping an occurrence, moving one, completing the series, cancelling it,
/// deleting it: all of them are writes to this row with a `pendingOp`, pushed
/// by the sync engine. The server has REST commands for each — the extension
/// and the web app use them — and the phone deliberately does not, because a
/// member on a plane must be able to skip next Tuesday's standup and have it
/// stick. A skip is an entry in the recurrence's `exdates`, a move is an
/// override in the same object, and both are fields the sync adapter accepts.
///
/// ## Complete and cancel act on the meeting, never on one date (FR-013)
///
/// There is deliberately no `completeOccurrence` and no `cancelOccurrence` on
/// this class, and `test/meetings_cubit_test.dart` asserts the surface rather
/// than trusting the absence. Within a series the member's two statements about
/// one date are "not this one" and "this one, later"; an outcome belongs to the
/// meeting. A per-occurrence status would be a fourth representation of a
/// series' state, disagreeing with the other three the first time a rule
/// changed.
class MeetingsCubit extends Cubit<MeetingsState> {
  MeetingsCubit(this._db, this._sync) : super(const MeetingsState());

  final AppDatabase _db;
  final SyncEngine _sync;

  StreamSubscription<SyncOutcome>? _passes;

  void listenToSync() {
    _passes ??= _sync.outcomes.listen((outcome) {
      unawaited(refresh());
      final refused = outcome.rejections
          .where((r) => r.entity == 'meetings')
          .toList();
      if (refused.isEmpty || isClosed) return;
      emit(
        state.copyWith(
          problem:
              refused.first.message ?? _refusalText(refused.first.reason),
        ),
      );
    });
  }

  @override
  Future<void> close() async {
    await _passes?.cancel();
    return super.close();
  }

  Future<void> show(MeetingView view) async {
    emit(state.copyWith(view: view, loading: true, clearProblem: true));
    await refresh();
  }

  Future<void> refresh() async {
    if (isClosed) return;

    final profile = await (_db.select(_db.profiles)..limit(1))
        .getSingleOrNull();
    final preferences = await (_db.select(_db.userPreferences)..limit(1))
        .getSingleOrNull();
    final rows = await _read(state.view);
    final blocked = {
      for (final row in await _sync.blockedRows())
        if (row.entity == 'meetings') row.id,
    };

    final now = DateTime.now().toUtc();
    final next = <String, DateTime?>{
      for (final row in rows)
        row.id: nextOccurrenceAfter(
          Repeating.ofMeeting(row),
          now,
          profile?.timezone,
        ),
    };

    if (isClosed) return;
    emit(
      state.copyWith(
        meetings: rows,
        nextOccurrences: next,
        blocked: blocked,
        loading: false,
        timezone: profile?.timezone,
        defaultDurationMin: preferences?.meetingDurationMin ?? 30,
        defaultReminderOffsets: preferences == null
            ? null
            : leadTimesAsMinutes(preferences.leadTimesJson),
      ),
    );
  }

  Future<List<LocalMeeting>> _read(MeetingView view) {
    final select = _db.select(_db.meetings);
    switch (view) {
      case MeetingView.upcoming:
        select
          ..where((r) => r.deletedAt.isNull() & r.status.equals('scheduled'))
          ..orderBy([(r) => OrderingTerm.asc(r.startAt)]);
      case MeetingView.past:
        select
          ..where(
            (r) =>
                r.deletedAt.isNull() &
                r.status.isIn(const ['completed', 'cancelled']),
          )
          ..orderBy([(r) => OrderingTerm.desc(r.startAt)]);
      case MeetingView.deleted:
        // The pending-op filter, and it has to be written this way: a meeting
        // the member has erased is on its way out and must not be offered for
        // restoring. `pendingOp.equals(purge).not()` alone is SQL
        // `NOT (pending_op = 'purge')`, which is NULL for every clean row and
        // NULL is falsy — so the list would come back empty. Bitten twice; see
        // `test/pending_op_test.dart`.
        select
          ..where(
            (r) =>
                r.deletedAt.isNotNull() &
                notPendingOp(r.pendingOp, PendingOps.purge),
          )
          ..orderBy([(r) => OrderingTerm.desc(r.deletedAt)]);
    }
    return select.get();
  }

  /// One row by id, for a screen that was handed only an id — a notification
  /// tap, a deep link.
  Future<LocalMeeting?> byId(String id) =>
      (_db.select(_db.meetings)..where((r) => r.id.equals(id)))
          .getSingleOrNull();

  // ── writes ─────────────────────────────────────────────────────────────────

  /// Creates a meeting and reports its id.
  ///
  /// [durationMin] null means the member's own default (FR-001).
  /// [reminderOffsets] empty means the same for the warnings, and is stored
  /// **expanded** rather than empty — mirroring the server, which resolves the
  /// member's `defaults.leadTimes` at creation so a later change to those
  /// defaults never silently moves the reminders of a meeting that already
  /// exists.
  ///
  /// [timezone] is stamped into `authoredTimezone`, which is what the expander
  /// recovers "18:00" from. The server overwrites it from the profile on the
  /// push — it refuses to read a client's copy — so this value only has to be
  /// right until the first sync, and it is right because the cubit reads the
  /// same mirror the server reads.
  Future<String> create({
    required String title,
    required DateTime startAt,
    required MeetingLocation location,
    String? description,
    int? durationMin,
    String? lockTimezone,
    String? prepNotes,
    int prepMinutes = 0,
    List<int> reminderOffsets = const [],
    MeetingRecurrence? recurrence,
    String source = 'app',
  }) async {
    final id = _uuid.v7();
    final now = DateTime.now().toUtc();

    await _db.into(_db.meetings).insert(
      MeetingsCompanion.insert(
        id: id,
        title: title.trim(),
        description: Value(_trimToNull(description)),
        startAt: startAt.toUtc(),
        durationMin: Value(durationMin ?? state.defaultDurationMin),
        lockTimezone: Value(lockTimezone),
        authoredTimezone: Value(state.timezone ?? ''),
        locationJson: Value(location.encode()),
        prepNotes: Value(_trimToNull(prepNotes)),
        prepMinutes: Value(prepMinutes),
        reminderOffsetsJson: Value(_encodeOffsets(reminderOffsets)),
        recurrenceJson: Value(recurrence?.encode()),
        source: Value(source),
        createdAt: now,
        updatedAt: now,
        baseUpdatedAt: const Value(null),
        pendingOp: const Value(PendingOps.create),
      ),
    );

    await _after();
    return id;
  }

  /// Everything about a meeting except its repeat, which [editSeries] owns
  /// because that one can be refused.
  Future<void> edit(
    String id, {
    String? title,
    String? description,
    DateTime? startAt,
    int? durationMin,
    MeetingLocation? location,
    String? prepNotes,
    int? prepMinutes,
    List<int>? reminderOffsets,
    String? lockTimezone,
    bool clearLockTimezone = false,
  }) => _write(
    id,
    MeetingsCompanion(
      title: title == null ? const Value.absent() : Value(title.trim()),
      description: description == null
          ? const Value.absent()
          : Value(_trimToNull(description)),
      startAt: startAt == null ? const Value.absent() : Value(startAt.toUtc()),
      durationMin:
          durationMin == null ? const Value.absent() : Value(durationMin),
      locationJson:
          location == null ? const Value.absent() : Value(location.encode()),
      prepNotes: prepNotes == null
          ? const Value.absent()
          : Value(_trimToNull(prepNotes)),
      prepMinutes:
          prepMinutes == null ? const Value.absent() : Value(prepMinutes),
      reminderOffsetsJson: reminderOffsets == null
          ? const Value.absent()
          : Value(_encodeOffsets(reminderOffsets)),
      // Three states, so a caller can pin, re-pin or unpin: absent leaves it,
      // a string sets it, and [clearLockTimezone] is the only way to say "this
      // no longer follows a place". A nullable parameter cannot express the
      // difference between "unchanged" and "cleared", which is exactly the
      // distinction the toggle needs.
      lockTimezone: clearLockTimezone
          ? const Value(null)
          : (lockTimezone == null
                ? const Value.absent()
                : Value(lockTimezone)),
    ),
  );

  /// The repeat, and the one write on this class that can be **refused**.
  ///
  /// A rule change can leave an override describing an occurrence the new rule
  /// never produces — "every week, six times" shortened to three, with week
  /// five already moved. The spec says the member is warned before it is
  /// discarded, so an unforced edit that would orphan one is refused here and
  /// the moments at stake are handed back: the editor turns them into a dialog
  /// and calls again with `force: true`.
  ///
  /// It is refused *before* the write rather than after, because the sync
  /// adapter forces every pushed edit — there is no member standing in front of
  /// a sync push to answer the dialog — so this is the only place the question
  /// can be asked. Returning the moments rather than throwing keeps the caller
  /// on one code path: an empty list means it went through.
  ///
  /// The member's existing skips and moves are carried onto the new rule
  /// unless the caller supplies its own, mirroring the server's merge: a
  /// picker that edits "every week on Monday" into "Monday and Wednesday"
  /// changes the rule and nothing else, and a patch that reset the exception
  /// lists would silently throw away every skip and every move for a change
  /// that kept them all valid.
  Future<List<DateTime>> editSeries(
    String id,
    MeetingRecurrence? recurrence, {
    bool force = false,
  }) async {
    final row = await byId(id);
    if (row == null) return const [];

    MeetingRecurrence? merged;
    if (recurrence != null) {
      final existing = MeetingRecurrence.decode(row.recurrenceJson);
      merged = recurrence.copyWith(
        exdates:
            recurrence.exdates.isNotEmpty ? null : (existing?.exdates ?? []),
        overrides: recurrence.overrides.isNotEmpty
            ? null
            : (existing?.overrides ?? []),
      );

      // The two zones the expander distinguishes: where the digits are written
      // and which clock they are read on. The orphan check uses the same pair,
      // or a member editing from abroad would be told their moved occurrences
      // were about to be discarded when they were not.
      final digits = row.lockTimezone ?? row.authoredTimezone;
      final expansion = row.lockTimezone ?? state.timezone;
      final orphans = orphanedOverrides(merged, digits, expansion);

      if (orphans.isNotEmpty && !force) {
        return [for (final orphan in orphans) orphan.originalStart];
      }
      if (orphans.isNotEmpty) {
        final discarded = {
          for (final orphan in orphans)
            orphan.originalStart.millisecondsSinceEpoch,
        };
        merged = merged.copyWith(
          overrides: [
            for (final override in merged.overrides)
              if (!discarded.contains(
                override.originalStart.millisecondsSinceEpoch,
              ))
                override,
          ],
        );
      }
    }

    await _write(id, MeetingsCompanion(recurrenceJson: Value(merged?.encode())));
    return const [];
  }

  /// "Not this one." The date joins the exception list (FR-005).
  Future<void> skipOccurrence(String id, DateTime originalStart) =>
      _rewriteRule(id, (rule) => skipInRule(rule, originalStart));

  /// "This one, later." An override keyed by the rule's own moment (FR-005).
  ///
  /// Moving onto a date the member had skipped clears **that occurrence's**
  /// skip and no other — see [moveInRule], which is where the rule lives so
  /// this cubit and the server cannot disagree about it.
  Future<void> moveOccurrence(
    String id,
    DateTime originalStart,
    DateTime startAt, {
    int? durationMin,
  }) => _rewriteRule(
    id,
    (rule) => moveInRule(
      rule,
      originalStart,
      startAt: startAt.toUtc(),
      durationMin: durationMin,
    ),
  );

  /// It happened — the whole meeting, series included (FR-013).
  Future<void> complete(String id) => _write(
    id,
    MeetingsCompanion(
      status: const Value('completed'),
      completedAt: Value(DateTime.now().toUtc()),
    ),
  );

  /// It is off. Distinct from completed and from deleted.
  Future<void> cancelMeeting(String id) => _write(
    id,
    const MeetingsCompanion(
      status: Value('cancelled'),
      // Cleared, because a cancelled meeting has no moment it happened at and
      // leaving a stale one would show a time for something that did not.
      completedAt: Value(null),
    ),
  );

  /// Back to scheduled, for a member who marked the wrong row.
  Future<void> reopen(String id) => _write(
    id,
    const MeetingsCompanion(
      status: Value('scheduled'),
      completedAt: Value(null),
    ),
  );

  /// A delete never touches the status. The Deleted view is where a member
  /// finds out whether the thing they removed had happened, been called off, or
  /// was still in the diary.
  Future<void> delete(String id) => _write(
    id,
    MeetingsCompanion(deletedAt: Value(DateTime.now().toUtc())),
    op: PendingOps.delete,
  );

  Future<void> restore(String id) => _write(
    id,
    const MeetingsCompanion(deletedAt: Value(null)),
    op: PendingOps.restore,
  );

  /// Erases a tombstone for good.
  Future<void> erase(String id) =>
      _write(id, const MeetingsCompanion(), op: PendingOps.purge);

  /// Puts a blocked row back in the outbox at the member's request.
  Future<void> retry(String id) async {
    await _sync.retry('meetings', id);
    await refresh();
  }

  void clearProblem() => emit(state.copyWith(clearProblem: true));

  /// A skip or a move: read the rule, bend it, write it back.
  ///
  /// A no-op on a meeting that does not repeat, matching the server's refusal
  /// without raising anything the UI has to catch — the actions are only
  /// offered on an occurrence of a series, so reaching here without a rule
  /// means a stale screen rather than a member's decision.
  Future<void> _rewriteRule(
    String id,
    MeetingRecurrence Function(MeetingRecurrence rule) change,
  ) async {
    final row = await byId(id);
    final rule = MeetingRecurrence.decode(row?.recurrenceJson);
    if (row == null || rule == null) return;
    await _write(
      id,
      MeetingsCompanion(recurrenceJson: Value(change(rule).encode())),
    );
  }

  Future<void> _write(
    String id,
    MeetingsCompanion patch, {
    String op = PendingOps.update,
  }) async {
    final row = await byId(id);
    if (row == null) return;

    await (_db.update(_db.meetings)..where((r) => r.id.equals(id))).write(
      patch.copyWith(
        updatedAt: Value(DateTime.now().toUtc()),
        // A row the server has never seen stays a `create`: pushing `update`
        // for a missing row is refused as `gone`, and the client's obligation
        // on a `gone` is to delete its local copy — so the member's second edit
        // would erase their own new meeting.
        pendingOp: Value(
          row.pendingOp == PendingOps.create ? PendingOps.create : op,
        ),
        // `baseUpdatedAt` stays untouched, deliberately: it is the server's
        // timestamp for the version this device pulled, and it is what makes
        // the next push uncontested.
        pushAttempts: const Value(0),
      ),
    );
    await _after();
  }

  Future<void> _after() async {
    await refresh();
    _sync.kick();
  }
}

/// The member's `defaults.leadTimes` as minutes before, furthest first.
///
/// The preference row stores the server's own labels — `1h`, `30m`, `0m` — and
/// a meeting's `reminderOffsets` are whole minutes. The same grammar
/// `planPings` reads, so a member's default warnings mean the same thing on a
/// reminder and on a meeting; anything unparseable is dropped rather than
/// guessed at, because a wrong offset is a warning at a time nobody chose.
///
/// An empty or unreadable preference answers the platform's own pair rather
/// than nothing: FR-003 says a member who chooses no reminders gets their
/// defaults, and "no defaults either" would leave a meeting with no warning at
/// all.
List<int> leadTimesAsMinutes(String leadTimesJson) {
  final minutes = <int>{};
  for (final label in decodeStringList(leadTimesJson)) {
    final match = RegExp(
      r'^(\d+)(m|h|d)$',
    ).firstMatch(label.trim().toLowerCase());
    if (match == null) continue;
    minutes.add(
      int.parse(match.group(1)!) *
          switch (match.group(2)!) {
            'm' => 1,
            'h' => 60,
            _ => 1440,
          },
    );
  }
  if (minutes.isEmpty) return const [1440, 30];
  return minutes.toList()..sort((a, b) => b - a);
}

/// The offsets, sorted furthest-first and de-duplicated.
///
/// The server's own rule, applied here so the row that is pushed is already the
/// row that comes back: sorted because the stored order is the order a screen
/// renders, and de-duplicated because the alert reconciliation keys on the
/// offset's label — two identical offsets would be two alerts with one label,
/// and the second would silently overwrite the first.
String _encodeOffsets(List<int> offsets) {
  final unique = {...offsets}.toList()..sort((a, b) => b - a);
  return '[${unique.join(',')}]';
}

String? _trimToNull(String? value) {
  final trimmed = (value ?? '').trim();
  return trimmed.isEmpty ? null : trimmed;
}

String _refusalText(String reason) => switch (reason) {
  'stale' => 'Another device changed this first. Its version is shown.',
  'gone' => 'That had already been removed elsewhere.',
  'protected' => 'That one cannot be changed.',
  'not_deleted' => 'Delete it before erasing it.',
  _ => 'Botvy refused that change.',
};
