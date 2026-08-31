import 'package:drift/drift.dart';
import 'package:drift_flutter/drift_flutter.dart';

part 'database.g.dart';

/// The device's own copy of the user's data.
///
/// Botvy is local-first: the phone schedules its own alarms from these tables,
/// so a reminder fires with no network, no server and no Google reachability.
/// Everything the user does offline is written here first and pushed later —
/// `pendingOp` on a reminder and `syncState` on a message *are* the outbox, so
/// there is no second table that could disagree with the rows it describes.

/// What the phone did to a reminder that the server has not been told about.
class ReminderOps {
  static const create = 'create';
  static const update = 'update';
  static const delete = 'delete';
}

/// Where a chat message is in its journey to the gateway.
class SyncStates {
  static const synced = 'synced';
  static const queued = 'queued';
  static const failed = 'failed';
}

@DataClassName('LocalReminder')
class Reminders extends Table {
  /// Server id once known; until then the clientId, so rows are stable across
  /// the create round-trip and local alarms do not have to be renumbered.
  TextColumn get id => text()();
  TextColumn get clientId => text().nullable()();
  TextColumn get title => text()();
  DateTimeColumn get remindAt => dateTime()();
  TextColumn get status => text().withDefault(const Constant('active'))();

  /// JSON array of offsets, e.g. ["1h","0m"].
  TextColumn get leadTimes => text().withDefault(const Constant('["1h","0m"]'))();
  DateTimeColumn get updatedAt => dateTime().nullable()();

  /// Null once the server agrees with this row.
  TextColumn get pendingOp => text().nullable()();

  @override
  Set<Column> get primaryKey => {id};
}

/// One scheduled ping. Mirrors the server's rows, and is computed locally for
/// a reminder created offline so it can be alarmed before it ever syncs.
@DataClassName('LocalPing')
class ReminderPings extends Table {
  TextColumn get id => text()();
  TextColumn get reminderId => text()();
  DateTimeColumn get notifyAt => dateTime()();
  TextColumn get label => text()();
  DateTimeColumn get sentAt => dateTime().nullable()();

  @override
  Set<Column> get primaryKey => {id};
}

@DataClassName('LocalMessage')
class ChatMessages extends Table {
  IntColumn get localId => integer().autoIncrement()();
  IntColumn get serverId => integer().nullable().unique()();
  TextColumn get clientId => text().nullable().unique()();
  TextColumn get role => text()();
  TextColumn get content => text()();
  DateTimeColumn get composedAt => dateTime()();
  TextColumn get syncState => text().withDefault(const Constant(SyncStates.synced))();
}

/// Small key/value bag: sync cursor, server defaults, timezone override.
/// A whole preferences package for four strings would be more moving parts.
class KeyValues extends Table {
  TextColumn get k => text()();
  TextColumn get v => text()();

  @override
  Set<Column> get primaryKey => {k};
}

@DriftDatabase(tables: [Reminders, ReminderPings, ChatMessages, KeyValues])
class AppDatabase extends _$AppDatabase {
  AppDatabase() : super(driftDatabase(name: 'botvy'));

  /// Test constructor: an in-memory database with no platform plugins.
  AppDatabase.forTesting(super.executor);

  @override
  int get schemaVersion => 1;

  // ── Reminders ──────────────────────────────────────────────────────────────

  Stream<List<LocalReminder>> watchReminders() =>
      (select(reminders)..orderBy([(r) => OrderingTerm(expression: r.remindAt)])).watch();

  Future<List<LocalReminder>> allReminders() => select(reminders).get();

  Future<List<LocalReminder>> pendingReminders() =>
      (select(reminders)..where((r) => r.pendingOp.isNotNull())).get();

  Future<void> upsertReminder(RemindersCompanion row) =>
      into(reminders).insertOnConflictUpdate(row);

