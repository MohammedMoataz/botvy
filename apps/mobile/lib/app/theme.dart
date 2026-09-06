import 'package:flex_color_scheme/flex_color_scheme.dart';
import 'package:flutter/material.dart';

import 'tokens.dart';

/// Material 3 themes built from the design tokens, not from a seed colour the
/// app picked for itself — the phone, the admin, the extension and the
/// marketing page all render the same palette.
abstract final class AppTheme {
  static ThemeData get light => FlexThemeData.light(
    colors: FlexSchemeColor.from(
      primary: BotvyTokens.accent,
      error: BotvyTokens.danger,
      brightness: Brightness.light,
    ),
    scaffoldBackground: BotvyTokens.lightBackground,
    surface: BotvyTokens.lightSurface,
    useMaterial3: true,
    subThemesData: _subThemes,
  ).copyWith(dividerColor: BotvyTokens.lightLine);

  static ThemeData get dark => FlexThemeData.dark(
    colors: FlexSchemeColor.from(
      primary: BotvyTokens.accent,
      error: BotvyTokens.danger,
      brightness: Brightness.dark,
    ),
    scaffoldBackground: BotvyTokens.darkBackground,
    surface: BotvyTokens.darkSurface,
    useMaterial3: true,
    subThemesData: _subThemes,
  ).copyWith(dividerColor: BotvyTokens.darkLine);

  static const FlexSubThemesData _subThemes = FlexSubThemesData(
    defaultRadius: BotvyTokens.radius,
  );
}
