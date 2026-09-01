import 'dart:async';
import 'dart:convert';

import 'package:connectivity_plus/connectivity_plus.dart';
import 'package:drift/drift.dart';
import 'package:flutter/foundation.dart';
import 'package:uuid/uuid.dart';

import '../api/api_client.dart';
import '../api/models.dart';
import '../db/database.dart';
import '../notifications/local_notifications.dart';

const _uuid = Uuid();

/// What `POST /chat/batch` accepts in one call. Mirrors the DTO's ArrayMaxSize.
const _batchLimit = 20;

/// Keys in the local key/value table.
class SyncKeys {
  /// Human-facing "last time we talked to the server", on the device clock.
  static const lastSyncAt = 'lastSyncAt';

  /// The server's own cursor, stored verbatim. Deliberately NOT [lastSyncAt]:
  /// that one is a device timestamp, and sending it as `since` would skip
  /// whatever the clock skew covers.
  static const cursor = 'syncCursor';

  static const defaults = 'serverDefaults';
  static const installId = 'installId';
  static const fcmToken = 'fcmToken';
}

/// Reconciles the device with the gateway.
///
/// The device holds the whole of this user's data and can edit it offline; the
/// server is the shared merge point rather than the place the data lives. One
/// round trip carries both directions — edits up, everything that changed since
/// the cursor down — and the queued chat flush stays a separate call because it
/// runs the model and can take minutes.
class SyncService {
  SyncService(this._api, this._db, this._scheduler);

  final ApiClient _api;
  final AppDatabase _db;
  final NotificationScheduler _scheduler;

  Future<void>? _inFlight;
  bool _again = false;
  StreamSubscription<List<ConnectivityResult>>? _connectivity;

  /// Re-syncs whenever the network comes back. Nothing else watches for it, so
  /// without this an outbox could sit full while the phone is online.
  void watchConnectivity() {
    _connectivity ??= Connectivity().onConnectivityChanged.listen((results) {
      final online = results.any((r) => r != ConnectivityResult.none);
      if (online) unawaited(sync());
    });
  }

  void dispose() {
    _connectivity?.cancel();
    _connectivity = null;
  }

  /// Fire-and-forget trigger for callers that must not wait (UI mutations).
  void kick() => unawaited(sync());

  /// Runs one pass. Concurrent callers await the pass already running, and a
  /// request that arrives mid-pass schedules exactly one more — so a burst of
  /// edits cannot start a stampede of syncs.
  Future<void> sync() {
    if (_inFlight != null) {
      _again = true;
      return _inFlight!;
    }
    final run = _run().whenComplete(() {
      _inFlight = null;
      if (_again) {
        _again = false;
        kick();
      }
    });
    _inFlight = run;
    return run;
  }

  Future<void> _run() async {
    // Each step is isolated: a failure in one must not abort the others or
    // lose the cursor. One rethrowing push used to block every later step on
    // every trigger, forever.
    final synced = await _step('sync', _syncOnce);
    final flushed = await _step('chat', _flushChat);

    // A flush creates rows the phone cannot predict — a reminder extracted from
    // a queued message carries no client id, and the reply is written by the
    // server — so the only way to learn them is to pull again.
    if (flushed == true) await _step('resync', _syncOnce);

    if (synced != null || flushed != null) {
      await _db.setValue(SyncKeys.lastSyncAt, DateTime.now().toIso8601String());
    }

    // Always, online or not — the alarms are the product.
    await _scheduler.rescheduleAll();
  }

  Future<T?> _step<T>(String name, Future<T> Function() body) async {
    try {
      return await body();
    } catch (e) {
      // Offline is the normal case here, not an error worth surfacing.
      debugPrint('sync step "$name" deferred: $e');
      return null;
    }
  }

  // ── the one round trip ─────────────────────────────────────────────────────

