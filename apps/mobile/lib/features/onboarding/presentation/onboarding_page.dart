import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';

import '../../../app/di.dart';
import '../../../app/l10n/app_localizations.dart';
import '../../../core/api/api_client.dart';
import '../../auth/application/auth_cubit.dart';
import '../../profile/data/profile_mirror.dart';
import '../application/onboarding_steps.dart';

/// The first-run walkthrough.
///
/// Skippable and resumable, and those are two different promises. Skippable:
/// every step's answer has a registry default behind it, so leaving is safe and
/// nothing is half-written. Resumable: skipping does *not* mark the walkthrough
/// finished, so Settings can offer it again — only reaching the end writes
/// `onboardingCompletedAt`, and only that stops the router sending a member
/// back here.
///
/// The steps come from the registry, so a later phase adds one without touching
/// this file.
class OnboardingPage extends StatefulWidget {
  const OnboardingPage({super.key});

  @override
  State<OnboardingPage> createState() => _OnboardingPageState();
}

class _OnboardingPageState extends State<OnboardingPage> {
  final _mirror = sl<ProfileMirror>();
  final _registry = sl<OnboardingRegistry>();

  List<OnboardingStep> _steps = const [];
  int _at = 0;
  bool _working = false;
  String? _problem;

  @override
  void initState() {
    super.initState();
    unawaited(_loadSteps());
  }

  Future<void> _loadSteps() async {
    final steps = await _registry.applicable();
    if (mounted) setState(() => _steps = steps);
  }

  /// Leaves the walkthrough without finishing it.
  ///
  /// `onboardingCompletedAt` is deliberately not written: a member who skipped
  /// has not been set up, and Settings should still be able to offer it. What
  /// they keep are the registry defaults, which is what they had anyway.
  Future<void> _skip() async {
    await context.read<AuthCubit>().onboardingSettled();
  }

  /// Finishes it, for good.
  Future<void> _finish() async {
    setState(() {
      _working = true;
      _problem = null;
    });
    // Captured before the await. Reading it afterwards is the
    // use_build_context_synchronously trap: the widget may be gone by then,
    // and on a slow connection it often is.
    final auth = context.read<AuthCubit>();
    try {
      await _mirror.patchProfile({
        'onboardingCompletedAt': DateTime.now().toUtc().toIso8601String(),
      });
      await auth.onboardingSettled();
    } on ApiException catch (e) {
      if (!mounted) return;
      final t = AppLocalizations.of(context);
      // Not marked finished, so the member is not stranded: the walkthrough is
      // still there to try again when the connection is.
      setState(() => _problem = e.isOffline ? t.offline : t.somethingWentWrong);
    } finally {
      if (mounted) setState(() => _working = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final t = AppLocalizations.of(context);
    final last = _at >= _steps.length - 1;

    return Scaffold(
      appBar: AppBar(
        title: Text(t.welcomeTitle),
        actions: [
          TextButton(
            onPressed: _working ? null : () => unawaited(_skip()),
            child: Text(t.skip),
          ),
        ],
      ),
      body: _steps.isEmpty
          // Nothing to ask. A member who registered with a name and a time zone
          // has already answered everything, and a walkthrough with no
          // questions in it should not be shown at all.
          ? Center(
              child: Padding(
                padding: const EdgeInsets.all(24),
                child: Column(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    Text(t.welcomeBody, textAlign: TextAlign.center),
                    const SizedBox(height: 24),
                    FilledButton(
                      onPressed: _working ? null : () => unawaited(_finish()),
                      child: Text(t.finish),
                    ),
                  ],
                ),
              ),
            )
          : Column(
              children: [
                LinearProgressIndicator(
                  value: _steps.isEmpty ? 1 : (_at + 1) / _steps.length,
                ),
                Expanded(
                  child: SingleChildScrollView(
                    padding: const EdgeInsets.all(24),
                    child: _steps[_at].build(context, _advance),
                  ),
                ),
                if (_problem != null)
                  Padding(
                    padding: const EdgeInsets.symmetric(horizontal: 24),
                    child: Text(
                      _problem!,
                      style: TextStyle(
                        color: Theme.of(context).colorScheme.error,
                      ),
                    ),
                  ),
                Padding(
                  padding: const EdgeInsets.all(24),
                  child: Row(
                    children: [
                      if (_at > 0)
                        OutlinedButton(
                          onPressed: _working
                              ? null
                              : () => setState(() => _at -= 1),
                          child: const Icon(Icons.arrow_back),
                        ),
                      const Spacer(),
                      FilledButton(
                        onPressed: _working
                            ? null
                            : () => unawaited(last ? _finish() : _advance()),
                        child: Text(last ? t.finish : t.next),
                      ),
                    ],
                  ),
                ),
              ],
            ),
    );
  }

  Future<void> _advance() async {
    if (_at >= _steps.length - 1) {
      await _finish();
      return;
    }
    setState(() => _at += 1);
  }
}
