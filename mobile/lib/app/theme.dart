import 'package:flex_color_scheme/flex_color_scheme.dart';
import 'package:flutter/material.dart';

import 'tokens.dart';

/// Material 3 themes built from the design tokens, not from a seed colour the
/// app picked for itself — the phone, the admin, the extension and the
/// marketing page all render the same palette.
///
/// The shape language is the "expressive" one 030 asked for, through our own
/// radii rather than a package: rounder cards, fields and FABs (`xl`), sheets
/// and dialogs rounder still (`xxl`), buttons left at Material's own stadium.
abstract final class AppTheme {
  static ThemeData get light => FlexThemeData.light(
    colors: FlexSchemeColor.from(
      primary: BotvyTokens.lightAccent,
      error: BotvyTokens.lightDown,
      brightness: Brightness.light,
    ),
    scaffoldBackground: BotvyTokens.lightBg,
    surface: BotvyTokens.lightSurface,
    useMaterial3: true,
    subThemesData: _subThemes,
    textTheme: _textTheme,
    extensions: const [BotvyStatusColors.light],
  ).copyWith(dividerColor: BotvyTokens.lightLine);

  static ThemeData get dark => FlexThemeData.dark(
    colors: FlexSchemeColor.from(
      primary: BotvyTokens.darkAccent,
      error: BotvyTokens.darkDown,
      brightness: Brightness.dark,
    ),
    scaffoldBackground: BotvyTokens.darkBg,
    surface: BotvyTokens.darkSurface,
    useMaterial3: true,
    subThemesData: _subThemes,
    textTheme: _textTheme,
    extensions: const [BotvyStatusColors.dark],
  ).copyWith(dividerColor: BotvyTokens.darkLine);

  static const FlexSubThemesData _subThemes = FlexSubThemesData(
    cardRadius: BotvyRadius.xl,
    fabRadius: BotvyRadius.xl,
    fabUseShape: true,
    fabSchemeColor: SchemeColor.primaryContainer,
    inputDecoratorRadius: BotvyRadius.xl,
    inputDecoratorIsFilled: true,
    chipRadius: BotvyRadius.lg,
    popupMenuRadius: BotvyRadius.lg,
    dialogRadius: BotvyRadius.xxl,
    bottomSheetRadius: BotvyRadius.xxl,
    navigationBarIndicatorSchemeColor: SchemeColor.secondaryContainer,
    navigationRailIndicatorSchemeColor: SchemeColor.secondaryContainer,
    useM2StyleDividerInM3: false,
  );

  // Emphasised titles: the weight, not the size, is what reads as current.
  static const TextTheme _textTheme = TextTheme(
    headlineMedium: TextStyle(fontWeight: FontWeight.w600),
    headlineSmall: TextStyle(fontWeight: FontWeight.w600),
    titleLarge: TextStyle(fontWeight: FontWeight.w600),
  );
}

/// The three status colours of `tokens.json` (`up`, `down`, `unknown`), which
/// Material's scheme has no roles for, per mode.
@immutable
class BotvyStatusColors extends ThemeExtension<BotvyStatusColors> {
  const BotvyStatusColors({
    required this.up,
    required this.down,
    required this.unknown,
  });

  final Color up;
  final Color down;
  final Color unknown;

  static const light = BotvyStatusColors(
    up: BotvyTokens.lightUp,
    down: BotvyTokens.lightDown,
    unknown: BotvyTokens.lightUnknown,
  );

  static const dark = BotvyStatusColors(
    up: BotvyTokens.darkUp,
    down: BotvyTokens.darkDown,
    unknown: BotvyTokens.darkUnknown,
  );

  /// The theme's own, or light's when a test pumps a bare `ThemeData`.
  static BotvyStatusColors of(BuildContext context) =>
      Theme.of(context).extension<BotvyStatusColors>() ?? light;

  @override
  BotvyStatusColors copyWith({Color? up, Color? down, Color? unknown}) =>
      BotvyStatusColors(
        up: up ?? this.up,
        down: down ?? this.down,
        unknown: unknown ?? this.unknown,
      );

  @override
  BotvyStatusColors lerp(BotvyStatusColors? other, double t) {
    if (other == null) return this;
    return BotvyStatusColors(
      up: Color.lerp(up, other.up, t)!,
      down: Color.lerp(down, other.down, t)!,
      unknown: Color.lerp(unknown, other.unknown, t)!,
    );
  }
}
