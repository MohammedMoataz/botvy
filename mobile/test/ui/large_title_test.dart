import 'package:botvy/ui/large_title.dart';
import 'package:botvy/ui/motion/diff_animated_list.dart';
import 'package:botvy/ui/scroll_aware_fab.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

Widget _slivers({List<String>? items}) => MaterialApp(
  home: Scaffold(
    floatingActionButton: ScrollAwareFab(
      icon: Icons.add,
      label: 'New',
      tooltip: 'New',
      onPressed: () {},
    ),
    body: LargeTitleScrollView(
      title: const Text('Tasks'),
      slivers: [
        DiffAnimatedList<String>.sliver(
          items: items ?? [for (var i = 0; i < 60; i++) 'row $i'],
          keyOf: (s) => s,
          itemBuilder: (context, s) => ListTile(title: Text(s)),
        ),
      ],
    ),
  ),
);

/// The large title's top: the lowest of the two texts the bar draws (the
/// toolbar's own title sits fixed at the top).
double _titleTop(WidgetTester tester) => find
    .text('Tasks')
    .evaluate()
    .map((e) => tester.getTopLeft(find.byElementPredicate((x) => x == e)).dy)
    .reduce((a, b) => a > b ? a : b);

void main() {
  testWidgets('the title starts large and collapses as the list scrolls', (
    tester,
  ) async {
    await tester.pumpWidget(_slivers());
    final expanded = _titleTop(tester);
    await tester.drag(find.byType(CustomScrollView), const Offset(0, -600));
    await tester.pumpAndSettle();
    expect(_titleTop(tester), lessThan(expanded));
    expect(find.text('Tasks'), findsWidgets, reason: 'still titled');
  });

  testWidgets('the FAB still folds on a large-title page', (tester) async {
    await tester.pumpWidget(_slivers());
    await tester.drag(find.byType(CustomScrollView), const Offset(0, -600));
    await tester.pumpAndSettle();
    expect(
      tester
          .widget<FloatingActionButton>(find.byType(FloatingActionButton))
          .isExtended,
      isFalse,
    );
  });

  testWidgets('the sliver list animates a removal too', (tester) async {
    await tester.pumpWidget(_slivers(items: ['a', 'b']));
    await tester.pumpWidget(_slivers(items: ['a']));
    await tester.pump(const Duration(milliseconds: 30));
    expect(find.text('b'), findsOneWidget);
    await tester.pumpAndSettle();
    expect(find.text('b'), findsNothing);
  });

  testWidgets('a box body never slides under the collapsed bar', (
    tester,
  ) async {
    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: LargeTitleScrollView.box(
            title: const Text('Calendar'),
            body: ListView(
              children: [
                for (var i = 0; i < 60; i++) ListTile(title: Text('day $i')),
              ],
            ),
          ),
        ),
      ),
    );
    await tester.drag(find.byType(ListView), const Offset(0, -300));
    await tester.pumpAndSettle();
    final barBottom = tester.getBottomLeft(find.byType(AppBar).first).dy;
    final firstShown = find.byType(ListTile).hitTestable().first;
    expect(tester.getTopLeft(firstShown).dy, greaterThanOrEqualTo(barBottom - 1));
  });
}
