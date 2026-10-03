// The shell's behaviour (spec 030, US1 and US2), on a router with the real
// paths and stub pages: what is under test is the navigation, not the
// features. `router_config_test.dart` checks the real route table has the
// same shape.
import 'package:botvy/app/l10n/app_localizations.dart';
import 'package:botvy/app/navigation.dart';
import 'package:botvy/app/router.dart';
import 'package:botvy/ui/shell/app_shell.dart';
import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';

const _roots = [
  Routes.home,
  Routes.tasks,
  Routes.calendar,
  Routes.chats,
  Routes.athlete,
];

class _ListPage extends StatelessWidget {
  const _ListPage(this.name);

  final String name;

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(leading: ShellMenuButton.maybe(context), title: Text(name)),
    body: ListView(
      key: PageStorageKey(name),
      children: [
        ListTile(
          title: Text('open $name/child'),
          onTap: () => context.push('$name/c1'),
        ),
        for (var i = 0; i < 60; i++) ListTile(title: Text('$name row $i')),
      ],
    ),
  );
}

class _Page extends StatelessWidget {
  const _Page(this.name);

  final String name;

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(title: Text(name)),
    body: Text('page $name'),
  );
}

GoRouter _router() => GoRouter(
  initialLocation: Routes.home,
  routes: [
    StatefulShellRoute(
      navigatorContainerBuilder: AppShell.branches,
      builder: (context, state, shell) => AppShell(
        shell: shell,
        destinations: shellDestinations(AppLocalizations.of(context)),
        drawer: Drawer(
          child: ListTile(
            title: const Text('Meetings'),
            onTap: () => GoRouter.of(context).push(Routes.meeting('m1')),
          ),
        ),
      ),
      branches: [
        for (final root in _roots)
          StatefulShellBranch(
            routes: [
              GoRoute(
                path: root,
                builder: (_, __) => _ListPage(root),
                routes: [
                  GoRoute(
                    path: ':id',
                    builder: (_, state) =>
                        _Page('$root/${state.pathParameters['id']}'),
                  ),
                ],
              ),
            ],
          ),
      ],
    ),
    GoRoute(
      path: '${Routes.meetings}/:id',
      builder: (_, state) => _Page('meeting ${state.pathParameters['id']}'),
    ),
  ],
);

Future<GoRouter> _pump(
  WidgetTester tester, {
  Size size = const Size(400, 800),
  Locale locale = const Locale('en'),
  bool reduceMotion = false,
}) async {
  tester.view.physicalSize = size;
  tester.view.devicePixelRatio = 1;
  addTearDown(tester.view.reset);
  final router = _router();
  tester.platformDispatcher.accessibilityFeaturesTestValue =
      FakeAccessibilityFeatures(disableAnimations: reduceMotion);
  addTearDown(tester.platformDispatcher.clearAccessibilityFeaturesTestValue);
  await tester.pumpWidget(
    MaterialApp.router(
      routerConfig: router,
      locale: locale,
      supportedLocales: AppLocalizations.supportedLocales,
      localizationsDelegates: const [
        AppLocalizations.delegate,
        GlobalMaterialLocalizations.delegate,
        GlobalWidgetsLocalizations.delegate,
        GlobalCupertinoLocalizations.delegate,
      ],
    ),
  );
  await tester.pumpAndSettle();
  return router;
}

Future<void> _tab(WidgetTester tester, String label) async {
  await tester.tap(
    find.descendant(of: find.byType(NavigationBar), matching: find.text(label)),
  );
  await tester.pumpAndSettle();
}

