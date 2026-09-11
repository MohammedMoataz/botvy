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
/// version 1 and opens version 7 arrives as `(1, 7)`, and every branch in the
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
    /*
     * A donor is built from **today's** DDL, which is what makes this helper
     * cheap — and it is also why a column added by a later version has to be
     * taken back out again.
     *
     * `daily_plans.meal_reason` arrives at version 9. A v8-shaped donor built
     * from today's definition would already have it, so the `addColumn` in the
     * 8 -> 9 branch would fail with "duplicate column" *in this test* and pass
     * on every real phone — the exact inversion of the defect the band guard
     * exists to prevent, and a false failure is how a test gets weakened until
     * it stops catching the real thing.
     *
     * SQLite has had `DROP COLUMN` since 3.35, and the bundled `sqlite3_flutter_libs`
     * is well past it.
     */
    if (version < 9 && tables.contains('daily_plans')) {
      raw.execute('ALTER TABLE daily_plans DROP COLUMN meal_reason');
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


  /// What every shipped version held, so a donor can be built at any of them.
  ///
  /// Version 1 is spelled out in its own test below rather than taken from a
  /// donor, because `donorAt` reads today's DDL and version 1 is the one step
  /// where that is not enough — it shipped a single table and nothing else, and
  /// building it by hand is what proves the `from < 2` guard runs.
  const v4Tables = [
    ...v3Tables,
    'daily_plans',
    'checkins',
    'rhythm_state',
  ];

  /// What version 5 shipped: the chat, on top of everything before it.
  const v5Tables = [
    ...v4Tables,
    'conversations',
    'messages',
    'pending_messages',
  ];

  /// What version 6 shipped: meetings and personal events (P5).
  const v6Tables = [
    ...v5Tables,
    'meetings',
    'calendar_events',
  ];

  /// What version 7 shipped: training (P6).
  const v7Tables = [
    ...v6Tables,
    'athlete_profile',
    'programs',
    'workouts',
    'sessions',
  ];

  /// What version 8 shipped: saved links (P7).
  const v8Tables = [
    ...v7Tables,
    'links',
  ];

  /// Every earlier version, upgraded to the current schema, asserting the
  /// **whole** schema each time.
  ///
  /// The one test in this file that could not have been skipped by an oversight
  /// and is the reason P3's defect existed for two phases. drift calls
  /// `onUpgrade` **once** with the pair it actually has, so a phone at version
  /// 1 opening version 8 arrives as `(1, 8)` and *every* branch sees
  /// `from == 1`. A branch guarded `from >= 4 && from < 5` therefore never runs
  /// for it, and that band is the only thing that would create `conversations`,
  /// `messages` and `pending_messages`: the install would come out with the
  /// chat feature querying tables that do not exist, for the life of the
  /// install. Written as a loop over every prior version so a sixth one is one
  /// entry in the map rather than a test somebody has to remember to add.
  ///
  /// `containsAll(declaredTables(db))` and not a fixed list, for the same
  /// reason: it covers the tables a later phase adds without this file being
  /// touched, which is exactly the remembering that failed last time.
  group('every earlier version upgrades to the current schema entire', () {
    final donors = <int, List<String>>{
      2: v2Tables,
      3: v3Tables,
      4: v4Tables,
      5: v5Tables,
      6: v6Tables,
      7: v7Tables,
      8: v8Tables,
    };

    for (final entry in donors.entries) {
      test('a version ${entry.key} file', () async {
        final db = AppDatabase.forTesting(
          NativeDatabase.opened(await donorAt(entry.key, entry.value)),
        );
        addTearDown(db.close);

        // Forces the open, and therefore the migration.
        expect(await db.getValue('anything'), isNull);

        expect(
          await tablesIn(db),
          containsAll(declaredTables(db)),
          reason:
              'a v${entry.key} install must end up with every table the '
              'current schema declares, not only the ones its own step adds: '
              'drift calls onUpgrade once with (${entry.key}, '
              '${db.schemaVersion}), so every createTable branch has to be '
              'guarded `from < N` rather than `from >= N-1 && from < N`',
        );

        // And every index, for the reason the 2 -> 3 branch gives: drift keeps
        // indexes as separate schema entities, so an upgrade that only calls
        // `createTable` leaves a phone with the tables and none of the indexes
        // and nothing ever says so.
        expect(
          await indexesIn(db),
          containsAll([
            'conversations_updated',
            'conversations_pending',
            'messages_conversation_seq',
            'messages_client',
            'pending_messages_composed',
            // P5's, in the same list rather than in a test of their own: the
            // point of this loop is that *every* prior version ends up with the
            // whole schema, and a phase whose indexes are only asserted from
            // the version before it is a phase whose `from < N` guard was never
            // exercised from further back.
            'meetings_start',
            'meetings_status_start',
            'meetings_pending',
            'calendar_events_start',
            'calendar_events_pending',
            // P6's, in the same list and for the same reason. `athlete_profile`
            // declares none: it holds one row per member and is only ever read
            // by its primary key, so an index over it would be a second copy
            // of the key.
            'programs_status',
            'programs_pending',
            'workouts_sport',
            'workouts_pending',
            'sessions_planned_at',
            'sessions_status_planned',
            'sessions_pending',
            // P7's, in the same list and for the same reason.
            'links_added_at',
            'links_status_added',
            'links_parent',
            // P8's, in the same list and for the same reason.
            'meals_name',
            'meals_kind',
            'meals_pending',
            'links_pending',
          ]),
        );

        // Usable, not merely present, and written the way the sync applier and
        // the chat outbox write them — so a column the migration got wrong
        // fails here rather than on a phone.
        await db.into(db.conversations).insert(
          ConversationsCompanion.insert(
            id: 'conv-1',
            kind: const Value('coach'),
            title: const Value('Coach'),
            pinned: const Value(true),
            createdAt: DateTime.now().toUtc(),
            updatedAt: DateTime.now().toUtc(),
          ),
        );
        await db.into(db.messages).insert(
          MessagesCompanion.insert(
            seq: const Value(1),
            conversationId: 'conv-1',
            role: 'user',
            content: 'How much protein today?',
            createdAt: DateTime.now().toUtc(),
          ),
        );
        await db.into(db.pendingMessages).insert(
          PendingMessagesCompanion.insert(
            clientId: 'client-1',
            conversationId: 'conv-1',
            body: 'remind me to call Dad in two hours',
            // Relative to now, never a pinned date: a fixture dated in the
            // future starts failing the day the clock reaches it.
            composedAt: DateTime.now().toUtc(),
          ),
        );

        // P5's two tables, written the way the sync applier writes them — a
        // series with its rule in `recurrence_json` and its place in
        // `location_json`, because those are the columns the whole calendar is
        // derived from and a migration that got one of them wrong would draw an
        // empty month rather than fail.
        final stamp = DateTime.now().toUtc();
        await db.into(db.meetings).insert(
          MeetingsCompanion.insert(
            id: 'meeting-1',
            title: 'Standup',
            startAt: stamp,
            durationMin: const Value(30),
            authoredTimezone: const Value('Africa/Cairo'),
            locationJson: const Value(
              '{"onlineLink":"https://meet.example/abc","address":null}',
            ),
            reminderOffsetsJson: const Value('[1440,30]'),
            recurrenceJson: Value(
              '{"dtstart":"${stamp.toIso8601String()}",'
              '"rrule":"FREQ=WEEKLY;COUNT=6","exdates":[],"overrides":[]}',
            ),
            createdAt: stamp,
            updatedAt: stamp,
          ),
        );
        await db.into(db.calendarEvents).insert(
          CalendarEventsCompanion.insert(
            id: 'event-1',
            title: 'Birthday',
            startAt: stamp,
            endAt: stamp.add(const Duration(days: 1)),
            allDay: const Value(true),
            color: const Value('#0ea5e9'),
            authoredTimezone: const Value('Africa/Cairo'),
            createdAt: stamp,
            updatedAt: stamp,
          ),
        );

        final meeting = (await db.select(db.meetings).get()).single;
        // The defaults the columns declare, for a meeting nothing has happened
        // to yet.
        expect(meeting.status, 'scheduled');
        expect(meeting.prepMinutes, 0);
        expect(meeting.allDay, isFalse);
        expect(meeting.lockTimezone, isNull);
        expect(meeting.recurrenceJson, contains('FREQ=WEEKLY;COUNT=6'));
        expect((await db.select(db.calendarEvents).get()).single.allDay, isTrue);

        expect((await db.select(db.conversations).get()).single.pinned, isTrue);
        // The defaults the columns declare, for a chat nothing has been
        // cleared from.
        expect(
          (await db.select(db.conversations).get()).single.clearedUpToSeq,
          0,
        );
        expect((await db.select(db.messages).get()).single.seq, 1);
        expect((await db.select(db.pendingMessages).get()).single.attempts, 0);

        // P6's four tables, written the way the sync applier and the athlete
        // cubit write them. The JSON columns carry the shapes the whole feature
        // is derived from — a session's exercises and their sets, a program's
        // weeks, the member's slots — so a migration that got one of them wrong
        // would draw an empty week rather than fail.
        await db.into(db.athleteProfile).insert(
          AthleteProfileCompanion.insert(
            userId: 'u-1',
            sportsJson: const Value('["gym","swimming"]'),
            slotsJson: const Value(
              '[{"id":"slot-gym","weekday":1,"start":"18:00",'
              '"durationMin":60,"sport":"gym","location":null}]',
            ),
            fetchedAt: stamp,
          ),
        );
        await db.into(db.programs).insert(
          ProgramsCompanion.insert(
            id: 'program-1',
            title: 'Four weeks of push and pull',
            sport: 'gym',
            weeksJson: const Value(
              '[{"index":0,"sessions":[{"templateId":"t1","weekday":1,'
              '"title":"Push day","focus":"chest","exercises":[]}]}]',
            ),
            createdAt: stamp,
            updatedAt: stamp,
          ),
        );
        await db.into(db.workouts).insert(
          WorkoutsCompanion.insert(
            id: 'workout-1',
            name: 'Leg day',
            sport: 'gym',
            exercisesJson: const Value(
              '[{"id":"e1","name":"Squat","notes":null,"mediaRefs":[],'
              '"sets":[{"targetReps":5,"targetWeightKg":100,"done":false}]}]',
            ),
            tagsJson: const Value('["legs"]'),
            createdAt: stamp,
            updatedAt: stamp,
          ),
        );
        await db.into(db.sessions).insert(
          SessionsCompanion.insert(
            id: 'session-1',
            plannedAt: stamp,
            durationMin: const Value(75),
            sport: 'gym',
            title: 'Push day',
            focus: const Value('chest'),
            slotId: const Value('slot-gym'),
            exercisesJson: const Value(
              '[{"id":"e1","name":"Squat","notes":null,"mediaRefs":[],'
              '"sets":[{"targetReps":5,"actualReps":5,"actualWeightKg":100,'
              '"done":true}]}]',
            ),
            createdAt: stamp,
            updatedAt: stamp,
          ),
        );

        final profile = (await db.select(db.athleteProfile).get()).single;
        expect(profile.slotsJson, contains('18:00'));
        // The strike count and the pending op a patch table declares, for a
        // profile nothing has queued.
        expect(profile.pendingOp, isNull);
        expect(profile.pushAttempts, 0);

        final session = (await db.select(db.sessions).get()).single;
        // The defaults the columns declare, for a session nothing has happened
        // to yet — and the one that matters is the status: a session is born
        // `planned`, and "missed" is never one of the four (FR-018).
        expect(session.status, 'planned');
        expect(session.completedAt, isNull);
        expect(session.durationMin, 75);
        expect(session.exercisesJson, contains('actualWeightKg'));
        expect((await db.select(db.programs).get()).single.status, 'active');
        expect(
          (await db.select(db.programs).get()).single.appliedStartDate,
          isNull,
        );
        expect((await db.select(db.workouts).get()).single.tagsJson, '["legs"]');
      });
    }
  });

  /// The immutable-message re-pull, which is the only migration move that table
  /// has.
  ///
  /// Messages carry no `updatedAt`, so they cannot be cut on a timestamp and a
  /// column backfilled onto the server's rows can never reach a device that
  /// already holds them — their sequences are below the watermark for ever.
  /// The answer is to discard the cache and rewind the watermark, and this is
  /// the test that the two halves actually happen: the rows go, and the number
  /// the next sync sends as `lastSeq` goes back with them.
  group('the immutable-message re-pull', () {
    Future<void> seed(AppDatabase db) async {
      for (final seq in [1, 2, 3]) {
        await db.into(db.messages).insert(
          MessagesCompanion.insert(
            seq: Value(seq),
            conversationId: 'conv-1',
            role: seq.isOdd ? 'user' : 'assistant',
            content: 'message $seq',
            createdAt: DateTime.now().toUtc(),
          ),
        );
      }
      await db.setValue(DbKeys.messagesLastSeq, '3');
    }

    test('discards the whole cache and rewinds the watermark to nought',
        () async {
      final db = AppDatabase.forTesting(NativeDatabase.memory());
      addTearDown(db.close);
      await seed(db);

      await repullMessages(db);

      expect(await db.select(db.messages).get(), isEmpty);
      // Nought and not null: `seq > 0` is how the server is asked for
      // everything, and clearing the key would work only because absent
      // happens to parse to the same request. Storing the number says it.
      expect(await db.getValue(DbKeys.messagesLastSeq), '0');
    });

    test('a partial re-pull keeps what is below the sequence given', () async {
      final db = AppDatabase.forTesting(NativeDatabase.memory());
      addTearDown(db.close);
      await seed(db);

      await repullMessages(db, fromSeq: 3);

      // Inclusive: `fromSeq: 3` means "message 3 is wrong too".
      expect(
        (await db.select(db.messages).get()).map((r) => r.seq),
        [1, 2],
      );
      // One below, because the server answers `seq > lastSeq`. Off by one here
      // and message 3 is never sent again — which is precisely the failure the
      // re-pull exists to avoid.
      expect(await db.getValue(DbKeys.messagesLastSeq), '2');
    });
  });

  test('a fresh file at the current schemaVersion has every declared table', () async {
    final db = AppDatabase.forTesting(NativeDatabase.memory());
    addTearDown(db.close);

    expect(db.schemaVersion, 9);

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

  /// 1 -> 8, the longest path there is, and the one that was broken.
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
          '1 -> 2 branch adds: drift calls onUpgrade once with (1, 7), so '
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

  /// 2 -> 8: the P2 tables, and then everything since.
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

  /// 3 -> 8: the daily rhythm (P3 T350), plus the chat, the calendar and
  /// training on top.
  test('a version 3 file upgrades and gains the rhythm tables', () async {
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
