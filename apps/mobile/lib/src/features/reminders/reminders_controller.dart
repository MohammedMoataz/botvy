import 'dart:convert';

import 'package:drift/drift.dart' show Value;
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:uuid/uuid.dart';

import '../../api/models.dart';
import '../../app_providers.dart';
import '../../db/database.dart';
import '../../sync/sync_service.dart';

const _uuid = Uuid();

class RemindersState {
  const RemindersState({
    this.items = const [],
    this.loading = false,
    this.error,
  });

  final List<Reminder> items;
  final bool loading;
  final String? error;

  RemindersState copyWith({
    List<Reminder>? items,
    bool? loading,
    String? error,
    bool clearError = false,
  }) =>
      RemindersState(
        items: items ?? this.items,
        loading: loading ?? this.loading,
        error: clearError ? null : (error ?? this.error),
      );
}

/// Reads the device's own database, never the network directly.
///
/// Every mutation is a local write plus a sync nudge, so the list updates
/// instantly, works with no connection, and the alarm is scheduled before the
/// gateway has heard about the reminder at all. Sync reconciles later.
class RemindersController extends AutoDisposeNotifier<RemindersState> {
  bool _disposed = false;

  @override
  RemindersState build() {
    ref.onDispose(() => _disposed = true);

    final db = ref.read(databaseProvider);
    final subscription = db.watchReminders().listen(_onRows);
    ref.onDispose(subscription.cancel);

    ref.read(syncServiceProvider).kick();
    return const RemindersState(loading: true);
  }

  AppDatabase get _db => ref.read(databaseProvider);
  SyncService get _sync => ref.read(syncServiceProvider);

  void _onRows(List<LocalReminder> rows) {
    if (_disposed) return;
    state = state.copyWith(
      items: sortReminders(rows.map(_toReminder).toList()),
      loading: false,
    );
  }

  /// Writes the reminder and its pings locally, then arms the alarms. The
  /// network is not on this path: offline, everything above still happens.
  Future<bool> create(String title, DateTime remindAt, {List<String>? leadTimes}) async {
    final trimmed = title.trim();
    if (trimmed.isEmpty || !remindAt.isAfter(DateTime.now())) return false;

    final offsets = leadTimes ?? await defaultLeadTimes(_db);
    final id = _uuid.v4();
    await _db.upsertReminder(RemindersCompanion.insert(
      id: id,
      clientId: Value(id),
      title: trimmed,
      remindAt: remindAt,
      leadTimes: Value(jsonEncode(offsets)),
      updatedAt: Value(DateTime.now()),
      pendingOp: const Value(ReminderOps.create),
    ));
    await _writePings(id, remindAt, offsets);
    await _armAndSync();
    return true;
  }

  Future<void> edit(
    String id, {
    String? title,
    DateTime? remindAt,
    List<String>? leadTimes,
  }) async {
    final existing = await _db.findReminder(id);
    if (existing == null) return;

    final newTime = remindAt ?? existing.remindAt;
    final offsets = leadTimes ?? _decode(existing.leadTimes);
    await _db.upsertReminder(RemindersCompanion.insert(
      id: id,
      clientId: Value(existing.clientId),
      title: title?.trim().isNotEmpty == true ? title!.trim() : existing.title,
      remindAt: newTime,
      status: Value(existing.status),
      leadTimes: Value(jsonEncode(offsets)),
      updatedAt: Value(DateTime.now()),
      // A row still waiting to be created must stay a create, or the update
      // would be sent for an id the gateway has never seen.
      pendingOp: Value(
        existing.pendingOp == ReminderOps.create ? ReminderOps.create : ReminderOps.update,
      ),
    ));
    await _writePings(id, newTime, offsets);
    await _armAndSync();
  }

  Future<void> setStatus(String id, String status) async {
    final existing = await _db.findReminder(id);
    if (existing == null) return;

    await _db.upsertReminder(RemindersCompanion.insert(
      id: id,
      clientId: Value(existing.clientId),
      title: existing.title,
      remindAt: existing.remindAt,
      status: Value(status),
      leadTimes: Value(existing.leadTimes),
      updatedAt: Value(DateTime.now()),
      pendingOp: Value(
        existing.pendingOp == ReminderOps.create ? ReminderOps.create : ReminderOps.update,
      ),
    ));
    // A finished reminder must stop ringing, immediately and locally.
    await _db.replacePings(id, const []);
    await _armAndSync();
  }

  Future<void> markDone(String id) => setStatus(id, 'done');

  Future<void> cancel(String id) => setStatus(id, 'cancelled');

  /// Permanent removal — how a finished reminder finally leaves the list.
  Future<void> remove(String id) async {
    final existing = await _db.findReminder(id);
    if (existing == null) return;

    if (existing.pendingOp == ReminderOps.create) {
      // Never reached the gateway, so there is nothing to delete there.
      await _db.deleteReminder(id);
    } else {
      await _db.upsertReminder(RemindersCompanion.insert(
        id: id,
        clientId: Value(existing.clientId),
        title: existing.title,
        remindAt: existing.remindAt,
        status: Value(existing.status),
        leadTimes: Value(existing.leadTimes),
        updatedAt: Value(DateTime.now()),
        pendingOp: const Value(ReminderOps.delete),
      ));
      await _db.replacePings(id, const []);
    }
    await _armAndSync();
  }

  Future<void> refresh() => _sync.sync();

  /// Clears the strike count so a rejected edit is attempted again.
  Future<void> retry(String id) async {
    await _db.resetPushAttempts(id);
    _sync.kick();
  }

  void clearError() {
    if (!_disposed) state = state.copyWith(clearError: true);
  }

  Future<void> _writePings(String id, DateTime remindAt, List<String> offsets) async {
    await _db.replacePings(id, [
      for (final ping in planPings(remindAt, offsets))
        ReminderPingsCompanion.insert(
          // Local ids until the server assigns its own; the alarm id is
          // derived from (reminderId, label), so this never reaches the OS.
          id: 'local:$id|${ping.label}',
          reminderId: id,
          notifyAt: ping.notifyAt,
          label: ping.label,
        ),
    ]);
  }

  Future<void> _armAndSync() async {
    await ref.read(notificationSchedulerProvider).rescheduleAll();
    _sync.kick();
  }

  static List<String> _decode(String encoded) {
    try {
      return (jsonDecode(encoded) as List).map((e) => e.toString()).toList();
    } catch (_) {
      return const ['1h', '0m'];
    }
  }

  Reminder _toReminder(LocalReminder row) => Reminder(
        id: row.id,
        title: row.title,
        remindAt: row.remindAt,
        status: row.status,
        leadTimes: _decode(row.leadTimes),
        clientId: row.clientId,
        updatedAt: row.updatedAt,
        pendingSync: row.pendingOp != null,
        syncFailed: row.pushAttempts >= AppDatabase.maxPushAttempts,
      );
}

/// The lead times new reminders get: the user's own if the gateway told us,
/// otherwise the server default. Nothing here is compiled in.
Future<List<String>> defaultLeadTimes(AppDatabase db) async {
  final raw = await db.getValue(SyncKeys.defaults);
  if (raw == null) return const ['1h', '0m'];
  try {
    final decoded = jsonDecode(raw) as Map<String, dynamic>;
    final leads = (decoded['leadTimes'] as List?)?.map((e) => e.toString()).toList();
    return (leads == null || leads.isEmpty) ? const ['1h', '0m'] : leads;
  } catch (_) {
    return const ['1h', '0m'];
  }
}

final remindersControllerProvider =
    NotifierProvider.autoDispose<RemindersController, RemindersState>(
        RemindersController.new);
