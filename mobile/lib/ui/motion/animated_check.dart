import 'package:flutter/material.dart';

import '../../app/tokens.dart';
import 'haptics.dart';

/// The round check that completes a task: the circle turns into a filled
/// check with a short scale-in, and the phone taps once (if haptics are on).
class AnimatedCheck extends StatelessWidget {
  const AnimatedCheck({
    super.key,
    required this.done,
    required this.tooltip,
    required this.doneTooltip,
    required this.onPressed,
  });

  final bool done;

  /// What a tap does while not done ("Complete") …
  final String tooltip;

  /// … and while done ("Mark as not done"): a screen reader names the action.
  final String doneTooltip;
  final VoidCallback onPressed;

  @override
  Widget build(BuildContext context) => Semantics(
    checked: done,
    child: IconButton(
      tooltip: done ? doneTooltip : tooltip,
      onPressed: () {
        if (!done) Haptics.light(context);
        onPressed();
      },
      icon: AnimatedSwitcher(
        duration: BotvyMotion.of(context).short,
        switchInCurve: BotvyMotion.enter,
        switchOutCurve: BotvyMotion.exit,
        transitionBuilder: (child, animation) =>
            ScaleTransition(scale: animation, child: child),
        child: done
            ? Icon(
                Icons.check_circle,
                key: const ValueKey(true),
                color: Theme.of(context).colorScheme.primary,
              )
            : const Icon(Icons.circle_outlined, key: ValueKey(false)),
      ),
    ),
  );
}
