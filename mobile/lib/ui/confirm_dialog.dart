import 'package:animations/animations.dart';
import 'package:flutter/material.dart';

import '../app/tokens.dart';

/// Asks before something that cannot be taken back. True only on an explicit
/// confirm; cancel, the barrier and back all answer false.
Future<bool> showConfirmDialog(
  BuildContext context, {
  required String title,
  String? body,
  required String confirmLabel,
  bool destructive = false,
}) async {
  final motion = BotvyMotion.of(context);
  // Material's fade-and-scale for a dialog, at the token durations.
  final answer = await showModal<bool>(
    context: context,
    configuration: FadeScaleTransitionConfiguration(
      transitionDuration: motion.medium,
      reverseTransitionDuration: motion.short,
    ),
    builder: (context) {
      final scheme = Theme.of(context).colorScheme;
      return AlertDialog(
        title: Text(title),
        content: body == null ? null : Text(body),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(context).pop(false),
            child: Text(MaterialLocalizations.of(context).cancelButtonLabel),
          ),
          FilledButton(
            style: destructive
                ? FilledButton.styleFrom(
                    backgroundColor: scheme.error,
                    foregroundColor: scheme.onError,
                  )
                : null,
            onPressed: () => Navigator.of(context).pop(true),
            child: Text(confirmLabel),
          ),
        ],
      );
    },
  );
  return answer ?? false;
}
