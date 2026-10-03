// tool/check_ui_literals.sh is CI's guard for FR-010: features take spacing,
// radii and colours from tokens and the theme, never as numbers. These
// fixtures are the contract — one line per banned form, and a clean file that
// uses the tokens — so a pattern that stops matching fails here, not silently
// in CI.
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

ProcessResult _check(String dir) =>
    Process.runSync('bash', ['tool/check_ui_literals.sh', dir]);

void main() {
  test('every banned form is reported, line by line', () {
    final result = _check('test/fixtures/ui_literals/bad');
    expect(result.exitCode, 1);
    final out = result.stdout as String;
    // One per single-line form, then three written over several lines,
    // reported at the line the call starts on.
    for (final line in [1, 2, 3, 4, 5, 6, 7, 8, 9, 12, 15]) {
      expect(out, contains('screen.dart:$line:'), reason: 'line $line');
    }
  });

  test('a file that uses the tokens passes', () {
    final result = _check('test/fixtures/ui_literals/good');
    expect(result.stdout, isEmpty);
    expect(result.exitCode, 0);
  });
}
