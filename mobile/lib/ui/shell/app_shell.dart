import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

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
