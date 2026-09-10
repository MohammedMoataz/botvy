import 'dart:async';
import 'dart:convert';

// Imported whole rather than by name: `Value`, `isNull` and the `&` of the
// query builder are extension members, and an extension only applies when its
// library is imported outright.
import 'package:drift/drift.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/widgets.dart' show AppLifecycleListener;

import '../api/api_client.dart';
import '../api/socket_client.dart';
import '../db/database.dart';
import '../notifications/local_notifications.dart';

/// Reconciles this device with the gateway.
///
/// Generalised from v1's `SyncService`, which knew about reminders and chats by
/// name. The shape is the same because the shape is `contracts/sync.md`: one
/// round trip carries the outbox up and everything that changed since the
/// cursor down, and the cursor is only stored once the whole apply has
/// committed locally. What changed is that the per-entity knowledge is now four
/// small functions — a pushed row, a pulled row, a sweep and a purge — rather
/// than the body of the engine, so P5's meetings are a table in [_appliers] and
/// not another two hundred lines here.
///
/// The device holds the whole of this member's data and can edit all of it
/// offline. The server is the shared merge point rather than the place the data
/// lives, which is why almost every rule below is about *not* losing a local
/// edit.
class SyncEngine {
  SyncEngine(this._api, this._db, this._scheduler);

  final ApiClient _api;
  final AppDatabase _db;
  final NotificationScheduler _scheduler;

  /// How many refusals a row is pushed through before the engine stops
  /// re-sending it.
  ///
  /// The row is **not** discarded at the cap and never is: it keeps its
  /// `pendingOp`, so it still reads as the member's own unsaved edit, and
  /// [blockedRows] is what a screen badges to offer a retry. Dropping it would
  /// be the app quietly deciding somebody's work was not worth keeping.
  static const int maxPushAttempts = 5;

  /// The entities this client pushes and pulls.
  ///
  /// Deliberately not every entity the contract lists. `profile` and
  /// `preferences` are still served by `ProfileMirror` over REST, and putting
  /// them in this list would have the pull overwrite the mirror with a second
  /// copy of the same record through a second code path. They move here in the
  /// same change that retires those two REST calls.
  static const List<String> entities = ['labels', 'tasks', 'reminders'];

  Future<void>? _inFlight;
  bool _again = false;
  AppLifecycleListener? _lifecycle;

  final StreamController<SyncOutcome> _outcomes =
      StreamController<SyncOutcome>.broadcast();

  /// What each pass did. Broadcast, because both the sync indicator and any
  /// screen showing a rejection want it and neither owns it.
  Stream<SyncOutcome> get outcomes => _outcomes.stream;

  SyncOutcome? _last;

  /// The most recent pass, for a widget that mounts between two of them.
  SyncOutcome? get lastOutcome => _last;

  // ── triggers ───────────────────────────────────────────────────────────────

  /// Fire-and-forget, for callers that must not wait — every UI mutation.
  void kick() => unawaited(sync());

  /// Wires the two triggers that are not an explicit [kick]: the connection
  /// coming back, and the app returning to the foreground.
  ///
  /// The socket's own `connect` is the connectivity signal rather than
  /// `connectivity_plus`. What this engine actually needs to know is not "the
  /// handset has a network" but "the gateway is reachable" — a phone on a
  /// captive-portal wifi has the first and not the second, and would sync on
  /// every join and fail on every one. Socket.IO reconnects on its own, so its
  /// connect event is exactly the moment a pass can succeed.
  ///
  /// `sync.nudge` is the server telling this device that one of the member's
  /// other clients pushed something (`016` T232), which is the same trigger
  /// wearing a different hat.
  ///
  /// ponytail: if the socket's backoff ever proves slower than the member's
  /// patience, add `connectivity_plus` and OR the two signals — nothing else
  /// here changes, because a duplicate trigger is collapsed by the latch.
  void watch(SocketClient socket) {
    socket
      ..on('connect', (_) => kick())
      ..on('sync.nudge', (_) => kick());

    // An `AppLifecycleListener` rather than a `WidgetsBindingObserver`: it
    // needs no widget to hang off, which is what lets the engine own its own
    // trigger instead of a screen remembering to forward one.
    _lifecycle ??= AppLifecycleListener(onResume: kick);
  }

  void dispose() {
    _lifecycle?.dispose();
    _lifecycle = null;
    unawaited(_outcomes.close());
  }

