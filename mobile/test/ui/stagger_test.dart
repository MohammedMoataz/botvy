import 'package:botvy/ui/motion/stagger.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

Widget _page(List<String> cards) => MaterialApp(
  home: StaggerScope(
    child: ListView(
      children: [
        for (var i = 0; i < cards.length; i++)
          StaggerItem(index: i, child: Text(cards[i])),
      ],
    ),
  ),
);

double _opacity(WidgetTester tester, String text) => tester
    .widget<FadeTransition>(
      find
          .ancestor(of: find.text(text), matching: find.byType(FadeTransition))
          .first,
    )
    .opacity
    .value;

void main() {
  testWidgets('cards enter one after another on first paint', (tester) async {
    await tester.pumpWidget(_page(['a', 'b', 'c', 'd']));
    await tester.pump(const Duration(milliseconds: 120));
    expect(_opacity(tester, 'a'), greaterThan(_opacity(tester, 'd')));
    await tester.pumpAndSettle();
    expect(_opacity(tester, 'd'), 1);
  });

  testWidgets('a refresh does not replay it', (tester) async {
    await tester.pumpWidget(_page(['a', 'b']));
    await tester.pumpAndSettle();
    await tester.pumpWidget(_page(['a', 'b', 'c']));
    await tester.pump();
    expect(_opacity(tester, 'c'), 1);
  });

  testWidgets('no entrance at all when animations are off', (tester) async {
    tester.platformDispatcher.accessibilityFeaturesTestValue =
        const FakeAccessibilityFeatures(disableAnimations: true);
    addTearDown(tester.platformDispatcher.clearAccessibilityFeaturesTestValue);
    await tester.pumpWidget(_page(['a', 'b']));
    await tester.pump();
    expect(_opacity(tester, 'b'), 1);
  });
}
