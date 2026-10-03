// The single seam between the app and the generated design tokens.
//
// `packages/tokens` builds `dist/tokens.dart` (class `BotvyTokens`) from
// `tokens.json`, so that four surfaces share one palette. Until that package
// is published into this app's dependencies, the values live here — same class
// name, same members as the generator emits, and `test/tokens_parity_test.dart`
// fails the moment one of them disagrees with `tokens.json`.
//
// TO SWAP IT IN, when packages/tokens ships a pubspec:
//   1. add `botvy_tokens: { path: ../../packages/tokens }` to pubspec.yaml
//   2. replace the `BotvyTokens` class below with
//        export 'package:botvy_tokens/tokens.dart';
// The short-name scales under it (`BotvySpace` and friends) stay: they read
// the generated members, they do not repeat their values.
import 'package:flutter/material.dart';

abstract final class BotvyTokens {
  static const Color lightBg = Color(0xFFF6F7F9);
  static const Color darkBg = Color(0xFF101418);
  static const Color lightSurface = Color(0xFFFFFFFF);
  static const Color darkSurface = Color(0xFF171C22);
  static const Color lightText = Color(0xFF14171A);
  static const Color darkText = Color(0xFFE8EBEE);
  static const Color lightMuted = Color(0xFF4B5563);
  static const Color darkMuted = Color(0xFF9AA4B2);
  static const Color lightLine = Color(0xFFE3E6EA);
  static const Color darkLine = Color(0xFF2A323B);
  static const Color lightAccent = Color(0xFF2563EB);
  static const Color darkAccent = Color(0xFF60A5FA);
  static const Color lightAccentText = Color(0xFFFFFFFF);
  static const Color darkAccentText = Color(0xFF0B1220);
  static const Color lightUp = Color(0xFF16A34A);
  static const Color darkUp = Color(0xFF4ADE80);
  static const Color lightDown = Color(0xFFDC2626);
  static const Color darkDown = Color(0xFFF87171);
  static const Color lightUnknown = Color(0xFF9CA3AF);
  static const Color darkUnknown = Color(0xFF6B7280);

  static const double radiusSm = 4;
  static const double radiusMd = 6;
  static const double radiusLg = 8;
  static const double radiusXl = 16;
  static const double radiusXxl = 28;
  static const double radiusFull = 9999;

  static const double spaceXxs = 2;
  static const double spaceXs = 4;
  static const double spaceSm = 8;
  static const double spaceMd = 12;
  static const double spaceLg = 16;
  static const double spaceXl = 24;
  static const double spaceXxl = 32;

  static const int motionShortMs = 150;
  static const int motionMediumMs = 250;
  static const int motionLongMs = 400;
}

/// Spacing, for insets and gaps. Features use these, never a number: the CI
/// literal check (`tool/check_ui_literals.sh`) fails on a numeric inset.
abstract final class BotvySpace {
  static const double xxs = BotvyTokens.spaceXxs;
  static const double xs = BotvyTokens.spaceXs;
  static const double sm = BotvyTokens.spaceSm;
  static const double md = BotvyTokens.spaceMd;
  static const double lg = BotvyTokens.spaceLg;
  static const double xl = BotvyTokens.spaceXl;
  static const double xxl = BotvyTokens.spaceXxl;
}

/// Corner radii. `xl` is the app's default shape — cards, FABs, fields;
/// `xxl` is sheets and dialogs.
abstract final class BotvyRadius {
  static const double sm = BotvyTokens.radiusSm;
  static const double md = BotvyTokens.radiusMd;
  static const double lg = BotvyTokens.radiusLg;
  static const double xl = BotvyTokens.radiusXl;
  static const double xxl = BotvyTokens.radiusXxl;
  static const double full = BotvyTokens.radiusFull;
}

/// Durations and curves for every animation in the app.
///
/// Screens read [BotvyMotion.of], never the constants: it answers zero when
/// the handset asks for no animations, which the constants cannot know.
/// Curves are Material 3's emphasised easing — the "expressive" feel comes
/// from these and the `long` duration on big transitions, not from physics.
abstract final class BotvyMotion {
  static const Duration short = Duration(
    milliseconds: BotvyTokens.motionShortMs,
  );
  static const Duration medium = Duration(
    milliseconds: BotvyTokens.motionMediumMs,
  );
  static const Duration long = Duration(milliseconds: BotvyTokens.motionLongMs);

  /// Something arriving.
  static const Curve enter = Easing.emphasizedDecelerate;

  /// Something leaving.
  static const Curve exit = Easing.emphasizedAccelerate;

  /// Something changing in place.
  static const Curve change = Easing.standard;

  static MotionDurations of(BuildContext context) =>
      MediaQuery.maybeDisableAnimationsOf(context) ?? false
      ? MotionDurations.off
      : MotionDurations.on;
}

class MotionDurations {
  const MotionDurations._(this.short, this.medium, this.long);

  static const on = MotionDurations._(
    BotvyMotion.short,
    BotvyMotion.medium,
    BotvyMotion.long,
  );
  static const off = MotionDurations._(
    Duration.zero,
    Duration.zero,
    Duration.zero,
  );

  final Duration short;
  final Duration medium;
  final Duration long;

  bool get enabled => long > Duration.zero;
}
