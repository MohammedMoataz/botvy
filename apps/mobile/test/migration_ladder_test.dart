import 'package:botvy/core/db/database.dart';
import 'package:drift/drift.dart' show Value;
import 'package:drift/native.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:sqlite3/sqlite3.dart';

/// The migration ladder.
///
/// Three things are worth asserting per version: that a fresh file builds the
/// whole schema, that a file from the *previous* version upgrades into it, and
/// that a file the ladder has no branch for fails with the ladder's own error
/// rather than a driver error nobody can act on.
///
/// The middle one is the one that matters, and it is the one that is easy to
/// skip. A fresh install exercises `onCreate`; only an upgrade exercises
/// `onUpgrade`, and a missing branch there does not fail in development — it
/// fails on every phone that already had the app, taking their unsent edits
/// with it.
void main() {
  test('a fresh file at the current schemaVersion has every declared table', () async {
    final db = AppDatabase.forTesting(NativeDatabase.memory());
    addTearDown(db.close);

    expect(db.schemaVersion, 2);

    final rows = await db
        .customSelect(
          "SELECT name FROM sqlite_master WHERE type = 'table' "
          "AND name NOT LIKE 'sqlite_%'",
        )
        .get();
    final built = rows.map((r) => r.read<String>('name')).toSet();

    expect(built, containsAll(db.allTables.map((t) => t.actualTableName)));
    // And the schema is usable, not merely present.
    await db.setValue('probe', 'ok');
    expect(await db.getValue('probe'), 'ok');
  });

  /// 1 -> 2: the profile and preferences mirrors.
  ///
  /// Opened as a v1-shaped file — the tables version 1 actually had, stamped
  /// with `user_version = 1` — so the upgrade path runs for real rather than
  /// being reasoned about.
  test('a version 1 file upgrades to 2 and gains the mirrors', () async {
    final raw = sqlite3.openInMemory();
    // Exactly what schemaVersion 1 shipped.
    raw.execute(
      'CREATE TABLE key_values (key TEXT NOT NULL, value TEXT NOT NULL, '
      'PRIMARY KEY (key))',
    );
    raw.execute("INSERT INTO key_values (key, value) VALUES ('installId', 'abc')");
    raw.execute('PRAGMA user_version = 1');

    final db = AppDatabase.forTesting(NativeDatabase.opened(raw));
    addTearDown(db.close);

    // Forces the open, and therefore the migration.
    expect(await db.getValue('installId'), 'abc');

    final rows = await db
        .customSelect(
          "SELECT name FROM sqlite_master WHERE type = 'table' "
          "AND name NOT LIKE 'sqlite_%'",
        )
        .get();
    final built = rows.map((r) => r.read<String>('name')).toSet();

    expect(built, contains('profiles'));
    expect(built, contains('user_preferences'));
    // And the row that was already there survived the upgrade — a migration
    // that dropped and recreated would pass a "table exists" check and still
    // have thrown away the member's data.
    expect(await db.getValue('installId'), 'abc');
  });

  /// The guard is `from >= 1 && from < 2`, not `from < 2`.
  ///
  /// `createTable` builds from today's definition, so an install created at
  /// version 2 already has these tables. An unconditional `createTable` in the
  /// branch would fail with "table already exists" on the *next* upgrade —
  /// which is a defect that only appears one version later, on real phones.
  test('the mirrors are usable immediately after the upgrade', () async {
    final raw = sqlite3.openInMemory();
    raw.execute(
      'CREATE TABLE key_values (key TEXT NOT NULL, value TEXT NOT NULL, '
      'PRIMARY KEY (key))',
    );
    raw.execute('PRAGMA user_version = 1');

    final db = AppDatabase.forTesting(NativeDatabase.opened(raw));
    addTearDown(db.close);

    await db
        .into(db.userPreferences)
        .insert(
          // The companion, not the row class: drift's generated row type is
          // `UserPreference`, and an insert is what the companion is for.
          UserPreferencesCompanion.insert(
            userId: 'user-1',
            planTomorrowTime: '21:00',
            endOfDayTime: '22:00',
            morningBriefingTime: '08:00',
            nextPracticeCutoff: '21:00',
            // Has a database default, so the companion wants it wrapped.
            leadTimesJson: const Value('["1h","0m"]'),
            quietFrom: '22:00',
            quietTo: '07:00',
            weekStartsOn: 'monday',
            checkinEnabled: true,
            meetingDurationMin: 30,
            mealMode: 'llm',
            aiSuggestions: true,
            fetchedAt: DateTime.utc(2026, 9, 9),
          ),
        );

    final stored = await db.select(db.userPreferences).getSingle();
    expect(stored.endOfDayTime, '22:00');
  });

  test(
    'a file the ladder does not recognise fails with the ladder error',
    () async {
      // A database that already holds tables but was never stamped with a drift
      // schema version — the shape any hand-built or foreign file has.
      final raw = sqlite3.openInMemory();
      raw.execute('CREATE TABLE legacy_rows (id TEXT NOT NULL PRIMARY KEY)');
      raw.execute('PRAGMA user_version = 0');

      final db = AppDatabase.forTesting(NativeDatabase.opened(raw));
      // Closing a database that never opened is allowed to fail; the assertion
      // below is the test, not the teardown.
      addTearDown(() async {
        try {
          await db.close();
        } catch (_) {}
      });

      await expectLater(
        db.getValue('anything'), // forces the open, and therefore the migration
        // drift may hand the failure back wrapped; what must not come out is a
        // driver error such as "table key_values already exists".
        throwsA(
          predicate<Object>(
            (e) =>
                e is MigrationLadderError ||
                '$e'.contains('MigrationLadderError'),
            'the ladder\'s own error',
          ),
        ),
      );
    },
  );
}
