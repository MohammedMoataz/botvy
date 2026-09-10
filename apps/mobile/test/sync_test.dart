import 'package:botvy/core/api/api_client.dart';
import 'package:botvy/core/db/database.dart';
import 'package:botvy/core/notifications/local_notifications.dart';
import 'package:botvy/core/sync/sync_engine.dart';
import 'package:drift/drift.dart' show Value;
import 'package:drift/native.dart';
import 'package:flutter_test/flutter_test.dart';

/// The sync engine.
///
/// Ported from v1's `test/sync_test.dart` and generalised: v1's cases were
/// written about reminders and chats, and every one of them was really about a
/// rule of the protocol — the cursor, the delete sweep, the base timestamp, the
/// rejection branch. The rule is what is asserted here, on whichever entity
/// shows it most plainly, plus the cases the v2 contract added: five rejection
/// reasons instead of one, and a push-attempt cap that must never throw a
/// member's edit away.
///
/// Every fixture is built from `DateTime.now()`. A pinned date in a test about
/// cursors and tombstones is a test that starts failing on a particular
/// Tuesday.
void main() {
  late AppDatabase db;
  late _FakeApi api;
  late _FakeScheduler scheduler;
  late SyncEngine engine;

  final now = DateTime.now().toUtc();

  setUp(() {
    db = AppDatabase.forTesting(NativeDatabase.memory());
    api = _FakeApi();
    scheduler = _FakeScheduler();
    engine = SyncEngine(api, db, scheduler);
  });

  tearDown(() async {
    engine.dispose();
    await db.close();
  });

  /// The shape of a response, with everything defaulted so a test names only
  /// the part it is about.
  Map<String, dynamic> reply({
    String? cursor,
    bool full = false,
    Map<String, dynamic> pull = const {},
    Map<String, dynamic> accepted = const {},
    List<Map<String, dynamic>> rejections = const [],
    List<Map<String, dynamic>> pendingAlerts = const [],
  }) => {
    'now': cursor ?? now.toIso8601String(),
    'full': full,
    'pull': {
      'labels': const <dynamic>[],
      'tasks': const <dynamic>[],
      'reminders': const <dynamic>[],
      ...pull,
    },
    'accepted': accepted,
    'rejections': rejections,
    'pendingAlerts': pendingAlerts,
  };

  Map<String, dynamic> serverTask(
    String id, {
    String title = 'Server task',
    DateTime? updatedAt,
    DateTime? deletedAt,
    String status = 'open',
  }) => {
    'id': id,
    'title': title,
    'notes': null,
    'dueAt': null,
    'allDay': true,
    'priority': 4,
    'labelId': null,
    'label': null,
    'status': status,
    'completedAt': null,
    'recurrence': null,
    'estimatedMinutes': null,
    'deferCount': 0,
    'deferredFrom': null,
    'source': 'app',
    'createdAt': (updatedAt ?? now).toIso8601String(),
    'updatedAt': (updatedAt ?? now).toIso8601String(),
    'deletedAt': deletedAt?.toIso8601String(),
  };

  Future<void> insertTask(
    String id, {
    String title = 'Local task',
    String? pendingOp,
    DateTime? baseUpdatedAt,
    DateTime? updatedAt,
    DateTime? deletedAt,
    int pushAttempts = 0,
  }) => db.into(db.tasks).insert(
    TasksCompanion.insert(
      id: id,
      title: title,
      createdAt: now,
      updatedAt: updatedAt ?? now,
      baseUpdatedAt: Value(baseUpdatedAt),
      pendingOp: Value(pendingOp),
      pushAttempts: Value(pushAttempts),
      deletedAt: Value(deletedAt),
    ),
  );

  Future<LocalTask?> task(String id) =>
      (db.select(db.tasks)..where((r) => r.id.equals(id))).getSingleOrNull();

  // ── the cursor ─────────────────────────────────────────────────────────────

  group('the cursor', () {
    test('asks for a full snapshot when the device has none', () async {
      api.next = reply(full: true);

      await engine.sync();

      expect(api.calls.single.since, isNull);
    });

    test('sends back exactly what the server last called now', () async {
      // Milliseconds and all. The cursor is the server's clock, and rounding it
      // through a local format is how a delta silently skips a row.
      const cursor = '2026-09-10T08:14:03.123Z';
      api.next = reply(cursor: cursor);
      await engine.sync();

      api.next = reply();
      await engine.sync();

      expect(api.calls.last.since, cursor);
    });

    test('is kept apart from the human-facing last-synced time', () async {
      api.next = reply(cursor: '2026-09-10T08:14:03.123Z');
      await engine.sync();

      expect(await db.getValue(SyncKeys.cursor), '2026-09-10T08:14:03.123Z');
      // A device timestamp, which must never be sent as `since`: whatever the
      // clock skew covers would be skipped exactly once, invisibly.
      expect(await db.getValue(SyncKeys.lastSyncAt), isNotNull);
      expect(
        await db.getValue(SyncKeys.lastSyncAt),
        isNot('2026-09-10T08:14:03.123Z'),
      );
    });

    test('is not advanced by a pass that never reached the server', () async {
      api.next = reply(cursor: '2026-09-10T08:14:03.123Z');
      await engine.sync();

      api.fail = true;
      await engine.sync();

      expect(await db.getValue(SyncKeys.cursor), '2026-09-10T08:14:03.123Z');
    });
  });

  // ── applying a pull ────────────────────────────────────────────────────────

  group('applying a pull', () {
    test('a delta must not delete a task that simply did not change', () async {
      await insertTask('kept');
      // A delta lists what changed. Treating it as the complete set is what
      // deletes every row that simply did not change — which, on a quiet day,
      // is all of them.
      api.next = reply(pull: {'tasks': [serverTask('fresh')]});

      await engine.sync();

      expect(await task('kept'), isNotNull);
      expect(await task('fresh'), isNotNull);
    });

    test('a full snapshot does remove what the server no longer has', () async {
      await insertTask('gone-server-side');
      api.next = reply(full: true, pull: {'tasks': [serverTask('still-there')]});

      await engine.sync();

      expect(await task('gone-server-side'), isNull);
      expect(await task('still-there'), isNotNull);
    });

    test('a full snapshot spares a row this device has not pushed yet', () async {
      // Created offline: it is in no snapshot yet, because the server has never
      // heard of it. Sweeping it would delete the member's new task the first
      // time they came back online on a stale cursor.
      await insertTask('made-offline', pendingOp: PendingOps.create);
      api.next = reply(full: true);

      await engine.sync();

      expect(await task('made-offline'), isNotNull);
    });

    test('a tombstone is stored rather than erased', () async {
      final deletedAt = now.subtract(const Duration(minutes: 5));
      api.next = reply(
        pull: {
          'tasks': [
            serverTask('binned', status: 'completed', deletedAt: deletedAt),
          ],
        },
      );

      await engine.sync();

      final row = await task('binned');
      expect(row!.deletedAt, isNotNull);
      // The status survives the delete. It is the only record of whether the
      // task was completed, cancelled or never dealt with, and the Deleted view
      // exists to show exactly that.
      expect(row.status, 'completed');
    });

    test('a restore made elsewhere puts it back', () async {
      await insertTask('restored', deletedAt: now);
      api.next = reply(pull: {'tasks': [serverTask('restored')]});

      await engine.sync();

      expect((await task('restored'))!.deletedAt, isNull);
    });

    test('a row edited again mid-flight keeps its local copy', () async {
      await insertTask(
        'edited',
        title: 'my newer edit',
        pendingOp: PendingOps.update,
      );
      // Pushed, not accepted — so this device's edit is still outstanding, and
      // the server's older copy must not overwrite it.
      api.next = reply(
        pull: {'tasks': [serverTask('edited', title: 'server copy')]},
      );

      await engine.sync();

      expect((await task('edited'))!.title, 'my newer edit');
    });

    test('the base timestamp comes from the server row only', () async {
      final serverUpdatedAt = now.subtract(const Duration(hours: 2));
      api.next = reply(
        pull: {'tasks': [serverTask('pulled', updatedAt: serverUpdatedAt)]},
      );

      await engine.sync();

      final row = await task('pulled');
      expect(row!.baseUpdatedAt, serverUpdatedAt);
      expect(row.updatedAt, serverUpdatedAt);
      expect(row.pendingOp, isNull);
    });

    test('labels are applied before tasks', () {
      // Not a preference: a task carries a snapshot of its label's name and
      // colour, so a task written before the label it names would render a
      // blank chip until something else touched the row. Asserted on the
      // constant the engine iterates, because that is where the order lives.
      expect(SyncEngine.entities.indexOf('labels'), lessThan(
        SyncEngine.entities.indexOf('tasks'),
      ));
    });

    test('pendingAlerts are mirrored under the server\'s own alert key', () async {
      final notifyAt = now.add(const Duration(hours: 3));
      api.next = reply(
        pendingAlerts: [
          {
            'source': {'kind': 'meeting', 'id': 'm-1', 'occurrenceAt': null},
            'label': '1h',
            'notifyAt': notifyAt.toIso8601String(),
            'title': 'Standup',
            'body': '1 hour before',
            'deepLink': '/meetings/m-1',
          },
        ],
      );

      await engine.sync();

      final row = await db.select(db.alertsLocal).getSingle();
      // Spelt exactly as `PlannedAlert.key` spells it, which is what makes the
      // alert the phone derived and the server's copy one alarm, not two.
      expect(row.id, 'meeting|m-1|-|1h');
      expect(row.notifyAt, notifyAt);
    });
  });

  // ── pushing ────────────────────────────────────────────────────────────────

  group('pushing', () {
    test('sends a pending row and clears it once the server has it', () async {
      await insertTask('outbound', pendingOp: PendingOps.create);
      api.next = reply(accepted: {'tasks': ['outbound']});

      await engine.sync();

      final pushed = api.calls.single.push['tasks'] as List;
      expect(pushed.single['op'], PendingOps.create);
      expect(pushed.single['id'], 'outbound');
      expect((await task('outbound'))!.pendingOp, isNull);
    });

    test('sends the server timestamp as the base, not this handset\'s clock',
        () async {
      final base = now.subtract(const Duration(days: 1));
      await insertTask(
        'based',
        pendingOp: PendingOps.update,
        baseUpdatedAt: base,
        updatedAt: now,
      );
      api.next = reply(accepted: {'tasks': ['based']});

      await engine.sync();

      final pushed = (api.calls.single.push['tasks'] as List).single;
      // While the base still matches, the server accepts the push with no clock
      // consulted at all. Sending the local edit time here is what turns every
      // offline edit into a clock comparison, which a slow handset loses.
      expect(pushed['baseUpdatedAt'], base.toIso8601String());
      expect(pushed['updatedAt'], now.toIso8601String());
    });

    test('clears pendingOp only for the ids the server named', () async {
      await insertTask('named', pendingOp: PendingOps.update);
      await insertTask('unnamed', pendingOp: PendingOps.update);
      api.next = reply(accepted: {'tasks': ['named']});

      await engine.sync();

      expect((await task('named'))!.pendingOp, isNull);
      // Never seen by the server, so still the member's unsent edit. Clearing
      // the whole pushed set on a 200 is how a half-arrived request loses one.
      expect((await task('unnamed'))!.pendingOp, PendingOps.update);
    });

    test('a stale rejection shows the winner and stops re-sending', () async {
      final serverUpdatedAt = now.add(const Duration(minutes: 1));
      await insertTask(
        'contested',
        title: 'my losing edit',
        pendingOp: PendingOps.update,
      );
      api.next = reply(
        rejections: [
          {
            'entity': 'tasks',
            'id': 'contested',
            'reason': 'stale',
            'server': serverTask(
              'contested',
              title: 'the winner',
              updatedAt: serverUpdatedAt,
            ),
          },
        ],
      );

      await engine.sync();

      final row = await task('contested');
      // Visibly replaced rather than silently dropped — and the pushing stops,
      // because a version that has already lost cannot win a retry.
      expect(row!.title, 'the winner');
      expect(row.pendingOp, isNull);
    });

    test('a gone rejection removes the local row', () async {
      await insertTask('erased-elsewhere', pendingOp: PendingOps.update);
      api.next = reply(
        rejections: [
          {
            'entity': 'tasks',
            'id': 'erased-elsewhere',
            'reason': 'gone',
            'server': null,
          },
        ],
      );

      await engine.sync();

      expect(await task('erased-elsewhere'), isNull);
    });

    test('an invalid rejection keeps the edit and never writes the message '
        'through the row path', () async {
      await insertTask(
        'refused',
        title: 'the member typed this',
        pendingOp: PendingOps.update,
      );
      // `server` carries a *message* here, not a row. Writing it as a row would
      // blank every column the member had filled in.
      api.next = reply(
        rejections: [
          {
            'entity': 'tasks',
            'id': 'refused',
            'reason': 'invalid',
            'server': {'message': 'remindAt is in the past'},
          },
        ],
      );

      await engine.sync();

      final row = await task('refused');
      expect(row!.title, 'the member typed this');
      expect(row.pendingOp, PendingOps.update);
      expect(row.pushAttempts, SyncEngine.maxPushAttempts);
      expect(engine.lastOutcome!.rejections.single.message,
          'remindAt is in the past');
    });

    test('a rejection is branched on entity before any table is touched',
        () async {
      await insertTask('same-id', title: 'untouched');
      await db.into(db.reminders).insert(
        RemindersCompanion.insert(
          id: 'same-id',
          title: 'the reminder',
          remindAt: now.add(const Duration(hours: 1)),
          createdAt: now,
          updatedAt: now,
          pendingOp: const Value(PendingOps.update),
        ),
      );
      api.next = reply(
        rejections: [
          {'entity': 'reminders', 'id': 'same-id', 'reason': 'gone'},
        ],
      );

      await engine.sync();

      // The reminder is gone and the task with the same id is not. Feeding a
      // refused reminder through the task path corrupts rather than crashes,
      // which is why the engine looks the entity up instead of casting.
      expect(await task('same-id'), isNotNull);
      expect(
        await (db.select(db.reminders)..where((r) => r.id.equals('same-id')))
            .getSingleOrNull(),
        isNull,
      );
    });

    test('a purge goes for good once the server accepts it', () async {
      await insertTask('erase-me', deletedAt: now, pendingOp: PendingOps.purge);
      api.next = reply(accepted: {'tasks': ['erase-me']});

      await engine.sync();

      // A hard-deleted row appears in no pull, so its absence can only be
      // recognised from having pushed it and not been refused.
      expect(await task('erase-me'), isNull);
    });

    /// A refused *meeting* fed through the task path would write a meeting's id
    /// into a task row — corruption rather than a crash, which is why the
    /// engine looks the entity up instead of casting. The reminders case above
    /// is the same rule; this one is here because P5 is the phase that added
    /// two entities to the map, and the failure mode of forgetting one is that
    /// its rejections silently fall through to `debugPrint`.
    test('a rejection for a meeting never touches a task of the same id',
        () async {
      await insertTask('same-id', title: 'untouched');
      await db.into(db.meetings).insert(
        MeetingsCompanion.insert(
          id: 'same-id',
          title: 'the meeting',
          startAt: now.add(const Duration(hours: 1)),
          createdAt: now,
          updatedAt: now,
          pendingOp: const Value(PendingOps.update),
        ),
      );
      api.next = reply(
        rejections: [
          {'entity': 'meetings', 'id': 'same-id', 'reason': 'gone'},
        ],
      );

      await engine.sync();

      expect(await task('same-id'), isNotNull);
      expect((await task('same-id'))!.title, 'untouched');
      expect(
        await (db.select(db.meetings)..where((r) => r.id.equals('same-id')))
            .getSingleOrNull(),
        isNull,
      );
    });

    test('a refused purge keeps the row, so nothing is lost', () async {
      await insertTask('live-row', pendingOp: PendingOps.purge);
      api.next = reply(
        rejections: [
          {
            'entity': 'tasks',
            'id': 'live-row',
            'reason': 'not_deleted',
            'server': serverTask('live-row', title: 'still alive'),
          },
        ],
      );

      await engine.sync();

      expect((await task('live-row'))!.title, 'still alive');
    });
  });

  // ── the attempt cap ────────────────────────────────────────────────────────

  group('the push-attempt cap', () {
    test('stops re-sending at the cap but never discards the edit', () async {
      await insertTask(
        'stuck',
        title: 'the member wrote this',
        pendingOp: PendingOps.update,
        pushAttempts: SyncEngine.maxPushAttempts,
      );
      api.next = reply();

      await engine.sync();

      expect(api.calls.single.push.containsKey('tasks'), isFalse);
      final row = await task('stuck');
      // Still there, still theirs, still marked as unsaved.
      expect(row!.title, 'the member wrote this');
      expect(row.pendingOp, PendingOps.update);
      expect(engine.lastOutcome!.blocked.single.id, 'stuck');
    });

    test('retry puts a blocked row back in the outbox', () async {
      await insertTask(
        'stuck',
        pendingOp: PendingOps.update,
        pushAttempts: SyncEngine.maxPushAttempts,
      );

      api.next = reply();
      await engine.retry('tasks', 'stuck');
      // `retry` kicks the engine, and `kick` is fire-and-forget; awaiting one
      // more pass is what makes the assertion about the *next* request rather
      // than a race with it.
      api.next = reply(accepted: {'tasks': ['stuck']});
      await engine.sync();

      expect((await task('stuck'))!.pushAttempts, 0);
    });

    test('an offline pass burns no attempt', () async {
      await insertTask('outbound', pendingOp: PendingOps.update);
      api.fail = true;

      await engine.sync();

      expect((await task('outbound'))!.pushAttempts, 0);
    });
  });

  // ── the latch and the alarms ───────────────────────────────────────────────

  group('every pass', () {
    test('re-arms the alarms even when the network step failed', () async {
      api.fail = true;

      await engine.sync();

      // Always, online or not — the alarms are the product, and a pass that
      // could not reach the server has still seen every local edit since the
      // last one.
      expect(scheduler.passes, 1);
      expect(engine.lastOutcome!.reachedServer, isFalse);
    });

    test('two concurrent callers share one pass', () async {
      api.next = reply();

      await Future.wait([engine.sync(), engine.sync(), engine.sync()]);

      // One request for three callers, and exactly one queued re-run behind it:
      // a burst of edits must not start a stampede.
      expect(api.calls.length, lessThanOrEqualTo(2));
    });
  });

  // ── the chat's two entities ─────────────────────────────────────────────────

  group('conversations and messages', () {
    Map<String, dynamic> serverConversation(
      String id, {
      String kind = 'coach',
      int clearedUpToSeq = 0,
      DateTime? updatedAt,
    }) => {
      'id': id,
      'kind': kind,
      'title': kind,
      'pinned': kind != 'free',
      'archived': false,
      'clearedUpToSeq': clearedUpToSeq,
      'lastMessageAt': null,
      'createdAt': now.toIso8601String(),
      'updatedAt': (updatedAt ?? now).toIso8601String(),
      'deletedAt': null,
    };

    Map<String, dynamic> serverMessage(
      int seq, {
      String conversationId = 'coach-1',
      String role = 'assistant',
      String content = 'About 120 g.',
      String? clientId,
    }) => {
      'seq': seq,
      'conversationId': conversationId,
      'role': role,
      'content': content,
      'clientId': clientId,
      'composedAt': null,
      'intent': null,
      'createdAt': now.toIso8601String(),
    };

    test('the request carries the message watermark, and a pull advances it',
        () async {
      api.next = reply(
        pull: {
          'conversations': [serverConversation('coach-1')],
          'messages': [serverMessage(1), serverMessage(2)],
        },
      );
      await engine.sync();

      // The cursor for this one table is a single integer, because messages
      // have no `updatedAt` to cut a delta on.
      expect(await db.getValue(DbKeys.messagesLastSeq), '2');
      expect(
        (await db.select(db.messages).get()).map((r) => r.seq),
        [1, 2],
      );
    });

    test('the watermark is never moved backwards by a pass that pulled nothing',
        () async {
      await db.setValue(DbKeys.messagesLastSeq, '9');
      api.next = reply(
        pull: {
          'conversations': [serverConversation('coach-1')],
          'messages': const <dynamic>[],
        },
      );
      await engine.sync();

      // `repullMessages` rewinds this key on purpose when a schema change makes
      // the cache wrong. A quiet pass that stored a nought over it would undo
      // that — and, worse, would re-download the member's whole history on
      // every empty sync.
      expect(await db.getValue(DbKeys.messagesLastSeq), '9');
    });

    test('a full snapshot does not sweep the message history away', () async {
      api.next = reply(
        pull: {
          'conversations': [serverConversation('coach-1')],
          'messages': [serverMessage(1)],
        },
      );
      await engine.sync();

      // A second pass, full, carrying no messages — which is what a full
      // snapshot looks like for this entity: the message pull is cut on
      // `seq > lastSeq` whether the snapshot is full or not, so "everything"
      // still means "everything the device does not have". Sweeping against
      // that set would delete the member's entire transcript.
      api.next = reply(
        full: true,
        pull: {
          'conversations': [serverConversation('coach-1')],
          'messages': const <dynamic>[],
        },
      );
      await engine.sync();

      expect(await db.select(db.messages).get(), hasLength(1));
    });

    test('a raised clear watermark deletes the messages it covers', () async {
      api.next = reply(
        pull: {
          'conversations': [serverConversation('coach-1')],
          'messages': [serverMessage(1), serverMessage(2), serverMessage(3)],
        },
      );
      await engine.sync();
      expect(await db.select(db.messages).get(), hasLength(3));

      // The clear was made on another device, so it reaches this one as a
      // conversation row with a higher watermark and nothing else. The server's
      // half only stops those messages being *sent* again; this device already
      // holds them, and FR-011 says nothing cleared may appear in the history a
      // screen shows — on any device, including one that has been away.
      api.next = reply(
        pull: {
          'conversations': [
            serverConversation(
              'coach-1',
              clearedUpToSeq: 2,
              updatedAt: now.add(const Duration(minutes: 1)),
            ),
          ],
          'messages': const <dynamic>[],
        },
      );
      await engine.sync();

      expect(
        (await db.select(db.messages).get()).map((r) => r.seq),
        [3],
      );
      expect(
        (await db.select(db.conversations).get()).single.clearedUpToSeq,
        2,
      );
    });

    test('a pulled message retires the outbox row that composed it', () async {
      await db.into(db.pendingMessages).insert(
        PendingMessagesCompanion.insert(
          clientId: 'client-7',
          conversationId: 'coach-1',
          body: 'remind me to call Dad in two hours',
          composedAt: now,
        ),
      );

      api.next = reply(
        pull: {
          'conversations': [serverConversation('coach-1')],
          'messages': [
            serverMessage(
              4,
              role: 'user',
              content: 'remind me to call Dad in two hours',
              clientId: 'client-7',
            ),
          ],
        },
      );
      await engine.sync();

      // Matched on the client id and not on the text — a member who sends "yes"
      // twice has two rows. Without this the sentence renders twice: once as
      // the queued bubble that never went away, and once as the message the
      // server issued a sequence for.
      expect(await db.select(db.pendingMessages).get(), isEmpty);
      expect(await db.select(db.messages).get(), hasLength(1));
    });

    test('the same message pulled twice is one row', () async {
      // The cursor the server cuts on is `now - 5 s`, lagged on purpose so a
      // transaction that committed just after a read arrives twice rather than
      // never. A plain insert would throw on the primary key and abort a pass
      // that is also carrying the member's tasks.
      final page = reply(
        pull: {
          'conversations': [serverConversation('coach-1')],
          'messages': [serverMessage(5)],
        },
      );
      api.next = page;
      await engine.sync();
      api.next = page;
      await engine.sync();

      expect(await db.select(db.messages).get(), hasLength(1));
    });

    test('a full page asks again, and stops at the cap', () async {
      // `moreMessages` lives inside `pull`, which is where the server puts it:
      // it is the one key in that map that is not an entity's rows.
      api.next = {
        ...reply(
          pull: {
            'conversations': [serverConversation('coach-1')],
            'messages': [serverMessage(1)],
          },
        ),
      };
      (api.next['pull'] as Map<String, dynamic>)['moreMessages'] = true;

      // This fake answers "there is more" for ever, which is the case the cap
      // exists for and which is not hypothetical: a gateway whose page does
      // not advance the watermark says exactly this, and the first version of
      // this test hung the whole suite because nothing stopped the drain.
      await engine.sync();

      // One round trip, then the pages the cap allows — and then it ends.
      expect(api.calls.length, SyncEngine.maxMessagePages + 1);
    });
  });

  // ── meetings and personal events (P5) ──────────────────────────────────────

  /// The two entities P5 adds, and the three things about them that are not
  /// already covered by the rules asserted above on tasks.
  group('meetings and personal events', () {
    test('a pushed meeting carries its rule and its place as objects', () async {
      // The server's adapter reads `fields.location.onlineLink` and
      // `fields.recurrence.dtstart`. The phone stores both as JSON *text*, so
      // sending the column verbatim would arrive as a location with neither
      // half — refused `location_required` for ever, on a meeting the member
      // can see is fine.
      final start = now.add(const Duration(days: 1));
      await db.into(db.meetings).insert(
        MeetingsCompanion.insert(
          id: 'meet-1',
          title: 'Standup',
          startAt: start,
          durationMin: const Value(45),
          authoredTimezone: const Value('Africa/Cairo'),
          locationJson: const Value(
            '{"onlineLink":"https://meet.example/abc","address":null}',
          ),
          reminderOffsetsJson: const Value('[1440,30]'),
          recurrenceJson: Value(
            '{"dtstart":"${start.toIso8601String()}",'
            '"rrule":"FREQ=WEEKLY;COUNT=6","exdates":[],"overrides":[]}',
          ),
          createdAt: now,
          updatedAt: now,
          pendingOp: const Value(PendingOps.create),
        ),
      );
      api.next = reply(accepted: {'meetings': ['meet-1']});

      await engine.sync();

      final pushed = (api.calls.single.push['meetings'] as List).single
          as Map<String, dynamic>;
      final data = pushed['data'] as Map<String, dynamic>;
      expect(pushed['op'], PendingOps.create);
      expect(data['location'], isA<Map<String, dynamic>>());
      expect(
        (data['location'] as Map)['onlineLink'],
        'https://meet.example/abc',
      );
      expect(data['recurrence'], isA<Map<String, dynamic>>());
      expect((data['recurrence'] as Map)['rrule'], 'FREQ=WEEKLY;COUNT=6');
      // Whole numbers, not strings: the server refuses a non-integer offset.
      expect(data['reminderOffsets'], <int>[1440, 30]);
      expect(data['durationMin'], 45);
      // `authoredTimezone` is deliberately absent. The server reads it from the
      // member's profile and refuses a pushed copy, because a client that could
      // rewrite it would move every occurrence of the series with nothing on
      // the row visibly changing.
      expect(data.containsKey('authoredTimezone'), isFalse);
    });

    test('a pulled meeting keeps the rule, the place and the server zone',
        () async {
      final start = now.add(const Duration(days: 2));
      api.next = reply(
        pull: {
          'meetings': [
            {
              'id': 'meet-2',
              'title': 'Review',
              'description': 'quarterly',
              'startAt': start.toIso8601String(),
              'durationMin': 60,
              'allDay': false,
              'lockTimezone': 'Africa/Cairo',
              'authoredTimezone': 'Africa/Cairo',
              'location': {'onlineLink': null, 'address': 'Room 1'},
              'prepNotes': 'read the deck',
              'prepMinutes': 15,
              'reminderOffsets': [60],
              'recurrence': {
                'dtstart': start.toIso8601String(),
                'rrule': 'FREQ=MONTHLY;BYMONTHDAY=-1',
                'exdates': <String>[],
                'overrides': <dynamic>[],
              },
              'status': 'scheduled',
              'completedAt': null,
              'source': 'app',
              'createdAt': now.toIso8601String(),
              'updatedAt': now.toIso8601String(),
              'deletedAt': null,
            },
          ],
          'calendar_events': [
            {
              'id': 'event-1',
              'title': 'Birthday',
              'notes': null,
              'startAt': start.toIso8601String(),
              'endAt': start.add(const Duration(days: 1)).toIso8601String(),
              'allDay': true,
              'color': '#0ea5e9',
              'recurrence': null,
              'authoredTimezone': 'Africa/Cairo',
              'createdAt': now.toIso8601String(),
              'updatedAt': now.toIso8601String(),
              'deletedAt': null,
            },
          ],
        },
      );

      await engine.sync();

      final row = (await db.select(db.meetings).get()).single;
      expect(row.title, 'Review');
      expect(row.durationMin, 60);
      expect(row.prepMinutes, 15);
      expect(row.lockTimezone, 'Africa/Cairo');
      expect(row.authoredTimezone, 'Africa/Cairo');
      expect(row.locationJson, contains('Room 1'));
      expect(row.recurrenceJson, contains('BYMONTHDAY=-1'));
      expect(row.reminderOffsetsJson, '[60]');
      // The server's own timestamp, kept apart from any local edit time: it is
      // what makes the next push uncontested and so clock-free.
      expect(row.baseUpdatedAt, isNotNull);
      expect(row.pendingOp, isNull);

      final event = (await db.select(db.calendarEvents).get()).single;
      expect(event.allDay, isTrue);
      expect(event.color, '#0ea5e9');
      expect(event.recurrenceJson, isNull);
    });

    test('a purge erases the meeting once the server has accepted it',
        () async {
      await db.into(db.meetings).insert(
        MeetingsCompanion.insert(
          id: 'erase-me',
          title: 'Cancelled series',
          startAt: now,
          createdAt: now,
          updatedAt: now,
          deletedAt: Value(now),
          pendingOp: const Value(PendingOps.purge),
        ),
      );
      api.next = reply(accepted: {'meetings': ['erase-me']});

      await engine.sync();

      // A hard-deleted row appears in no pull, so its absence can only be
      // recognised from having pushed it and not been refused.
      expect(await db.select(db.meetings).get(), isEmpty);
    });
  });
}

/// Answers whatever the test queued, and records what was asked.
///
/// A subclass overriding one method rather than a dio interceptor: the engine
/// uses exactly one call, and what these tests are about is the *arguments* to
/// it — the cursor and the push payload — which an interceptor would make the
/// test decode out of a request body.
class _FakeApi extends ApiClient {
  _FakeApi()
    : super(
        TokenStore(InMemorySecretStore()),
        baseUrl: 'http://example.invalid',
      );

  final List<({String? since, Map<String, dynamic> push})> calls = [];
  Map<String, dynamic> next = const {};

  /// Offline, which is the normal state of this application rather than an
  /// error.
  bool fail = false;

  @override
  Future<Map<String, dynamic>> sync({
    required String installId,
    required List<String> entities,
    String? since,
    int? lastSeq,
    Map<String, dynamic> push = const {},
  }) async {
    calls.add((since: since, push: push));
    if (fail) throw ApiException('offline', isOffline: true);
    return next;
  }
}

class _FakeScheduler extends NotificationScheduler {
  int passes = 0;

  @override
  Future<int> rescheduleAll(AppDatabase db, {DateTime? now}) async {
    passes++;
    return 0;
  }
}
