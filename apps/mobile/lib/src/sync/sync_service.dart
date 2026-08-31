import 'dart:async';
import 'dart:convert';

import 'package:connectivity_plus/connectivity_plus.dart';
import 'package:drift/drift.dart';
import 'package:flutter/foundation.dart';
import 'package:uuid/uuid.dart';

import '../api/api_client.dart';
import '../api/models.dart';
import '../db/database.dart';
import '../notifications/local_notifications.dart';

const _uuid = Uuid();

/// Keys in the local key/value table.
class SyncKeys {
  static const lastSyncAt = 'lastSyncAt';
  static const defaults = 'serverDefaults';
  static const profile = 'coachingProfile';
  static const installId = 'installId';
}

/// Reconciles the device with the gateway.
///
/// The rules are deliberately blunt, because a personal assistant used by one
/// person on one phone does not need merge semantics:
///   * local changes go up first, oldest first;
///   * then the server's list replaces the local one, except for rows still
///     waiting to be pushed;
///   * then every upcoming alarm is re-scheduled from what the database now
///     says.
///
/// The last step runs even when the network steps failed — that is what makes
/// a reminder created in airplane mode still fire on time.
class SyncService {
  SyncService(this._api, this._db, this._scheduler);

  final ApiClient _api;
  final AppDatabase _db;
  final NotificationScheduler _scheduler;

  Future<void>? _inFlight;
  bool _again = false;
  StreamSubscription<List<ConnectivityResult>>? _connectivity;

  /// Re-syncs whenever the network comes back. Nothing else watches for it, so
  /// without this an outbox could sit full while the phone is online.
  void watchConnectivity() {
    _connectivity ??= Connectivity().onConnectivityChanged.listen((results) {
      final online = results.any((r) => r != ConnectivityResult.none);
      if (online) unawaited(sync());
    });
  }

  void dispose() {
    _connectivity?.cancel();
    _connectivity = null;
  }

  /// Fire-and-forget trigger for callers that must not wait (UI mutations).
  void kick() => unawaited(sync());

  /// Runs one pass. Concurrent callers await the pass already running, and a
  /// request that arrives mid-pass schedules exactly one more — so a burst of
  /// edits cannot start a stampede of syncs.
  Future<void> sync() {
    if (_inFlight != null) {
      _again = true;
      return _inFlight!;
    }
    final run = _run().whenComplete(() {
      _inFlight = null;
      if (_again) {
        _again = false;
        kick();
      }
    });
    _inFlight = run;
    return run;
  }

  Future<void> _run() async {
    var online = true;
    try {
      await _pushReminders();
      await _pushMessages();
      await _pullReminders();
      await _pullChat();
      await _pullSettings();
      await _touchDevice();
      await _db.setValue(SyncKeys.lastSyncAt, DateTime.now().toIso8601String());
    } catch (e) {
      // Offline is the normal case here, not an error worth surfacing: the
      // next trigger picks up where this left off.
      online = false;
      debugPrint('sync deferred: $e');
    }

    // Always, online or not — the alarms are the product.
    await _scheduler.rescheduleAll();
    if (!online) return;
  }

  // ── push ───────────────────────────────────────────────────────────────────

  Future<void> _pushReminders() async {
    for (final row in await _db.pendingReminders()) {
      final leadTimes = _decodeLeadTimes(row.leadTimes);
      switch (row.pendingOp) {
        case ReminderOps.create:
          final created = await _api.createReminder(
            title: row.title,
            remindAt: row.remindAt,
            leadTimes: leadTimes,
            clientId: row.clientId ?? row.id,
          );
          // The server's id replaces the local one, and its ping rows replace
          // the ones computed on the device.
          await _db.deleteReminder(row.id);
          await _writeServerReminder(created);
        case ReminderOps.update:
          try {
            final updated = await _api.updateReminder(
              row.id,
              title: row.title,
              remindAt: row.remindAt,
              leadTimes: leadTimes,
              status: row.status,
            );
            await _writeServerReminder(updated);
          } on ApiException catch (e) {
            if (e.statusCode != 404) rethrow;
            await _db.deleteReminder(row.id); // deleted elsewhere; drop it
          }
        case ReminderOps.delete:
          try {
            await _api.deleteReminder(row.id);
          } on ApiException catch (e) {
            if (e.statusCode != 404) rethrow; // already gone is success
          }
          await _db.deleteReminder(row.id);
      }
    }
  }

  Future<void> _pushMessages() async {
    final queued = await _db.outbox();
    if (queued.isEmpty) return;

    final result = await _api.sendQueued([
      for (final m in queued.where((m) => m.role == 'user' && m.clientId != null))
        QueuedMessage(clientId: m.clientId!, text: m.content, composedAt: m.composedAt),
    ]);

    for (final m in queued) {
      if (m.clientId != null) await _db.markSynced(m.clientId!);
    }
    // The reply is not inserted here: the history pull that follows brings it
    // back with its server id. Writing it now would leave a copy with no id
    // for that pull to duplicate.
    if (result.processed > 0) debugPrint('flushed ${result.processed} queued message(s)');
  }

  // ── pull ───────────────────────────────────────────────────────────────────

