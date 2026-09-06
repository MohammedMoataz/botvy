import 'package:botvy/core/db/database.dart';
import 'package:drift/native.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:sqlite3/sqlite3.dart';

/// The migration ladder.
///
/// There is exactly one schema version, so there are exactly two things worth
/// asserting: that opening a fresh file at version 1 actually builds the
/// schema, and that a file the ladder has no branch for fails with the
/// ladder's own error rather than a driver error nobody can act on.
///
/// Later phases add one case per bump. The harness exists so that adding one is
/// a line rather than a fixture — and so CI, not every existing install, is
/// where a forgotten `MigrationStrategy` branch is discovered.
void main() {
  test('a fresh file at schemaVersion 1 has every declared table', () async {
    final db = AppDatabase.forTesting(NativeDatabase.memory());
    addTearDown(db.close);

    expect(db.schemaVersion, 1);

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
