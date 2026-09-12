import 'dart:async';
import 'dart:convert';

// Imported whole rather than by name: `Value` and the `&` of the query builder
// are extension members, and an extension only applies when its library is
// imported outright.
import 'package:drift/drift.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:uuid/uuid.dart';

import '../../../core/api/api_client.dart';
import '../../../core/db/database.dart';
import '../../../core/sync/sync_engine.dart';

const Uuid _uuid = Uuid();

/// What the member reads, which is three words where the server has six states.
///
/// `fetching` and `extracting` are one thing from outside — Botvy is reading
/// the page — and two states on the server because a crash between them says
/// where the work stopped. `spec.md`'s own glossary records the translation,
/// and it lives here rather than in a widget so the list, the detail screen and
/// any future notification all say the same word.
enum LinkPhase { waiting, reading, summarising, done, failed }

LinkPhase phaseOf(String status) => switch (status) {
  'queued' => LinkPhase.waiting,
  'fetching' || 'extracting' => LinkPhase.reading,
  'summarising' => LinkPhase.summarising,
  'done' => LinkPhase.done,
  _ => LinkPhase.failed,
};

/// One suggestion, as the inbox holds it.
///
/// A plain map from the read rather than a typed model, and that is a decision
/// rather than laziness: nothing on the phone *edits* a suggestion — the two
/// actions are commands that go straight back to the server — so a model would
/// be a second description of a shape the GraphQL query already fixes, with
/// nothing to gain from it but the work of keeping the two in step.
typedef SuggestionCard = Map<String, dynamic>;

class KnowledgeState {
  const KnowledgeState({
    this.loading = true,
    this.links = const [],
    this.suggestions = const [],
    this.filter,
    this.busy = const {},
    this.problem,
  });

  final bool loading;

  /// The member's links, newest first, **top level only**: a playlist's videos
  /// are shown inside it rather than scattered through the list.
  final List<LocalLink> links;

  final List<SuggestionCard> suggestions;

  /// A phase to show alone, or null for everything.
  final LinkPhase? filter;

  /// Ids with a command in flight, so a second tap does nothing.
  final Set<String> busy;

  final String? problem;

  KnowledgeState copyWith({
    bool? loading,
    List<LocalLink>? links,
    List<SuggestionCard>? suggestions,
    LinkPhase? filter,
    bool clearFilter = false,
    Set<String>? busy,
    String? problem,
    bool clearProblem = false,
  }) => KnowledgeState(
    loading: loading ?? this.loading,
    links: links ?? this.links,
    suggestions: suggestions ?? this.suggestions,
    filter: clearFilter ? null : (filter ?? this.filter),
    busy: busy ?? this.busy,
    problem: clearProblem ? null : (problem ?? this.problem),
  );
}

/// What the member saved to read, and what came of it (P7).
///
/// ## The list is local and the summary is not
///
/// Everything the list draws comes from the `links` table, so it renders with
/// the network off and a link saved on a plane appears immediately. The
/// **summary** does not: a knowledge document runs to sixty thousand characters
/// and the phone shows one at a time, so it is fetched over GraphQL when the
/// member opens a link and forgotten when they leave. [LocalLink.docId] is what
/// tells the list there is something to fetch.
///
/// ## Saving is a row and retrying is a command
///
/// Saving writes a local row with `pendingOp: create` and lets the sync engine
/// push it — which is what makes it work offline and what makes a retried push
/// a no-op, because the id is minted here. Retrying is REST, because `status`
/// and `attempts` are the server's record of work it did and the sync adapter
/// refuses an edit to them: what the member is asking for is not "set this row
/// back to queued", it is "do the work again", which has a limit attached and
/// an answer worth reading.
///
/// Accepting and dismissing a suggestion are commands for the same reason, and
/// a stronger one: accepting fills a **session**, which is another context's
/// row that this phone has no business writing.
class KnowledgeCubit extends Cubit<KnowledgeState> {
  KnowledgeCubit(this._db, this._sync, this._api)
    : super(const KnowledgeState());

  final AppDatabase _db;
  final SyncEngine _sync;
  final ApiClient _api;

