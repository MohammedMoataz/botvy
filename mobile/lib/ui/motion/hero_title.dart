import 'package:flutter/material.dart';

/// A title that flies from a list row into the app bar of the screen it opens
/// (and back), so the member sees where the new screen came from. Both ends
/// use the same [tag]; the text may differ in style, not in content.
class HeroTitle extends StatelessWidget {
  const HeroTitle({super.key, required this.tag, required this.text});

  final Object tag;
  final String text;

  @override
  Widget build(BuildContext context) => Hero(
    tag: tag,
    // Text in flight has no Material above it; this keeps it from drawing
    // with the debug yellow underline.
    child: Material(
      type: MaterialType.transparency,
      child: Text(text, maxLines: 1, overflow: TextOverflow.ellipsis),
    ),
  );
}
