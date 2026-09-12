import 'package:botvy/core/api/api_client.dart';
import 'package:botvy/core/db/database.dart';
import 'package:botvy/core/notifications/local_notifications.dart';
import 'package:botvy/core/sync/sync_engine.dart';
import 'package:botvy/features/knowledge/application/knowledge_cubit.dart';
import 'package:drift/drift.dart' show Value;
import 'package:drift/native.dart';
import 'package:flutter_test/flutter_test.dart';

/// Saved links on the phone (T741, T742), against the real drift database in
/// memory.
///
/// In memory rather than mocked, for the reason every other cubit test in this
/// suite gives: what this cubit *is* is a set of queries and a set of
/// `pendingOp` rules, and a mocked repository would assert that the cubit calls
/// the methods the cubit calls.
///
/// The one thing worth stating about this feature's tests specifically: almost
/// nothing here is the phone's decision. The URL is normalised on the server,
/// the kind is recognised there, the reading happens there, and the states
/// arrive by sync. So these cases are about the narrow set of things the phone
/// *does* decide — what it writes locally, what it pushes, and which of the
/// server's six states it shows as which of the member's three words.
void main() {
  late AppDatabase db;
  late _FakeApi api;
  late SyncEngine engine;
  late KnowledgeCubit cubit;

  setUp(() {
    db = AppDatabase.forTesting(NativeDatabase.memory());
    api = _FakeApi();
    engine = SyncEngine(api, db, _SilentScheduler());
    cubit = KnowledgeCubit(db, engine, api);
  });

  tearDown(() async {
    // Join whatever pass is in flight before closing anything: every write
    // kicks the engine fire-and-forget, so at teardown there is usually a read
    // part way through, and closing the database under it throws from inside
    // the engine as an unhandled async error that fails the *next* test.
    // `await engine.sync()` joins the running pass rather than starting a
    // second one, which is the idiom the other cubit tests use.
    await engine.sync();
    engine.dispose();
    await cubit.close();
    await db.close();
  });

  group('the three words the member reads', () {
    test('collapses the server’s six states onto five phases', () {
      // `fetching` and `extracting` are one thing from outside — Botvy is
      // reading the page — and two states on the server because a crash
      // between them says where the work stopped.
      expect(phaseOf('queued'), LinkPhase.waiting);
      expect(phaseOf('fetching'), LinkPhase.reading);
      expect(phaseOf('extracting'), LinkPhase.reading);
      expect(phaseOf('summarising'), LinkPhase.summarising);
      expect(phaseOf('done'), LinkPhase.done);
      expect(phaseOf('failed'), LinkPhase.failed);
    });

    test('reads a status it has never heard of as failed', () {
      // A newer gateway can invent one. Failed is the safe reading: it shows a
      // reason and offers a retry, where "waiting" would leave the member
      // watching a row that never moves.
      expect(phaseOf('quantum'), LinkPhase.failed);
    });
  });

  group('saving', () {
    test('writes a queued row the sync engine will push', () async {
      final id = await cubit.save(
        ' https://example.com/split ',
        tags: ['gym'],
      );

      final row = await cubit.byId(id!);
      expect(row!.url, 'https://example.com/split');
      expect(row.status, 'queued');
      // The id is minted here, so the row exists before the server has heard
      // of it and a retried push is a no-op rather than a duplicate.
      expect(row.pendingOp, PendingOps.create);
      // The kind and the title are the *server's* to decide — it recognises a
      // YouTube URL from the URL itself — so the phone leaves them alone.
      expect(row.kind, 'article');
      expect(row.title, isNull);
    });

    test('pushes only the url and the tags', () async {
      await cubit.save('https://example.com/split', tags: ['gym']);
      await engine.sync();

      final pushed = api.calls
          .expand((push) => (push['links'] as List? ?? const []))
          .cast<Map<String, dynamic>>()
          .toList();
      // Not a count: the fake acknowledges nothing, so the row stays pending
      // and every pass re-sends it — which is the engine working. What this
      // case is about is the *shape* of what goes out.
      expect(pushed, isNotEmpty);
      expect(pushed.first['op'], 'create');
      // Asserted on the payload's *shape*, not on the server's behaviour: a
      // push carrying a `status` would be the phone telling the server it had
      // read an article itself, and the adapter refuses it as `invalid`.
      expect(pushed.first['data'], {
        'url': 'https://example.com/split',
        'tags': ['gym'],
      });
    });

    test('answers the row it already has rather than making a second', () async {
      final first = await cubit.save('https://example.com/split');
      final again = await cubit.save('https://example.com/split');

      expect(again, first);
      expect(cubit.state.links, hasLength(1));
    });

    test('refuses an empty paste with a sentence rather than a row', () async {
      expect(await cubit.save('   '), isNull);
      expect(cubit.state.problem, isNotNull);
      expect(cubit.state.links, isEmpty);
    });
  });

  group('the list', () {
    test('hides a playlist’s videos inside it', () async {
      final parent = await cubit.save('https://youtube/playlist?list=PLabc');
      await db.into(db.links).insert(
        LinksCompanion.insert(
          id: 'child-1',
          url: 'https://youtube/watch?v=one',
          parentLinkId: Value(parent),
          addedAt: DateTime.now().toUtc(),
          createdAt: DateTime.now().toUtc(),
          updatedAt: DateTime.now().toUtc(),
        ),
      );

      await cubit.refresh();
      // One save is one row in the list. Listing a playlist's fifty videos
      // beside it turns one save into fifty rows the member did not ask for.
      expect(cubit.state.links.map((l) => l.id), [parent]);
      expect(await cubit.childrenOf(parent!), hasLength(1));
    });

    test('filters by the member’s word, not the server’s state', () async {
      final reading = await cubit.save('https://example.com/one');
      final done = await cubit.save('https://example.com/two');
      await (db.update(db.links)..where((r) => r.id.equals(reading!)))
          .write(const LinksCompanion(status: Value('extracting')));
      await (db.update(db.links)..where((r) => r.id.equals(done!)))
          .write(const LinksCompanion(status: Value('done')));

      await cubit.showOnly(LinkPhase.reading);
      // `extracting` is one of the two states behind "reading", so filtering on
      // the word finds it.
      expect(cubit.state.links.map((l) => l.id), [reading]);

      await cubit.showOnly(null);
      expect(cubit.state.links, hasLength(2));
    });

    test('drops a removed link and marks it for the push', () async {
      final id = await cubit.save('https://example.com/one');
      await cubit.remove(id!);

      expect(cubit.state.links, isEmpty);
      final row = await cubit.byId(id);
      // A tombstone, not a removal: the client's delete sweep runs only against
      // a full snapshot, so a row removed outright would stay on every device.
      expect(row!.deletedAt, isNotNull);
      expect(row.pendingOp, PendingOps.delete);
    });
  });

  group('retrying', () {
    test('does not move the row itself', () async {
      final id = await cubit.save('https://example.com/one');
      await (db.update(db.links)..where((r) => r.id.equals(id!)))
          .write(const LinksCompanion(status: Value('failed')));

      await cubit.retry(id!);

      // The server may refuse — the attempts can be spent — and a phone that
      // showed the member a link back in the queue and then had to put it back
      // to failed would be showing them a state the product is not in.
      expect((await cubit.byId(id))!.status, 'failed');
      expect(api.retried, [id]);
    });

    test('surfaces the refusal when the attempts are spent', () async {
      final id = await cubit.save('https://example.com/one');
      api.retryRefusal = 'This link has been refused 3 times.';

      await cubit.retry(id!);
      expect(cubit.state.problem, contains('refused 3 times'));
    });
  });

  group('media', () {
    test('resolves a proxied path against this installation’s gateway', () {
      // FR-008: every picture comes through Botvy's own signed path. The server
      // serves it as a *path*, because the signature is over the target and the
      // origin is whatever this member's Botvy is reached by.
      expect(
        cubit.mediaUrl('/media?url=x&sig=y'),
        'http://example.invalid/media?url=x&sig=y',
      );
    });

    test('leaves an absolute URL alone and answers null for nothing', () {
      expect(cubit.mediaUrl('https://cdn.example.com/a.png'),
          'https://cdn.example.com/a.png');
      // Null means this installation has no signing secret. The screen renders
      // no picture rather than falling back to the source's own address, which
      // would quietly defeat FR-008 on exactly the installation whose Owner had
      // not finished configuring it.
      expect(cubit.mediaUrl(null), isNull);
      expect(cubit.mediaUrl(''), isNull);
    });
  });

  group('suggestions', () {
    test('loads the inbox and clears it as the member answers', () async {
      api.inbox = [
        {
          'id': 'suggestion-1',
          'sport': 'gym',
          'forDate': '2026-09-20',
          'draft': {'title': 'Upper body', 'exercises': []},
          'sources': [],
        },
      ];
      await cubit.loadSuggestions();
      expect(cubit.state.suggestions, hasLength(1));

      api.inbox = const [];
      await cubit.accept('suggestion-1');
      expect(api.accepted, ['suggestion-1']);
      expect(cubit.state.suggestions, isEmpty);
    });

    test('dismisses without touching a session', () async {
      api.inbox = const [];
      await cubit.dismiss('suggestion-2');
      expect(api.dismissed, ['suggestion-2']);
      expect(api.accepted, isEmpty);
    });
  });
}