  /// Runs one pass.
  ///
  /// Concurrent callers await the pass already running, and a request that
  /// arrives mid-pass schedules exactly **one** more. Not a queue: a burst of
  /// edits — a member ticking off six tasks — would otherwise start six passes,
  /// five of which push nothing and all of which re-plan the alarms. One
  /// queued re-run is enough, because the pass it schedules reads the rows as
  /// they are when it starts, so it carries every edit made during the first.
  Future<void> sync() {
    if (_inFlight != null) {
      _again = true;
      return _inFlight!;
    }
    final run = _drain().whenComplete(() => _inFlight = null);
    _inFlight = run;
    return run;
  }

  /// The pass, and then the one queued behind it.
  ///
  /// The re-run is awaited inside the latch rather than kicked off and
  /// forgotten, so the future `sync()` hands back covers *everything* the call
  /// caused. Forgetting it worked in production and made every test racy: a
  /// spec that awaited a pass could still have a second one land after it
  /// finished, against a database the teardown had closed.
  Future<void> _drain() async {
    await _run();
    while (_again) {
      _again = false;
      await _run();
    }
  }

  Future<void> _run() async {
    SyncOutcome outcome;
    try {
      outcome = await _roundTrip();
      await _db.setValue(
        SyncKeys.lastSyncAt,
        DateTime.now().toUtc().toIso8601String(),
      );
    } catch (error) {
      // Offline is the normal state of this application, not an error worth
      // showing. What matters is that the pass ends here rather than throwing
      // out of the trigger that started it: in v1 one rethrowing push blocked
      // every later step, on every trigger, for ever.
      debugPrint('sync deferred: $error');
      outcome = SyncOutcome.offline(blocked: await blockedRows());
    }

    // Always, online or not, and after a failure too — the alarms are the
    // product. A pass that could not reach the server has still, by getting
    // this far, seen every local edit the member made since the last one.
    outcome = outcome.copyWith(armed: await _scheduler.rescheduleAll(_db));

    _last = outcome;
    if (!_outcomes.isClosed) _outcomes.add(outcome);
  }

  // ── the round trip ─────────────────────────────────────────────────────────

  Future<SyncOutcome> _roundTrip() async {
    final cursor = await _db.getValue(SyncKeys.cursor);
    final push = <String, dynamic>{};
    final pushedIds = <String, Set<String>>{};

    for (final entity in entities) {
      final rows = await _pendingRows(entity);
      if (rows.isEmpty) continue;
      push[entity] = rows.map((row) => row.payload).toList();
      pushedIds[entity] = {for (final row in rows) row.id};
    }

    final response = await _api.sync(
      installId: await stableInstallId(_db),
      entities: entities,
      since: cursor,
      push: push,
    );

    return _apply(response, pushedIds);
  }

