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
