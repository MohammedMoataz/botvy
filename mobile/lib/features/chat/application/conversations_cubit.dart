import 'dart:async';

import 'package:drift/drift.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:uuid/uuid.dart';

import '../../../core/api/api_client.dart';
import '../../../core/db/database.dart';
import '../../../core/sync/sync_engine.dart';

const Uuid _uuid = Uuid();

/// The two chats that are always there.
///
/// Named here because three places need the same pair — the ordering, the
/// screen's own labels for them, and the guard that decides whether the menu
/// offers deleting — and because a member's own chat could legitimately be
/// *called* "Coach". The kind is what identifies them, never the title.
abstract final class ChatKinds {
  static const String coach = 'coach';
  static const String planner = 'planner';
  static const String free = 'free';
}

/// A refusal the member can do something about.
///
/// The server answers `403 protected` when a pinned chat is deleted, unpinned
/// or archived (FR-001), and the only useful thing to say next is "you can
/// empty it instead". Carried as its own object rather than as a message,
/// because the screen has to offer that action and a sentence cannot be tapped.
///
/// [message] is the server's own explanation when it sent one. Shown in
/// preference to the local sentence: the server knows *which* rule refused and
/// this build may be older than the rule.
class ProtectedRefusal {
  const ProtectedRefusal({required this.conversationId, required this.message});

  final String conversationId;
  final String message;
}

/// The chat list, in two sections.
class ConversationsState {
  const ConversationsState({
    this.loading = true,
    this.busy = false,
    this.pinned = const [],
    this.others = const [],
    this.refusal,
    this.problem,
    this.opened,
  });

  final bool loading;

  /// A command is in flight. What stops a double tap sending two creates, the
  /// second of which would leave an empty chat in the list for ever.
  final bool busy;

  /// Coach and Planner, in that order, above the divider (US3).
  final List<LocalConversation> pinned;

  /// Everything else, most recently spoken in first.
  final List<LocalConversation> others;

  final ProtectedRefusal? refusal;

  final String? problem;

  /// A chat that has just been created and should be opened. Cleared on read by
  /// the screen, so a rebuild does not navigate a second time.
  final String? opened;

  ConversationsState copyWith({
    bool? loading,
    bool? busy,
    List<LocalConversation>? pinned,
    List<LocalConversation>? others,
    ProtectedRefusal? refusal,
    String? problem,
    String? opened,
    bool clearRefusal = false,
    bool clearProblem = false,
    bool clearOpened = false,
  }) => ConversationsState(
    loading: loading ?? this.loading,
    busy: busy ?? this.busy,
    pinned: pinned ?? this.pinned,
    others: others ?? this.others,
    refusal: clearRefusal ? null : (refusal ?? this.refusal),
    problem: clearProblem ? null : (problem ?? this.problem),
    opened: clearOpened ? null : (opened ?? this.opened),
  );
}

/// The member's chats: what there is, and what may be done to each.
///
/// **Every write here is a REST command, and none of them is local-first.**
/// That is the opposite of what tasks and reminders do and it is deliberate for
/// one reason: the refusals are the feature. Deleting, unpinning or archiving
/// Coach has to come back as a sentence with a next step in it, while the
/// screen that asked is still open (US3 acceptance 1 and 2). A sync push that
/// is refused arrives as a rejection on the following pass, by which time the
/// member has put the phone down — and worse, an optimistic local unpin would
/// have already moved Coach out of its section, so the screen would tell them
/// it worked and then silently put it back.
///
/// ponytail: the offline ceiling, stated plainly. Renaming a chat on a plane
/// does not work, and neither does starting a new one. The upgrade is the push
/// slot `sync.md` already reserves for `conversations`
/// (`op: 'upsert'|'delete'|'clear'`) — set `pendingOp` on the mirrored row and
/// teach the applier to push it — and the engine's existing rejection handling
/// would carry the `protected` verdict. It is not worth it until somebody asks:
/// what a member does offline is *write messages*, and that path is local-first
/// already.
class ConversationsCubit extends Cubit<ConversationsState> {
  ConversationsCubit(this._db, this._api, this._sync)
    : super(const ConversationsState());

  final AppDatabase _db;
  final ApiClient _api;
  final SyncEngine _sync;

  StreamSubscription<SyncOutcome>? _passes;