  /// Writes everything one response carries, in one local transaction.
  ///
  /// The cursor is the last statement in it. Nothing else would be safe: a
  /// cursor stored before the rows it stands for would make the next pass a
  /// delta over data this device never received, and the gap is permanent
  /// because a delta has no way to mention a row that did not change again.
  Future<SyncOutcome> _apply(
    Map<String, dynamic> response,
    Map<String, Set<String>> pushedIds,
  ) async {
    final now = response['now'] as String?;
    final full = response['full'] == true;
    final pull = _map(response['pull']);
    final accepted = _map(response['accepted']);
    final rejections = (response['rejections'] as List? ?? const [])
        .whereType<Map>()
        .map((raw) => Rejection.fromJson(Map<String, dynamic>.from(raw)))
        .toList();

    await _db.transaction(() async {
      // 1. Rejections first, and branching on `entity` before touching any
      //    table. Every entity shares the rejection shape, so a refused
      //    reminder fed through the task path would write a reminder's id into
      //    a task row — corruption rather than a crash, which is why this is a
      //    lookup and not a cast.
      for (final rejection in rejections) {
        final applier = _appliers[rejection.entity];
        if (applier == null) {
          // A rejection for something this build does not know about. Skipped
          // rather than thrown: a newer server may sync an entity an older
          // phone has no table for, and the rest of the response is still good.
          debugPrint('rejection for unknown entity ${rejection.entity}');
          continue;
        }
        await _applyRejection(applier, rejection);
      }

      // 2. Clear `pendingOp` only for the ids the server actually named.
      //    Clearing the whole pushed set on a 200 is the mistake that discards
      //    a row the server never saw — a request that half-arrived, an entity
      //    the server refused to consider at all.
      for (final entity in entities) {
        final applier = _appliers[entity]!;
        final ids = (accepted[entity] as List? ?? const [])
            .whereType<String>()
            .toSet();
        if (ids.isEmpty) continue;

        // A purge the server accepted is the one op whose row can finally go:
        // it is gone there, and a hard-deleted row appears in no pull, so its
        // absence can only be recognised from having pushed it and not been
        // refused.
        final purged = await applier.purgedAmong(_db, ids);
        await applier.clearPending(_db, ids.difference(purged));
        await applier.hardDelete(_db, purged);
      }

      // 3. The pull, parents before children. A task carries a snapshot of its
      //    label's name and colour, and a task written before the label it
      //    names would render a blank chip until something else touched it.
      //    [entities] is in that order and is iterated rather than sorted, so
      //    the order is visible where it is declared.
      final seen = <String, Set<String>>{};
      for (final entity in entities) {
        final applier = _appliers[entity]!;
        final rows = (pull[entity] as List? ?? const []).whereType<Map>();

        // A row this device edited again while the push was in flight keeps
        // its local copy: the member's newest edit wins locally and the next
        // pass carries it up. Recomputed here, after step 2, so the set is
        // exactly "still dirty now" rather than "was dirty before the reply".
        final stillPending = await applier.pendingIds(_db);

        final ids = <String>{};
        for (final raw in rows) {
          final row = Map<String, dynamic>.from(raw);
          final id = row['id'];
          if (id is! String) continue;
          ids.add(id);
          if (stillPending.contains(id)) continue;
          await applier.writeServerRow(_db, row);
        }
        seen[entity] = ids;
      }

      // 4. The delete sweep, and only against a full snapshot.
      //
      //    A delta lists what changed; treating it as the complete set deletes
      //    every row that simply did not change, which on a quiet day is all of
      //    them. Deletions arrive as tombstones instead — a row with
      //    `deletedAt`, which is what the Deleted view lists — so there is
      //    nothing a delta needs this for.
      //
      //    `full` is not an optimisation either: a device offline for longer
      //    than the tombstone horizon has missed deletions whose tombstones the
      //    server has since purged, and a complete snapshot is the only thing
      //    that can tell it.
      if (full) {
        for (final entity in entities) {
          await _appliers[entity]!.sweep(_db, seen[entity] ?? const {});
        }
      }

      // 5. The server's own planned alerts, replaced wholesale. They are a
      //    mirror of one query's answer and carry nothing local, so there is
      //    nothing to reconcile — and a stale row here is an alarm for
      //    something the member has dealt with.
      await _writePendingAlerts(response['pendingAlerts']);

      // 6. The cursor, last. Stored verbatim as the string the server sent:
      //    it is the server's clock, and reformatting it through `DateTime`
      //    rounds off the milliseconds a delta is cut on.
      if (now != null) await _db.setValue(SyncKeys.cursor, now);
    });

    return SyncOutcome(
      reachedServer: true,
      full: full,
      pushed: pushedIds.values.fold(0, (sum, ids) => sum + ids.length),
      accepted: accepted.values
          .whereType<List>()
          .fold(0, (sum, ids) => sum + ids.length),
      rejections: rejections,
      blocked: await blockedRows(),
    );
  }

  /// One refusal, applied.
  ///
  /// The reason decides what happens, not the presence of a `server` field, and
  /// that distinction is load-bearing:
  ///
  /// * `stale` and `not_deleted` carry the server's row and the member's edit
  ///   lost. The local copy is overwritten so the winner is *visible* rather
  ///   than silently dropped, and `pendingOp` is cleared so this device stops
  ///   pushing a version that can never win.
  /// * `protected` is the same overwrite and never reported as `stale`,
  ///   because a stale verdict tells the phone to overwrite and retry — and
  ///   against a row it is never allowed to change it would retry for ever.
  /// * `gone` means there is nothing to edit. The local row goes.
  /// * `invalid` is a domain rule refusing the row itself — an empty title, a
  ///   moment in the past. Its `server` field carries a *message*, not a row,
  ///   so writing it through the row path would fill the table with nulls.
  ///   The edit is kept and the pushing stops; the rejection is surfaced.
  Future<void> _applyRejection(_EntityApplier applier, Rejection r) async {
    switch (r.reason) {
      case 'gone':
        await applier.hardDelete(_db, {r.id});
        return;
      case 'invalid':
        // Straight to the cap rather than one strike: retrying an unchanged
        // row against an unchanged rule fails identically four more times, and
        // each of those is a round trip the member waits for.
        await applier.block(_db, r.id, maxPushAttempts);
        return;
      default:
        final row = r.serverRow;
        if (row == null) {
          await applier.hardDelete(_db, {r.id});
          return;
        }
        await applier.writeServerRow(_db, row);
    }
  }

