import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';

import '../../../app/di.dart';
import '../../../app/l10n/app_localizations.dart';
import '../../../core/api/api_client.dart';

/// What the sign-in form can be doing. Sealed so a new state cannot be added
/// without every `switch` over it being updated.
sealed class SignInState {
  const SignInState();
}

class SignInIdle extends SignInState {
  const SignInIdle();
}

class SignInBusy extends SignInState {
  const SignInBusy();
}

class SignInFailed extends SignInState {
  const SignInFailed(this.message);
  final String message;
}

class SignInSucceeded extends SignInState {
  const SignInSucceeded();
}

class SignInCubit extends Cubit<SignInState> {
  SignInCubit(this._api) : super(const SignInIdle());

  final ApiClient _api;

  Future<void> submit(
    String email,
    String password, {
    required String notYetAvailable,
  }) async {
    emit(const SignInBusy());
    try {
      await _api.login(email, password);
      emit(const SignInSucceeded());
    } on ApiException catch (e) {
      // `POST /api/v1/auth/login` arrives in P1. Until then the round trip
      // still proves the phone can reach the server and that the base URL is
      // right, which is the whole point of the skeleton.
      emit(SignInFailed(e.statusCode == 404 ? notYetAvailable : e.message));
    }
  }
}

class SignInPage extends StatelessWidget {
  const SignInPage({super.key});

  @override
  Widget build(BuildContext context) {
    return BlocProvider(
      create: (_) => SignInCubit(sl<ApiClient>()),
      child: const _SignInView(),
    );
  }
}

class _SignInView extends StatefulWidget {
  const _SignInView();

  @override
  State<_SignInView> createState() => _SignInViewState();
}

class _SignInViewState extends State<_SignInView> {
  final _formKey = GlobalKey<FormState>();
  final _email = TextEditingController();
  final _password = TextEditingController();

  @override
  void dispose() {
    _email.dispose();
    _password.dispose();
    super.dispose();
  }

  void _submit(BuildContext context) {
    if (!(_formKey.currentState?.validate() ?? false)) return;
    context.read<SignInCubit>().submit(
      _email.text.trim(),
      _password.text,
      notYetAvailable: AppLocalizations.of(context).signInNotYetAvailable,
    );
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);

    return Scaffold(
      body: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(24),
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 420),
              child: Form(
                key: _formKey,
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    Text(
                      l10n.appTitle,
                      style: Theme.of(context).textTheme.headlineMedium,
                      textAlign: TextAlign.center,
                    ),
                    const SizedBox(height: 8),
                    Text(
                      l10n.signInTitle,
                      style: Theme.of(context).textTheme.bodyMedium,
                      textAlign: TextAlign.center,
                    ),
                    const SizedBox(height: 24),
                    TextFormField(
                      controller: _email,
                      keyboardType: TextInputType.emailAddress,
                      autofillHints: const [AutofillHints.email],
                      // The field holds an address, which is written left to
                      // right even when the page is not.
                      textDirection: TextDirection.ltr,
                      decoration: InputDecoration(labelText: l10n.email),
                      validator: (v) => (v == null || v.trim().isEmpty)
                          ? l10n.emailRequired
                          : null,
                    ),
                    const SizedBox(height: 12),
                    TextFormField(
                      controller: _password,
                      obscureText: true,
                      autofillHints: const [AutofillHints.password],
                      textDirection: TextDirection.ltr,
                      decoration: InputDecoration(labelText: l10n.password),
                      onFieldSubmitted: (_) => _submit(context),
                      validator: (v) => (v == null || v.isEmpty)
                          ? l10n.passwordRequired
                          : null,
                    ),
                    const SizedBox(height: 20),
                    BlocBuilder<SignInCubit, SignInState>(
                      builder: (context, state) => Column(
                        crossAxisAlignment: CrossAxisAlignment.stretch,
                        children: [
                          FilledButton(
                            onPressed: state is SignInBusy
                                ? null
                                : () => _submit(context),
                            child: state is SignInBusy
                                ? const SizedBox.square(
                                    dimension: 18,
                                    child: CircularProgressIndicator(
                                      strokeWidth: 2,
                                    ),
                                  )
                                : Text(l10n.signInAction),
                          ),
                          if (state is SignInFailed) ...[
                            const SizedBox(height: 12),
                            Text(
                              state.message,
                              style: TextStyle(
                                color: Theme.of(context).colorScheme.error,
                              ),
                              textAlign: TextAlign.center,
                            ),
                          ],
                        ],
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}
