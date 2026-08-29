/// Types mirroring apps/gateway/openapi.json. Hand-written rather than
/// generated -- six endpoints do not justify a codegen toolchain.
library;

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
    required this.role,
    required this.content,
    this.createdAt,
    this.streaming = false,
  });

  final int? id;
  final String role; // 'user' | 'assistant'
  String content; // mutable: the assistant bubble grows token by token
  final DateTime? createdAt;

  /// True while tokens are still arriving for this message.
  bool streaming;

  bool get isUser => role == 'user';

  factory ChatMessage.fromJson(Map<String, dynamic> json) => ChatMessage(
        id: json['id'] as int?,
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
    this.createdAt,
    this.notifications = const [],
  });

  final String id;
  final String title;

  /// Local time -- the gateway speaks UTC.
  final DateTime remindAt;

  final String status; // 'active' | 'done' | 'cancelled'
  final DateTime? createdAt;

  /// May legitimately be shorter than the lead times requested: the gateway
  /// drops any whose moment has already passed. Not an error.
  final List<ReminderNotification> notifications;

  bool get isActive => status == 'active';

  factory Reminder.fromJson(Map<String, dynamic> json) => Reminder(
        id: json['id'] as String,
        title: (json['title'] as String?) ?? '',
        remindAt: _localTime(json['remindAt']) ?? DateTime.now(),
        status: (json['status'] as String?) ?? 'active',
        createdAt: _localTime(json['createdAt']),
        notifications: ((json['notifications'] as List?) ?? const [])
            .map((n) =>
                ReminderNotification.fromJson(Map<String, dynamic>.from(n as Map)))
            .toList(),
      );
}

DateTime? _localTime(Object? raw) {
  if (raw is! String) return null;
  return DateTime.tryParse(raw)?.toLocal();
}

const _kWeekdays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const _kMonths = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

/// 'Today 14:30' / 'Tomorrow 09:00' / 'Fri 3 Oct, 09:00' (+ year if not this
/// one). [now] is injectable so this is testable without a clock.
///
/// ponytail: hand-rolled instead of pulling in `intl` for one format string.
/// Swap for DateFormat the day the app needs real localisation.
String formatRemindAt(DateTime when, {DateTime? now}) {
  final local = when.toLocal();
  final ref = (now ?? DateTime.now()).toLocal();
  // UTC anchors: a local DateTime difference across a DST boundary is 23h or
  // 25h, which rounds to the wrong number of calendar days.
  final days = DateTime.utc(local.year, local.month, local.day)
      .difference(DateTime.utc(ref.year, ref.month, ref.day))
      .inDays;
  final time = '${local.hour.toString().padLeft(2, '0')}:'
      '${local.minute.toString().padLeft(2, '0')}';
  if (days == 0) return 'Today $time';
  if (days == 1) return 'Tomorrow $time';
  if (days == -1) return 'Yesterday $time';
  final date = '${_kWeekdays[local.weekday - 1]} ${local.day} '
      '${_kMonths[local.month - 1]}';
  return local.year == ref.year
      ? '$date, $time'
      : '$date ${local.year}, $time';
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
