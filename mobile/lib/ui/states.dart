import 'dart:async';

import 'package:flutter/material.dart';

import '../app/l10n/app_localizations.dart';
import '../app/tokens.dart';

/// Nothing here yet: an icon, one line, and at most one thing to do about it.
class EmptyState extends StatelessWidget {
  const EmptyState({
    super.key,
    required this.icon,
    required this.message,
    this.actionLabel,
    this.onAction,
  });

  final IconData icon;
  final String message;
  final String? actionLabel;
  final VoidCallback? onAction;

  @override
  Widget build(BuildContext context) => _Centred(
    icon: icon,
    message: message,
    action: actionLabel == null || onAction == null
        ? null
        : FilledButton.tonal(onPressed: onAction, child: Text(actionLabel!)),
  );
}

/// Something failed: what, and a way to try again.
class ErrorState extends StatelessWidget {
  const ErrorState({super.key, required this.message, this.onRetry});

  final String message;
  final VoidCallback? onRetry;

  @override
  Widget build(BuildContext context) => _Centred(
    icon: Icons.error_outline,
    iconColor: Theme.of(context).colorScheme.error,
    message: message,
    action: onRetry == null
        ? null
        : OutlinedButton.icon(
            onPressed: onRetry,
            icon: const Icon(Icons.refresh),
            label: Text(AppLocalizations.of(context).retry),
          ),
  );
}

/// Waiting. Rare in a local-first app — the cache answers before a frame —
/// which is why it is one centred indicator and not a skeleton, and why it
/// waits 300 ms before appearing: an answer that comes sooner never flashes a
/// spinner, then fades in when it does come.
class LoadingView extends StatefulWidget {
  const LoadingView({super.key});

  static const Duration delay = Duration(milliseconds: 300);

  @override
  State<LoadingView> createState() => _LoadingViewState();
}

class _LoadingViewState extends State<LoadingView> {
  Timer? _timer;
  bool _shown = false;

  @override
  void initState() {
    super.initState();
    _timer = Timer(LoadingView.delay, () {
      if (mounted) setState(() => _shown = true);
    });
  }

  @override
  void dispose() {
    _timer?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => AnimatedOpacity(
    opacity: _shown ? 1 : 0,
    duration: BotvyMotion.of(context).short,
    child: _shown
        ? const Center(child: CircularProgressIndicator())
        : const SizedBox.shrink(),
  );
}

class _Centred extends StatelessWidget {
  const _Centred({
    required this.icon,
    required this.message,
    this.iconColor,
    this.action,
  });

  final IconData icon;
  final Color? iconColor;
  final String message;
  final Widget? action;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Center(
      child: SingleChildScrollView(
        padding: const EdgeInsetsDirectional.all(BotvySpace.xl),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(
              icon,
              size: BotvySpace.xxl * 2,
              color: iconColor ?? theme.colorScheme.onSurfaceVariant,
            ),
            const SizedBox(height: BotvySpace.lg),
            Text(
              message,
              textAlign: TextAlign.center,
              style: theme.textTheme.bodyLarge?.copyWith(
                color: theme.colorScheme.onSurfaceVariant,
              ),
            ),
            if (action != null) ...[
              const SizedBox(height: BotvySpace.xl),
              action!,
            ],
          ],
        ),
      ),
    );
  }
}
