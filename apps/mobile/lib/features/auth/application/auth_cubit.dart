import 'package:flutter_bloc/flutter_bloc.dart';

import '../../../core/api/api_client.dart';
import '../../../core/db/database.dart';
import '../../profile/data/profile_mirror.dart';

/// What went wrong, as something a screen can translate.
///
/// Never the server's raw message: `translate()` in the API client writes for
/// whoever is reading a log, and the sign-in path has exactly one thing it may
/// say about a failed credential.
enum AuthFailure {
  invalidCredentials,
  registrationClosed,
  emailTaken,
  linkRequired,
  passwordMismatch,
  offline,
  unknown,
}

enum AuthPhase { unknown, signedOut, working, signedIn }

class AuthState {
  const AuthState({
    this.phase = AuthPhase.unknown,
    this.email,
    this.userId,
    this.failure,
    this.linkEmail,
    this.mustChangePassword = false,
  });

  final AuthPhase phase;
  final String? email;
  final String? userId;
  final AuthFailure? failure;

  /// The address a Google sign-in collided with, kept so the screen can ask for
  /// its password and finish the link rather than sending the member away to
  /// register a second account.
  final String? linkEmail;
  final bool mustChangePassword;

  bool get isSignedIn => phase == AuthPhase.signedIn;
  bool get isBusy => phase == AuthPhase.working;

  AuthState copyWith({
    AuthPhase? phase,
    String? email,
    String? userId,
    AuthFailure? failure,
    String? linkEmail,
    bool? mustChangePassword,
    bool clearFailure = false,
  }) => AuthState(
    phase: phase ?? this.phase,
    email: email ?? this.email,
    userId: userId ?? this.userId,
    failure: clearFailure ? null : (failure ?? this.failure),
    linkEmail: clearFailure ? null : (linkEmail ?? this.linkEmail),
    mustChangePassword: mustChangePassword ?? this.mustChangePassword,
  );
}

/// The phone's session.
///
/// One thing here is worth stating because it is easy to get backwards: a
/// successful sign-in pulls the profile and preferences into the local mirror
/// *before* reporting `signedIn`. The router redirects on that flag, so
/// reporting it first would land the member on a screen whose data is still in
/// flight — and on a slow connection that is a visibly empty home screen
/// rather than a loading one.
///
/// The sync loop arrives in P2. Until then this phase fetches the two records
/// itself, which is why the mirror is filled here rather than by a background
/// pass.
class AuthCubit extends Cubit<AuthState> {
  AuthCubit(this._api, this._db, this._mirror) : super(const AuthState());

  final ApiClient _api;
  final AppDatabase _db;
  final ProfileMirror _mirror;

  /// Decides the opening screen from what is already on the device.
  ///
  /// A returning member must not see the sign-in form flash before the home
  /// screen, so this runs before the first frame the router paints.
  Future<void> restore() async {
    final token = await _api.tokens.readAccess();
    if (token == null) {
      emit(const AuthState(phase: AuthPhase.signedOut));
      return;
    }

    emit(
      AuthState(
        phase: AuthPhase.signedIn,
        email: await _api.tokens.readEmail(),
        userId: await _db.getValue(DbKeys.userId),
      ),
    );
  }

  Future<void> signIn(String email, String password) async {
    await _attempt(
      () async => _api.login(email, password, device: await _device()),
    );
  }

  /// Registers, then signs in with the same credentials.
  ///
  /// Two calls rather than one, because registration deliberately does not
  /// return a session: an installation may close registration between the two,
  /// and a register endpoint that also signed people in would make that gap
  /// invisible. The failure the member sees is the same either way.
  Future<void> register({
    required String email,
    required String password,
    required String passwordConfirm,
    String? displayName,
    String? locale,
    String? timezone,
  }) async {
    if (password != passwordConfirm) {
      emit(state.copyWith(phase: AuthPhase.signedOut, failure: AuthFailure.passwordMismatch));
      return;
    }

    await _attempt(() async {
      await _api.register(
        email: email,
        password: password,
        passwordConfirm: passwordConfirm,
        displayName: displayName,
        locale: locale,
        timezone: timezone,
      );
      return _api.login(email, password, device: await _device());
    });
  }

  Future<void> signInWithGoogle(String idToken) async {
    await _attempt(() async => _api.google(idToken, device: await _device()));
  }

  /// Finishes what `signInWithGoogle` refused with [AuthFailure.linkRequired].
  Future<void> linkGoogle(String idToken, String password) async {
    await _attempt(
      () async => _api.linkGoogle(idToken, password, device: await _device()),
    );
  }

  Future<void> signOut() async {
    await _api.logout();
    // The mirror goes too. The next member on this handset must not open the
    // app to the last one's name, allergies and daily times.
    await _mirror.clear();
    await _db.setValue(DbKeys.userId, '');
    emit(const AuthState(phase: AuthPhase.signedOut));
  }

  /// The session died while the app was running — a revoked family, a deleted
  /// account, a password changed on another device. Called by the API client.
  Future<void> onSessionLost() async {
    await _mirror.clear();
    emit(const AuthState(phase: AuthPhase.signedOut));
  }

  Future<void> _attempt(Future<Session> Function() action) async {
    emit(state.copyWith(phase: AuthPhase.working, clearFailure: true));

    try {
      final session = await action();
      await _db.setValue(DbKeys.userId, session.userId);

      // Before signedIn, deliberately. See the note on the class.
      await _mirror.fill();

      emit(
        AuthState(
          phase: AuthPhase.signedIn,
          email: session.email,
          userId: session.userId,
          mustChangePassword: session.mustChangePassword,
        ),
      );
    } on ApiException catch (e) {
      emit(
        state.copyWith(
          phase: AuthPhase.signedOut,
          failure: _classify(e),
          linkEmail: e.linkEmail,
        ),
      );
    }
  }

  AuthFailure _classify(ApiException e) {
    if (e.isOffline) return AuthFailure.offline;
    if (e.linkEmail != null) return AuthFailure.linkRequired;
    return switch (e.statusCode) {
      401 => AuthFailure.invalidCredentials,
      403 => AuthFailure.registrationClosed,
      409 => AuthFailure.emailTaken,
      _ => AuthFailure.unknown,
    };
  }

  /// This handset, as the server needs to know it.
  ///
  /// The install id is minted once and kept forever: a fresh one per sign-in
  /// would give the member a new device row each time, and then one
  /// notification per row for every reminder.
  Future<Map<String, dynamic>> _device() async => {
    'installId': await stableInstallId(_db),
    'kind': deviceKind(),
  };
}