  /// Every row the engine has given up re-sending, so a screen can badge it and
  /// offer the member a retry.
  Future<List<BlockedRow>> blockedRows() async {
    final blocked = <BlockedRow>[];
    for (final entity in entities) {
      for (final id in await _appliers[entity]!.blockedIds(_db)) {
        blocked.add(BlockedRow(entity: entity, id: id));
      }
    }
    return blocked;
  }

  /// Puts a blocked row back in the outbox at the member's request.
  ///
  /// Zeroes the strike count rather than nudging it under the cap, because the
  /// member has usually just corrected whatever the server refused and the row
  /// deserves its full allowance again.
  Future<void> retry(String entity, String id) async {
    await _appliers[entity]?.block(_db, id, 0);
    kick();
  }

  Future<void> retryAll() async {
    for (final row in await blockedRows()) {
      await _appliers[row.entity]?.block(_db, row.id, 0);
    }
    kick();
  }

  /// Forgets the cursor, so the next pass asks for a full snapshot.
  ///
  /// The repair for anything that has gone wrong locally, and the reason
  /// `since` is nullable rather than required with a sentinel.
  Future<void> resetCursor() => _db.setValue(SyncKeys.cursor, '');

  // ── the outbox ─────────────────────────────────────────────────────────────

  Future<List<_PendingRow>> _pendingRows(String entity) =>
      _appliers[entity]!.pending(_db, maxPushAttempts);

  Future<void> _writePendingAlerts(Object? raw) async {
    await _db.delete(_db.alertsLocal).go();
    if (raw is! List) return;
    final fetchedAt = DateTime.now().toUtc();

    for (final entry in raw.whereType<Map>()) {
      final alert = Map<String, dynamic>.from(entry);
      final source = Map<String, dynamic>.from(
        alert['source'] as Map? ?? const {},
      );
      final kind = source['kind'];
      final sourceId = source['id'];
      final label = alert['label'];
      final notifyAt = _date(alert['notifyAt']);
      if (kind is! String ||
          sourceId is! String ||
          label is! String ||
          notifyAt == null) {
        continue;
      }
      final occurrenceAt = _date(source['occurrenceAt']);

      await _db.into(_db.alertsLocal).insertOnConflictUpdate(
        AlertsLocalCompanion.insert(
          // The server's own unique key for an alert, spelt exactly as
          // `PlannedAlert.key` spells it — which is what makes the alert this
          // phone derived and the server's copy of it one alarm instead of two.
          id: '$kind|$sourceId|'
              '${occurrenceAt?.toUtc().toIso8601String() ?? '-'}|$label',
          sourceKind: kind,
          sourceId: sourceId,
          occurrenceAt: Value(occurrenceAt),
          label: label,
          notifyAt: notifyAt,
          title: alert['title'] as String? ?? '',
          body: Value(alert['body'] as String? ?? ''),
          deepLink: Value(alert['deepLink'] as String? ?? ''),
          fetchedAt: fetchedAt,
        ),
      );
    }
  }

  /// The per-entity halves of the protocol, one entry per table.
  ///
  /// A map rather than a chain of `if (entity == 'tasks')`: the engine indexes
  /// it by the string the server sent, which is the same lookup the rejection
  /// branch needs, and a new entity is an entry here rather than four more
  /// branches spread through this file.
  late final Map<String, _EntityApplier> _appliers = {
    'labels': _LabelApplier(),
    'tasks': _TaskApplier(),
    'reminders': _ReminderApplier(),
  };
}

/// Keys this engine owns. Feature slices declare their own, as `DbKeys` says.
abstract final class SyncKeys {
  /// The server's own cursor, stored verbatim.
  ///
  /// Deliberately not [lastSyncAt]: that one is this handset's clock, and
  /// sending it as `since` would skip whatever the clock skew covers — every
  /// row written in that window, invisibly, once.
  static const String cursor = 'syncCursor';

  /// "Last time we talked to the server", for the member to read. Never sent.
  static const String lastSyncAt = 'lastSyncAt';
}

/// What one pass did.
class SyncOutcome {
  const SyncOutcome({
    required this.reachedServer,
    this.full = false,
    this.pushed = 0,
    this.accepted = 0,
    this.armed = 0,
    this.rejections = const [],
    this.blocked = const [],
  });

  factory SyncOutcome.offline({List<BlockedRow> blocked = const []}) =>
      SyncOutcome(reachedServer: false, blocked: blocked);

