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
    required this.role,
    required this.content,
    this.createdAt,
    this.streaming = false,
    this.syncState = 'synced',
  });

  final int? id;

  /// Set for messages this device composed; the key the outbox dedupes on.
  final String? clientId;

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
  });

  final String clientId;
  final String text;

  /// When the user actually typed it. The gateway resolves "in two hours"
  /// against this, not against the moment the flush lands.
  final DateTime composedAt;
}

/// POST /chat/batch.
class ChatBatchResult {
  const ChatBatchResult({
    required this.processed,
    required this.duplicates,
    this.reply,
  });

  final int processed;

  /// clientIds the gateway had already stored — safe to mark synced too.
  final List<String> duplicates;

  /// One reply covering the whole batch. Null when everything was a duplicate.
  final String? reply;

  factory ChatBatchResult.fromJson(Map<String, dynamic> json) => ChatBatchResult(
        processed: (json['processed'] as num?)?.toInt() ?? 0,
        duplicates: ((json['duplicates'] as List?) ?? const [])
            .map((e) => e.toString())
            .toList(),
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
  });

  final bool optedIn;
  final String timezone;
  final List<int> trainingDays; // ISO weekdays, 1 = Monday
  final List<String> allergies;
  final String? gymTime;
  final String? checkinTime;
  final String? programTime;
  final String? language;

  factory CoachingProfile.fromJson(Map<String, dynamic> json) => CoachingProfile(
        optedIn: (json['optedIn'] as bool?) ?? false,
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
