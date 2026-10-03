import 'package:botvy/ui/hex_color.dart';
import 'package:flutter/painting.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test('reads #rrggbb with or without the hash, always opaque', () {
    expect(tryParseHexColor('#22c55e'), const Color(0xFF22C55E));
    expect(tryParseHexColor('22c55e'), const Color(0xFF22C55E));
  });

  test('anything else is no colour', () {
    for (final bad in [null, '', '#fff', '#22c55e80', 'zzzzzz']) {
      expect(tryParseHexColor(bad), isNull, reason: '$bad');
    }
  });

  test('the label fallback is the neutral slate', () {
    expect(parseHexColor('nope'), labelFallbackColor);
    expect(parseHexColor('#ef4444'), const Color(0xFFEF4444));
  });
}