  Future<bool> _syncOnce() async {
    await _followDeviceTimezone();
    final cursor = await _db.getValue(SyncKeys.cursor);
    // Messages are immutable and pulled by id, so the chat the gateway
    // backfilled onto rows this device already holds can only arrive by asking
    // for the history again. The predicate is the data: a synced message with
    // no chat is, by construction, from before chats existed.
    final legacy = await _db.hasLegacyMessages();
    final outbound = await _outboundReminders();
    final chats = await _outboundConversations();
    final profilePatch = await _dirtyProfilePatch();

    var result = await _api.sync(
      since: cursor,
      lastMessageId: legacy ? 0 : await _db.highestMessageId(),
      installId: await stableInstallId(_db),
      reminders: outbound.payload,
      conversations: chats.payload,
      profile: profilePatch,
    );

    await _applyResult(
      result,
      pushedIds: outbound.ids,
      pushedChatIds: chats.ids,
      pushedProfile: profilePatch != null,
      // Passed rather than recomputed, so an empty pull still clears the legacy
      // rows: otherwise a server that had pruned its history would leave the
      // predicate true and ask for lastMessageId 0 on every sync for ever.
      sweepLegacy: legacy,
    );

    // The gateway pages messages. One pass used to stop after the first page
    // and the rest arrived on some later sync — invisible while the device
    // already held the history, and not once it has to fetch it again.
    //
    // Later pages push nothing (already sent) and carry `since`, so they stay
    // deltas: passing null again would make each one a full snapshot and run
    // the delete sweeps once per page.
    //
    // ponytail: 50 pages is about 10k messages a pass. Raise it if a real
    // history ever hits the ceiling.
    for (var page = 1; page < 50 && result.moreMessages; page++) {
      result = await _api.sync(
        since: result.now,
        lastMessageId: await _db.highestMessageId(),
        installId: await stableInstallId(_db),
      );
      await _applyResult(
        result,
        pushedIds: const {},
        pushedChatIds: const {},
        pushedProfile: false,
        sweepLegacy: false,
      );
    }
    return true;
  }

