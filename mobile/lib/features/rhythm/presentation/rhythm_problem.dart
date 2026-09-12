import 'package:flutter/material.dart';

import '../../../app/l10n/app_localizations.dart';
import '../application/rhythm_cubit.dart';

/// A refused command, said in the member's own language.
///
/// The cubit has no `BuildContext` and so no `AppLocalizations`, so it reports
/// two sentinels instead of two sentences — an English string composed there
/// would be English on an Arabic screen. This is where they become words.
/// Anything that is neither sentinel is the server's own message, shown as it
/// came: the API's refusals name the field and the rule, which is more useful
/// than "something went wrong" even when it arrives in English.
///
/// Inline in the sheet rather than a snack bar, on purpose. A snack bar for
/// "this was not sent" appears over the sheet and then leaves, and the member
/// is left looking at a form that seems to have worked. Failing in place, above
/// the button that failed, is the only version that survives being ignored for
/// ten seconds.
class RhythmProblem extends StatelessWidget {
  const RhythmProblem({super.key, required this.problem});

  final String problem;

  @override
  Widget build(BuildContext context) {
    final t = AppLocalizations.of(context);
    final scheme = Theme.of(context).colorScheme;

    return Padding(
      padding: const EdgeInsets.only(top: 12),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(Icons.error_outline, size: 18, color: scheme.error),
          const SizedBox(width: 8),
          Expanded(
            child: Text(
              switch (problem) {
                RhythmCubit.offlineProblem => t.rhythmOffline,
                RhythmCubit.refusedProblem => t.rhythmRefused,
                _ => problem,
              },
              style: Theme.of(
                context,
              ).textTheme.bodySmall?.copyWith(color: scheme.error),
            ),
          ),
        ],
      ),
    );
  }
}