  final bool reachedServer;
  final bool full;
  final int pushed;
  final int accepted;

  /// How many alarms the scheduler armed afterwards. Zero on a device that has
  /// not granted the permission, which is worth telling the member.
  final int armed;

  final List<Rejection> rejections;

  /// Rows the engine has stopped re-sending. Never empty and quiet: this is
  /// what the sync badge counts and what tap-to-retry acts on.
  final List<BlockedRow> blocked;

  bool get hasProblems => rejections.isNotEmpty || blocked.isNotEmpty;

  SyncOutcome copyWith({int? armed}) => SyncOutcome(
    reachedServer: reachedServer,
    full: full,
    pushed: pushed,
    accepted: accepted,
    armed: armed ?? this.armed,
    rejections: rejections,
    blocked: blocked,
  );
}

/// One refused push.
class Rejection {
  const Rejection({
    required this.entity,
    required this.id,
    required this.reason,
    this.server,
  });

  factory Rejection.fromJson(Map<String, dynamic> json) => Rejection(
    entity: json['entity'] as String? ?? '',
    id: json['id'] as String? ?? '',
    reason: json['reason'] as String? ?? 'invalid',
    server: json['server'],
  );

  final String entity;
  final String id;

  /// `stale` | `gone` | `protected` | `not_deleted` | `invalid`.
  final String reason;

  /// The server's own row, for the reasons that carry one. Untyped because an
  /// `invalid` puts a `{message}` here instead, which is exactly why
  /// [serverRow] exists rather than a cast at the use site.
  final Object? server;

  /// The server's row, or null when this rejection did not carry one.
  ///
  /// Recognised by the row naming the same id, not by being non-null. An
  /// `invalid` rejection carries the domain rule's message in this field, and
  /// writing that through the row path would blank every column of the
  /// member's row.
  Map<String, dynamic>? get serverRow {
    final raw = server;
    if (raw is! Map) return null;
    if (raw['id'] != id) return null;
    return Map<String, dynamic>.from(raw);
  }

  /// What the server said, for a rejection the member has to see.
  String? get message {
    final raw = server;
    if (raw is Map && raw['message'] is String) return raw['message'] as String;
    return null;
  }
}

/// A row the engine has stopped re-sending.
class BlockedRow {
  const BlockedRow({required this.entity, required this.id});

  final String entity;
  final String id;
}

/// A row on its way up.
class _PendingRow {
  const _PendingRow(this.id, this.payload);

  final String id;
  final Map<String, dynamic> payload;
}

/// Everything the engine needs to know about one entity, and nothing else.
///
/// Six operations rather than a generic table walker: drift's generated tables
/// are distinct types with distinct companions, so "update the pending column
/// of whichever table this is" cannot be written once without giving up the
/// type checking that makes the generated code worth having. Six short
/// overrides per entity is the cheaper trade.
abstract class _EntityApplier {
  /// Rows with an unsent operation and strikes left.
  Future<List<_PendingRow>> pending(AppDatabase db, int cap);

  /// Every id that still has an unsent operation, at whatever strike count.
  Future<Set<String>> pendingIds(AppDatabase db);

  /// Ids the engine has given up on.
  Future<Set<String>> blockedIds(AppDatabase db);

  /// Which of [ids] were pushed as a purge — the rows that go for good once the
  /// server has accepted them.
  Future<Set<String>> purgedAmong(AppDatabase db, Set<String> ids);

  Future<void> clearPending(AppDatabase db, Set<String> ids);

  /// Sets the strike count outright: to the cap to stop pushing, to zero to
  /// start again.
  Future<void> block(AppDatabase db, String id, int attempts);

  Future<void> hardDelete(AppDatabase db, Set<String> ids);

  /// One pulled row, written over the local copy.
  Future<void> writeServerRow(AppDatabase db, Map<String, dynamic> row);

  /// Removes every local row absent from a **full** snapshot, sparing anything
  /// with an unsent operation — a row created offline is in no snapshot yet.
  Future<void> sweep(AppDatabase db, Set<String> seen);
}

class _LabelApplier extends _EntityApplier {
  @override
  Future<List<_PendingRow>> pending(AppDatabase db, int cap) async {
    final rows = await (db.select(db.labels)..where(
      (r) => r.pendingOp.isNotNull() & r.pushAttempts.isSmallerThanValue(cap),
    )).get();

    return [
      for (final row in rows)
        _PendingRow(row.id, {
          'op': row.pendingOp,
          'id': row.id,
          'updatedAt': row.updatedAt.toUtc().toIso8601String(),
          // The server's own timestamp, never this handset's edit time. While
          // it still matches, the push is accepted with no clock consulted at
          // all — which is the whole reason the column exists.
          'baseUpdatedAt': row.baseUpdatedAt?.toUtc().toIso8601String(),
          'data': {
            'name': row.name,
            'color': row.color,
            'sortOrder': row.sortOrder,
          },
        }),
    ];
  }

