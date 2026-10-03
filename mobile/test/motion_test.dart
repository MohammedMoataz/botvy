// Every animation reads its duration from BotvyMotion.of, so the handset's
// "remove animations" is one switch rather than a check at every call site.
import 'package:botvy/app/tokens.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

Future<MotionDurations> _read(WidgetTester tester, {required bool off}) async {
  late MotionDurations read;
  await tester.pumpWidget(
    MediaQuery(
      data: MediaQueryData(disableAnimations: off),
      child: Builder(
        builder: (context) {
          read = BotvyMotion.of(context);
          return const SizedBox.shrink();
        },
      ),
    ),
  );
  return read;
}

void main() {
  testWidgets('the token durations, normally', (tester) async {
    final motion = await _read(tester, off: false);
    expect(motion.short, const Duration(milliseconds: 150));
    expect(motion.medium, const Duration(milliseconds: 250));
    expect(motion.long, const Duration(milliseconds: 400));
    expect(motion.enabled, isTrue);
  });

  testWidgets('nothing, when the handset removes animations', (tester) async {
    final motion = await _read(tester, off: true);
    expect(motion.short, Duration.zero);
    expect(motion.medium, Duration.zero);
    expect(motion.long, Duration.zero);
    expect(motion.enabled, isFalse);
  });
}
