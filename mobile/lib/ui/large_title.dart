import 'package:flutter/material.dart';

/// A tab's page under a Material 3 large title that collapses into the
/// toolbar as the content scrolls (030, US6).
///
/// Two shapes, because the tabs are two shapes:
/// - [LargeTitleScrollView.new] — the page is a list of slivers. One scroll
///   view and one scroll position, so the route's PrimaryScrollController,
///   the folding FAB and pull-to-refresh all follow it as before.
/// - [LargeTitleScrollView.box] — the page is a box with scrollables of its
///   own (the calendar's month, week and day). A NestedScrollView collapses
///   the title as the inner scrollable moves; the FAB then follows the title,
///   not the inner list.
///
/// The page keeps its own Scaffold (and FAB); this is its body.
/// Material 3's `SliverAppBar.large` expanded height; Flutter does not export
/// it.
const double _expandedHeight = 152;

class LargeTitleScrollView extends StatelessWidget {
  const LargeTitleScrollView({
    super.key,
    required this.title,
    this.leading,
    this.actions,
    required List<Widget> this.slivers,
    this.onRefresh,
  }) : body = null;

  const LargeTitleScrollView.box({
    super.key,
    required this.title,
    this.leading,
    this.actions,
    required Widget this.body,
  }) : slivers = null,
       onRefresh = null;

  final Widget title;
  final Widget? leading;
  final List<Widget>? actions;
  final List<Widget>? slivers;
  final Widget? body;

  /// Pull to refresh, for the sliver shape.
  final RefreshCallback? onRefresh;

  Widget _bar() =>
      SliverAppBar.large(leading: leading, title: title, actions: actions);

  @override
  Widget build(BuildContext context) {
    final body = this.body;
    if (body != null) {
      return NestedScrollView(
        headerSliverBuilder: (context, _) => [_bar()],
        body: body,
      );
    }
    final view = CustomScrollView(slivers: [_bar(), ...slivers!]);
    final onRefresh = this.onRefresh;
    return onRefresh == null
        ? view
        : RefreshIndicator(
            onRefresh: onRefresh,
            // Below the expanded title, where the content starts.
            edgeOffset: MediaQuery.paddingOf(context).top + _expandedHeight,
            child: view,
          );
  }
}