  @override
  Future<Set<String>> pendingIds(AppDatabase db) async {
    final rows = await (db.select(db.labels)
          ..where((r) => r.pendingOp.isNotNull()))
        .get();
    return {for (final row in rows) row.id};
  }

  @override
  Future<Set<String>> blockedIds(AppDatabase db) async {
    final rows = await (db.select(db.labels)..where(
      (r) =>
          r.pendingOp.isNotNull() &
          r.pushAttempts.isBiggerOrEqualValue(SyncEngine.maxPushAttempts),
    )).get();
    return {for (final row in rows) row.id};
  }

  @override
  Future<Set<String>> purgedAmong(AppDatabase db, Set<String> ids) async {
    if (ids.isEmpty) return const {};
    final rows = await (db.select(db.labels)..where(
      (r) => r.id.isIn(ids) & r.pendingOp.equals(PendingOps.purge),
    )).get();
    return {for (final row in rows) row.id};
  }

  @override
  Future<void> clearPending(AppDatabase db, Set<String> ids) async {
    if (ids.isEmpty) return;
    await (db.update(db.labels)..where((r) => r.id.isIn(ids))).write(
      const LabelsCompanion(
        pendingOp: Value(null),
        pushAttempts: Value(0),
      ),
    );
  }

  @override
  Future<void> block(AppDatabase db, String id, int attempts) async {
    await (db.update(db.labels)..where((r) => r.id.equals(id)))
        .write(LabelsCompanion(pushAttempts: Value(attempts)));
  }

  @override
  Future<void> hardDelete(AppDatabase db, Set<String> ids) async {
    if (ids.isEmpty) return;
    await (db.delete(db.labels)..where((r) => r.id.isIn(ids))).go();
  }

  @override
  Future<void> writeServerRow(AppDatabase db, Map<String, dynamic> row) async {
    final updatedAt = _date(row['updatedAt']) ?? DateTime.now().toUtc();
    await db.into(db.labels).insertOnConflictUpdate(
      LabelsCompanion.insert(
        id: row['id'] as String,
        name: row['name'] as String? ?? '',
        color: row['color'] as String? ?? '#475569',
        sortOrder: Value(row['sortOrder'] as int? ?? 0),
        createdAt: _date(row['createdAt']) ?? updatedAt,
        updatedAt: updatedAt,
        // The server's value, kept apart from any local edit time: it is what
        // makes the next push uncontested and so clock-free.
        baseUpdatedAt: Value(updatedAt),
        // A tombstone is stored, not erased. It is what the Deleted view lists
        // and what Restore undoes; the row leaves for good only when the server
        // purges it past the horizon, which a full snapshot then reflects.
        deletedAt: Value(_date(row['deletedAt'])),
        pendingOp: const Value(null),
        pushAttempts: const Value(0),
      ),
    );
  }

  @override
  Future<void> sweep(AppDatabase db, Set<String> seen) async {
    await (db.delete(db.labels)..where(
      (r) => r.pendingOp.isNull() & r.id.isNotIn(seen),
    )).go();
  }
}

class _TaskApplier extends _EntityApplier {
  @override
  Future<List<_PendingRow>> pending(AppDatabase db, int cap) async {
    final rows = await (db.select(db.tasks)..where(
      (r) => r.pendingOp.isNotNull() & r.pushAttempts.isSmallerThanValue(cap),
    )).get();

    return [
      for (final row in rows)
        _PendingRow(row.id, {
          'op': row.pendingOp,
          'id': row.id,
          'updatedAt': row.updatedAt.toUtc().toIso8601String(),
          'baseUpdatedAt': row.baseUpdatedAt?.toUtc().toIso8601String(),
          'data': {
            'title': row.title,
            'notes': row.notes,
            'dueAt': row.dueAt?.toUtc().toIso8601String(),
            'allDay': row.allDay,
            'priority': row.priority,
            'labelId': row.labelId,
            // The label's *name and colour* are deliberately not sent. The
            // server re-resolves the snapshot from its own store, because a
            // phone that was offline may hold a label renamed since and
            // pushing its stale copy would show the old name to every other
            // device until something else touched the row.
            'status': row.status,
            'completedAt': row.completedAt?.toUtc().toIso8601String(),
            'recurrence': _decodeJson(row.recurrenceJson),
            'estimatedMinutes': row.estimatedMinutes,
            'source': row.source,
          },
        }),
    ];
  }