  StreamSubscription<SyncOutcome>? _passes;

  /// Refreshes after every sync pass, because a link's whole life happens on
  /// the server: a row saved here as `queued` becomes `reading` and then `done`
  /// with nothing on this device doing anything.
  void listenToSync() {
    _passes ??= _sync.outcomes.listen((_) => unawaited(refresh()));
  }

  @override
  Future<void> close() async {
    await _passes?.cancel();
    return super.close();
  }

  void clearProblem() => emit(state.copyWith(clearProblem: true));

  Future<void> showOnly(LinkPhase? phase) async {
    emit(
      phase == null
          ? state.copyWith(clearFilter: true)
          : state.copyWith(filter: phase),
    );
    await refresh();
  }

  Future<void> refresh() async {
    if (isClosed) return;

    final rows = await (_db.select(_db.links)
          ..where(
            (r) =>
                r.deletedAt.isNull() &
                notPendingOp(r.pendingOp, PendingOps.purge) &
                // Top level only. A playlist's videos belong inside the
                // playlist; listing them beside it turns one save into fifty
                // rows the member did not ask for.
                r.parentLinkId.isNull(),
          )
          ..orderBy([
            (r) => OrderingTerm(expression: r.addedAt, mode: OrderingMode.desc),
          ]))
        .get();

    final filter = state.filter;
    final links = filter == null
        ? rows
        : [for (final row in rows) if (phaseOf(row.status) == filter) row];

    if (isClosed) return;
    emit(state.copyWith(loading: false, links: links));
  }

  /// A playlist's videos, for the detail screen.
  Future<List<LocalLink>> childrenOf(String linkId) =>
      (_db.select(_db.links)
            ..where((r) => r.parentLinkId.equals(linkId) & r.deletedAt.isNull())
            ..orderBy([(r) => OrderingTerm(expression: r.addedAt)]))
          .get();

  Future<LocalLink?> byId(String id) =>
      (_db.select(_db.links)..where((r) => r.id.equals(id))).getSingleOrNull();

  // ── saving, which works offline ───────────────────────────────────────────

  /// Saves a link (FR-001).
  ///
  /// The id is minted here, so the row exists before the server has heard of
  /// it and a retried push is a no-op rather than a duplicate. The `kind` is
  /// left at the column's default and the `title` at null: both are the
  /// *server's* to decide — it recognises a YouTube URL from the URL itself —
  /// and a phone that guessed would show the member one thing and the next
  /// sync pass another.
  ///
  /// Returns the id, so a share-sheet handler can open what it just saved.
  Future<String?> save(String url, {List<String> tags = const []}) async {
    final trimmed = url.trim();
    if (trimmed.isEmpty) {
      emit(state.copyWith(problem: 'Paste a link first.'));
      return null;
    }

    // A local duplicate is answered locally, so the member is told at once
    // rather than after a round trip. It is a *courtesy* rather than the rule:
    // the server normalises the URL and this does not, so two spellings of one
    // article are collapsed there and only there. FR-005 lives on the server.
    final existing = await (_db.select(_db.links)
          ..where((r) => r.url.equals(trimmed) & r.deletedAt.isNull()))
        .getSingleOrNull();
    if (existing != null) return existing.id;

    final now = DateTime.now().toUtc();
    final id = _uuid.v7();
    await _db.into(_db.links).insert(
      LinksCompanion.insert(
        id: id,
        url: trimmed,
        tagsJson: Value(jsonEncode(tags)),
        addedAt: now,
        createdAt: now,
        updatedAt: now,
        pendingOp: const Value(PendingOps.create),
      ),
    );

    _sync.kick();
    await refresh();
    return id;
  }

  /// Removes a link. A playlist's videos follow it on the server.
  Future<void> remove(String id) async {
    final now = DateTime.now().toUtc();
    await (_db.update(_db.links)..where((r) => r.id.equals(id))).write(
      LinksCompanion(
        deletedAt: Value(now),
        updatedAt: Value(now),
        pendingOp: const Value(PendingOps.delete),
      ),
    );
    _sync.kick();
    await refresh();
  }

