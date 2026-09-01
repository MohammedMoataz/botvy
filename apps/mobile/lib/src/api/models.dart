/// Types mirroring apps/gateway/openapi.json. Hand-written rather than
/// generated -- a handful of endpoints do not justify a codegen toolchain.
library;

import 'package:intl/intl.dart';

/// `TokenPairDto` -- returned by POST /auth/login and POST /auth/refresh.
class TokenPair {
  const TokenPair({required this.accessToken, required this.refreshToken});

  final String accessToken;
  final String refreshToken;

  factory TokenPair.fromJson(Map<String, dynamic> json) => TokenPair(
        accessToken: json['accessToken'] as String,
        refreshToken: json['refreshToken'] as String,
      );
}

/// POST /auth/register response. Not described in openapi.json (the 201 has no
/// schema); shape taken from AuthService.register in the gateway source.
class Account {
  const Account({required this.id, required this.email, required this.role});

  final String id;
  final String email;
  final String role; // 'user' | 'admin'

  factory Account.fromJson(Map<String, dynamic> json) => Account(
        id: json['id'] as String,
        email: json['email'] as String,
        role: json['role'] as String,
      );
}

/// A row from GET /chat/history (Prisma `Message`), and the same type the chat
/// screen uses for in-flight local messages.
class ChatMessage {
  ChatMessage({
    this.id,
    this.clientId,
    this.conversationId,
    required this.role,
    required this.content,
    this.createdAt,
    this.streaming = false,
    this.syncState = 'synced',
  });

  final int? id;

  /// Set for messages this device composed; the key the outbox dedupes on.
  final String? clientId;

  /// Which chat it belongs to. Null only on a row cached before chats existed.
  final String? conversationId;

  final String role; // 'user' | 'assistant'
  String content; // mutable: the assistant bubble grows token by token
  final DateTime? createdAt;

  /// True while tokens are still arriving for this message.
  bool streaming;

  /// 'synced' | 'queued' | 'failed' — queued means written offline and waiting.
  String syncState;

  bool get isUser => role == 'user';

  bool get isQueued => syncState == 'queued';

  factory ChatMessage.fromJson(Map<String, dynamic> json) => ChatMessage(
        id: json['id'] as int?,
        // Present for messages this device composed offline: it is how a
        // pulled row is matched to the local one instead of duplicating it.
        clientId: json['clientId'] as String?,
        conversationId: json['conversationId'] as String?,
        role: json['role'] as String,
        content: (json['content'] as String?) ?? '',
        createdAt: json['createdAt'] == null
            ? null
            : DateTime.tryParse(json['createdAt'] as String),
      );
}

/// One scheduled ping for a [Reminder] (`notifications[]` on the wire).
class ReminderNotification {
  const ReminderNotification({
    required this.id,
    required this.reminderId,
    required this.notifyAt,
    required this.label,
    this.sentAt,
  });

  final String id;
  final String reminderId;

  /// Local time -- the gateway speaks UTC.
  final DateTime notifyAt;

  /// Human label the gateway assigned, e.g. '1h' or 'now'.
  final String label;

  final DateTime? sentAt;

  bool get sent => sentAt != null;

  factory ReminderNotification.fromJson(Map<String, dynamic> json) =>
      ReminderNotification(
        id: json['id'] as String,
        reminderId: json['reminderId'] as String,
        notifyAt: _localTime(json['notifyAt']) ?? DateTime.now(),
        label: (json['label'] as String?) ?? '',
        sentAt: _localTime(json['sentAt']),
      );
}

/// A row from GET /reminders.
class Reminder {
  const Reminder({
    required this.id,
    required this.title,
    required this.remindAt,
    required this.status,
    this.leadTimes = const ['1h', '0m'],
    this.clientId,
    this.createdAt,
    this.updatedAt,
    this.notifications = const [],
    this.pendingSync = false,
    this.syncFailed = false,
    this.deletedAt,
  });

  final String id;
  final String title;

  /// Local time -- the gateway speaks UTC.
  final DateTime remindAt;

  final String status; // 'active' | 'done' | 'cancelled'

  /// The offsets this reminder's pings were planned from.
  final List<String> leadTimes;

  /// Set for reminders this device created offline.
  final String? clientId;

  final DateTime? createdAt;
  final DateTime? updatedAt;

  /// May legitimately be shorter than the lead times requested: the gateway
  /// drops any whose moment has already passed. Not an error.
  final List<ReminderNotification> notifications;

  /// True while this device holds a change the gateway has not accepted yet.
  final bool pendingSync;

  /// The server has refused this edit enough times that the device stopped
  /// re-sending it. The edit is still here; the tile offers a retry.
  final bool syncFailed;

  /// Set when the server has removed it. A delta carries the row marked rather
  /// than omitting it, which is the only way a deletion can reach the device.
  final DateTime? deletedAt;

