import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart' show ScrollDirection;

/// An extended FAB that folds to its icon while the member scrolls down a
/// list and opens again on the way back up — the label is for the first
/// look, the icon is enough once they are reading.
///
/// The FAB is a sibling of the list in the `Scaffold`, not its ancestor, so
/// it cannot hear the list scroll. [FabScrollScope] goes above the `Scaffold`,
/// hears the scroll notifications bubbling up from the body, and tells the
/// FAB. With no scope above it the FAB stays extended.
class ScrollAwareFab extends StatelessWidget {
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
  Widget build(BuildContext context) {
    final extended = FabScrollScope.extendedOf(context);
    return FloatingActionButton.extended(
      onPressed: onPressed,
      tooltip: tooltip,
      isExtended: extended,
      icon: Icon(icon),
      label: Text(label),
    );
  }
}

class FabScrollScope extends StatefulWidget {
  const FabScrollScope({super.key, required this.child});

  final Widget child;

  static bool extendedOf(BuildContext context) =>
      context
          .dependOnInheritedWidgetOfExactType<_FabExtended>()
          ?.notifier
          ?.value ??
      true;

  @override
  State<FabScrollScope> createState() => _FabScrollScopeState();
}

class _FabScrollScopeState extends State<FabScrollScope> {
  final _extended = ValueNotifier<bool>(true);

  bool _onScroll(ScrollNotification n) {
    // Only the page's own vertical list: a horizontal carousel or a nested
    // list inside a card is not the member scrolling the page.
    if (n.depth != 0 || n.metrics.axis != Axis.vertical) return false;
    if (n is UserScrollNotification) {
      // Checked alone: the notification that says "going down" still
      // reports the top offset, and the at-top rule below would undo it.
      if (n.direction == ScrollDirection.reverse) _extended.value = false;
      if (n.direction == ScrollDirection.forward) _extended.value = true;
    } else if (n.metrics.pixels <= n.metrics.minScrollExtent) {
      _extended.value = true;
    }
    return false;
  }

  @override
  void dispose() {
    _extended.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) =>
      NotificationListener<ScrollNotification>(
        onNotification: _onScroll,
        child: _FabExtended(notifier: _extended, child: widget.child),
      );
}

class _FabExtended extends InheritedNotifier<ValueNotifier<bool>> {
  const _FabExtended({required super.notifier, required super.child});
}