  Future<void> restore(String id) async {
    final now = DateTime.now().toUtc();
    await (_db.update(_db.links)..where((r) => r.id.equals(id))).write(
      LinksCompanion(
        deletedAt: const Value(null),
        updatedAt: Value(now),
        pendingOp: const Value(PendingOps.restore),
      ),
    );
    _sync.kick();
    await refresh();
  }

  // ── the commands ──────────────────────────────────────────────────────────

  /// "Try that again" (FR-003).
  ///
  /// The local row is **not** moved to `waiting` optimistically. The server may
  /// refuse — the attempts can be spent — and a phone that showed the member a
  /// link back in the queue and then had to put it back to failed would be
  /// showing them a state the product is not in. The sync pass brings the real
  /// row.
  Future<void> retry(String id) async {
    if (state.busy.contains(id)) return;
    emit(state.copyWith(busy: {...state.busy, id}));
    try {
      final answer = await _api.retryLink(id);
      if (answer.refusal != null) {
        emit(state.copyWith(problem: answer.refusal));
      } else {
        _sync.kick();
      }
    } on ApiException catch (e) {
      if (!isClosed) emit(state.copyWith(problem: e.message));
    } finally {
      if (!isClosed) {
        emit(state.copyWith(busy: {...state.busy}..remove(id)));
        await refresh();
      }
    }
  }

  /// A proxied media path, made absolute against this installation's gateway.
  ///
  /// The server serves `/media?url=…&sig=…` as a **path**: the signature is
  /// over the target, and the origin is whatever this member's Botvy is
  /// reached by — which the server cannot know and the phone already holds.
  /// Resolving here rather than on the server is what keeps one installation's
  /// summaries readable from a tunnel, from the LAN and from a phone that
  /// changed network between saving and reading.
  ///
  /// Null in, null out: a null URL means this installation has no signing
  /// secret, and the screen renders no picture rather than falling back to the
  /// source's own address — which would quietly defeat FR-008 on exactly the
  /// installation whose Owner had not finished configuring it.
  String? mediaUrl(String? path) {
    if (path == null || path.isEmpty) return null;
    if (path.startsWith('http://') || path.startsWith('https://')) return path;
    return '${_api.origin}$path';
  }

  /// One link's summary and, for a playlist, its videos.
  ///
  /// Null when the network is not there, which the detail screen renders as
  /// "the summary is on the server" rather than as an error — the member still
  /// has the title, the state and the link out from the local row.
  Future<Map<String, dynamic>?> detail(String id) async {
    try {
      return await _api.link(id);
    } on ApiException {
      return null;
    }
  }

  // ── suggestions ───────────────────────────────────────────────────────────

  Future<void> loadSuggestions() async {
    try {
      final rows = await _api.suggestions();
      if (!isClosed) emit(state.copyWith(suggestions: rows));
    } on ApiException catch (e) {
      if (!isClosed) emit(state.copyWith(problem: e.message));
    }
  }

  /// The member takes a suggestion (FR-010).
  ///
  /// A sync pass follows, because the session it filled was written on the
  /// server and this device has not seen it yet.
  Future<void> accept(String suggestionId, {String? sessionId}) async {
    if (state.busy.contains(suggestionId)) return;
    emit(state.copyWith(busy: {...state.busy, suggestionId}));
    try {
      await _api.acceptSuggestion(suggestionId, sessionId: sessionId);
      _sync.kick();
      await loadSuggestions();
    } on ApiException catch (e) {
      if (!isClosed) emit(state.copyWith(problem: e.message));
    } finally {
      if (!isClosed) {
        emit(state.copyWith(busy: {...state.busy}..remove(suggestionId)));
      }
    }
  }

  Future<void> dismiss(String suggestionId) async {
    if (state.busy.contains(suggestionId)) return;
    emit(state.copyWith(busy: {...state.busy, suggestionId}));
    try {
      await _api.dismissSuggestion(suggestionId);
      await loadSuggestions();
    } on ApiException catch (e) {
      if (!isClosed) emit(state.copyWith(problem: e.message));
    } finally {
      if (!isClosed) {
        emit(state.copyWith(busy: {...state.busy}..remove(suggestionId)));
      }
    }
  }
}