  bool get deleted => deletedAt != null;

  bool get isActive => status == 'active';

  factory Reminder.fromJson(Map<String, dynamic> json) => Reminder(
        id: json['id'] as String,
        title: (json['title'] as String?) ?? '',
        remindAt: _localTime(json['remindAt']) ?? DateTime.now(),
        status: (json['status'] as String?) ?? 'active',
        leadTimes: ((json['leadTimes'] as List?) ?? const ['1h', '0m'])
            .map((e) => e.toString())
            .toList(),
        clientId: json['clientId'] as String?,
        createdAt: _localTime(json['createdAt']),
        updatedAt: _localTime(json['updatedAt']),
        deletedAt: _localTime(json['deletedAt']),
        notifications: ((json['notifications'] as List?) ?? const [])
            .map((n) =>
                ReminderNotification.fromJson(Map<String, dynamic>.from(n as Map)))
            .toList(),
      );
}

/// A message typed while offline, waiting in the outbox.
class QueuedMessage {
  const QueuedMessage({
    required this.clientId,
    required this.text,
    required this.composedAt,
    this.conversationId,
  });

  final String clientId;
  final String text;

  /// Absent for a message typed before this app had chats; the gateway files
  /// those in the coaching one, which is where the device already shows them.
  final String? conversationId;

  /// When the user actually typed it. The gateway resolves "in two hours"
  /// against this, not against the moment the flush lands.
  final DateTime composedAt;
}

/// POST /chat/batch.
class ChatBatchResult {
  const ChatBatchResult({
    required this.processed,
    required this.duplicates,
    this.accepted = const [],
    this.reply,
  });

  final int processed;

  /// clientIds the gateway had already stored — safe to mark synced too.
  final List<String> duplicates;

  /// clientIds this call actually stored. The device clears exactly these and
  /// the duplicates: marking the whole outbox synced on any success discarded
  /// rows the server had never seen.
  final List<String> accepted;

  /// One reply per chat in the batch, joined. Null when all were duplicates.
  final String? reply;

  factory ChatBatchResult.fromJson(Map<String, dynamic> json) => ChatBatchResult(
        processed: (json['processed'] as num?)?.toInt() ?? 0,
        duplicates: ((json['duplicates'] as List?) ?? const [])
            .map((e) => e.toString())
            .toList(),
        accepted:
            ((json['accepted'] as List?) ?? const []).map((e) => e.toString()).toList(),
        reply: json['reply'] as String?,
      );
}

/// GET /settings/defaults — values the app used to hardcode.
class ServerDefaults {
  const ServerDefaults({
    required this.timezone,
    required this.leadTimes,
    required this.checkinTime,
    required this.programTime,
  });

  final String timezone;
  final List<String> leadTimes;
  final String checkinTime;
  final String programTime;

  factory ServerDefaults.fromJson(Map<String, dynamic> json) => ServerDefaults(
        timezone: (json['timezone'] as String?) ?? 'UTC',
        leadTimes: ((json['leadTimes'] as List?) ?? const ['1h', '0m'])
            .map((e) => e.toString())
            .toList(),
        checkinTime: (json['checkinTime'] as String?) ?? '21:00',
        programTime: (json['programTime'] as String?) ?? '22:00',
      );
}

/// One evening's answer, as the server recorded it.
class CheckinEntry {
  const CheckinEntry({
    required this.checkinDate,
    required this.adhered,
    this.rawReply,
    required this.createdAt,
  });

  /// Local calendar date, YYYY-MM-DD — the server's own key for the day.
  final String checkinDate;
  final bool adhered;
  final String? rawReply;
  final DateTime createdAt;

  factory CheckinEntry.fromJson(Map<String, dynamic> json) => CheckinEntry(
        checkinDate: (json['checkinDate'] as String?) ?? '',
        adhered: (json['adhered'] as bool?) ?? false,
        rawReply: json['rawReply'] as String?,
        createdAt: _localTime(json['createdAt']) ?? DateTime.now(),
      );
}

/// A day's training, either reported by the user or generated as a plan.
class WorkoutEntry {
  const WorkoutEntry({
    required this.workoutDate,
    required this.source,
    this.exercises = const [],
    this.muscleGroups = const [],
    this.notes,
    required this.createdAt,
  });

  final String workoutDate;
  final String source; // 'reported' | 'planned'
  final List<String> exercises;
  final List<String> muscleGroups;
  final String? notes;
  final DateTime createdAt;

  bool get isPlanned => source == 'planned';