class _FakeApi extends ApiClient {
  _FakeApi()
    : super(
        TokenStore(InMemorySecretStore()),
        baseUrl: 'http://example.invalid',
      );

  /// Every push body this test sent, so the payload's *shape* can be asserted
  /// rather than the consumer's behaviour — which passes with a fallback in
  /// place.
  final List<Map<String, dynamic>> calls = [];
  final List<String> retried = [];
  final List<String> accepted = [];
  final List<String> dismissed = [];

  Map<String, dynamic> next = const {};
  List<Map<String, dynamic>> inbox = const [];
  String? retryRefusal;

  @override
  Future<Map<String, dynamic>> sync({
    required String installId,
    required List<String> entities,
    String? since,
    int? lastSeq,
    Map<String, dynamic> push = const {},
  }) async {
    calls.add(push);
    return next;
  }

  @override
  Future<({String status, int attempts, String? refusal})> retryLink(
    String linkId,
  ) async {
    retried.add(linkId);
    return (status: 'queued', attempts: 1, refusal: retryRefusal);
  }

  @override
  Future<List<Map<String, dynamic>>> suggestions({
    String status = 'pending',
  }) async => inbox;

  @override
  Future<void> acceptSuggestion(String id, {String? sessionId}) async {
    accepted.add(id);
  }

  @override
  Future<void> dismissSuggestion(String id) async {
    dismissed.add(id);
  }
}

class _SilentScheduler extends NotificationScheduler {
  @override
  Future<int> rescheduleAll(AppDatabase db, {DateTime? now}) async => 0;
}
