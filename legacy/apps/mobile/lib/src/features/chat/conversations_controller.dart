import 'package:drift/drift.dart' show Value;
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:uuid/uuid.dart';

import '../../app_providers.dart';
import '../../db/database.dart';
import '../../sync/sync_service.dart';

const _uuid = Uuid();

/// How much of the first message stands in for a name the user never gave.
const _derivedTitleLength = 40;

/// Clearing locally is unbounded — the user asked for the chat to be empty, and
/// every message in it is either already on the server or about to be sent.
/// The gateway records its own, exact watermark when the push lands.
const _clearEverythingLocal = 0x7FFFFFFF;

class ConversationsState {
  const ConversationsState({
    this.items = const [],
    this.loading = false,
    this.showArchived = false,
  });

  final List<LocalConversation> items;
  final bool loading;
  final bool showArchived;

  /// The chat to open when nothing else is chosen: the most recently active.
  LocalConversation? get mostRecent => items.isEmpty ? null : items.first;

  ConversationsState copyWith({
    List<LocalConversation>? items,
    bool? loading,
    bool? showArchived,
  }) =>
      ConversationsState(
        items: items ?? this.items,
        loading: loading ?? this.loading,
        showArchived: showArchived ?? this.showArchived,
      );
}

/// The chat list.
///
/// Every mutation is a local write plus a sync nudge, the same shape as
/// [RemindersController]: renaming, pinning, archiving and deleting all work
/// with no connection and reconcile later.
class ConversationsController extends AutoDisposeNotifier<ConversationsState> {
  bool _disposed = false;

  @override
  ConversationsState build() {
    ref.onDispose(() => _disposed = true);
    _subscribe(archived: false);
    ref.read(syncServiceProvider).kick();
    return const ConversationsState(loading: true);
  }

  void _subscribe({required bool archived}) {
    final subscription =
        _db.watchConversations(archived: archived).listen(_onRows);
    ref.onDispose(subscription.cancel);
  }

  AppDatabase get _db => ref.read(databaseProvider);
  SyncService get _sync => ref.read(syncServiceProvider);

  void _onRows(List<LocalConversation> rows) {
    if (_disposed) return;
    state = state.copyWith(items: rows, loading: false);
  }

  /// Starts a chat. Nothing is written yet: a chat the user opens and abandons
  /// should litter neither the list nor the gateway, so the row appears with
  /// the first message.
  String startNew() => _uuid.v4();

  Future<void> rename(String id, String title) =>
      _edit(id, (existing) => ConversationsCompanion.insert(
            id: id,
            title: Value(title.trim()),
            pinned: Value(existing.pinned),
            archived: Value(existing.archived),
            isCoaching: Value(existing.isCoaching),
            lastMessageAt: Value(existing.lastMessageAt),
            baseUpdatedAt: Value(existing.baseUpdatedAt),
            updatedAt: Value(DateTime.now()),
            pendingOp: const Value(ConversationOps.upsert),
          ));

  Future<void> setPinned(String id, bool pinned) =>
      _edit(id, (existing) => ConversationsCompanion.insert(
            id: id,
            title: Value(existing.title),
            pinned: Value(pinned),
            archived: Value(existing.archived),
            isCoaching: Value(existing.isCoaching),
            lastMessageAt: Value(existing.lastMessageAt),
            baseUpdatedAt: Value(existing.baseUpdatedAt),
            updatedAt: Value(DateTime.now()),
            pendingOp: const Value(ConversationOps.upsert),
          ));

  Future<void> setArchived(String id, bool archived) =>
      _edit(id, (existing) => ConversationsCompanion.insert(
            id: id,
            title: Value(existing.title),
            pinned: Value(existing.pinned),
            archived: Value(archived),
            isCoaching: Value(existing.isCoaching),
            lastMessageAt: Value(existing.lastMessageAt),
            baseUpdatedAt: Value(existing.baseUpdatedAt),
            updatedAt: Value(DateTime.now()),
            pendingOp: const Value(ConversationOps.upsert),
          ));