  factory WorkoutEntry.fromJson(Map<String, dynamic> json) => WorkoutEntry(
        workoutDate: (json['workoutDate'] as String?) ?? '',
        source: (json['source'] as String?) ?? 'planned',
        exercises:
            ((json['exercises'] as List?) ?? const []).map((e) => e.toString()).toList(),
        muscleGroups:
            ((json['muscleGroups'] as List?) ?? const []).map((e) => e.toString()).toList(),
        notes: json['notes'] as String?,
        createdAt: _localTime(json['createdAt']) ?? DateTime.now(),
      );
}

/// A push the server refused, with the row that won attached.
class SyncRejection {
  const SyncRejection({
    required this.id,
    required this.reason,
    this.entity = 'reminder',
    this.server,
    this.serverConversation,
  });

  final String id;

  /// Which table the row belongs to. Defaulting to 'reminder' keeps a response
  /// from a gateway that predates chats readable — but the field has to be
  /// read, or a rejected chat is written back through the reminder path and
  /// quietly corrupts the local store.
  final String entity;

  final String reason; // 'stale' | 'gone' | 'protected'

  /// The authoritative reminder, or null when the server no longer has one.
  final Reminder? server;

  /// The authoritative chat, for a rejection whose entity is 'conversation'.
  final Conversation? serverConversation;

  bool get isConversation => entity == 'conversation';

  factory SyncRejection.fromJson(Map<String, dynamic> json) {
    final entity = (json['entity'] as String?) ?? 'reminder';
    final server = json['server'] is Map
        ? Map<String, dynamic>.from(json['server'] as Map)
        : null;
    return SyncRejection(
      id: (json['id'] as String?) ?? '',
      entity: entity,
      reason: (json['reason'] as String?) ?? 'stale',
      server: entity == 'reminder' && server != null ? Reminder.fromJson(server) : null,
      serverConversation:
          entity == 'conversation' && server != null ? Conversation.fromJson(server) : null,
    );
  }
}

/// One named chat, as the gateway holds it.
class Conversation {
  const Conversation({
    required this.id,
    this.title = '',
    this.pinned = false,
    this.archived = false,
    this.isCoaching = false,
    this.updatedAt,
    this.deletedAt,
  });

  final String id;
  final String title;
  final bool pinned;
  final bool archived;

  /// The one chat the nightly check-in and program land in.
  final bool isCoaching;

  final DateTime? updatedAt;

  /// Set when the server has removed it. The device drops the chat and every
  /// message in it — the only way a deletion can reach another phone, since
  /// messages carry no tombstone of their own.
  final DateTime? deletedAt;

  bool get deleted => deletedAt != null;

  factory Conversation.fromJson(Map<String, dynamic> json) => Conversation(
        id: json['id'] as String,
        title: (json['title'] as String?) ?? '',
        pinned: (json['pinned'] as bool?) ?? false,
        archived: (json['archived'] as bool?) ?? false,
        // The gateway marks it with a reserved client id rather than a column.
        isCoaching: json['clientId'] == 'coaching',
        updatedAt: _date(json['updatedAt']),
        deletedAt: _date(json['deletedAt']),
      );
}

DateTime? _date(Object? value) =>
    value is String ? DateTime.tryParse(value)?.toLocal() : null;

/// Everything that changed since the device's cursor, plus the new cursor.
class SyncResult {
  const SyncResult({
    required this.now,
    required this.lastMessageId,
    required this.full,
    this.moreMessages = false,
    this.reminders = const [],
    this.conversations = const [],
    this.profile,
    this.checkins = const [],
    this.workouts = const [],
    this.messages = const [],
    this.rejected = const [],
  });

  /// The server's own timestamp, stored verbatim and sent back next time. It is
  /// never parsed or compared against the device clock.
  final String now;
  final int lastMessageId;

  /// True when this response replaces the local copy rather than amending it.
  final bool full;

  /// The message page came back full, so there is more history to fetch. The
  /// device loops on this rather than hardcoding the server's page size.
  final bool moreMessages;

  final List<Reminder> reminders;
  final List<Conversation> conversations;
  final CoachingProfile? profile;
  final List<CheckinEntry> checkins;
  final List<WorkoutEntry> workouts;
  final List<ChatMessage> messages;
  final List<SyncRejection> rejected;

  factory SyncResult.fromJson(Map<String, dynamic> json) {
    final pull = Map<String, dynamic>.from((json['pull'] as Map?) ?? const {});
    List<T> list<T>(String key, T Function(Map<String, dynamic>) parse) =>
        ((pull[key] as List?) ?? const [])
            .map((e) => parse(Map<String, dynamic>.from(e as Map)))
            .toList();

    return SyncResult(
      now: (json['now'] as String?) ?? '',
      lastMessageId: (json['lastMessageId'] as num?)?.toInt() ?? 0,
      full: (json['full'] as bool?) ?? false,
      moreMessages: (json['moreMessages'] as bool?) ?? false,
      reminders: list('reminders', Reminder.fromJson),
      conversations: list('conversations', Conversation.fromJson),
      profile: pull['profile'] is Map
          ? CoachingProfile.fromJson(Map<String, dynamic>.from(pull['profile'] as Map))
          : null,
      checkins: list('checkins', CheckinEntry.fromJson),
      workouts: list('workouts', WorkoutEntry.fromJson),
      messages: list('messages', ChatMessage.fromJson),
      rejected: ((json['rejected'] as List?) ?? const [])
          .map((e) => SyncRejection.fromJson(Map<String, dynamic>.from(e as Map)))
          .toList(),
    );
  }
}

