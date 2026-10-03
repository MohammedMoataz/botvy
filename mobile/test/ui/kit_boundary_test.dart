// Constitution IX for the kit: lib/ui/ is feature-agnostic. Features import
// it; it imports no feature, or the kit becomes a second way for features to
// reach into each other.
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

void main() {
  test('lib/ui imports no feature', () {
    final offenders = <String>[];
    for (final file in Directory('lib/ui').listSync(recursive: true)) {
      if (file is! File || !file.path.endsWith('.dart')) continue;
      final lines = file.readAsLinesSync();
      for (var i = 0; i < lines.length; i++) {
        final line = lines[i];
        if (line.startsWith('import ') && line.contains('features/')) {
          offenders.add('${file.path}:${i + 1}: $line');
        }
      }
    }
    expect(offenders, isEmpty);
  });
}
