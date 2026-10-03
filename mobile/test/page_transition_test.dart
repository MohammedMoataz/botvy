// Pushing a screen uses Material's shared-axis Z transition (parent to
// child), from the theme, and none at all under "remove animations".
import 'package:animations/animations.dart';
import 'package:botvy/app/theme.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

Future<void> _push(WidgetTester tester, {required bool off}) async {
  await tester.pumpWidget(
    MediaQuery(
      data: MediaQueryData(disableAnimations: off),
      child: MaterialApp(
        theme: AppTheme.light,
        home: Builder(
          builder: (context) => TextButton(
            onPressed: () => Navigator.of(
              context,
            ).push(MaterialPageRoute<void>(builder: (_) => const Text('next'))),
            child: const Text('go'),
          ),
        ),
      ),
    ),
  );
  await tester.tap(find.text('go'));
  await tester.pump();
  await tester.pump(const Duration(milliseconds: 50));
}

void main() {
  testWidgets('a pushed screen arrives on the shared Z axis', (tester) async {
    await _push(tester, off: false);
    expect(find.byType(SharedAxisTransition), findsWidgets);
    await tester.pumpAndSettle();
  });

  testWidgets('and simply appears when animations are off', (tester) async {
    await _push(tester, off: true);
    expect(find.byType(SharedAxisTransition), findsNothing);
    expect(find.text('next'), findsOneWidget);
    await tester.pumpAndSettle();
  });
}