  Future<void> _applyResult(
    SyncResult result, {
    required Set<String> pushedIds,
    required Set<String> pushedChatIds,
    required bool pushedProfile,
    required bool sweepLegacy,
  }) async {
    // One transaction ending in the cursor write, so the cursor can never
    // advance past rows that were not stored.
    await _db.transaction(() async {
      for (final rejection in result.rejected) {
        // Branch on the table. Feeding a rejected chat through the reminder
        // path would write a reminder row with a conversation's id in it —
        // corruption rather than a crash, which is why this is not a cast.
        if (rejection.isConversation) {
          if (rejection.serverConversation != null) {
            await _writeServerConversation(rejection.serverConversation!);
          } else {
            await _db.deleteConversation(rejection.id);
          }
          await _db.bumpConversationAttempts(rejection.id);
          continue;
        }
        if (rejection.server != null) {
          // The server's row won. Overwrite and stop trying to push ours —
          // the losing edit is visibly replaced rather than silently dropped.
          await _writeServerReminder(rejection.server!);
        } else {
          await _db.deleteReminder(rejection.id); // gone server-side
        }
        await _db.bumpPushAttempts(rejection.id);
      }

      // Chats before messages, so the list never briefly holds a message
      // pointing at a chat that is not there yet.
      final stillPendingChats = {
        for (final row in await _db.pendingConversations())
          if (!pushedChatIds.contains(row.id)) row.id,
      };
      final seenChats = <String>{};
      for (final chat in result.conversations) {
        seenChats.add(chat.id);
        if (chat.deleted) {
          // The chat is gone, so what was said in it goes too. This is the only
          // way a deletion reaches another device: messages carry no tombstone.
          await _db.deleteConversation(chat.id);
          continue;
        }
        if (stillPendingChats.contains(chat.id)) continue; // edited mid-flight
        await _writeServerConversation(chat);
      }
      if (result.full) {
        for (final local in await _db.allConversations()) {
          if (seenChats.contains(local.id)) continue;
          if (local.pendingOp != null) continue; // never pushed yet — keep it
          await _db.deleteConversation(local.id);
        }
      }

      // Everything this removes mirrors a server row that the lines below are
      // replacing with a chat-tagged copy. It runs before the first page is
      // written, and deletes the whole legacy set rather than just this page,
      // which is what makes the re-pull terminate.
      if (sweepLegacy) await _db.deleteLegacyMessages();

      final stillPending = {
        for (final row in await _db.pendingReminders())
          if (!pushedIds.contains(row.id)) row.id,
      };

      final seen = <String>{};
      for (final reminder in result.reminders) {
        seen.add(reminder.id);
        if (reminder.deleted) {
          await _db.deleteReminder(reminder.id);
          continue;
        }
        // A row edited again while the push was in flight keeps its local copy.
        if (stillPending.contains(reminder.id)) continue;
        await _writeServerReminder(reminder);
      }

      // Only a full snapshot is authoritative about what exists. Running this
      // over a delta would delete every reminder that simply had not changed.
      if (result.full) {
        for (final local in await _db.allReminders()) {
          if (seen.contains(local.id)) continue;
          if (local.pendingOp != null) continue; // never pushed yet — keep it
          await _db.deleteReminder(local.id);
        }
      }

      if (result.profile != null) {
        await _writeServerProfile(result.profile!, clearDirty: pushedProfile);
      }

      for (final entry in result.checkins) {
        await _db.upsertCheckin(CheckinsCompanion.insert(
          checkinDate: entry.checkinDate,
          adhered: entry.adhered,
          rawReply: Value(entry.rawReply),
          createdAt: entry.createdAt,
        ));
      }

      for (final entry in result.workouts) {
        await _db.upsertWorkout(WorkoutRecordsCompanion.insert(
          workoutDate: entry.workoutDate,
          source: entry.source,
          exercises: Value(jsonEncode(entry.exercises)),
          muscleGroups: Value(jsonEncode(entry.muscleGroups)),
          notes: Value(entry.notes),
          createdAt: entry.createdAt,
        ));
      }

      for (final message in result.messages) {
        if (message.id == null) continue;
        final chatId = message.conversationId;
        // A message naming a chat this device has not been sent cannot be
        // filed. Stopping here rather than dropping it leaves the watermark
        // behind — it is derived from the rows actually stored — so the next
        // sync asks for this message again and gets it once its chat arrives.
        //
        // ponytail: that self-healing is why the server's `lastMessageId` is
        // never persisted. Storing it would advance the cursor past a message
        // that was skipped, and the gap would be permanent.
        if (chatId == null || await _db.findConversation(chatId) == null) break;
        await _db.upsertServerMessage(
          serverId: message.id!,
          clientId: message.clientId,
          conversationId: chatId,
          role: message.role,
          content: message.content,
          composedAt: message.createdAt ?? DateTime.now(),
        );
        await _db.bumpLastMessageAt(chatId, message.createdAt ?? DateTime.now());
      }

      await _db.setValue(SyncKeys.cursor, result.now);
    });
  }

  // ── outbound ───────────────────────────────────────────────────────────────

  /// Chats the gateway has not accepted yet.
  ///
  /// The id always goes up: the phone minted it and the gateway takes it, so a
  /// create and an edit are the same write and a retried create cannot make a
  /// second chat.
  Future<({List<Map<String, dynamic>> payload, Set<String> ids})>
      _outboundConversations() async {
    final rows = await _db.pendingConversations();
    return (
      payload: [
        for (final row in rows)
          {
            'id': row.id,
            'title': row.title,
            'pinned': row.pinned,
            'archived': row.archived,
            if (row.pendingOp == ConversationOps.delete) 'deleted': true,
            'updatedAt': (row.updatedAt ?? DateTime.now()).toUtc().toIso8601String(),
            // The server's timestamp, never a local edit time: when it still
            // matches, the gateway takes the edit without consulting a clock.
            if (row.baseUpdatedAt != null)
              'baseUpdatedAt': row.baseUpdatedAt!.toUtc().toIso8601String(),
          },
      ],
      ids: {for (final row in rows) row.id},
    );
  }

