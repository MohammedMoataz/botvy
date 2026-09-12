// The single seam between the app and the generated design tokens.
//
// `packages/tokens` builds `dist/tokens.dart` (class `BotvyTokens`) from
// `tokens.json`, so that four surfaces share one palette. Until that package
// is published into this app's dependencies, the values live here — same class
// name, same members, seeded from exactly the same source the generator is
// seeded from v1's admin stylesheet.
//
// TO SWAP IT IN, when packages/tokens ships a pubspec:
//   1. add `botvy_tokens: { path: ../../packages/tokens }` to pubspec.yaml
//   2. replace this whole file's body with
//        export 'package:botvy_tokens/tokens.dart';
// Nothing else in the app imports the generator's path, so that is the change.
import 'package:flutter/painting.dart' show Color;

abstract final class BotvyTokens {
  // Light — the v1 admin palette.
  static const Color lightBackground = Color(0xFFF6F7F9);
  static const Color lightSurface = Color(0xFFFFFFFF);
  static const Color lightText = Color(0xFF14171A);
  static const Color lightMuted = Color(0xFF4B5563);
  static const Color lightLine = Color(0xFFE3E6EA);

  // Dark.
  static const Color darkBackground = Color(0xFF0F1216);
  static const Color darkSurface = Color(0xFF171B21);
  static const Color darkText = Color(0xFFE6E9EE);
  static const Color darkMuted = Color(0xFF9BA3AF);
  static const Color darkLine = Color(0xFF262C34);

  // Shared.
  static const Color accent = Color(0xFF2563EB);
  static const Color success = Color(0xFF16A34A);
  static const Color danger = Color(0xFFDC2626);

  static const double radius = 10;
}
