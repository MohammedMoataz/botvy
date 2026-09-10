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
///
/// "From the previous version" is not enough, and P3 found out why. drift calls
/// `onUpgrade` **once**, with the pair it actually has: a phone that last ran
/// version 1 and opens version 4 arrives as `(1, 4)`, and every branch in the
/// ladder sees `from == 1`. A branch guarded `from >= 2 && from < 3` therefore
/// never runs for it — so a v1 install upgrading to v3 came out with the
/// profile mirrors and **no task tables at all**, and every query against them
/// failed for the life of the install. Nothing caught it because this file only
/// ever opened a v1 file against a v2 schema, where the two guard shapes agree.
///
/// So the tests below open a donor from *every* earlier version against the
/// current schema, and each one asserts the whole schema afterwards rather than
/// only the tables its own step adds.
void main() {
  /// Every table the current schema declares.
  ///
  /// Read from `allTables` rather than listed, so a later phase's table is
  /// covered by these assertions without anybody remembering to add it here —
  /// which is exactly the kind of remembering that failed last time.
  Set<String> declaredTables(AppDatabase db) =>
      db.allTables.map((t) => t.actualTableName).toSet();

  Future<Set<String>> tablesIn(AppDatabase db) async =>
      (await db
              .customSelect(
                "SELECT name FROM sqlite_master WHERE type = 'table' "
                "AND name NOT LIKE 'sqlite_%'",
              )
              .get())
          .map((r) => r.read<String>('name'))
          .toSet();

  Future<Set<String>> indexesIn(AppDatabase db) async =>
      (await db
              .customSelect(
                "SELECT name FROM sqlite_master WHERE type = 'index' "
                "AND name NOT LIKE 'sqlite_%'",
              )
              .get())
          .map((r) => r.read<String>('name'))
          .toSet();

  /// A database file shaped like [version], holding exactly [tables].
  ///
  /// The DDL is taken from a *current* database, which is exact rather than
  /// approximate only while no bump has altered one of those tables — today's
  /// definition of `profiles` is still version 2's definition of `profiles`.
  /// The day a bump alters one, its donor stops being valid and the DDL has to
  /// be written out by hand here. That is the same rule the guarded branches
  /// follow, for the same reason.
  Future<Database> donorAt(int version, List<String> tables) async {
    final donor = AppDatabase.forTesting(NativeDatabase.memory());
    final quoted = tables.map((name) => "'$name'").join(', ');
    final ddl = await donor
        .customSelect(
          'SELECT sql FROM sqlite_master '
          "WHERE type IN ('table', 'index') AND name NOT LIKE 'sqlite_%' "
          'AND (name IN ($quoted) OR tbl_name IN ($quoted))',
        )
        .get();
    final statements = ddl
        .map((r) => r.read<String?>('sql'))
        .whereType<String>()
        .toList();
    await donor.close();
    expect(
      statements.length,
      greaterThanOrEqualTo(tables.length),
      reason: 'the v$version tables to build from',
    );

    final raw = sqlite3.openInMemory();
    for (final statement in statements) {
      raw.execute(statement);
    }
    raw.execute('PRAGMA user_version = $version');
    return raw;
  }

  /// What version 2 shipped, and what version 3 shipped.
  const v2Tables = ['key_values', 'profiles', 'user_preferences'];
  const v3Tables = [
    ...v2Tables,
    'labels',
    'tasks',
    'reminders',
    'alerts_local',
  ];

  test('a fresh file at the current schemaVersion has every declared table', () async {
    final db = AppDatabase.forTesting(NativeDatabase.memory());
    addTearDown(db.close);

    expect(db.schemaVersion, 4);

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

  /// 1 -> 4, the longest path there is, and the one that was broken.
  ///
  /// Opened as a v1-shaped file — the one table version 1 actually had, stamped
  /// with `user_version = 1` — so the upgrade path runs for real rather than
  /// being reasoned about. It asserts the **whole** schema, not just the
  /// mirrors: this is the case that came out of the ladder missing four tables,
  /// and an assertion about only the step it was written for is what let that
  /// through.
  test('a version 1 file upgrades to the current schema entire', () async {
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

    expect(
      await tablesIn(db),
      containsAll(declaredTables(db)),
      reason:
          'a v1 install must end up with every table, not only the ones the '
          '1 -> 2 branch adds: drift calls onUpgrade once with (1, 4), so '
          'every later branch has to be guarded `from < N` rather than '
          '`from >= N-1 && from < N`',
    );
    // And the row that was already there survived the upgrade — a migration
    // that dropped and recreated would pass a "table exists" check and still
    // have thrown away the member's data.
    expect(await db.getValue('installId'), 'abc');
  });

  /// The mirrors work straight after the upgrade, not merely exist.
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

  /// 2 -> 4: the P2 tables, and then the P3 ones on top.
  test('a version 2 file upgrades and gains the P2 tables', () async {
    final db = AppDatabase.forTesting(
      NativeDatabase.opened(await donorAt(2, v2Tables)),
    );
    addTearDown(db.close);

    // Forces the open, and therefore the migration.
    expect(await db.getValue('anything'), isNull);

    expect(
      await tablesIn(db),
      containsAll(declaredTables(db)),
    );

    // The indexes too. `createTable` does not create them — drift keeps them
    // as separate schema entities, so an upgrade that only calls `createTable`
    // leaves a phone with the tables and none of the indexes, and nothing ever
    // says so. Invisible in a test database of ten rows; a slow Today list on
    // a real one.
    expect(
      await indexesIn(db),
      containsAll([
        'labels_sort',
        'labels_pending',
        'tasks_due',
        'tasks_status_due',
        'tasks_label',
        'tasks_pending',
        'reminders_remind_at',
        'reminders_pending',
        'alerts_local_notify_at',
      ]),
    );

    // And the new tables are usable straight away, not merely present.
    await db
        .into(db.tasks)
        .insert(
          TasksCompanion.insert(
            id: 'task-1',
            title: 'Pay the electricity bill',
            updatedAt: DateTime.now(),
            createdAt: DateTime.now(),
          ),
        );
    expect((await db.select(db.tasks).get()).single.status, 'open');
  });

  /// 3 -> 4: the daily rhythm (P3 T350).
  test('a version 3 file upgrades to 4 and gains the rhythm tables', () async {
    final raw = await donorAt(3, v3Tables);
    // A task the member already had, so the upgrade is asserted to *keep* what
    // was there rather than merely to add what was not.
    //
    // The instants go in as ISO text, because that is how this database stores
    // a `DateTimeColumn` — an integer here reads back as "Invalid date format",
    // which is what a hand-built donor gets wrong the first time.
    final stamp = DateTime.now().toUtc().toIso8601String();
    raw.execute(
      'INSERT INTO tasks (id, title, updated_at, created_at, push_attempts, '
      'all_day, priority, status, defer_count, source) '
      "VALUES ('task-old', 'Renew the passport', '$stamp', '$stamp', 0, 1, 4, "
      "'open', 0, 'app')",
    );

    final db = AppDatabase.forTesting(NativeDatabase.opened(raw));
    addTearDown(db.close);

    // Forces the open, and therefore the migration.
    expect((await db.select(db.tasks).get()).single.id, 'task-old');

    expect(
      await tablesIn(db),
      containsAll(['daily_plans', 'checkins', 'rhythm_state']),
    );
    expect(
      await indexesIn(db),
      containsAll([
        'daily_plans_date',
        'daily_plans_pending',
        'checkins_date',
        'checkins_pending',
      ]),
    );

    // Usable, not merely present — and written the way the sync applier writes
    // them, so a column the migration got wrong fails here rather than on a
    // phone.
    await db.into(db.dailyPlans).insert(
      DailyPlansCompanion.insert(
        id: 'u-1:2026-09-11',
        date: '2026-09-11',
        status: const Value('draft'),
        tasksJson: const Value('[{"id":"task-old","title":"Renew the passport"}]'),
        updatedAt: DateTime.now(),
      ),
    );
    await db.into(db.checkins).insert(
      CheckinsCompanion.insert(
        id: 'u-1:2026-09-10',
        date: '2026-09-10',
        // Zero, and it has to survive as zero: nought is the worst mood the
        // scale can describe, and a column that turned it into null would make
        // the member's worst day read as a day they never answered.
        mood: const Value(0),
        adhered: const Value(false),
        updatedAt: DateTime.now(),
      ),
    );
    await db.into(db.rhythmState).insert(
      RhythmStateCompanion.insert(
        userId: 'u-1',
        lastEndOfDayDate: const Value('2026-09-10'),
        awaitingCheckin: const Value(true),
        streakCurrent: const Value(3),
        streakBest: const Value(9),
      ),
    );

    expect((await db.select(db.dailyPlans).get()).single.status, 'draft');
    final checkin = (await db.select(db.checkins).get()).single;
    expect(checkin.mood, 0);
    expect(checkin.adhered, isFalse);
    // The default the column declares, for a member who has answered nothing.
    expect((await db.select(db.rhythmState).get()).single.streakBest, 9);
  });

  /// A check-in with no answer at all keeps all three fields null.
  ///
  /// The one that would be caught by nothing else: a `mood` or `adhered`
  /// declared non-nullable with a default would make every unanswered day read
  /// as "mood 0, did not follow the plan" — a week strip full of misses the
  /// member never earned.
  test('an unanswered check-in stores nulls, not zeros', () async {
    final db = AppDatabase.forTesting(NativeDatabase.memory());
    addTearDown(db.close);

    await db.into(db.checkins).insert(
      CheckinsCompanion.insert(
        id: 'u-1:2026-09-09',
        date: '2026-09-09',
        updatedAt: DateTime.now(),
      ),
    );

    final row = (await db.select(db.checkins).get()).single;
    expect(row.mood, isNull);
    expect(row.adhered, isNull);
    expect(row.note, isNull);
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
