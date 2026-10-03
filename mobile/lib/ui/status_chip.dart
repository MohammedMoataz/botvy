import 'package:flutter/material.dart';

import '../app/theme.dart';
import '../app/tokens.dart';

enum BotvyStatus { up, down, unknown }

/// A small rounded label in one of the three status colours of the tokens.
class StatusChip extends StatelessWidget {
  const StatusChip({super.key, required this.status, required this.label});

  final BotvyStatus status;
  final String label;

  @override
  Widget build(BuildContext context) {
    final colors = BotvyStatusColors.of(context);
    final color = switch (status) {
      BotvyStatus.up => colors.up,
      BotvyStatus.down => colors.down,
      BotvyStatus.unknown => colors.unknown,
    };
    return DecoratedBox(
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.15),
        borderRadius: BorderRadius.circular(BotvyRadius.full),
      ),
      child: Padding(
        padding: const EdgeInsetsDirectional.symmetric(
          horizontal: BotvySpace.md,
          vertical: BotvySpace.xs,
        ),
        child: Text(
          label,
          style: Theme.of(context).textTheme.labelMedium
              ?.copyWith(color: color),
        ),
      ),
    );
  }
}
