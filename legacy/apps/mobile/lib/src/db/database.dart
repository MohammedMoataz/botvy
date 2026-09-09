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

  /// Undo: the row is here, the server still thinks it is deleted.
  static const restore = 'restore';

  /// Erase it for good. The row is kept only until the gateway is told —
  /// deleting it locally first would let the next full snapshot, which still
  /// carries the server's tombstone, bring it back.
  static const purge = 'purge';
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

  /// Set when the reminder has been deleted. The row stays: it is what the
  /// Deleted view lists and what Restore undoes. Cleared on the server's
  /// horizon, when a full snapshot stops carrying it.
  DateTimeColumn get deletedAt => dateTime().nullable()();

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

/// What the phone did to a chat the server has not been told about.
///
/// Only two, unlike a reminder: the phone mints the id and the gateway takes it
/// verbatim, so a create and an edit are the same write on the wire.
class ConversationOps {
  static const upsert = 'upsert';
  static const delete = 'delete';

  /// Empty it, but keep it. The only way to empty the coaching chat, which
  /// cannot be deleted.
  static const clear = 'clear';
}

/// One named chat.
///
/// The user creates these and keeps a topic in its own thread. Two-way synced,
/// so the columns mirror [Reminders]: an edit time, the server's own timestamp
/// for the version last pulled, a pending operation and an attempt count.
@DataClassName('LocalConversation')
class Conversations extends Table {
  /// Minted by whichever side creates it, and the gateway accepts the phone's
  /// uuid as the row's own id. That is what lets a message name its chat the
  /// instant the user opens one, with no network and no create round trip.
  TextColumn get id => text()();

  /// Empty until the user renames it. The list shows the first message instead,
  /// so no auto-title is ever written and none can collide with a rename.
  TextColumn get title => text().withDefault(const Constant(''))();

  BoolColumn get pinned => boolean().withDefault(const Constant(false))();
  BoolColumn get archived => boolean().withDefault(const Constant(false))();

  /// True for the one chat the nightly check-in and program land in. It is also
  /// where a message with no chat of its own is shown.
  BoolColumn get isCoaching => boolean().withDefault(const Constant(false))();

  /// Newest activity, which is what the list is ordered by. Kept apart from
  /// [updatedAt]: that is an *edit* time and drives the outbox, so bumping it
  /// on every message would make every send look like a pending push.
  DateTimeColumn get lastMessageAt => dateTime().nullable()();

  DateTimeColumn get updatedAt => dateTime().nullable()();

  /// The server's own timestamp for the last version pulled, never written by a
  /// local edit — the same contract as [Reminders.baseUpdatedAt]. Null also
  /// means the server has never sent this row, which is how a local delete
  /// knows there is nothing to tell the gateway about.
  DateTimeColumn get baseUpdatedAt => dateTime().nullable()();

  /// Everything up to this server message id has been cleared. Rides the
  /// conversation row so a chat emptied on one device empties on all of them —
  /// messages carry no tombstone of their own.
  IntColumn get clearedUpToMessageId => integer().withDefault(const Constant(0))();

  TextColumn get pendingOp => text().nullable()();
  IntColumn get pushAttempts => integer().withDefault(const Constant(0))();

  @override
  Set<Column> get primaryKey => {id};
}

@DataClassName('LocalMessage')
class ChatMessages extends Table {
  IntColumn get localId => integer().autoIncrement()();
  IntColumn get serverId => integer().nullable().unique()();
  TextColumn get clientId => text().nullable().unique()();

