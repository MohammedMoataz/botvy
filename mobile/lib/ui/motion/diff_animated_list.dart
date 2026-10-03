import 'package:flutter/material.dart';

import '../../app/tokens.dart';
import 'list_diff.dart';

/// A lazily built list whose rows animate in and out as [items] changes:
/// a new row grows and fades in, a removed one shrinks and fades out, and the
/// rows around them move rather than jump.
///
/// Driven by a key diff ([diffKeys]) on every rebuild, so the cubit keeps
/// emitting plain lists and the page keeps passing them in — nothing about the
/// data has to know it is animated. Moves re-render in place.
class DiffAnimatedList<T> extends StatefulWidget {
  const DiffAnimatedList({
    super.key,
    required this.items,
    required this.keyOf,
    required this.itemBuilder,
    this.padding,
  });

  final List<T> items;
  final Object Function(T item) keyOf;
  final Widget Function(BuildContext context, T item) itemBuilder;
  final EdgeInsetsGeometry? padding;

  @override
  State<DiffAnimatedList<T>> createState() => _DiffAnimatedListState<T>();
}

class _DiffAnimatedListState<T> extends State<DiffAnimatedList<T>> {
  /// Past this many rows in or out at once, the change is a new list (a view
  /// switched, a sync landed), not an edit: rebuilt, not animated. Rows
  /// growing in start at zero height, and a lazy list would build hundreds of
  /// them to fill the screen — the 2,000-task Today budget (SC-005) is what
  /// caught it.
  static const int _maxAnimated = 10;

  var _list = GlobalKey<AnimatedListState>();

  @override
  void didUpdateWidget(DiffAnimatedList<T> old) {
    super.didUpdateWidget(old);
    final list = _list.currentState;
    if (list == null) return;
    final diff = diffKeys(
      old.items.map(old.keyOf).toList(),
      widget.items.map(widget.keyOf).toList(),
    );
    if (diff.removed.length + diff.inserted.length > _maxAnimated) {
      _list = GlobalKey<AnimatedListState>();
      return;
    }
    final duration = BotvyMotion.of(context).short;
    for (final i in diff.removed) {
      final gone = old.items[i];
      list.removeItem(
        i,
        (context, animation) =>
            _transition(animation, old.itemBuilder(context, gone)),
        duration: duration,
      );
    }
    for (final i in diff.inserted) {
      list.insertItem(i, duration: duration);
    }
  }

  static Widget _transition(Animation<double> animation, Widget child) =>
      SizeTransition(
        sizeFactor: CurvedAnimation(
          parent: animation,
          curve: BotvyMotion.enter,
          reverseCurve: BotvyMotion.exit,
        ),
        child: FadeTransition(opacity: animation, child: child),
      );

  @override
  Widget build(BuildContext context) => KeyedSubtree(
    // A bulk change swaps in a new AnimatedList; this key is what lets the
    // new one pick up the old one's scroll offset from the route's
    // PageStorage instead of jumping to the top.
    key: const PageStorageKey<String>('DiffAnimatedList'),
    child: AnimatedList(
      key: _list,
      padding: widget.padding,
      initialItemCount: widget.items.length,
      itemBuilder: (context, index, animation) => _transition(
        animation,
        widget.itemBuilder(context, widget.items[index]),
      ),
    ),
  );
}
