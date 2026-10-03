import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../app/tokens.dart';

/// One tab of the shell: what the bar and the rail draw for it.
class ShellDestination {
  const ShellDestination({
    required this.icon,
    required this.selectedIcon,
    required this.label,
  });

  final IconData icon;
  final IconData selectedIcon;
  final String label;
}

/// The signed-in app's frame: a bottom `NavigationBar` on a phone, a
/// `NavigationRail` from 600 dp (Material's medium window class), and a modal
/// drawer for everything that is not a tab.
///
/// Each tab is a `StatefulShellBranch` with its own navigator, so switching
/// keeps the scroll and the pushed pages of the tab left behind. Tapping the
/// tab already showing returns it to its root.
///
/// The pages inside keep their own `Scaffold`s and app bars; this one only
/// holds the bar and the drawer. A page asks for the drawer with
/// [ShellMenuButton].
class AppShell extends StatefulWidget {
  const AppShell({
    super.key,
    required this.shell,
    required this.destinations,
    required this.drawer,
  });

  final StatefulNavigationShell shell;
  final List<ShellDestination> destinations;
  final Widget drawer;

  /// Material's compact/medium boundary.
  static const double railWidth = 600;

  /// The branches' container, for `StatefulShellRoute.navigatorContainerBuilder`:
  /// every tab stays built (its navigator, its scroll) and the one shown
  /// changes by Material's fade-through — the old tab fades out in the first
  /// third, the new one fades in and settles from 92 % scale in the rest.
  static Widget branches(
    BuildContext context,
    StatefulNavigationShell shell,
    List<Widget> children,
  ) => _FadeThroughBranches(index: shell.currentIndex, children: children);

  @override
  State<AppShell> createState() => _AppShellState();
}

class _AppShellState extends State<AppShell> {
  final _scaffold = GlobalKey<ScaffoldState>();

  void _select(int index) => widget.shell.goBranch(
    index,
    initialLocation: index == widget.shell.currentIndex,
  );

  @override
  Widget build(BuildContext context) {
    final media = MediaQuery.of(context);
    final wide = media.size.width >= AppShell.railWidth;
    // The keyboard belongs to the page: the bar would ride up on top of it.
    final typing = media.viewInsets.bottom > 0;
    final destinations = widget.destinations;

    return _ShellScope(
      scaffold: _scaffold,
      child: Scaffold(
        key: _scaffold,
        // The pages' own scaffolds handle the keyboard inset; doing it here
        // too would squeeze them twice.
        resizeToAvoidBottomInset: false,
        drawer: widget.drawer,
        body: wide
            ? Row(
                children: [
                  SafeArea(
                    child: NavigationRail(
                      selectedIndex: widget.shell.currentIndex,
                      onDestinationSelected: _select,
                      labelType: NavigationRailLabelType.all,
                      leading: const ShellMenuButton(),
                      destinations: [
                        for (final d in destinations)
                          NavigationRailDestination(
                            icon: Icon(d.icon),
                            selectedIcon: Icon(d.selectedIcon),
                            label: Text(d.label),
                          ),
                      ],
                    ),
                  ),
                  const VerticalDivider(width: 1),
                  Expanded(child: widget.shell),
                ],
              )
            : widget.shell,
        bottomNavigationBar: wide || typing
            ? null
            : NavigationBar(
                selectedIndex: widget.shell.currentIndex,
                onDestinationSelected: _select,
                destinations: [
                  for (final d in destinations)
                    NavigationDestination(
                      icon: Icon(d.icon),
                      selectedIcon: Icon(d.selectedIcon),
                      label: d.label,
                    ),
                ],
              ),
      ),
    );
  }
}

/// Opens the shell's drawer from a page's app bar.
///
/// The page's `Scaffold` is not the one holding the drawer, so a plain
/// `Scaffold.of(context).openDrawer()` would find the wrong one. Outside a
/// shell (a page pumped alone in a test) it draws nothing.
class ShellMenuButton extends StatelessWidget {
  const ShellMenuButton({super.key});

  @override
  Widget build(BuildContext context) {
    final scope = context.dependOnInheritedWidgetOfExactType<_ShellScope>();
    if (scope == null) return const SizedBox.shrink();
    return IconButton(
      icon: const Icon(Icons.menu),
      tooltip: MaterialLocalizations.of(context).openAppDrawerTooltip,
      onPressed: () => scope.scaffold.currentState?.openDrawer(),
    );
  }
}

class _ShellScope extends InheritedWidget {
  const _ShellScope({required this.scaffold, required super.child});

  final GlobalKey<ScaffoldState> scaffold;

  @override
  bool updateShouldNotify(_ShellScope old) => old.scaffold != scaffold;
}

class _FadeThroughBranches extends StatefulWidget {
  const _FadeThroughBranches({required this.index, required this.children});

  final int index;
  final List<Widget> children;

  @override
  State<_FadeThroughBranches> createState() => _FadeThroughBranchesState();
}

class _FadeThroughBranchesState extends State<_FadeThroughBranches> {
  // Material's fade-through split: out over the first ~35 %, in after it.
  static const Curve _out = Interval(0, 0.35, curve: BotvyMotion.exit);
  static const Curve _in = Interval(0.35, 1, curve: BotvyMotion.enter);

  /// The tab fading out, kept on stage until its fade ends; every other
  /// hidden tab is offstage, as the IndexedStack kept it — built and holding
  /// its state, but not laid out, painted, hit or read by a screen reader.
  int? _leaving;

  @override
  void didUpdateWidget(_FadeThroughBranches old) {
    super.didUpdateWidget(old);
    // With animations off there is no fade to wait for: the old tab goes
    // offstage at once (and an `onEnd` would fire mid-build).
    if (old.index != widget.index) {
      _leaving = BotvyMotion.of(context).enabled ? old.index : null;
    }
  }

  @override
  Widget build(BuildContext context) {
    final duration = BotvyMotion.of(context).medium;
    return Stack(
      fit: StackFit.expand,
      children: [
        for (var i = 0; i < widget.children.length; i++)
          _branch(i, duration, widget.children[i]),
      ],
    );
  }

  Widget _branch(int i, Duration duration, Widget child) {
    final shown = i == widget.index;
    return Offstage(
      offstage: !shown && i != _leaving,
      child: IgnorePointer(
        ignoring: !shown,
        child: ExcludeSemantics(
          excluding: !shown,
          // A hidden tab's tickers stop, as they did in the IndexedStack —
          // once it has finished fading out.
          child: TickerMode(
            enabled: shown || i == _leaving,
            child: AnimatedOpacity(
              opacity: shown ? 1 : 0,
              duration: duration,
              curve: shown ? _in : _out,
              onEnd: () {
                if (i == _leaving && mounted) setState(() => _leaving = null);
              },
              child: AnimatedScale(
                scale: shown ? 1 : 0.92,
                duration: duration,
                curve: shown ? _in : _out,
                child: child,
              ),
            ),
          ),
        ),
      ),
    );
  }
}
