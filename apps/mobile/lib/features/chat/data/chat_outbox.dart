import 'dart:async';

import 'package:drift/drift.dart';
import 'package:uuid/uuid.dart';

import '../../../core/api/api_client.dart';
import '../../../core/db/database.dart';
import '../../../core/sync/sync_engine.dart';

const Uuid _uuid = Uuid();

/// The chat's own outbox: what the member typed and the server has not
/// acknowledged.
///
/// A class of its own rather than four methods on the chat cubit, for one
/// reason that is worth the file: **the flush has to happen when no chat screen
/// is open.** A member types three sentences on the underground, kills the app,
/// and opens it at their desk — what carries those three sentences is a sync
/// pass and a socket that reconnected, neither of which knows anything about a
/// screen. A cubit that owned the flush would only flush while it was being
/// looked at.
///
/// It is also where the "flushes once" latch lives. Two triggers fire together
/// all the time — the socket connects *and* the app resumes, or a sync pass
/// completes while the member is pressing send — and two overlapping flushes
/// would send the same twenty messages twice. The server's unique
/// `{userId, clientId}` index means that is not corruption, but it is two
/// replies to one sentence, which the member reads as Botvy answering itself.
class ChatOutbox {
  ChatOutbox(this._api, this._db, this._sync);

  final ApiClient _api;
  final AppDatabase _db;
  final SyncEngine _sync;

  /// The contract's cap (`POST /conversations/batch`, ≤ 20). A hard limit on
  /// the server, so sending twenty-one is a refusal rather than a partial
  /// success — which is why this is enforced here and not hoped for.
  static const int batchSize = 20;

  Future<int>? _inFlight;

  /// Writes a message the member has typed, and hands back the client id it
  /// was minted with.
  ///
  /// Called on **every** send, online or off. That is deliberate: it gives the
  /// screen something to draw the moment the member presses the button, and it
  /// means a socket that dies between `chat.send` and `chat.accepted` has left
  /// the sentence somewhere the flush can find it. The socket path deletes the
  /// row again when the server names the sequence it took.
  ///
  /// [clientId] is accepted rather than always minted because the socket path
  /// needs the same id in the frame it emits and in the row it writes: the id
  /// is what ties the two together, and it is what makes a retried send a no-op
  /// on the server rather than a second copy of the sentence.
  Future<String> queue({
    required String conversationId,
    required String body,
    String? clientId,
    DateTime? composedAt,
  }) async {
    final id = clientId ?? _uuid.v7();
    await _db.into(_db.pendingMessages).insertOnConflictUpdate(
      PendingMessagesCompanion.insert(
        clientId: id,
        conversationId: conversationId,
        body: body,
        // The moment the member typed it, and the whole reason this column
        // exists: FR-007 says a message composed offline is understood as of
        // when it was written, so "remind me in two hours" typed at 14:10 is
        // still a reminder for 16:10 when it flushes at 19:00.
        composedAt: composedAt ?? DateTime.now().toUtc(),
      ),
    );
    return id;
  }

  /// The messages still waiting in one chat, oldest first.
  ///
  /// Includes the ones that have run out of attempts. They are still the
  /// member's own words and still on screen — greyed, with what went wrong —
  /// because a sentence that quietly disappeared is worse than one that is
  /// visibly stuck.
  Future<List<LocalPendingMessage>> waiting(String conversationId) =>
      (_db.select(_db.pendingMessages)
            ..where((r) => r.conversationId.equals(conversationId))
            ..orderBy([(r) => OrderingTerm.asc(r.composedAt)]))
          .get();

  /// Forgets one queued message, because the server has it.
  Future<void> forget(String clientId) async {
    await (_db.delete(_db.pendingMessages)
          ..where((r) => r.clientId.equals(clientId)))
        .go();
  }

  /// Sends one batch, and answers how many the server took.
  ///
  /// Concurrent callers get the flush that is already running rather than a
  /// second one — see the note on the class. One batch per call and no loop: a
  /// member with sixty queued messages needs three triggers, and a loop here
  /// would spin against a server that accepts nothing. Triggers are plentiful
  /// (every sync pass, every reconnection, every send), so the queue drains
  /// without anybody writing a retry schedule.
  Future<int> flush() {
    final running = _inFlight;
    if (running != null) return running;
    final run = _flushOnce().whenComplete(() => _inFlight = null);
    _inFlight = run;
    return run;
  }

  Future<int> _flushOnce() async {
    final rows =
        await (_db.select(_db.pendingMessages)
              ..where(
                (r) =>
                    r.attempts.isSmallerThanValue(SyncEngine.maxPushAttempts),
              )
              // Oldest first, because the server interprets each as of its own
              // `composedAt` and a conversation read out of order is a
              // different conversation.
              ..orderBy([(r) => OrderingTerm.asc(r.composedAt)])
              ..limit(batchSize))
            .get();
    if (rows.isEmpty) return 0;

    Map<String, dynamic> answer;
    try {
      answer = await _api.conversationsBatch([
        for (final row in rows)
          {
            'conversationId': row.conversationId,
            'clientId': row.clientId,
            'text': row.body,
            'composedAt': row.composedAt.toUtc().toIso8601String(),
          },
      ]);
    } on ApiException catch (error) {
      // Offline is not a strike. The whole design assumes the network is
      // usually absent, and counting a plane journey against the five attempts
      // would give up on a message that nothing was ever wrong with.
      if (!error.isOffline) await _strike(rows);
      return 0;
    }

    final accepted = (answer['accepted'] as List? ?? const [])
        .whereType<String>()
        .toSet();

    for (final row in rows) {
      if (accepted.contains(row.clientId)) {
        await forget(row.clientId);
      } else {
        // Sent and not named. The server considered this message and did not
        // take it, which is a refusal rather than a lost packet, so it counts.
        await _strike([row]);
      }
    }

    // The replies themselves come down as ordinary messages on the next pull.
    // Nothing here writes them: a message written once from a REST response and
    // again from a pull is the one row `messages` may not hold twice, and the
    // pull is the path that always exists.
    if (accepted.isNotEmpty) _sync.kick();

    return accepted.length;
  }

  Future<void> _strike(List<LocalPendingMessage> rows) async {
    for (final row in rows) {
      await (_db.update(_db.pendingMessages)
            ..where((r) => r.clientId.equals(row.clientId)))
          .write(PendingMessagesCompanion(attempts: Value(row.attempts + 1)));
    }
  }
}
