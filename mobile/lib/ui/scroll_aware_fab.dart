import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart' show ScrollDirection;

/// An extended FAB that folds to its icon while the member scrolls down a
/// list and opens again on the way back up — the label is for the first
/// look, the icon is enough once they are reading.
///
/// It follows the route's [PrimaryScrollController]: on a phone a page's
/// vertical list attaches to it by itself (Flutter's
/// `automaticallyInheritForPlatforms`), and the FAB lives in the same route,
/// so no page has to wire the two together. A page with no such list keeps
/// the FAB extended.
class ScrollAwareFab extends StatefulWidget {
  const ScrollAwareFab({
    super.key,
    required this.icon,
    required this.label,
    required this.tooltip,
    required this.onPressed,
  });

  final IconData icon;
  final String label;

  /// Required: when the FAB is folded the label is gone, and the tooltip is
  /// what a screen reader and a long-press still say.
  final String tooltip;
  final VoidCallback? onPressed;

  @override
  State<ScrollAwareFab> createState() => _ScrollAwareFabState();
}

class _ScrollAwareFabState extends State<ScrollAwareFab> {
  ScrollController? _controller;
  bool _extended = true;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    final controller = PrimaryScrollController.maybeOf(context);
    if (controller == _controller) return;
    _controller?.removeListener(_onScroll);
    _controller = controller?..addListener(_onScroll);
  }

  void _onScroll() {
    final controller = _controller;
    // More than one list on the route gives no single direction to follow;
    // leave the FAB as it is.
    if (controller == null || controller.positions.length != 1) return;
    final position = controller.position;
    final extended = switch (position.userScrollDirection) {
      ScrollDirection.reverse => false,
      ScrollDirection.forward => true,
      ScrollDirection.idle =>
        position.pixels <= position.minScrollExtent || _extended,
    };
    if (extended != _extended) setState(() => _extended = extended);
  }

  @override
  void dispose() {
    _controller?.removeListener(_onScroll);
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => FloatingActionButton.extended(
    onPressed: widget.onPressed,
    tooltip: widget.tooltip,
    isExtended: _extended,
    icon: Icon(widget.icon),
    label: Text(widget.label),
  );
}