  @override
  Future<Set<String>> pendingIds(AppDatabase db) async {
    final rows =
        await (db.select(db.tasks)..where((r) => r.pendingOp.isNotNull())).get();
    return {for (final row in rows) row.id};
  }

  @override
  Future<Set<String>> blockedIds(AppDatabase db) async {
    final rows = await (db.select(db.tasks)..where(
      (r) =>
          r.pendingOp.isNotNull() &
          r.pushAttempts.isBiggerOrEqualValue(SyncEngine.maxPushAttempts),
    )).get();
    return {for (final row in rows) row.id};
  }

  @override
  Future<Set<String>> purgedAmong(AppDatabase db, Set<String> ids) async {
    if (ids.isEmpty) return const {};
    final rows = await (db.select(db.tasks)..where(
      (r) => r.id.isIn(ids) & r.pendingOp.equals(PendingOps.purge),
    )).get();
    return {for (final row in rows) row.id};
  }

  @override
  Future<void> clearPending(AppDatabase db, Set<String> ids) async {
    if (ids.isEmpty) return;
    await (db.update(db.tasks)..where((r) => r.id.isIn(ids))).write(
      const TasksCompanion(pendingOp: Value(null), pushAttempts: Value(0)),
    );
  }

  @override
  Future<void> block(AppDatabase db, String id, int attempts) async {
    await (db.update(db.tasks)..where((r) => r.id.equals(id)))
        .write(TasksCompanion(pushAttempts: Value(attempts)));
  }

  @override
  Future<void> hardDelete(AppDatabase db, Set<String> ids) async {
    if (ids.isEmpty) return;
    await (db.delete(db.tasks)..where((r) => r.id.isIn(ids))).go();
  }

  @override
  Future<void> writeServerRow(AppDatabase db, Map<String, dynamic> row) async {
    final updatedAt = _date(row['updatedAt']) ?? DateTime.now().toUtc();
    final label = row['label'];
    final snapshot = label is Map ? Map<String, dynamic>.from(label) : null;
    final recurrence = row['recurrence'];

    await db.into(db.tasks).insertOnConflictUpdate(
      TasksCompanion.insert(
        id: row['id'] as String,
        title: row['title'] as String? ?? '',
        notes: Value(row['notes'] as String?),
        dueAt: Value(_date(row['dueAt'])),
        allDay: Value(row['allDay'] as bool? ?? true),
        priority: Value(row['priority'] as int? ?? 4),
        labelId: Value(row['labelId'] as String?),
        labelName: Value(snapshot?['name'] as String?),
        labelColor: Value(snapshot?['color'] as String?),
        // Written, never transitioned. The pulled row *is* the outcome of
        // whatever happened on the other device; re-running a completion here
        // would advance a repeating task's recurrence a second time.
        status: Value(row['status'] as String? ?? 'open'),
        completedAt: Value(_date(row['completedAt'])),
        recurrenceJson: Value(recurrence == null ? null : jsonEncode(recurrence)),
        estimatedMinutes: Value(row['estimatedMinutes'] as int?),
        deferCount: Value(row['deferCount'] as int? ?? 0),
        deferredFrom: Value(_date(row['deferredFrom'])),
        source: Value(row['source'] as String? ?? 'app'),
        createdAt: _date(row['createdAt']) ?? updatedAt,
        updatedAt: updatedAt,
        baseUpdatedAt: Value(updatedAt),
        deletedAt: Value(_date(row['deletedAt'])),
        pendingOp: const Value(null),
        pushAttempts: const Value(0),
      ),
    );
  }

  @override
  Future<void> sweep(AppDatabase db, Set<String> seen) async {
    await (db.delete(db.tasks)..where(
      (r) => r.pendingOp.isNull() & r.id.isNotIn(seen),
    )).go();
  }
}

