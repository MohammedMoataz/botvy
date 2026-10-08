import 'package:flutter/material.dart';

import '../app/l10n/app_localizations.dart';
import '../app/tokens.dart';
import 'confirm_dialog.dart';

/// The Save button a form screen pins under its content (031).
///
/// Always shown, so a member can see there is a save step. It is enabled only
/// while there is something to save, so a disabled button also tells them
/// nothing is waiting.
class SaveBar extends StatelessWidget {
  const SaveBar({
    super.key,
    required this.dirty,
    required this.saving,
    required this.onSave,
  });

  final bool dirty;
  final bool saving;
  final VoidCallback onSave;

  @override
  Widget build(BuildContext context) {
    final t = AppLocalizations.of(context);
    return SafeArea(
      top: false,
      child: Padding(
        padding: const EdgeInsetsDirectional.fromSTEB(
          BotvySpace.lg,
          BotvySpace.sm,
          BotvySpace.lg,
          BotvySpace.md,
        ),
        child: FilledButton.icon(
          key: const ValueKey('save-bar'),
          onPressed: dirty && !saving ? onSave : null,
          icon: saving
              ? const SizedBox.square(
                  dimension: BotvySpace.lg,
                  child: CircularProgressIndicator(strokeWidth: 2),
                )
              : const Icon(Icons.check),
          label: Text(t.save),
        ),
      ),
    );
  }
}

/// Asks before leaving a screen that still has unsaved edits.
///
/// Without it, the back gesture silently throws away what the member typed,
/// and that silent loss is why the Save button exists.
class UnsavedChangesGuard extends StatelessWidget {
  const UnsavedChangesGuard({
    super.key,
    required this.dirty,
    required this.child,
  });

  final bool dirty;
  final Widget child;

  @override
  Widget build(BuildContext context) => PopScope<Object?>(
        canPop: !dirty,
        onPopInvokedWithResult: (didPop, _) async {
          if (didPop) return;
          final t = AppLocalizations.of(context);
          final navigator = Navigator.of(context);
          final leave = await showConfirmDialog(
            context,
            title: t.unsavedTitle,
            confirmLabel: t.discard,
            destructive: true,
          );
          if (leave) navigator.pop();
        },
        child: child,
      );
}