  /// Re-reads after every pass, so a chat created on the laptop and a chat the
  /// server moved a question into both appear without a pull-to-refresh.
  void listenToSync() {
    _passes ??= _sync.outcomes.listen((_) => unawaited(refresh()));
  }

  @override
  Future<void> close() async {
    await _passes?.cancel();
    return super.close();
  }

  Future<void> refresh() async {
    if (isClosed) return;

    final rows =
        await (_db.select(_db.conversations)
              ..where(
                (r) =>
                    r.deletedAt.isNull() &
                    r.archived.equals(false) &
                    // "Not on its way out", written with the shared helper
                    // because `pendingOp.equals('purge').not()` alone is SQL
                    // `NOT (pending_op = 'purge')`, which is NULL for a clean
                    // row and NULL is falsy — so the filter would hide every
                    // conversation that has no pending operation, and that is
                    // all of them. Shipped twice in this codebase already.
                    notPendingOp(r.pendingOp, PendingOps.purge),
              )
              ..orderBy([(r) => OrderingTerm.desc(r.lastMessageAt)]))
            .get();

    final pinned = rows.where((row) => row.pinned).toList()
      // Coach first, then Planner, then anything else the operator ever pins.
      // Sorted by kind and not by `lastMessageAt`, because the two pinned chats
      // are a fixed pair of places rather than a recency list: a member who
      // used the Planner this morning should still find Coach where it was.
      ..sort((a, b) => _pinnedRank(a.kind).compareTo(_pinnedRank(b.kind)));

    if (isClosed) return;
    emit(
      state.copyWith(
        loading: false,
        pinned: pinned,
        others: rows.where((row) => !row.pinned).toList(),
      ),
    );
  }

  static int _pinnedRank(String kind) => switch (kind) {
    ChatKinds.coach => 0,
    ChatKinds.planner => 1,
    _ => 2,
  };

  // ── commands ───────────────────────────────────────────────────────────────

  /// Starts an ordinary chat and asks the screen to open it.
  Future<void> create({String? title}) async {
    // The id is minted here and sent, so a create retried after a response
    // that never arrived is the same chat rather than a second empty one.
    final id = _uuid.v7();
    await _command(id, () async {
      final row = await _api.createConversation(id: id, title: title);
      await _writeMirror(row);
      if (!isClosed) emit(state.copyWith(opened: id));
    });
  }

  Future<void> rename(LocalConversation conversation, String title) =>
      _command(conversation.id, () async {
        final row = await _api.patchConversation(
          conversation.id,
          title: title.trim(),
          // The server's own value for the version this device last pulled —
          // never [LocalConversation.updatedAt], which is when *this* device
          // last touched the row. Sending the local time makes the server fall
          // through to a clock comparison instead of accepting the edit
          // outright, and a slow handset loses that comparison.
          baseUpdatedAt: conversation.baseUpdatedAt,
        );
        await _writeMirror(row);
      });

  /// Refused for `coach` and `planner`.
  Future<void> unpin(LocalConversation conversation) =>
      _command(conversation.id, () async {
        final row = await _api.patchConversation(
          conversation.id,
          pinned: false,
          baseUpdatedAt: conversation.baseUpdatedAt,
        );
        await _writeMirror(row);
      });

  /// Refused for `coach` and `planner`.
  Future<void> archive(LocalConversation conversation) =>
      _command(conversation.id, () async {
        final row = await _api.patchConversation(
          conversation.id,
          archived: true,
          baseUpdatedAt: conversation.baseUpdatedAt,
        );
        await _writeMirror(row);
      });

  /// Refused for `coach` and `planner`.
  Future<void> remove(LocalConversation conversation) =>
      _command(conversation.id, () async {
        await _api.deleteConversation(conversation.id);
        // A tombstone rather than a hard delete, and the status columns are
        // untouched: the row is what the next full pull reconciles against, and
        // removing it outright would have the sweep treat the chat as one this
        // device had simply never heard of.
        await (_db.update(_db.conversations)
              ..where((r) => r.id.equals(conversation.id)))
            .write(
              ConversationsCompanion(
                deletedAt: Value(DateTime.now().toUtc()),
                // `updatedAt` moves because this device just edited the row.
                // `baseUpdatedAt` deliberately does not: it is the server's own
                // value for the version last pulled, and overwriting it with a
                // local clock is what breaks the next push's outright accept.
                updatedAt: Value(DateTime.now().toUtc()),
              ),
            );
      });

