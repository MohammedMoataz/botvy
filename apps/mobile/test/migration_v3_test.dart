import 'package:botvy/src/db/database.dart';
import 'package:drift/native.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:sqlite3/sqlite3.dart';

/// The v2 → v3 upgrade, run against a database shaped like the shipped v0.3.0.
///
/// The rule this file exists to defend: **a message already on the phone is not
/// deleted by the migration.** It is tempting — the rows are pure cache and
/// they have to be fetched again to learn which chat they belong to — but doing
/// it here would mean a phone that upgraded with no signal opens to an empty
/// app, in an app whose whole point is working without one. They are swept
/// later, inside the transaction that writes their replacements.
const _v2Schema = [
  '''
  CREATE TABLE reminders (
    id TEXT NOT NULL,
    client_id TEXT NULL,
    title TEXT NOT NULL,
    remind_at INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'active',
    lead_times TEXT NOT NULL DEFAULT '["1h","0m"]',
    updated_at INTEGER NULL,
    base_updated_at INTEGER NULL,
    pending_op TEXT NULL,
    push_attempts INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (id)
  )''',
  '''
  CREATE TABLE reminder_pings (
    id TEXT NOT NULL,
    reminder_id TEXT NOT NULL,
    notify_at INTEGER NOT NULL,
    label TEXT NOT NULL,
    sent_at INTEGER NULL,
    PRIMARY KEY (id)
  )''',
  '''
  CREATE TABLE chat_messages (
    local_id INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    server_id INTEGER NULL UNIQUE,
    client_id TEXT NULL UNIQUE,
    role TEXT NOT NULL,
    content TEXT NOT NULL,
    composed_at INTEGER NOT NULL,
    sync_state TEXT NOT NULL DEFAULT 'synced'
  )''',
  '''
  CREATE TABLE key_values (
    k TEXT NOT NULL,
    v TEXT NOT NULL,
    PRIMARY KEY (k)
  )''',
  '''
  CREATE TABLE coaching_profiles (
    id INTEGER NOT NULL DEFAULT 0,
    opted_in INTEGER NOT NULL DEFAULT 0,
    timezone TEXT NOT NULL DEFAULT 'UTC',
    training_days TEXT NOT NULL DEFAULT '[]',
    allergies TEXT NOT NULL DEFAULT '[]',
    gym_time TEXT NULL,
    checkin_time TEXT NULL,
    program_time TEXT NULL,
    language TEXT NULL,
    awaiting_checkin INTEGER NOT NULL DEFAULT 0,
    awaiting_since INTEGER NULL,
    dirty INTEGER NOT NULL DEFAULT 0,
    updated_at INTEGER NULL,
    PRIMARY KEY (id)
  )''',
  '''
  CREATE TABLE checkins (
    checkin_date TEXT NOT NULL,
    adhered INTEGER NOT NULL,
    raw_reply TEXT NULL,
    created_at INTEGER NOT NULL,
    PRIMARY KEY (checkin_date)
  )''',
  '''
  CREATE TABLE workout_records (
    workout_date TEXT NOT NULL,
    source TEXT NOT NULL,
    exercises TEXT NOT NULL DEFAULT '[]',
    muscle_groups TEXT NOT NULL DEFAULT '[]',
    notes TEXT NULL,
    created_at INTEGER NOT NULL,
    PRIMARY KEY (workout_date)
  )''',
];

AppDatabase _openV2WithData() {
  final raw = sqlite3.openInMemory();
  for (final statement in _v2Schema) {
    raw.execute(statement);
  }
  raw.execute('PRAGMA user_version = 2');

  raw.execute('''
    INSERT INTO reminders (id, client_id, title, remind_at, status, lead_times, pending_op)
    VALUES ('r1', 'r1', 'Dentist', 1788000000000, 'active', '["1h","0m"]', 'create')''');
  // History the gateway already has, cached here with no chat.
  raw.execute('''
    INSERT INTO chat_messages (server_id, role, content, composed_at, sync_state)
    VALUES (11, 'user', 'from before chats', 1788000000000, 'synced')''');
  raw.execute('''
    INSERT INTO chat_messages (server_id, role, content, composed_at, sync_state)
    VALUES (12, 'assistant', 'a reply', 1788000001000, 'synced')''');
  // Typed with no signal and never sent. This exists nowhere else.
  raw.execute('''
    INSERT INTO chat_messages (client_id, role, content, composed_at, sync_state)
    VALUES ('c1', 'user', 'typed on a plane', 1788000002000, 'queued')''');

  return AppDatabase.forTesting(NativeDatabase.opened(raw));
}

void main() {
  late AppDatabase db;

  setUp(() => db = _openV2WithData());
  tearDown(() => db.close());

  test('does NOT delete the cached history', () async {
    // If this ever fails, someone moved the sweep into the migration and a
    // phone that upgrades offline now opens to nothing.
    final rows = await db.watchMessages().first;
    expect(rows, hasLength(3));
  });

  test('marks the cache as predating chats, without a flag to maintain', () async {
    expect(await db.hasLegacyMessages(), isTrue);
    for (final row in await db.watchMessages().first) {
      expect(row.conversationId, isNull);
    }
  });

  test('keeps an unsent message queued and addressable', () async {
    final queued = await db.outbox();
    expect(queued.map((m) => m.clientId), ['c1']);
    expect(queued.single.conversationId, isNull);
  });

  test('creates the chat table, empty', () async {
    expect(await db.allConversations(), isEmpty);
  });

  test('keeps the pending reminder and its operation', () async {
    final rows = await db.allReminders();
    expect(rows.single.pendingOp, ReminderOps.create);
  });

  test('reports the new schema version', () async {
    await db.allConversations(); // force the migration to run
    expect(db.schemaVersion, 4);
  });

  test('an existing reminder is not mistaken for a deleted one', () async {
    // The deleted column is new; every row that predates it was, by
    // definition, not deleted — anything that had been was erased outright.
    expect((await db.allReminders()).single.deletedAt, isNull);
    expect((await db.watchReminders().first).map((r) => r.id), ['r1']);
  });

  test('the sweep clears only the cache, never the outbox', () async {
    final removed = await db.deleteLegacyMessages();

    expect(removed, 2);
    final left = await db.watchMessages().first;
    expect(left.map((m) => m.content), ['typed on a plane']);
    // With nothing unfiled left, the next sync asks from the watermark again
    // rather than re-fetching the world for ever.
    expect(await db.hasLegacyMessages(), isFalse);
  });

  test('signing out takes the chat names too', () async {
    await db.upsertConversation(ConversationsCompanion.insert(id: 'chat-1'));
    await db.wipe();

    expect(await db.allConversations(), isEmpty);
    expect(await db.watchMessages().first, isEmpty);
  });
}