  Future<({List<Map<String, dynamic>> payload, Set<String> ids})> _outboundReminders() async {
    final rows = await _db.pendingReminders();
    return (
      payload: [
        for (final row in rows)
          {
            if (row.pendingOp != ReminderOps.create) 'id': row.id,
            'clientId': row.clientId ?? row.id,
            'title': row.title,
            'remindAt': row.remindAt.toUtc().toIso8601String(),
            'leadTimes': _decodeLeadTimes(row.leadTimes),
            'status': row.status,
            if (row.pendingOp == ReminderOps.delete) 'deleted': true,
            'updatedAt': (row.updatedAt ?? DateTime.now()).toUtc().toIso8601String(),
            // The server's timestamp, not ours. When it still matches, the
            // gateway takes the edit without looking at this handset's clock.
            if (row.baseUpdatedAt != null)
              'baseUpdatedAt': row.baseUpdatedAt!.toUtc().toIso8601String(),
          },
      ],
      ids: {for (final row in rows) row.id},
    );
  }

  /// Records the handset's zone as an ordinary local edit.
  ///
  /// The gateway resolves "8pm" against the profile timezone, so a phone that
  /// has travelled must say so. Doing it as a dirty local write rather than a
  /// direct PATCH means a zone change noticed offline is remembered instead of
  /// lost — that call was the one thing on the settings screen that still
  /// required a connection.
  Future<void> _followDeviceTimezone() async {
    final device = await deviceTimezone();
    final local = await _db.profile();
    if (local != null && local.timezone == device) return;

    await _db.writeProfile(CoachingProfilesCompanion(
      timezone: Value(device),
      dirty: const Value(true),
      updatedAt: Value(DateTime.now()),
    ));
  }

  /// The profile fields this device may write, and only those.
  ///
  /// Built as an explicit map rather than from the row: a `toJson` would leak a
  /// server-owned column the first time someone adds one, and the server would
  /// then be told its own scheduling state by a phone.
  Future<Map<String, dynamic>?> _dirtyProfilePatch() async {
    final row = await _db.profile();
    if (row == null || !row.dirty) return null;
    return {
      'optedIn': row.optedIn,
      'timezone': row.timezone,
      'trainingDays': _decodeList(row.trainingDays).map((e) => int.tryParse('$e') ?? e).toList(),
      'allergies': _decodeList(row.allergies).map((e) => '$e').toList(),
      'gymTime': row.gymTime,
      'checkinTime': row.checkinTime,
      'programTime': row.programTime,
      'language': row.language,
    };
  }

  Future<bool> _flushChat() async {
    final queued = await _db.outbox();
    if (queued.isEmpty) return false;

    var processed = 0;
    // The endpoint refuses more than [_batchLimit] at a time. Sending the whole
    // outbox meant that once it passed that, every flush 400'd, the error was
    // swallowed as "offline", and nothing ever drained it again — a permanent,
    // silent stall.
    for (var start = 0; start < queued.length; start += _batchLimit) {
      final chunk = queued.sublist(
        start,
        start + _batchLimit > queued.length ? queued.length : start + _batchLimit,
      );
      final result = await _api.sendQueued([
        for (final m in chunk)
          QueuedMessage(
            clientId: m.clientId!,
            text: m.content,
            composedAt: m.composedAt,
            conversationId: m.conversationId,
          ),
      ]);

      // Only what the server actually named. Marking the whole chunk synced on
      // any success discarded rows it had never seen.
      for (final clientId in {...result.duplicates, ...result.accepted}) {
        await _db.markSynced(clientId);
      }
      processed += result.processed;
    }
    return processed > 0;
  }

  // ── writing what came back ─────────────────────────────────────────────────

  Future<void> _writeServerConversation(Conversation c) async {
    await _db.upsertConversation(ConversationsCompanion.insert(
      id: c.id,
      title: Value(c.title),
      pinned: Value(c.pinned),
      archived: Value(c.archived),
      isCoaching: Value(c.isCoaching),
      updatedAt: Value(c.updatedAt),
      // The server's own timestamp, kept apart from any local edit time: it is
      // what makes the next push uncontested and so clock-free.
      baseUpdatedAt: Value(c.updatedAt),
      pendingOp: const Value(null),
      pushAttempts: const Value(0),
    ));
  }