  /// Null means "not known yet": a row cached before this app had chats, or one
  /// typed offline before its chat reached the gateway. A *synced* null is the
  /// signal that the whole cache predates chats — see [AppDatabase.hasLegacyMessages].
  TextColumn get conversationId => text().nullable()();

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
    Conversations,
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
  int get schemaVersion => 5;

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
          if (from < 3) {
            await m.createTable(conversations);
            // Nullable, and every existing row is left null on purpose.
            // Messages are immutable and pulled by `id > lastMessageId`, so the
            // chat the gateway backfills onto a row this device already holds
            // can never reach it — the cache has to be fetched again. Deleting
            // it here would leave a phone that upgraded on a plane with no
            // history at all. Instead a null chat on a synced row marks the row
            // as pre-chat, `hasLegacyMessages` makes the next pull start from
            // zero, and those rows are swept in the same transaction that
            // writes their replacements. Queued rows keep their null and are
            // never swept: the user's unsent words are not a cache.
            await m.addColumn(chatMessages, chatMessages.conversationId);
          }
          if (from < 4) {
            // Deleted reminders used to be removed from this table outright,
            // so there was nothing to undo. They stay now, hidden from the
            // list and shown in the Deleted view. Null for every existing row
            // is right: anything still here was not deleted.
            await m.addColumn(reminders, reminders.deletedAt);
          }
          // Only for a database whose conversations table predates the column.
          // `createTable` above builds it from *today's* definition, which
          // already has it, so an unconditional addColumn here fails with
          // "duplicate column" on every upgrade from before v3. Any table
          // created inside a migration has this trap.
          if (from >= 3 && from < 5) {
            // Zero for every existing chat, which is right: none has been
            // cleared, and server message ids start at 1.
            await m.addColumn(conversations, conversations.clearedUpToMessageId);
          }
        },
      );

  // ── Reminders ──────────────────────────────────────────────────────────────

  /// The reminders the user still has.
  ///
  /// Excludes tombstones, and also excludes one deleted offline whose delete
  /// has not been pushed yet — before this it stayed in the list until the sync
  /// landed, so deleting with no connection looked like it had failed.
  /// Note the shape of the pendingOp test: `pending_op != 'delete'` is NULL in
  /// SQL for a NULL column, which is falsy, so writing it that way would hide
  /// every reminder that has no pending operation at all — i.e. all of them.
  Stream<List<LocalReminder>> watchReminders() => (select(reminders)
        ..where((r) =>
            r.deletedAt.isNull() &
            (r.pendingOp.isNull() | r.pendingOp.equals(ReminderOps.delete).not()))
        ..orderBy([(r) => OrderingTerm(expression: r.remindAt)]))
      .watch();

  /// Recently deleted, newest first. What the undo view lists.
  ///
  /// A row deleted offline is here the moment the user taps delete, before the
  /// gateway has been told — the tombstone is local first, like every other
  /// edit.
  Stream<List<LocalReminder>> watchDeletedReminders() => (select(reminders)
        ..where((r) =>
            (r.deletedAt.isNotNull() | r.pendingOp.equals(ReminderOps.delete)) &
            // One on its way out for good is already gone as far as the user
            // is concerned; the row survives only until the gateway is told.
            (r.pendingOp.isNull() | r.pendingOp.equals(ReminderOps.purge).not()))
        ..orderBy([(r) => OrderingTerm.desc(r.updatedAt)]))
      .watch();

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

  /// Erases a reminder outright. For a row the gateway has purged or never
  /// had — an ordinary delete leaves a tombstone instead, so there is
  /// something to undo.
  Future<void> deleteReminder(String id) => transaction(() async {
        await (delete(reminderPings)..where((p) => p.reminderId.equals(id))).go();
        await (delete(reminders)..where((r) => r.id.equals(id))).go();
      });

  /// Marks a reminder deleted and silences it, keeping the row for the undo
  /// view. The pings go now: a deleted reminder must not ring while it waits
  /// to be either restored or purged.
  Future<void> tombstoneReminder(String id, DateTime at) => transaction(() async {
        await (delete(reminderPings)..where((p) => p.reminderId.equals(id))).go();
        await (update(reminders)..where((r) => r.id.equals(id)))
            .write(RemindersCompanion(deletedAt: Value(at)));
      });

  /// Lifts a local tombstone. The pings are re-planned by the caller, which
  /// knows whether the reminder can still ring.
  Future<void> untombstoneReminder(String id) =>
      (update(reminders)..where((r) => r.id.equals(id)))
          .write(const RemindersCompanion(deletedAt: Value(null)));

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

  // ── Conversations ──────────────────────────────────────────────────────────

  /// The chat list: pinned first, then newest activity.
  ///
  /// A chat deleted locally is already gone from the user's point of view even
  /// though its row survives until the gateway is told, so it is filtered out
  /// here. Note the parentheses around the pendingOp clause — Dart binds `&`
  /// tighter than `|`, and without them the archived test would apply to only
  /// half of it.
  ///
  /// Do not write `pendingOp.isNotValue(delete)`: in SQL `pending_op !=
  /// 'delete'` is NULL for a NULL column, which is falsy, so that expression
  /// hides every clean chat and shows nothing else.
  Stream<List<LocalConversation>> watchConversations({bool archived = false}) =>
      (select(conversations)
            ..where((c) =>
                c.archived.equals(archived) &
                (c.pendingOp.isNull() | c.pendingOp.equals(ConversationOps.upsert)))
            ..orderBy([
              (c) => OrderingTerm.desc(c.pinned),
              (c) => OrderingTerm.desc(c.lastMessageAt),
              (c) => OrderingTerm.desc(c.updatedAt),
            ]))
          .watch();

  Future<List<LocalConversation>> allConversations() => select(conversations).get();

  Future<LocalConversation?> findConversation(String id) =>
      (select(conversations)..where((c) => c.id.equals(id))).getSingleOrNull();

  Future<LocalConversation?> coachingConversation() =>
      (select(conversations)..where((c) => c.isCoaching.equals(true))).getSingleOrNull();

  Future<void> upsertConversation(ConversationsCompanion row) =>
      into(conversations).insertOnConflictUpdate(row);

  /// Chats the server has not accepted yet, oldest edit first. Same attempt
  /// ceiling as reminders, so one refused row cannot block the rest.
  Future<List<LocalConversation>> pendingConversations() => (select(conversations)
        ..where((c) =>
            c.pendingOp.isNotNull() & c.pushAttempts.isSmallerThanValue(maxPushAttempts))
        ..orderBy([(c) => OrderingTerm(expression: c.updatedAt)]))
      .get();

  Future<void> bumpConversationAttempts(String id) => customUpdate(
        'UPDATE conversations SET push_attempts = push_attempts + 1 WHERE id = ?',
        variables: [Variable.withString(id)],
        updates: {conversations},
      );

  Future<void> resetConversationAttempts(String id) =>
      (update(conversations)..where((c) => c.id.equals(id)))
          .write(const ConversationsCompanion(pushAttempts: Value(0)));

  /// A chat and everything said in it.
  ///
  /// Deleting the messages is the point: the chat is gone, so its contents must
  /// not stay in the cache. [keepTombstone] leaves the row behind carrying
  /// `pendingOp = delete`, which is the only way the gateway learns about a
  /// delete made offline.
  Future<void> deleteConversation(String id, {bool keepTombstone = false}) =>
      transaction(() async {
        await (delete(chatMessages)..where((m) => m.conversationId.equals(id))).go();
        if (keepTombstone) return;
        await (delete(conversations)..where((c) => c.id.equals(id))).go();
      });

  /// Drops this chat's messages at or below [upToMessageId], and anything in
  /// it the server has never seen.
  ///
  /// The second half matters: a message queued offline has no server id, so an
  /// id-bounded delete would leave it behind in a chat the user has just
  /// emptied. It is dropped here because clearing is a deliberate act, unlike
  /// the sync's own housekeeping.
  Future<void> clearConversationMessages(String id, {required int upToMessageId}) =>
      (delete(chatMessages)
            ..where((m) =>
                m.conversationId.equals(id) &
                (m.serverId.isNull() |
                    m.serverId.isSmallerOrEqualValue(upToMessageId))))
          .go();

  Future<void> bumpLastMessageAt(String id, DateTime when) =>
      (update(conversations)..where((c) => c.id.equals(id)))
          .write(ConversationsCompanion(lastMessageAt: Value(when)));

  // ── Chat ───────────────────────────────────────────────────────────────────

  Stream<List<LocalMessage>> watchMessages() =>
      (select(chatMessages)..orderBy([(m) => OrderingTerm(expression: m.composedAt)])).watch();

  /// One chat's messages, oldest first.
  ///
  /// [includeUnassigned] is set for the coaching chat and nowhere else. A
  /// message cached before this app knew about chats, or typed offline before
  /// its chat reached the gateway, has none — and the gateway files an
  /// unattributed message under coaching, so that is where the user is shown
  /// it. It is also what keeps a whole pre-upgrade history on screen until the
  /// re-pull redistributes it.
  Stream<List<LocalMessage>> watchConversationMessages(
    String conversationId, {
    bool includeUnassigned = false,
  }) =>
      (select(chatMessages)
            ..where((m) => includeUnassigned
                ? m.conversationId.equals(conversationId) | m.conversationId.isNull()
                : m.conversationId.equals(conversationId))
            ..orderBy([(m) => OrderingTerm(expression: m.composedAt)]))
          .watch();

  /// True while the cache still holds messages from before chats existed.
  ///
  /// Derived from the rows themselves rather than a flag, so there is no state
  /// to clear and nothing that can fall out of step with the data.
  Future<bool> hasLegacyMessages() async => (await (select(chatMessages)
            ..where((m) =>
                m.conversationId.isNull() & m.syncState.equals(SyncStates.synced))
            ..limit(1))
          .get())
      .isNotEmpty;

  /// Removes the pre-chat cache in one statement.
  ///
  /// Everything it deletes mirrors a server row that the same transaction is
  /// replacing with a chat-tagged copy. Deleting the whole set rather than just
  /// the page being applied is what makes the re-pull terminate: afterwards
  /// [hasLegacyMessages] is false and the watermark advances normally again.
  Future<int> deleteLegacyMessages() => (delete(chatMessages)
        ..where((m) =>
            m.conversationId.isNull() & m.syncState.equals(SyncStates.synced)))
      .go();

  /// The highest server id this device holds.
  ///
  /// An aggregate, not a table scan: the backfill walks the whole history 200
  /// rows at a time, and loading every row to find one number would make that
  /// quadratic.
  Future<int> highestMessageId() async {
    final max = chatMessages.serverId.max();
    final row = await (selectOnly(chatMessages)..addColumns([max])).getSingle();
    return row.read(max) ?? 0;
  }

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
    required String conversationId,
    required String role,
    required String content,
    required DateTime composedAt,
  }) async {
    if (clientId != null) {
      final updated = await (update(chatMessages)
            ..where((m) => m.clientId.equals(clientId)))
          .write(ChatMessagesCompanion(
        serverId: Value(serverId),
        // The chat has to be written here too, not only on the insert below:
        // this is the path every message this device composed offline takes,
        // and without it they would all stay filed under no chat forever.
        conversationId: Value(conversationId),
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
      conversationId: Value(conversationId),
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
        // Including the chat names: a title is the most legible thing in this
        // database, and it is written from the previous account's own words.
        await delete(conversations).go();
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
