import 'package:botvy/ui/confirm_dialog.dart';
import 'package:botvy/ui/scroll_aware_fab.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

Future<bool?> _ask(WidgetTester tester, Future<void> Function() answer) async {
  bool? result;
  await tester.pumpWidget(
    MaterialApp(
      home: Builder(
        builder: (context) => TextButton(
          onPressed: () async => result = await showConfirmDialog(
            context,
            title: 'Sign out?',
            confirmLabel: 'Sign out',
            destructive: true,
          ),
          child: const Text('open'),
        ),
      ),
    ),
  );
  await tester.tap(find.text('open'));
  await tester.pumpAndSettle();
  await answer();
  await tester.pumpAndSettle();
  return result;
}

void main() {
  group('showConfirmDialog', () {
    testWidgets('confirm answers true', (tester) async {
      expect(
        await _ask(tester, () => tester.tap(find.text('Sign out').last)),
        isTrue,
      );
    });

    testWidgets('cancel answers false', (tester) async {
      expect(
        await _ask(tester, () => tester.tap(find.text('Cancel'))),
        isFalse,
      );
    });

    testWidgets('tapping outside answers false', (tester) async {
      expect(
        await _ask(tester, () => tester.tapAt(const Offset(5, 5))),
        isFalse,
      );
    });
  });

  group('ScrollAwareFab', () {
    Future<void> pumpList(WidgetTester tester) => tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: ListView(
            children: [
              for (var i = 0; i < 100; i++) ListTile(title: Text('row $i')),
            ],
          ),
          floatingActionButton: ScrollAwareFab(
            icon: Icons.add,
            label: 'New task',
            tooltip: 'New task',
            onPressed: () {},
          ),
        ),
      ),
    );

    bool extended(WidgetTester tester) => tester
        .widget<FloatingActionButton>(find.byType(FloatingActionButton))
        .isExtended;

    testWidgets('folds on the way down, opens on the way up', (tester) async {
      await pumpList(tester);
      expect(extended(tester), isTrue);

      await tester.drag(find.byType(ListView), const Offset(0, -400));
      await tester.pumpAndSettle();
      expect(extended(tester), isFalse);

      await tester.drag(find.byType(ListView), const Offset(0, 100));
      await tester.pumpAndSettle();
      expect(extended(tester), isTrue);
    });

    testWidgets('folded, it still has its tooltip', (tester) async {
      await pumpList(tester);
      await tester.drag(find.byType(ListView), const Offset(0, -400));
      await tester.pumpAndSettle();
      expect(find.byTooltip('New task'), findsOneWidget);
    });

    testWidgets('with no list on the page it stays extended', (tester) async {
      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            floatingActionButton: ScrollAwareFab(
              icon: Icons.add,
              label: 'New',
              tooltip: 'New',
              onPressed: () {},
            ),
          ),
        ),
      );
      expect(extended(tester), isTrue);
    });
  });
}
