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
///
/// [DiffAnimatedList.sliver] is the same list as a sliver, for a page that is
/// one `CustomScrollView` (a large-title tab).
class DiffAnimatedList<T> extends StatefulWidget {
  const DiffAnimatedList({
    super.key,
    required this.items,
    required this.keyOf,
    required this.itemBuilder,
    this.padding,
  }) : sliver = false;

  const DiffAnimatedList.sliver({
    super.key,
    required this.items,
    required this.keyOf,
    required this.itemBuilder,
  }) : padding = null,
       sliver = true;

  final List<T> items;
  final Object Function(T item) keyOf;
  final Widget Function(BuildContext context, T item) itemBuilder;
  final EdgeInsetsGeometry? padding;
  final bool sliver;

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

  // AnimatedListState or SliverAnimatedListState: the same two calls, no
  // shared interface.
  var _list = GlobalKey();

  void _insert(int index, Duration duration) => switch (_list.currentState) {
    AnimatedListState list => list.insertItem(index, duration: duration),
    SliverAnimatedListState list => list.insertItem(index, duration: duration),
    _ => null,
  };

  void _remove(int index, AnimatedRemovedItemBuilder builder, Duration d) =>
      switch (_list.currentState) {
        AnimatedListState list => list.removeItem(index, builder, duration: d),
        SliverAnimatedListState list => list.removeItem(
          index,
          builder,
          duration: d,
        ),
        _ => null,
      };

  @override
  void didUpdateWidget(DiffAnimatedList<T> old) {
    super.didUpdateWidget(old);
    if (_list.currentState == null) return;
    final diff = diffKeys(
      old.items.map(old.keyOf).toList(),
      widget.items.map(widget.keyOf).toList(),
    );
    if (diff.removed.length + diff.inserted.length > _maxAnimated) {
      _list = GlobalKey();
      return;
    }
    final duration = BotvyMotion.of(context).short;
    for (final i in diff.removed) {
      final gone = old.items[i];
      _remove(
        i,
        // Gone from the data: drawn while it shrinks, but a tap on it would
        // act on a deleted item through its old callbacks.
        (context, animation) => IgnorePointer(
          child: _transition(animation, old.itemBuilder(context, gone)),
        ),
        duration,
      );
    }
    for (final i in diff.inserted) {
      _insert(i, duration);
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

  Widget _row(BuildContext context, int index, Animation<double> animation) =>
      _transition(animation, widget.itemBuilder(context, widget.items[index]));

  @override
  Widget build(BuildContext context) {
    // In a sliver the scroll view is the page's, and outlives a rebuild.
    if (widget.sliver) {
      return SliverAnimatedList(
        key: _list,
        initialItemCount: widget.items.length,
        itemBuilder: _row,
      );
    }
    return KeyedSubtree(
      // A bulk change swaps in a new AnimatedList; this key is what lets the
      // new one pick up the old one's scroll offset from the route's
      // PageStorage instead of jumping to the top.
      key: const PageStorageKey<String>('DiffAnimatedList'),
      child: AnimatedList(
        key: _list,
        padding: widget.padding,
        initialItemCount: widget.items.length,
        itemBuilder: _row,
      ),
    );
  }
}
