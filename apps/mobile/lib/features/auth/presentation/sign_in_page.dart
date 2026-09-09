import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:go_router/go_router.dart';

import '../../../app/l10n/app_localizations.dart';
import '../../../app/router.dart';
import '../../../core/notifications/local_notifications.dart' show deviceTimezone;
import '../application/auth_cubit.dart';

/// Sign in, or create an account.
///
/// One page with a mode rather than two routes. The two forms differ by three
/// fields, and a member who mistyped their address on the wrong one should be
/// able to switch without losing what they typed — which two routes make
/// awkward and this makes free.
///
/// No Google button. `AuthCubit.signInWithGoogle` and `linkGoogle` exist and
/// are tested, but `GOOGLE_CLIENT_IDS` is unset on this installation, so a
/// button here would fail every time it was pressed — and a control that always
/// fails teaches people the app is broken. The link-with-password path is the
/// half worth remembering when it lands: a 409 carrying `link_required` puts
/// the address in `state.linkEmail`, and the same password field finishes it.
class SignInPage extends StatefulWidget {
  const SignInPage({super.key});

  @override
  State<SignInPage> createState() => _SignInPageState();
}

class _SignInPageState extends State<SignInPage> {
  final _form = GlobalKey<FormState>();
  final _email = TextEditingController();
  final _password = TextEditingController();
  final _confirm = TextEditingController();
  final _name = TextEditingController();

  bool _registering = false;
  bool _obscure = true;

  @override
  void dispose() {
    _email.dispose();
    _password.dispose();
    _confirm.dispose();
    _name.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (!(_form.currentState?.validate() ?? false)) return;

    final cubit = context.read<AuthCubit>();
    final locale = Localizations.localeOf(context).languageCode;

    if (_registering) {
      await cubit.register(
        email: _email.text.trim(),
        password: _password.text,
        passwordConfirm: _confirm.text,
        displayName: _name.text.trim(),
        locale: locale,
        // The phone's own zone, so the member's very first reminder is already
        // in their local time rather than waiting for them to find the setting.
        //
        // `deviceTimezone()`, not `DateTime.now().timeZoneName`: the latter is
        // an abbreviation like `EEST`, and the server validates an IANA zone —
        // it would refuse the registration with a message about a field the
        // member never filled in.
        timezone: await deviceTimezone(),
      );
    } else {
      await cubit.signIn(_email.text.trim(), _password.text);
    }
  }