  Future<void> _writeServerReminder(Reminder r) async {
    await _db.upsertReminder(RemindersCompanion.insert(
      id: r.id,
      clientId: Value(r.clientId),
      title: r.title,
      remindAt: r.remindAt,
      status: Value(r.status),
      leadTimes: Value(jsonEncode(r.leadTimes)),
      updatedAt: Value(r.updatedAt),
      baseUpdatedAt: Value(r.updatedAt),
      pendingOp: const Value(null),
      pushAttempts: const Value(0),
    ));
    await _db.replacePings(r.id, [
      for (final n in r.notifications)
        ReminderPingsCompanion.insert(
          id: n.id,
          reminderId: r.id,
          notifyAt: n.notifyAt,
          label: n.label,
          sentAt: Value(n.sentAt),
        ),
    ]);
  }

  Future<void> _writeServerProfile(CoachingProfile p, {required bool clearDirty}) async {
    final local = await _db.profile();
    // An edit made while the push was in flight stays dirty and wins locally
    // until the next pass carries it up.
    final keepLocalEdit = (local?.dirty ?? false) && !clearDirty;
    if (keepLocalEdit) {
      await _db.writeProfile(CoachingProfilesCompanion(
        awaitingCheckin: Value(p.awaitingCheckin),
        awaitingSince: Value(p.awaitingSince),
      ));
      return;
    }

    await _db.writeProfile(CoachingProfilesCompanion(
      optedIn: Value(p.optedIn),
      timezone: Value(p.timezone),
      trainingDays: Value(jsonEncode(p.trainingDays)),
      allergies: Value(jsonEncode(p.allergies)),
      gymTime: Value(p.gymTime),
      checkinTime: Value(p.checkinTime),
      programTime: Value(p.programTime),
      language: Value(p.language),
      awaitingCheckin: Value(p.awaitingCheckin),
      awaitingSince: Value(p.awaitingSince),
      dirty: const Value(false),
      updatedAt: Value(DateTime.now()),
    ));
  }

}

List<String> _decodeLeadTimes(String encoded) {
  try {
    return (jsonDecode(encoded) as List).map((e) => e.toString()).toList();
  } catch (_) {
    return const ['1h', '0m'];
  }
}

List<Object?> _decodeList(String encoded) {
  try {
    return jsonDecode(encoded) as List;
  } catch (_) {
    return const [];
  }
}

/// A per-installation id, generated once and kept. Deliberately survives sign
/// out: it identifies the device, not the account.
Future<String> stableInstallId(AppDatabase db) async {
  final existing = await db.getValue(SyncKeys.installId);
  if (existing != null && existing.isNotEmpty) return existing;
  final fresh = _uuid.v4();
  await db.setValue(SyncKeys.installId, fresh);
  return fresh;
}

/// Expands lead times the way the gateway does, so a reminder created offline
/// is alarmed immediately instead of waiting for its first sync.
///
/// Mirrors `planNotifications` in the gateway: an offset already in the past is
/// dropped, except the at-the-moment one, which always survives.
List<({DateTime notifyAt, String label})> planPings(
  DateTime remindAt,
  List<String> leadTimes, {
  DateTime? now,
}) {
  final notBefore = now ?? DateTime.now();
  final planned = <({DateTime notifyAt, String label})>[];
  final seen = <String>{};

  for (final offset in leadTimes) {
    final match = RegExp(r'^(\d+)(m|h|d)$').firstMatch(offset.trim());
    if (match == null) continue;
    final value = int.parse(match.group(1)!);
    final unit = match.group(2)!;
    final ms = value *
        switch (unit) {
          'm' => 60 * 1000,
          'h' => 60 * 60 * 1000,
          _ => 24 * 60 * 60 * 1000,
        };

    final label = value == 0
        ? 'now'
        : '$value ${switch (unit) { 'm' => 'minute', 'h' => 'hour', _ => 'day' }}'
            '${value == 1 ? '' : 's'} before';
    if (!seen.add(label)) continue;

    final notifyAt = remindAt.subtract(Duration(milliseconds: ms));
    if (ms != 0 && notifyAt.isBefore(notBefore)) continue;
    planned.add((notifyAt: notifyAt, label: label));
  }

  planned.sort((a, b) => a.notifyAt.compareTo(b.notifyAt));
  return planned;
}
