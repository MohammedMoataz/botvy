import 'package:botvy/app/appearance/appearance_cubit.dart';
import 'package:botvy/core/api/api_client.dart';
import 'package:botvy/ui/motion/animated_check.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_test/flutter_test.dart';

Future<List<String>> _tapCheck(WidgetTester tester, {required bool on}) async {
  final calls = <String>[];
  tester.binding.defaultBinaryMessenger.setMockMethodCallHandler(
    SystemChannels.platform,
    (call) async {
      if (call.method == 'HapticFeedback.vibrate') {
        calls.add('${call.arguments}');
      }
      return null;
    },
  );
  addTearDown(
    () => tester.binding.defaultBinaryMessenger.setMockMethodCallHandler(
      SystemChannels.platform,
      null,
    ),
  );
  final appearance = AppearanceCubit(InMemorySecretStore());
  await appearance.setHaptics(on);
  var done = false;
  await tester.pumpWidget(
    BlocProvider.value(
      value: appearance,
      child: MaterialApp(
        home: StatefulBuilder(
          builder: (context, setState) => AnimatedCheck(
            done: done,
            tooltip: 'Complete',
            onPressed: () => setState(() => done = !done),
          ),
        ),
      ),
    ),
  );
  await tester.tap(find.byType(AnimatedCheck));
  await tester.pumpAndSettle();
  expect(find.byIcon(Icons.check_circle), findsOneWidget);
  return calls;
}

void main() {
  testWidgets('completing taps lightly when haptics are on', (tester) async {
    expect(await _tapCheck(tester, on: true), [
      'HapticFeedbackType.lightImpact',
    ]);
  });

  testWidgets('and not at all when they are off', (tester) async {
    expect(await _tapCheck(tester, on: false), isEmpty);
  });
}
