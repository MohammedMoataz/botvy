import 'package:flutter/material.dart';

import '../app/tokens.dart';

/// A titled group of rows: the settings hub's unit, and any screen's that
/// lists things in kinds.
///
/// The title is `titleSmall` in the primary colour, the rows sit on one
/// filled card, and the dividers between them start where the text does.
// Where a ListTile's title starts: padding, a 24 dp icon, the gap after it.
const double _textStart = BotvySpace.lg + 24 + BotvySpace.lg;

class Section extends StatelessWidget {
  const Section({super.key, required this.title, required this.children});

  final String title;
  final List<Widget> children;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Padding(
      padding: const EdgeInsetsDirectional.symmetric(
        horizontal: BotvySpace.lg,
        vertical: BotvySpace.sm,
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Padding(
            padding: const EdgeInsetsDirectional.only(
              start: BotvySpace.lg,
              bottom: BotvySpace.sm,
            ),
            child: Semantics(
              header: true,
              child: Text(
                title,
                style: theme.textTheme.titleSmall?.copyWith(
                  color: theme.colorScheme.primary,
                ),
              ),
            ),
          ),
          Card.filled(
            margin: EdgeInsetsDirectional.zero,
            clipBehavior: Clip.antiAlias,
            child: Column(
              children: [
                for (var i = 0; i < children.length; i++) ...[
                  if (i > 0)
                    const Divider(
                      height: 1,
                      indent: _textStart,
                      endIndent: BotvySpace.lg,
                    ),
                  children[i],
                ],
              ],
            ),
          ),
        ],
      ),
    );
  }
}
