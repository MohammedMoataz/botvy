// Regressions found by the final review of 030, each pinned before its fix.
import 'package:botvy/app/theme.dart';
import 'package:botvy/ui/motion/animated_check.dart';
import 'package:botvy/ui/motion/diff_animated_list.dart';
import 'package:botvy/ui/motion/hero_title.dart';
import 'package:botvy/ui/settings_tiles.dart';
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
  testWidgets('a hero title keeps the app bar title size', (tester) async {
    await tester.pumpWidget(
      MaterialApp(
        theme: AppTheme.light,
        home: Scaffold(
          appBar: AppBar(
            title: const HeroTitle(tag: 't', text: 'Chat'),
          ),
        ),
      ),
    );
    final element = tester.element(find.text('Chat'));
    expect(
      DefaultTextStyle.of(element).style.fontSize,
      Theme.of(element).textTheme.titleLarge!.fontSize,
    );
  });

  testWidgets('a bulk change keeps the scroll position', (tester) async {
    final before = [for (var i = 0; i < 100; i++) 'r$i'];
    await tester.pumpWidget(_list(before));
    await tester.drag(find.byType(Scrollable), const Offset(0, -2000));
    await tester.pumpAndSettle();
    expect(find.text('r0'), findsNothing);

    await tester.pumpWidget(
      _list([...before, for (var i = 0; i < 20; i++) 'n$i']),
    );
    await tester.pumpAndSettle();
    expect(find.text('r0'), findsNothing, reason: 'did not jump to the top');
  });

  testWidgets('a disabled choice tile does not open its dialog', (
    tester,
  ) async {
    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: ChoiceTile<String>(
            icon: Icons.language,
            title: 'Week starts',
            value: 'monday',
            options: const {'monday': 'Monday', 'sunday': 'Sunday'},
            enabled: false,
            onChanged: (_) {},
          ),
        ),
      ),
    );
    await tester.tap(find.text('Week starts'));
    await tester.pumpAndSettle();
    expect(find.byType(SimpleDialog), findsNothing);
  });

  testWidgets('a done check names the action it will take', (tester) async {
    final handle = tester.ensureSemantics();
    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: AnimatedCheck(
            done: true,
            tooltip: 'Complete',
            doneTooltip: 'Mark as not done',
            onPressed: () {},
          ),
        ),
      ),
    );
    expect(find.byTooltip('Mark as not done'), findsOneWidget);
    expect(
      tester.getSemantics(find.byType(AnimatedCheck)),
      isSemantics(isChecked: true, hasCheckedState: true),
    );
    handle.dispose();
  });
}