  Future<void> deleteReminder(String id) => transaction(() async {
        await (delete(reminderPings)..where((p) => p.reminderId.equals(id))).go();
        await (delete(reminders)..where((r) => r.id.equals(id))).go();
      });

  /// Replaces a reminder's pings wholesale — the only safe way to re-plan,
  /// since a changed time invalidates every row derived from the old one.
  Future<void> replacePings(String reminderId, List<ReminderPingsCompanion> rows) =>
      transaction(() async {
        await (delete(reminderPings)..where((p) => p.reminderId.equals(reminderId))).go();
        for (final row in rows) {
          await into(reminderPings).insertOnConflictUpdate(row);
        }
      });

  /// Pings still to fire, soonest first: exactly what gets scheduled.
  Future<List<LocalPing>> upcomingPings(DateTime after) {
    final query = select(reminderPings).join([
      innerJoin(reminders, reminders.id.equalsExp(reminderPings.reminderId)),
    ])
      ..where(reminderPings.sentAt.isNull() &
          reminderPings.notifyAt.isBiggerThanValue(after) &
          reminders.status.equals('active'))
      ..orderBy([OrderingTerm(expression: reminderPings.notifyAt)]);
    return query.map((row) => row.readTable(reminderPings)).get();
  }

  Future<LocalReminder?> findReminder(String id) =>
      (select(reminders)..where((r) => r.id.equals(id))).getSingleOrNull();

  // ── Chat ───────────────────────────────────────────────────────────────────

  Stream<List<LocalMessage>> watchMessages() =>
      (select(chatMessages)..orderBy([(m) => OrderingTerm(expression: m.composedAt)])).watch();

  Future<List<LocalMessage>> outbox() => (select(chatMessages)
        ..where((m) => m.syncState.isNotValue(SyncStates.synced))
        ..orderBy([(m) => OrderingTerm(expression: m.composedAt)]))
      .get();

  Future<int> insertMessage(ChatMessagesCompanion row) =>
      into(chatMessages).insert(row, mode: InsertMode.insertOrReplace);

  /// Stores a message the gateway returned.
  ///
  /// A message this device composed comes back carrying the same clientId, so
  /// it is matched to the row already here rather than inserted a second time
  /// — the server id and the local draft are the same message.
  Future<void> upsertServerMessage({
    required int serverId,
    String? clientId,
    required String role,
    required String content,
    required DateTime composedAt,
  }) async {
    if (clientId != null) {
      final updated = await (update(chatMessages)
            ..where((m) => m.clientId.equals(clientId)))
          .write(ChatMessagesCompanion(
        serverId: Value(serverId),
        content: Value(content),
        syncState: const Value(SyncStates.synced),
      ));
      if (updated > 0) return;
    }

    final existing = await (select(chatMessages)
          ..where((m) => m.serverId.equals(serverId)))
        .getSingleOrNull();
    if (existing != null) return;

    await into(chatMessages).insert(ChatMessagesCompanion.insert(
      serverId: Value(serverId),
      clientId: Value(clientId),
      role: role,
      content: content,
      composedAt: composedAt,
    ));
  }

  Future<void> markSynced(String clientId) =>
      (update(chatMessages)..where((m) => m.clientId.equals(clientId)))
          .write(const ChatMessagesCompanion(syncState: Value(SyncStates.synced)));

  // ── Key/value ──────────────────────────────────────────────────────────────

  Future<String?> getValue(String key) async {
    final row = await (select(keyValues)..where((r) => r.k.equals(key))).getSingleOrNull();
    return row?.v;
  }

  Future<void> setValue(String key, String value) =>
      into(keyValues).insertOnConflictUpdate(KeyValuesCompanion.insert(k: key, v: value));

  /// Signing out must leave nothing behind: this data is one account's.
  Future<void> wipe() => transaction(() async {
        await delete(reminderPings).go();
        await delete(reminders).go();
        await delete(chatMessages).go();
        await delete(keyValues).go();
      });
}
