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
    required this.onPressed,
  });

  final bool done;
  final String tooltip;
  final VoidCallback onPressed;

  @override
  Widget build(BuildContext context) => IconButton(
    tooltip: tooltip,
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
  );
}
