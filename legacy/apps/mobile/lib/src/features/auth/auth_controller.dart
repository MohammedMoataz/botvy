import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../api/api_client.dart';
import '../../app_providers.dart';

class AuthState {
  const AuthState({
    required this.signedIn,
    this.email,
    this.busy = false,
    this.error,
  });

  final bool signedIn;
  final String? email;
  final bool busy;
  final String? error;

  AuthState copyWith({
    bool? signedIn,
    String? email,
    bool? busy,
    String? error,
    bool clearError = false,
  }) =>
      AuthState(
        signedIn: signedIn ?? this.signedIn,
        email: email ?? this.email,
        busy: busy ?? this.busy,
        error: clearError ? null : (error ?? this.error),
      );
}

/// Seeded in main() from secure storage so the app opens straight into chat
/// for an already-signed-in user instead of flashing the login screen.
final initialAuthProvider = Provider<AuthState>(
  (ref) => throw UnimplementedError('overridden in main()'),
);

class AuthController extends Notifier<AuthState> {
  @override
  AuthState build() {
    // The refresh token died mid-session -> drop back to the login screen.
    ref.watch(apiClientProvider).onAuthLost = () {
      state = const AuthState(signedIn: false, error: 'Session expired. Sign in again.');
    };
    return ref.watch(initialAuthProvider);
  }

  ApiClient get _api => ref.read(apiClientProvider);

  Future<void> login(String email, String password) async {
    state = state.copyWith(busy: true, clearError: true);
    try {
      await _api.login(email.trim(), password);
      state = AuthState(signedIn: true, email: email.trim());
    } on ApiException catch (e) {
      state = state.copyWith(busy: false, error: e.message);
    }
  }

  /// Registers, then signs in with the same credentials -- the gateway's
  /// register endpoint returns the account, not a token pair.
  Future<void> register(String email, String password,
      {String? displayName}) async {
    state = state.copyWith(busy: true, clearError: true);
    try {
      await _api.register(email.trim(), password, displayName: displayName);
      await _api.login(email.trim(), password);
      state = AuthState(signedIn: true, email: email.trim());
    } on ApiException catch (e) {
      state = state.copyWith(busy: false, error: e.message);
    }
  }

  Future<void> logout() async {
    // The cache holds this account's reminders and conversation, and the
    // scheduled alarms would keep firing for them. Both must go before the
    // next person signs in on this device.
    await ref.read(pushServiceProvider).unregister();
    await ref.read(notificationSchedulerProvider).cancelAll();
    await ref.read(databaseProvider).wipe();
    await _api.logout();
    state = const AuthState(signedIn: false);
  }

  void clearError() => state = state.copyWith(clearError: true);
}

final authControllerProvider =
    NotifierProvider<AuthController, AuthState>(AuthController.new);
