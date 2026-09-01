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

  /// When this device last changed the row. Drives outbox ordering and the
  /// newest-wins comparison.
  DateTimeColumn get updatedAt => dateTime().nullable()();

  /// The server's own `updatedAt` for the last version this device pulled —
  /// deliberately *not* the same thing as [updatedAt], and never written by a
  /// local edit.
  ///
  /// The gateway accepts a push outright when this still matches its row,
  /// which is the ordinary case and consults no clock at all. Sending the
  /// local edit time here instead would never match, so every offline edit
  /// would fall through to a clock comparison and a handset running slow
  /// would lose all of them.
  DateTimeColumn get baseUpdatedAt => dateTime().nullable()();

  /// Null once the server agrees with this row.
  TextColumn get pendingOp => text().nullable()();

  /// How many times the server has refused this row. A rejected edit keeps its
  /// `pendingOp` forever rather than being discarded, but stops being re-sent
  /// after a few tries so one poisoned row cannot block the whole outbox.
  IntColumn get pushAttempts => integer().withDefault(const Constant(0))();

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

/// The user's coaching settings, as one row with id 0.
///
/// A table rather than a JSON blob in [KeyValues] because these fields are
/// edited offline: they need a dirty flag and an edit time, and the settings
/// screen reads them directly. The previous cached blob had no reader at all.
@DataClassName('LocalProfile')
class CoachingProfiles extends Table {
  IntColumn get id => integer().withDefault(const Constant(0))();

  // ── the fields the phone may change ──
  BoolColumn get optedIn => boolean().withDefault(const Constant(false))();
  TextColumn get timezone => text().withDefault(const Constant('UTC'))();

  /// JSON arrays, matching how [Reminders.leadTimes] already stores a list.
  TextColumn get trainingDays => text().withDefault(const Constant('[]'))();
  TextColumn get allergies => text().withDefault(const Constant('[]'))();
  TextColumn get gymTime => text().nullable()();
  TextColumn get checkinTime => text().nullable()();
  TextColumn get programTime => text().nullable()();
  TextColumn get language => text().nullable()();

  // ── the server's, pulled and displayed but never pushed ──
  BoolColumn get awaitingCheckin => boolean().withDefault(const Constant(false))();
  DateTimeColumn get awaitingSince => dateTime().nullable()();

  /// True while this device holds an edit the server has not accepted yet.
  BoolColumn get dirty => boolean().withDefault(const Constant(false))();
  DateTimeColumn get updatedAt => dateTime().nullable()();

  @override
  Set<Column> get primaryKey => {id};
}

/// One evening's answer. Pull-only: check-ins are recorded server-side when the
/// reply is classified, so the phone never authors one.
@DataClassName('LocalCheckin')
class Checkins extends Table {
  /// The server's own unique key, so an upsert is idempotent without an id.
  TextColumn get checkinDate => text()();
  BoolColumn get adhered => boolean()();
  TextColumn get rawReply => text().nullable()();
  DateTimeColumn get createdAt => dateTime()();

  @override
  Set<Column> get primaryKey => {checkinDate};
}

/// A day's training, either reported by the user or generated as a plan.
@DataClassName('LocalWorkout')
class WorkoutRecords extends Table {
  TextColumn get workoutDate => text()();
  TextColumn get source => text()(); // 'reported' | 'planned'
  TextColumn get exercises => text().withDefault(const Constant('[]'))();
  TextColumn get muscleGroups => text().withDefault(const Constant('[]'))();
  TextColumn get notes => text().nullable()();
  DateTimeColumn get createdAt => dateTime()();

  @override
  Set<Column> get primaryKey => {workoutDate};
}

/// Small key/value bag: sync cursor, server defaults, install id.
/// A whole preferences package for four strings would be more moving parts.
class KeyValues extends Table {
  TextColumn get k => text()();
  TextColumn get v => text()();

  @override
  Set<Column> get primaryKey => {k};
}

@DriftDatabase(
  tables: [
    Reminders,
    ReminderPings,
    ChatMessages,
    KeyValues,
    CoachingProfiles,
    Checkins,
    WorkoutRecords,
  ],
)
class AppDatabase extends _$AppDatabase {
  AppDatabase() : super(driftDatabase(name: 'botvy'));

  /// Test constructor: an in-memory database with no platform plugins.
  AppDatabase.forTesting(super.executor);

  @override
  int get schemaVersion => 2;

