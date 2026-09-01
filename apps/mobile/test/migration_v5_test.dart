import 'package:botvy/src/db/database.dart';
import 'package:drift/native.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:sqlite3/sqlite3.dart';

/// The v4 → v5 upgrade.
///
/// This one exists because it broke: the v3 step calls `createTable` for
/// conversations, which builds it from *today's* definition — already carrying
/// `cleared_up_to_message_id` — so an unconditional `addColumn` at v5 fails
/// with "duplicate column" for anyone upgrading from before v3. The column is
/// only added for a database whose table predates it, and this fixture is the
/// one that takes that branch.
const _v4Conversations = '''
  CREATE TABLE conversations (
    id TEXT NOT NULL,
    title TEXT NOT NULL DEFAULT '',
    pinned INTEGER NOT NULL DEFAULT 0,
    archived INTEGER NOT NULL DEFAULT 0,
    is_coaching INTEGER NOT NULL DEFAULT 0,
    last_message_at INTEGER NULL,
    updated_at INTEGER NULL,
    base_updated_at INTEGER NULL,
    pending_op TEXT NULL,
    push_attempts INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (id)
  )''';

const _v4Rest = [
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
    deleted_at INTEGER NULL,
    pending_op TEXT NULL,
    push_attempts INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (id)
  )''',
  '''
  CREATE TABLE reminder_pings (
    id TEXT NOT NULL, reminder_id TEXT NOT NULL, notify_at INTEGER NOT NULL,
    label TEXT NOT NULL, sent_at INTEGER NULL, PRIMARY KEY (id)
  )''',
  '''
  CREATE TABLE chat_messages (
    local_id INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    server_id INTEGER NULL UNIQUE, client_id TEXT NULL UNIQUE,
    conversation_id TEXT NULL, role TEXT NOT NULL, content TEXT NOT NULL,
    composed_at INTEGER NOT NULL, sync_state TEXT NOT NULL DEFAULT 'synced'
  )''',
  '''CREATE TABLE key_values (k TEXT NOT NULL, v TEXT NOT NULL, PRIMARY KEY (k))''',
  '''
  CREATE TABLE coaching_profiles (
    id INTEGER NOT NULL DEFAULT 0, opted_in INTEGER NOT NULL DEFAULT 0,
    timezone TEXT NOT NULL DEFAULT 'UTC', training_days TEXT NOT NULL DEFAULT '[]',
    allergies TEXT NOT NULL DEFAULT '[]', gym_time TEXT NULL, checkin_time TEXT NULL,
    program_time TEXT NULL, language TEXT NULL,
    awaiting_checkin INTEGER NOT NULL DEFAULT 0, awaiting_since INTEGER NULL,
    dirty INTEGER NOT NULL DEFAULT 0, updated_at INTEGER NULL, PRIMARY KEY (id)
  )''',
  '''
  CREATE TABLE checkins (
    checkin_date TEXT NOT NULL, adhered INTEGER NOT NULL, raw_reply TEXT NULL,
    created_at INTEGER NOT NULL, PRIMARY KEY (checkin_date)
  )''',
  '''
  CREATE TABLE workout_records (
    workout_date TEXT NOT NULL, source TEXT NOT NULL,
    exercises TEXT NOT NULL DEFAULT '[]', muscle_groups TEXT NOT NULL DEFAULT '[]',
    notes TEXT NULL, created_at INTEGER NOT NULL, PRIMARY KEY (workout_date)
  )''',
];

AppDatabase _openV4() {
  final raw = sqlite3.openInMemory();
  raw.execute(_v4Conversations);
  for (final statement in _v4Rest) {
    raw.execute(statement);
  }
  raw.execute('PRAGMA user_version = 4');

  raw.execute("INSERT INTO conversations (id, title) VALUES ('chat-1', 'Cairo trip')");
  raw.execute('''
    INSERT INTO chat_messages (server_id, conversation_id, role, content, composed_at, sync_state)
    VALUES (7, 'chat-1', 'user', 'still here', 1788000000000, 'synced')''');

  return AppDatabase.forTesting(NativeDatabase.opened(raw));
}

void main() {
  late AppDatabase db;

  setUp(() => db = _openV4());
  tearDown(() => db.close());

  test('adds the clear watermark to a table that predates it', () async {
    final chat = await db.findConversation('chat-1');

    expect(chat, isNotNull);
    expect(chat!.clearedUpToMessageId, 0);
    expect(chat.title, 'Cairo trip');
  });

  test('no chat counts as already cleared', () async {
    // Zero is the right default: message ids start at 1, so nothing is caught.
    await db.clearConversationMessages('chat-1', upToMessageId: 0);

    expect((await db.watchMessages().first).map((m) => m.content), ['still here']);
  });

  test('keeps the messages it already had', () async {
    expect(await db.watchMessages().first, hasLength(1));
  });

  test('reports the new schema version', () async {
    await db.allConversations();
    expect(db.schemaVersion, 5);
  });
}