  /// Empties a chat. The one thing a pinned chat *does* allow.
  Future<void> clear(String conversationId) =>
      _command(conversationId, () async {
        final row = await _api.clearConversation(conversationId);
        // The new watermark, written straight away rather than waited for: the
        // chat screen filters its history on this column, so this is what makes
        // the clear take effect on the frame the member is looking at. FR-011's
        // other halves — every device, and never reversible — are the server's:
        // the pull starts at `max(lastSeq, clearedUpToSeq)`, so nothing cleared
        // is sent to a device that catches up later either.
        await _writeMirror(row);
      });

  /// Writes the server's answer over the local mirror.
  ///
  /// `baseUpdatedAt` takes the server's `updatedAt` and nothing else, which is
  /// the whole rule about those two columns: one is the server's version, the
  /// other is this device's edit time, and confusing them is what makes an
  /// offline edit fall through to a clock comparison.
  Future<void> _writeMirror(Map<String, dynamic> row) async {
    final id = row['id'];
    if (id is! String || id.isEmpty) return;
    final updatedAt =
        DateTime.tryParse(row['updatedAt'] as String? ?? '')?.toUtc() ??
        DateTime.now().toUtc();

    await _db.into(_db.conversations).insertOnConflictUpdate(
      ConversationsCompanion.insert(
        id: id,
        kind: Value(row['kind'] as String? ?? ChatKinds.free),
        title: Value(row['title'] as String? ?? ''),
        pinned: Value(row['pinned'] == true),
        archived: Value(row['archived'] == true),
        clearedUpToSeq: Value(row['clearedUpToSeq'] as int? ?? 0),
        lastMessageAt: Value(
          DateTime.tryParse(row['lastMessageAt'] as String? ?? '')?.toUtc(),
        ),
        createdAt:
            DateTime.tryParse(row['createdAt'] as String? ?? '')?.toUtc() ??
            updatedAt,
        updatedAt: updatedAt,
        baseUpdatedAt: Value(updatedAt),
      ),
    );
    await refresh();
  }

  /// The shape every command shares: one at a time, refusals told apart, and a
  /// pull afterwards.
  Future<void> _command(
    String conversationId,
    Future<void> Function() send,
  ) async {
    if (state.busy) return;
    emit(state.copyWith(busy: true, clearProblem: true, clearRefusal: true));

    try {
      await send();
    } on ApiException catch (error) {
      if (isClosed) return;

      // `protected` and nothing else, on the code and not on the status.
      //
      // Refusing to delete Coach and refusing to touch somebody else's chat are
      // both `403`, and they must be answered differently: the first has a next
      // step, and the second (FR-020) must reveal nothing at all — not even
      // that the chat exists. Branching on the status would offer "clear it
      // instead" for a conversation belonging to another member.
      if (error.code == 'protected') {
        emit(
          state.copyWith(
            busy: false,
            refusal: ProtectedRefusal(
              conversationId: conversationId,
              message: error.message,
            ),
          ),
        );
        return;
      }

      emit(
        state.copyWith(
          busy: false,
          // `isOffline` rather than a status, because the sentence is
          // different: a member on a train is told to try again, not that
          // something went wrong. Both are sentinels — this cubit has no
          // `BuildContext` and so no locale, and a message composed here would
          // be English on an Arabic screen.
          problem: error.isOffline
              ? offlineProblem
              : (error.message.isEmpty ? refusedProblem : error.message),
        ),
      );
      return;
    } catch (_) {
      if (isClosed) return;
      emit(state.copyWith(busy: false, problem: refusedProblem));
      return;
    }

    if (isClosed) return;
    emit(state.copyWith(busy: false));
    _sync.kick();
  }

  void clearProblem() => emit(state.copyWith(clearProblem: true));
  void clearRefusal() => emit(state.copyWith(clearRefusal: true));
  void clearOpened() => emit(state.copyWith(clearOpened: true));

  /// Sentinels, mapped to sentences by the screen. Same split the rhythm and
  /// tasks features use, and for the same reason.
  static const String offlineProblem = 'chat.offline';
  static const String refusedProblem = 'chat.refused';
}