class _ReminderApplier extends _EntityApplier {
  @override
  Future<List<_PendingRow>> pending(AppDatabase db, int cap) async {
    final rows = await (db.select(db.reminders)..where(
      (r) => r.pendingOp.isNotNull() & r.pushAttempts.isSmallerThanValue(cap),
    )).get();

    return [
      for (final row in rows)
        _PendingRow(row.id, {
          'op': row.pendingOp,
          'id': row.id,
          'updatedAt': row.updatedAt.toUtc().toIso8601String(),
          'baseUpdatedAt': row.baseUpdatedAt?.toUtc().toIso8601String(),
          'data': {
            'title': row.title,
            'remindAt': row.remindAt.toUtc().toIso8601String(),
            'leadTimes': decodeStringList(row.leadTimesJson),
            'status': row.status,
            'snoozedUntil': row.snoozedUntil?.toUtc().toIso8601String(),
            'source': row.source,
          },
        }),
    ];
  }

  @override
  Future<Set<String>> pendingIds(AppDatabase db) async {
    final rows = await (db.select(db.reminders)
          ..where((r) => r.pendingOp.isNotNull()))
        .get();
    return {for (final row in rows) row.id};
  }

  @override
  Future<Set<String>> blockedIds(AppDatabase db) async {
    final rows = await (db.select(db.reminders)..where(
      (r) =>
          r.pendingOp.isNotNull() &
          r.pushAttempts.isBiggerOrEqualValue(SyncEngine.maxPushAttempts),
    )).get();
    return {for (final row in rows) row.id};
  }

  @override
  Future<Set<String>> purgedAmong(AppDatabase db, Set<String> ids) async {
    if (ids.isEmpty) return const {};
    final rows = await (db.select(db.reminders)..where(
      (r) => r.id.isIn(ids) & r.pendingOp.equals(PendingOps.purge),
    )).get();
    return {for (final row in rows) row.id};
  }

  @override
  Future<void> clearPending(AppDatabase db, Set<String> ids) async {
    if (ids.isEmpty) return;
    await (db.update(db.reminders)..where((r) => r.id.isIn(ids))).write(
      const RemindersCompanion(pendingOp: Value(null), pushAttempts: Value(0)),
    );
  }

  @override
  Future<void> block(AppDatabase db, String id, int attempts) async {
    await (db.update(db.reminders)..where((r) => r.id.equals(id)))
        .write(RemindersCompanion(pushAttempts: Value(attempts)));
  }

  @override
  Future<void> hardDelete(AppDatabase db, Set<String> ids) async {
    if (ids.isEmpty) return;
    await (db.delete(db.reminders)..where((r) => r.id.isIn(ids))).go();
  }

  @override
  Future<void> writeServerRow(AppDatabase db, Map<String, dynamic> row) async {
    final updatedAt = _date(row['updatedAt']) ?? DateTime.now().toUtc();
    final remindAt = _date(row['remindAt']) ?? updatedAt;

    await db.into(db.reminders).insertOnConflictUpdate(
      RemindersCompanion.insert(
        id: row['id'] as String,
        title: row['title'] as String? ?? '',
        remindAt: remindAt,
        leadTimesJson: Value(
          jsonEncode((row['leadTimes'] as List? ?? const []).map((e) => '$e')
              .toList()),
        ),
        status: Value(row['status'] as String? ?? 'active'),
        snoozedUntil: Value(_date(row['snoozedUntil'])),
        source: Value(row['source'] as String? ?? 'app'),
        createdAt: _date(row['createdAt']) ?? updatedAt,
        updatedAt: updatedAt,
        baseUpdatedAt: Value(updatedAt),
        deletedAt: Value(_date(row['deletedAt'])),
        pendingOp: const Value(null),
        pushAttempts: const Value(0),
      ),
    );
  }

  @override
  Future<void> sweep(AppDatabase db, Set<String> seen) async {
    await (db.delete(db.reminders)..where(
      (r) => r.pendingOp.isNull() & r.id.isNotIn(seen),
    )).go();
  }
}

Map<String, dynamic> _map(Object? raw) =>
    raw is Map ? Map<String, dynamic>.from(raw) : const {};

/// An instant the server sent, or null.
///
/// Handed back as a plain [DateTime], which is what every column here holds:
/// this database stores date-times as ISO text, and a `tz.TZDateTime` written
/// to one appends its zone (`…+0300 +03:00`) so the row can be inserted and
/// never read back.
DateTime? _date(Object? value) {
  if (value is DateTime) return value;
  if (value is! String || value.isEmpty) return null;
  return DateTime.tryParse(value)?.toUtc();
}

Object? _decodeJson(String? encoded) {
  if (encoded == null || encoded.isEmpty) return null;
  try {
    return jsonDecode(encoded);
  } catch (_) {
    // A recurrence rule this device cannot parse is not worth failing a whole
    // sync over, and sending the raw string would be refused as `invalid`
    // for ever. Dropped, so the rest of the row still lands.
    return null;
  }
}