  /// Without this, drift's default `onUpgrade` throws and every existing
  /// install fails to open the moment the version moves. v1 → v2 only adds, so
  /// nothing is rebuilt and no row is at risk: the reminders, their pending
  /// operations and the queued messages all survive untouched, and the first
  /// sync afterwards has no cursor and so fills the new tables from a full
  /// snapshot.
  @override
  MigrationStrategy get migration => MigrationStrategy(
        onCreate: (m) => m.createAll(),
        onUpgrade: (m, from, to) async {
          if (from < 2) {
            await m.createTable(coachingProfiles);
            await m.createTable(checkins);
            await m.createTable(workoutRecords);
            await m.addColumn(reminders, reminders.pushAttempts);
            // Null on an existing row: it has never been reconciled against a
            // server timestamp, so the first push falls back to the clock
            // comparison and the first pull fills it in.
            await m.addColumn(reminders, reminders.baseUpdatedAt);
            // The blob these tables replace. It never had a reader, but it is
            // still one account's preferences sitting in a row nothing owns.
            await (delete(keyValues)..where((r) => r.k.equals('coachingProfile'))).go();
          }
        },
      );

  // ── Reminders ──────────────────────────────────────────────────────────────

  Stream<List<LocalReminder>> watchReminders() =>
      (select(reminders)..orderBy([(r) => OrderingTerm(expression: r.remindAt)])).watch();

  Future<List<LocalReminder>> allReminders() => select(reminders).get();

  /// The outbox: rows the server has not accepted yet.
  ///
  /// Oldest edit first, so a create is pushed before the update that follows
  /// it. A row the server keeps refusing drops out after [maxPushAttempts] and
  /// stops blocking the queue, but keeps its `pendingOp` — the user's edit is
  /// never silently thrown away, and the tile offers a retry.
  Future<List<LocalReminder>> pendingReminders() => (select(reminders)
        ..where((r) =>
            r.pendingOp.isNotNull() & r.pushAttempts.isSmallerThanValue(maxPushAttempts))
        ..orderBy([(r) => OrderingTerm(expression: r.updatedAt)]))
      .get();

  static const maxPushAttempts = 5;

  Future<void> bumpPushAttempts(String id) =>
      customUpdate(
        'UPDATE reminders SET push_attempts = push_attempts + 1 WHERE id = ?',
        variables: [Variable.withString(id)],
        updates: {reminders},
      );

  Future<void> resetPushAttempts(String id) =>
      (update(reminders)..where((r) => r.id.equals(id)))
          .write(const RemindersCompanion(pushAttempts: Value(0)));

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

  /// Messages waiting to be delivered.
  ///
  /// Only rows the batch endpoint can actually accept: it takes the user's own
  /// turns, keyed by client id. A queued assistant row or one with no id could
  /// never be sent, and used to sit here forever rebuilding the same payload.
  Future<List<LocalMessage>> outbox() => (select(chatMessages)
        ..where((m) =>
            m.syncState.isNotValue(SyncStates.synced) &
            m.role.equals('user') &
            m.clientId.isNotNull())
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
        // Including the history: signing out must not leave the previous
        // account's check-ins and programs readable on the device.
        await delete(coachingProfiles).go();
        await delete(checkins).go();
        await delete(workoutRecords).go();
      });

  // ── Coaching profile ───────────────────────────────────────────────────────

  Stream<LocalProfile?> watchProfile() =>
      (select(coachingProfiles)..where((p) => p.id.equals(0))).watchSingleOrNull();

  Future<LocalProfile?> profile() =>
      (select(coachingProfiles)..where((p) => p.id.equals(0))).getSingleOrNull();

  Future<void> writeProfile(CoachingProfilesCompanion row) =>
      into(coachingProfiles).insertOnConflictUpdate(row.copyWith(id: const Value(0)));

  // ── History (pull-only) ────────────────────────────────────────────────────

  Future<void> upsertCheckin(CheckinsCompanion row) =>
      into(checkins).insertOnConflictUpdate(row);

  Future<List<LocalCheckin>> recentCheckins({int limit = 60}) => (select(checkins)
        ..orderBy([(c) => OrderingTerm.desc(c.checkinDate)])
        ..limit(limit))
      .get();

  Future<void> upsertWorkout(WorkoutRecordsCompanion row) =>
      into(workoutRecords).insertOnConflictUpdate(row);

  Future<List<LocalWorkout>> recentWorkouts({int limit = 30}) => (select(workoutRecords)
        ..orderBy([(w) => OrderingTerm.desc(w.workoutDate)])
        ..limit(limit))
      .get();
}