  /// Removes a chat and everything said in it.
  Future<void> remove(String id) async {
    final existing = await _db.findConversation(id);
    if (existing == null || existing.isCoaching) return;

    if (existing.baseUpdatedAt == null) {
      // The gateway has never sent this row, so there is nothing to tell it.
      await _db.deleteConversation(id);
    } else {
      await _db.deleteConversation(id, keepTombstone: true);
      await _db.upsertConversation(ConversationsCompanion.insert(
        id: id,
        title: Value(existing.title),
        pinned: Value(existing.pinned),
        archived: Value(existing.archived),
        isCoaching: Value(existing.isCoaching),
        baseUpdatedAt: Value(existing.baseUpdatedAt),
        updatedAt: Value(DateTime.now()),
        pendingOp: const Value(ConversationOps.delete),
      ));
    }
    _sync.kick();
  }

  /// Empties a chat without deleting it — the only way to clear the coaching
  /// one, which cannot be deleted.
  ///
  /// The local messages go now so the screen is empty immediately; the push
  /// tells the gateway, which records how far the clearing went so every other
  /// device does the same.
  Future<void> clearMessages(String id) async {
    final existing = await _db.findConversation(id);
    if (existing == null) return;

    await _db.clearConversationMessages(id, upToMessageId: _clearEverythingLocal);
    await _db.upsertConversation(ConversationsCompanion.insert(
      id: id,
      title: Value(existing.title),
      pinned: Value(existing.pinned),
      archived: Value(existing.archived),
      isCoaching: Value(existing.isCoaching),
      clearedUpToMessageId: Value(existing.clearedUpToMessageId),
      baseUpdatedAt: Value(existing.baseUpdatedAt),
      updatedAt: Value(DateTime.now()),
      pendingOp: const Value(ConversationOps.clear),
    ));
    _sync.kick();
  }

  Future<void> retry(String id) async {
    await _db.resetConversationAttempts(id);
    _sync.kick();
  }

  void toggleArchivedView() {
    final next = !state.showArchived;
    state = state.copyWith(showArchived: next, loading: true);
    _subscribe(archived: next);
  }

  Future<void> _edit(
    String id,
    ConversationsCompanion Function(LocalConversation existing) build,
  ) async {
    final existing = await _db.findConversation(id);
    if (existing == null) return;
    await _db.upsertConversation(build(existing));
    _sync.kick();
  }
}

final conversationsControllerProvider =
    NotifierProvider.autoDispose<ConversationsController, ConversationsState>(
        ConversationsController.new);

/// Which chat is on screen.
///
/// App-lifetime, not autoDispose: the drawer closes and the chat controller is
/// rebuilt per chat, and this has to outlive both. Null means "the most
/// recently active", which on a fresh install is the coaching chat.
///
/// Signing out needs no reset — `logout` wipes the database, so a stale id
/// simply resolves to a chat with no rows and the screen is empty, which is the
/// required outcome.
class ActiveConversation extends Notifier<String?> {
  @override
  String? build() => null;

  void select(String? id) => state = id;
}

final activeConversationProvider =
    NotifierProvider<ActiveConversation, String?>(ActiveConversation.new);

/// The id the chat screen is showing. Deliberately an id and not a row: a chat
/// the user has just started has no row until they send something.
final currentConversationIdProvider = Provider<String?>((ref) {
  final chosen = ref.watch(activeConversationProvider);
  if (chosen != null) return chosen;
  return ref.watch(conversationsControllerProvider).mostRecent?.id;
});

/// What to call a chat the user has not named.
///
/// Derived rather than stored: an auto-title written server-side would bump the
/// row's `updatedAt`, and a rename a second later would then be compared
/// against a stale base and lose to the clock. This costs nothing and works
/// before the gateway has ever heard of the chat.
String conversationLabel(LocalConversation? chat, String? firstMessage) {
  if (chat != null && chat.title.trim().isNotEmpty) return chat.title.trim();
  if (chat?.isCoaching ?? false) return 'Coaching';

  final source = firstMessage?.replaceAll(RegExp(r'\s+'), ' ').trim() ?? '';
  if (source.isEmpty) return 'New chat';

  // Code points, not UTF-16 units: slicing mid-surrogate leaves half a
  // character that renders as tofu.
  final chars = source.runes.toList();
  if (chars.length <= _derivedTitleLength) return source;
  return '${String.fromCharCodes(chars.take(_derivedTitleLength)).trimRight()}…';
}