/// GET/PATCH /coaching/profile. Also carries the user's timezone, which drives
/// reminders too — not only coaching.
class CoachingProfile {
  const CoachingProfile({
    required this.optedIn,
    required this.timezone,
    this.trainingDays = const [],
    this.allergies = const [],
    this.gymTime,
    this.checkinTime,
    this.programTime,
    this.language,
    this.awaitingCheckin = false,
    this.awaitingSince,
    this.pendingSync = false,
  });

  final bool optedIn;
  final String timezone;
  final List<int> trainingDays; // ISO weekdays, 1 = Monday
  final List<String> allergies;
  final String? gymTime;
  final String? checkinTime;
  final String? programTime;
  final String? language;

  /// Server-owned: Botvy has asked today's question and is waiting on a reply.
  /// Displayed, never sent back.
  final bool awaitingCheckin;
  final DateTime? awaitingSince;

  /// True while this device holds an edit the server has not accepted yet.
  final bool pendingSync;

  factory CoachingProfile.fromJson(Map<String, dynamic> json) => CoachingProfile(
        optedIn: (json['optedIn'] as bool?) ?? false,
        awaitingCheckin: (json['awaitingCheckin'] as bool?) ?? false,
        awaitingSince: _localTime(json['awaitingSince']),
        timezone: (json['timezone'] as String?) ?? 'UTC',
        trainingDays: ((json['trainingDays'] as List?) ?? const [])
            .map((e) => (e as num).toInt())
            .toList(),
        allergies: ((json['allergies'] as List?) ?? const [])
            .map((e) => e.toString())
            .toList(),
        gymTime: json['gymTime'] as String?,
        checkinTime: json['checkinTime'] as String?,
        programTime: json['programTime'] as String?,
        language: json['language'] as String?,
      );
}

DateTime? _localTime(Object? raw) {
  if (raw is! String) return null;
  return DateTime.tryParse(raw)?.toLocal();
}

/// 'Today 14:30' / 'Tomorrow 09:00' / 'Fri 3 Oct, 09:00' (+ year if not this
/// one). [now] is injectable so this is testable without a clock, and
/// [locale] so an Arabic user reads Arabic month names.
String formatRemindAt(DateTime when, {DateTime? now, String? locale}) {
  final local = when.toLocal();
  final ref = (now ?? DateTime.now()).toLocal();
  // UTC anchors: a local DateTime difference across a DST boundary is 23h or
  // 25h, which rounds to the wrong number of calendar days.
  final days = DateTime.utc(local.year, local.month, local.day)
      .difference(DateTime.utc(ref.year, ref.month, ref.day))
      .inDays;
  final time = DateFormat.Hm(locale).format(local);
  if (days == 0) return 'Today $time';
  if (days == 1) return 'Tomorrow $time';
  if (days == -1) return 'Yesterday $time';
  final pattern = local.year == ref.year ? 'EEE d MMM' : 'EEE d MMM y';
  return '${DateFormat(pattern, locale).format(local)}, $time';
}

/// Soonest pending reminder first; everything already fired, done or cancelled
/// after it, most recent first.
List<Reminder> sortReminders(List<Reminder> items, {DateTime? now}) {
  final ref = now ?? DateTime.now();
  final upcoming = <Reminder>[];
  final rest = <Reminder>[];
  for (final r in items) {
    (r.isActive && r.remindAt.isAfter(ref) ? upcoming : rest).add(r);
  }
  upcoming.sort((a, b) => a.remindAt.compareTo(b.remindAt));
  rest.sort((a, b) => b.remindAt.compareTo(a.remindAt));
  return [...upcoming, ...rest];
}

/// GET /health -- unauthenticated.
class HealthStatus {
  const HealthStatus({
    required this.status,
    required this.database,
    required this.ollama,
  });

  final String status; // 'ok' | 'degraded'
  final bool database;
  final bool ollama;

  bool get ok => status == 'ok';

  factory HealthStatus.fromJson(Map<String, dynamic> json) => HealthStatus(
        status: (json['status'] as String?) ?? 'unknown',
        database: (json['database'] as bool?) ?? false,
        ollama: (json['ollama'] as bool?) ?? false,
      );
}
