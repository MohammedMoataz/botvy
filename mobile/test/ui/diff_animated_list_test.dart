import 'package:botvy/ui/motion/diff_animated_list.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

Widget _list(List<String> items) => MaterialApp(
  home: Scaffold(
    body: DiffAnimatedList<String>(
      items: items,
      keyOf: (s) => s,
      itemBuilder: (context, s) => ListTile(title: Text(s)),
    ),
  ),
);

void main() {
  testWidgets('a removed row animates out, a new one animates in', (
    tester,
  ) async {
    await tester.pumpWidget(_list(['a', 'b']));
    await tester.pumpWidget(_list(['a', 'c']));
    await tester.pump(const Duration(milliseconds: 50));
    // Midway: the leaving row is still drawn beside the arriving one.
    expect(find.text('b'), findsOneWidget);
    expect(find.text('c'), findsOneWidget);
    expect(find.byType(SizeTransition), findsWidgets);

    await tester.pumpAndSettle();
    expect(find.text('b'), findsNothing);
    expect(find.text('a'), findsOneWidget);
    expect(find.text('c'), findsOneWidget);
  });

  testWidgets('with animations off the list simply changes', (tester) async {
    tester.platformDispatcher.accessibilityFeaturesTestValue =
        const FakeAccessibilityFeatures(disableAnimations: true);
    addTearDown(tester.platformDispatcher.clearAccessibilityFeaturesTestValue);
    await tester.pumpWidget(_list(['a', 'b']));
    await tester.pumpWidget(_list(['a', 'c']));
    await tester.pump();
    expect(find.text('b'), findsNothing);
    expect(find.text('c'), findsOneWidget);
  });

  testWidgets('a bulk change rebuilds instead of animating every row', (
    tester,
  ) async {
    await tester.pumpWidget(_list(['a']));
    await tester.pumpWidget(_list([for (var i = 0; i < 500; i++) 'r$i']));
    await tester.pump();
    // Rows animating in start at zero height, so a lazy list would build
    // hundreds of them to fill the screen. Only what fits is built.
    expect(find.byType(ListTile).evaluate().length, lessThan(30));
  });
}