  /// Full snapshot rather than a delta cursor: a person owns tens of
  /// reminders, and replacing the list makes a deletion propagate for free.
  Future<void> _pullReminders() async {
    final server = await _api.reminders();
    final pending = {for (final r in await _db.pendingReminders()) r.id};
    final seen = <String>{};

    for (final r in server) {
      seen.add(r.id);
      if (pending.contains(r.id)) continue; // local edit wins until it is pushed
      await _writeServerReminder(r);
    }

    for (final local in await _db.allReminders()) {
      if (seen.contains(local.id)) continue;
      if (local.pendingOp != null) continue; // never pushed yet — keep it
      await _db.deleteReminder(local.id);
    }
  }

  Future<void> _pullChat() async {
    final history = await _api.history();
    for (final m in history) {
      if (m.id == null) continue;
      await _db.upsertServerMessage(
        serverId: m.id!,
        clientId: m.clientId,
        role: m.role,
        content: m.content,
        composedAt: m.createdAt ?? DateTime.now(),
      );
    }
  }

  Future<void> _pullSettings() async {
    final defaults = await _api.defaults();
    await _db.setValue(
      SyncKeys.defaults,
      jsonEncode({
        'timezone': defaults.timezone,
        'leadTimes': defaults.leadTimes,
        'checkinTime': defaults.checkinTime,
        'programTime': defaults.programTime,
      }),
    );

    // The gateway resolves "8pm" against the profile timezone, so a phone that
    // has travelled must say so or every reminder lands in the old zone.
    final profile = await _api.coachingProfile();
    final device = await deviceTimezone();
    if (profile == null || profile.timezone != device) {
      await _api.updateCoachingProfile({'timezone': device});
    }
    await _db.setValue(
      SyncKeys.profile,
      jsonEncode({
        'optedIn': profile?.optedIn ?? false,
        'timezone': device,
        'trainingDays': profile?.trainingDays ?? const [],
        'allergies': profile?.allergies ?? const [],
        'gymTime': profile?.gymTime,
        'checkinTime': profile?.checkinTime,
        'programTime': profile?.programTime,
        'language': profile?.language,
      }),
    );
  }

  /// Re-registering refreshes `lastSeenAt`, which is how the gateway knows this
  /// phone already holds the upcoming alarms and can skip pushing them.
  Future<void> _touchDevice() async {
    final installId = await stableInstallId(_db);
    await _api.registerDevice(
      installId: installId,
      platform: defaultTargetPlatform.name,
      fcmToken: await _db.getValue('fcmToken'),
    );
  }

  // ── helpers ────────────────────────────────────────────────────────────────

  Future<void> _writeServerReminder(Reminder r) async {
    await _db.upsertReminder(RemindersCompanion.insert(
      id: r.id,
      clientId: Value(r.clientId),
      title: r.title,
      remindAt: r.remindAt,
      status: Value(r.status),
      leadTimes: Value(jsonEncode(r.leadTimes)),
      updatedAt: Value(r.updatedAt),
      pendingOp: const Value(null),
    ));
    await _db.replacePings(r.id, [
      for (final n in r.notifications)
        ReminderPingsCompanion.insert(
          id: n.id,
          reminderId: r.id,
          notifyAt: n.notifyAt,
          label: n.label,
          sentAt: Value(n.sentAt),
        ),
    ]);
  }
}

List<String> _decodeLeadTimes(String encoded) {
  try {
    return (jsonDecode(encoded) as List).map((e) => e.toString()).toList();
  } catch (_) {
    return const ['1h', '0m'];
  }
}

/// A per-installation id, generated once and kept. Deliberately survives sign
/// out: it identifies the device, not the account.
Future<String> stableInstallId(AppDatabase db) async {
  final existing = await db.getValue(SyncKeys.installId);
  if (existing != null && existing.isNotEmpty) return existing;
  final fresh = _uuid.v4();
  await db.setValue(SyncKeys.installId, fresh);
  return fresh;
}

/// Expands lead times the way the gateway does, so a reminder created offline
/// is alarmed immediately instead of waiting for its first sync.
///
/// Mirrors `planNotifications` in the gateway: an offset already in the past is
/// dropped, except the at-the-moment one, which always survives.
List<({DateTime notifyAt, String label})> planPings(
  DateTime remindAt,
  List<String> leadTimes, {
  DateTime? now,
}) {
  final notBefore = now ?? DateTime.now();
  final planned = <({DateTime notifyAt, String label})>[];
  final seen = <String>{};

  for (final offset in leadTimes) {
    final match = RegExp(r'^(\d+)(m|h|d)$').firstMatch(offset.trim());
    if (match == null) continue;
    final value = int.parse(match.group(1)!);
    final unit = match.group(2)!;
    final ms = value *
        switch (unit) {
          'm' => 60 * 1000,
          'h' => 60 * 60 * 1000,
          _ => 24 * 60 * 60 * 1000,
        };

    final label = value == 0
        ? 'now'
        : '$value ${switch (unit) { 'm' => 'minute', 'h' => 'hour', _ => 'day' }}'
            '${value == 1 ? '' : 's'} before';
    if (!seen.add(label)) continue;

    final notifyAt = remindAt.subtract(Duration(milliseconds: ms));
    if (ms != 0 && notifyAt.isBefore(notBefore)) continue;
    planned.add((notifyAt: notifyAt, label: label));
  }

  planned.sort((a, b) => a.notifyAt.compareTo(b.notifyAt));
  return planned;
}
