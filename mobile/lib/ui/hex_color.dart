import 'package:flutter/painting.dart';

/// The colour a label is drawn in when its stored colour is unreadable: a
/// neutral slate that reads on both themes.
const Color labelFallbackColor = Color(0xFF475569);

/// `#rrggbb` (the hash optional) to an opaque [Color], or null.
///
/// Labels and personal events store their colour as a string rather than an
/// index into the palette, because the palette is an operator setting and may
/// change under something that was already given one of its colours. This is
/// member data, not the app's palette, which is why it is the one place a hex
/// literal lives.
Color? tryParseHexColor(String? hex) {
  final cleaned = (hex ?? '').replaceFirst('#', '');
  final value = int.tryParse(cleaned, radix: 16);
  if (value == null || cleaned.length != 6) return null;
  return Color(0xFF000000 | value);
}

/// [tryParseHexColor], falling back to [labelFallbackColor].
Color parseHexColor(String? hex) => tryParseHexColor(hex) ?? labelFallbackColor;
