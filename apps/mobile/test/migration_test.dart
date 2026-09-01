import 'package:botvy/src/db/database.dart';
import 'package:drift/drift.dart' show Value;
import 'package:drift/native.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:sqlite3/sqlite3.dart';

/// The v1 → v2 upgrade, run against a database shaped like the shipped one.
///
/// This is the test that stands between a release and every existing install
/// failing to open: drift's default `onUpgrade` throws, so the strategy has to
/// exist and has to leave the user's pending work alone.
const _v1Schema = [
  '''
  CREATE TABLE reminders (
    id TEXT NOT NULL,
    client_id TEXT NULL,
    title TEXT NOT NULL,
    remind_at INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'active',
    lead_times TEXT NOT NULL DEFAULT '["1h","0m"]',
    updated_at INTEGER NULL,
    pending_op TEXT NULL,
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
];

AppDatabase _openV1WithData() {
  final raw = sqlite3.openInMemory();
  for (final statement in _v1Schema) {
    raw.execute(statement);
  }
  raw.execute('PRAGMA user_version = 1');

  // A reminder the user created offline that has never been pushed.
  raw.execute('''
    INSERT INTO reminders (id, client_id, title, remind_at, status, lead_times, pending_op)
    VALUES ('r1', 'r1', 'Dentist', 1788000000000, 'active', '["1h","0m"]', 'create')''');
  raw.execute('''
    INSERT INTO reminder_pings (id, reminder_id, notify_at, label)
    VALUES ('p1', 'r1', 1788000000000, 'now')''');
  // A message typed with no signal, still waiting.
  raw.execute('''
    INSERT INTO chat_messages (client_id, role, content, composed_at, sync_state)
    VALUES ('c1', 'user', 'buy eggs', 1788000000000, 'queued')''');
  // The dead cache the new profile table replaces.
  raw.execute('''
    INSERT INTO key_values (k, v) VALUES ('coachingProfile', '{"optedIn":true}')''');
  raw.execute('''
    INSERT INTO key_values (k, v) VALUES ('installId', 'install-1')''');

  return AppDatabase.forTesting(NativeDatabase.opened(raw));
}

void main() {
  late AppDatabase db;

  setUp(() => db = _openV1WithData());
  tearDown(() => db.close());

  test('keeps a reminder that was never pushed, and its pending operation', () async {
    final rows = await db.allReminders();

    expect(rows, hasLength(1));
    expect(rows.single.title, 'Dentist');
    expect(rows.single.pendingOp, ReminderOps.create);
  });

  test('keeps a queued message in the outbox', () async {
    final queued = await db.outbox();
    expect(queued.map((m) => m.clientId), ['c1']);
  });

  test('gives existing reminders a zeroed attempt count', () async {
    // The column is new; an existing row must not arrive already exhausted.
    final rows = await db.allReminders();
    expect(rows.single.pushAttempts, 0);
    expect(await db.pendingReminders(), hasLength(1));
  });

  test('leaves the base timestamp null until a pull fills it', () async {
    // A v1 row was never reconciled against a server timestamp. Inventing one
    // would claim the row is uncontested and let it overwrite a newer server
    // edit; null correctly falls back to the clock comparison.
    expect((await db.allReminders()).single.baseUpdatedAt, isNull);
  });

  test('creates the three tables the sync fills', () async {
    expect(await db.profile(), isNull);
    expect(await db.recentCheckins(), isEmpty);
    expect(await db.recentWorkouts(), isEmpty);
  });

  test('drops the cached profile blob it replaces', () async {
    // It never had a reader, but it is still one account's preferences.
    expect(await db.getValue('coachingProfile'), isNull);
    expect(await db.getValue('installId'), 'install-1');
  });

  test('reports the new schema version', () async {
    await db.profile(); // force the migration to run
    expect(db.schemaVersion, 2);
  });

  test('a fresh install gets every table without an upgrade', () async {
    final fresh = AppDatabase.forTesting(NativeDatabase.memory());
    addTearDown(fresh.close);

    expect(await fresh.profile(), isNull);
    expect(await fresh.recentCheckins(), isEmpty);
    expect(await fresh.allReminders(), isEmpty);
  });

  test('signing out leaves none of the account behind', () async {
    await db.writeProfile(const CoachingProfilesCompanion(optedIn: Value(true)));
    await db.upsertCheckin(CheckinsCompanion.insert(
      checkinDate: '2026-09-01',
      adhered: true,
      createdAt: DateTime(2026, 9, 1),
    ));
    await db.upsertWorkout(WorkoutRecordsCompanion.insert(
      workoutDate: '2026-09-01',
      source: 'planned',
      createdAt: DateTime(2026, 9, 1),
    ));

    await db.wipe();

    expect(await db.profile(), isNull);
    expect(await db.recentCheckins(), isEmpty);
    expect(await db.recentWorkouts(), isEmpty);
    expect(await db.allReminders(), isEmpty);
    expect(await db.getValue('installId'), isNull);
  });
}