  @override
  Widget build(BuildContext context) {
    final t = AppLocalizations.of(context);

    return Scaffold(
      body: SafeArea(
        child: BlocBuilder<AuthCubit, AuthState>(
          builder: (context, state) => Center(
            child: SingleChildScrollView(
              padding: const EdgeInsets.all(24),
              child: ConstrainedBox(
                constraints: const BoxConstraints(maxWidth: 420),
                child: Form(
                  key: _form,
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      Text(
                        _registering ? t.registerTitle : t.signInTitle,
                        style: Theme.of(context).textTheme.headlineSmall,
                      ),
                      const SizedBox(height: 24),

                      if (_registering) ...[
                        TextFormField(
                          controller: _name,
                          textInputAction: TextInputAction.next,
                          decoration: InputDecoration(labelText: t.displayName),
                        ),
                        const SizedBox(height: 12),
                      ],

                      TextFormField(
                        controller: _email,
                        keyboardType: TextInputType.emailAddress,
                        autofillHints: const [AutofillHints.username],
                        textInputAction: TextInputAction.next,
                        decoration: InputDecoration(labelText: t.email),
                        validator: (v) =>
                            (v == null || v.trim().isEmpty) ? t.emailRequired : null,
                      ),
                      const SizedBox(height: 12),

                      TextFormField(
                        controller: _password,
                        obscureText: _obscure,
                        autofillHints: const [AutofillHints.password],
                        textInputAction: _registering
                            ? TextInputAction.next
                            : TextInputAction.done,
                        decoration: InputDecoration(
                          labelText: t.password,
                          suffixIcon: IconButton(
                            icon: Icon(
                              _obscure ? Icons.visibility : Icons.visibility_off,
                            ),
                            onPressed: () => setState(() => _obscure = !_obscure),
                          ),
                        ),
                        validator: (v) {
                          if (v == null || v.isEmpty) return t.passwordRequired;
                          // Only when registering. An existing password shorter
                          // than today's minimum must still be able to sign in,
                          // or its owner cannot reach the screen that changes it.
                          if (_registering && v.length < 8) return t.passwordTooShort;
                          return null;
                        },
                        onFieldSubmitted: (_) {
                          if (!_registering) unawaited(_submit());
                        },
                      ),

                      if (_registering) ...[
                        const SizedBox(height: 12),
                        TextFormField(
                          controller: _confirm,
                          obscureText: _obscure,
                          textInputAction: TextInputAction.done,
                          decoration: InputDecoration(
                            labelText: t.confirmPassword,
                          ),
                          // Inline, so the member is told before they submit.
                          // The server checks it too; that copy is for every
                          // caller that is not this form.
                          validator: (v) =>
                              v == _password.text ? null : t.passwordsDoNotMatch,
                          onFieldSubmitted: (_) => unawaited(_submit()),
                        ),
                      ],

                      const SizedBox(height: 24),
                      FilledButton(
                        onPressed: state.isBusy ? null : () => unawaited(_submit()),
                        child: state.isBusy
                            ? const SizedBox(
                                height: 20,
                                width: 20,
                                child: CircularProgressIndicator(strokeWidth: 2),
                              )
                            : Text(
                                _registering ? t.registerAction : t.signInAction,
                              ),
                      ),

                      const SizedBox(height: 8),
                      TextButton(
                        // The typed address survives the switch: somebody who
                        // started on the wrong form should not retype it.
                        onPressed: state.isBusy
                            ? null
                            : () => setState(() => _registering = !_registering),
                        child: Text(_registering ? t.haveAccount : t.needAccount),
                      ),

                      if (state.failure != null) ...[
                        const SizedBox(height: 16),
                        _Failure(message: _describe(t, state.failure!)),
                      ],

                      const SizedBox(height: 24),
                      // On the sign-in screen because this is where a wrong
                      // address shows up, and it shows up as a failed sign-in
                      // that looks exactly like a wrong password. A member who
                      // cannot get in needs to be able to check the address
                      // from here, not from behind a session they cannot open.
                      TextButton.icon(
                        onPressed: () => context.push(Routes.server),
                        icon: const Icon(Icons.dns_outlined, size: 18),
                        label: Text(t.serverSettings),
                      ),
                    ],
                  ),
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }

  /// The failure, in the member's language.
  ///
  /// Never the server's own message: that is written for whoever reads a log,
  /// and the sign-in path has exactly one thing it may say about a rejected
  /// credential — the API answers a wrong password and an unknown address
  /// identically, and so does this.
  String _describe(AppLocalizations t, AuthFailure failure) => switch (failure) {
    AuthFailure.invalidCredentials => t.invalidCredentials,
    AuthFailure.registrationClosed => t.registrationClosed,
    AuthFailure.emailTaken => t.emailTaken,
    AuthFailure.passwordMismatch => t.passwordsDoNotMatch,
    AuthFailure.offline => t.offline,
    // The Google link path has no button to reach it yet, so it cannot happen
    // here. Handled rather than defaulted, so adding the button does not
    // silently show the wrong message.
    AuthFailure.linkRequired => t.emailTaken,
    AuthFailure.unknown => t.somethingWentWrong,
  };
}

class _Failure extends StatelessWidget {
  const _Failure({required this.message});

  final String message;

  @override
  Widget build(BuildContext context) {
    final colours = Theme.of(context).colorScheme;
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: colours.errorContainer,
        borderRadius: BorderRadius.circular(8),
      ),
      child: Row(
        children: [
          Icon(Icons.error_outline, color: colours.onErrorContainer),
          const SizedBox(width: 8),
          Expanded(
            child: Text(
              message,
              style: TextStyle(color: colours.onErrorContainer),
            ),
          ),
        ],
      ),
    );
  }
}