void main() {
  testWidgets('five destinations, Today first', (tester) async {
    await _pump(tester);
    final bar = tester.widget<NavigationBar>(find.byType(NavigationBar));
    expect(bar.destinations, hasLength(5));
    expect(bar.selectedIndex, 0);
    for (final label in ['Today', 'Tasks', 'Calendar', 'Coach', 'Training']) {
      expect(
        find.descendant(
          of: find.byType(NavigationBar),
          matching: find.text(label),
        ),
        findsOneWidget,
      );
    }
  });

  testWidgets('each tab keeps its scroll and its pushed page', (tester) async {
    await _pump(tester);

    await _tab(tester, 'Tasks');
    await tester.drag(find.byType(ListView), const Offset(0, -600));
    await tester.pumpAndSettle();
    expect(find.text('/tasks row 0'), findsNothing);

    await _tab(tester, 'Coach');
    await tester.tap(find.text('open /chats/child'));
    await tester.pumpAndSettle();
    expect(find.text('page /chats/c1'), findsOneWidget);

    await _tab(tester, 'Tasks');
    expect(find.text('/tasks row 0'), findsNothing, reason: 'scroll kept');

    await _tab(tester, 'Coach');
    expect(find.text('page /chats/c1'), findsOneWidget, reason: 'stack kept');
  });

  testWidgets('tapping the active tab returns it to its root', (tester) async {
    await _pump(tester);
    await _tab(tester, 'Coach');
    await tester.tap(find.text('open /chats/child'));
    await tester.pumpAndSettle();

    await _tab(tester, 'Coach');
    expect(find.text('page /chats/c1'), findsNothing);
    expect(find.text('open /chats/child'), findsOneWidget);
  });

  testWidgets('a deep link into a tab opens inside it, bar showing', (
    tester,
  ) async {
    final router = await _pump(tester);
    await openFromOutside(router, Routes.chat('c1'));
    await tester.pumpAndSettle();

    expect(find.text('page /chats/c1'), findsOneWidget);
    final bar = tester.widget<NavigationBar>(find.byType(NavigationBar));
    expect(bar.selectedIndex, 3);

    await tester.pageBack();
    await tester.pumpAndSettle();
    expect(find.text('open /chats/child'), findsOneWidget);
  });

  testWidgets('a deep link to a drawer page opens above Today', (tester) async {
    final router = await _pump(tester);
    await _tab(tester, 'Tasks');
    await openFromOutside(router, Routes.meeting('m1'));
    await tester.pumpAndSettle();

    expect(find.text('page meeting m1'), findsOneWidget);
    expect(find.byType(NavigationBar).hitTestable(), findsNothing);

    await tester.pageBack();
    await tester.pumpAndSettle();
    final bar = tester.widget<NavigationBar>(find.byType(NavigationBar));
    expect(bar.selectedIndex, 0, reason: 'back lands on Today');
  });

  testWidgets('the menu button opens the drawer, from the right in Arabic', (
    tester,
  ) async {
    await _pump(tester, locale: const Locale('ar'));
    await tester.tap(find.byType(ShellMenuButton));
    await tester.pumpAndSettle();

    final drawer = tester.getRect(find.byType(Drawer));
    expect(drawer.right, 400, reason: 'start edge is the right in Arabic');

    await tester.tap(find.text('Meetings'));
    await tester.pumpAndSettle();
    expect(find.text('page meeting m1'), findsOneWidget);
    expect(find.byType(NavigationBar).hitTestable(), findsNothing);
  });

  testWidgets('a wide screen gets a rail instead of the bar', (tester) async {
    await _pump(tester, size: const Size(840, 1200));
    expect(find.byType(NavigationRail), findsOneWidget);
    expect(find.byType(NavigationBar), findsNothing);
  });

  double opacityOf(WidgetTester tester, String text) {
    final fade = tester.widget<FadeTransition>(
      find
          .ancestor(of: find.text(text), matching: find.byType(FadeTransition))
          .first,
    );
    return fade.opacity.value;
  }

  testWidgets('tabs change by fading through', (tester) async {
    await _pump(tester);
    await tester.tap(
      find.descendant(
        of: find.byType(NavigationBar),
        matching: find.text('Tasks'),
      ),
    );
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 160));
    final midway = opacityOf(tester, '/tasks row 0');
    expect(midway, greaterThan(0));
    expect(midway, lessThan(1));
    await tester.pumpAndSettle();
    expect(opacityOf(tester, '/tasks row 0'), 1);
  });

  testWidgets('and switch at once when animations are off', (tester) async {
    await _pump(tester, reduceMotion: true);
    await tester.tap(
      find.descendant(
        of: find.byType(NavigationBar),
        matching: find.text('Tasks'),
      ),
    );
    await tester.pump();
    await tester.pump();
    expect(opacityOf(tester, '/tasks row 0'), 1);
  });

  testWidgets('back on another tab returns to Today first', (tester) async {
    await _pump(tester);
    await _tab(tester, 'Tasks');
    await tester.binding.handlePopRoute();
    await tester.pumpAndSettle();
    final bar = tester.widget<NavigationBar>(find.byType(NavigationBar));
    expect(bar.selectedIndex, 0);
  });

  testWidgets('a wide screen has one menu button, on the rail', (tester) async {
    await _pump(tester, size: const Size(840, 1200));
    expect(find.byIcon(Icons.menu), findsOneWidget);
    expect(
      find.descendant(
        of: find.byType(NavigationRail),
        matching: find.byIcon(Icons.menu),
      ),
      findsOneWidget,
    );
  });

  testWidgets('outside a shell a page keeps its own back arrow', (
    tester,
  ) async {
    await tester.pumpWidget(
      MaterialApp(
        home: Builder(
          builder: (context) => TextButton(
            onPressed: () => Navigator.of(context).push(
              MaterialPageRoute<void>(
                builder: (context) => Scaffold(
                  appBar: AppBar(
                    leading: ShellMenuButton.maybe(context),
                    title: const Text('alone'),
                  ),
                ),
              ),
            ),
            child: const Text('go'),
          ),
        ),
      ),
    );
    await tester.tap(find.text('go'));
    await tester.pumpAndSettle();
    expect(find.byType(BackButton), findsOneWidget);
  });

  testWidgets('switching fast lets each leaving tab finish its fade', (
    tester,
  ) async {
    await _pump(tester);
    await _tab(tester, 'Tasks');
    await tester.tap(
      find.descendant(
        of: find.byType(NavigationBar),
        matching: find.text('Calendar'),
      ),
    );
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 40));
    await tester.tap(
      find.descendant(
        of: find.byType(NavigationBar),
        matching: find.text('Coach'),
      ),
    );
    await tester.pump();
    // Tasks was still fading out when Coach was picked: it keeps fading
    // rather than vanishing in one frame.
    expect(find.text('/tasks row 0'), findsOneWidget);
    await tester.pumpAndSettle();
    expect(find.text('/tasks row 0'), findsNothing);
  });
}
