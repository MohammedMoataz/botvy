import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';

import '../../core/api/api_client.dart';
import '../l10n/app_localizations.dart';

/// How this phone looks and feels: theme, language, haptics.
///
/// Device-local and never synced. A theme is a property of a screen, not of a
/// member — the same person may want dark on the phone and light on a tablet.
@immutable
class AppearanceState {
  const AppearanceState({
    this.themeMode = ThemeMode.system,
    this.locale,
    this.haptics = true,
  });

  final ThemeMode themeMode;

  /// Null follows the handset, which is what the app did before 030.
  final Locale? locale;

  final bool haptics;

  AppearanceState copyWith({
    ThemeMode? themeMode,
    Locale? Function()? locale,
    bool? haptics,
  }) => AppearanceState(
    themeMode: themeMode ?? this.themeMode,
    locale: locale == null ? this.locale : locale(),
    haptics: haptics ?? this.haptics,
  );

  @override
  bool operator ==(Object other) =>
      other is AppearanceState &&
      other.themeMode == themeMode &&
      other.locale == locale &&
      other.haptics == haptics;

  @override
  int get hashCode => Object.hash(themeMode, locale, haptics);
}

/// Restored in `main()` before the first frame, like the session, so an Arabic
/// choice never shows one English frame first.
///
/// Kept in the keystore through [SecretStore] on the precedent the gateway
/// URL already set: three short strings, and the storage is already here.
/// Sign-out clears tokens, not these, so the sign-in screen keeps the
/// member's language.
class AppearanceCubit extends Cubit<AppearanceState> {
  AppearanceCubit(this._store) : super(const AppearanceState());

  final SecretStore _store;

  static const themeKey = 'appearance.theme';
  static const localeKey = 'appearance.locale';
  static const hapticsKey = 'appearance.haptics';

  Future<void> restore() async {
    final theme = await _store.read(themeKey);
    final locale = await _store.read(localeKey);
    final haptics = await _store.read(hapticsKey);
    // A value this build does not recognise (a newer build wrote it, or it
    // was damaged) falls back to the default rather than failing the boot.
    emit(
      AppearanceState(
        themeMode: ThemeMode.values.asNameMap()[theme] ?? ThemeMode.system,
        locale: _supported(locale),
        haptics: haptics != 'false',
      ),
    );
  }

  Future<void> setThemeMode(ThemeMode mode) async {
    emit(state.copyWith(themeMode: mode));
    await _store.write(themeKey, mode.name);
  }

  /// Null goes back to following the handset.
  Future<void> setLocale(Locale? locale) async {
    emit(state.copyWith(locale: () => locale));
    if (locale == null) {
      await _store.delete(localeKey);
    } else {
      await _store.write(localeKey, locale.languageCode);
    }
  }

  Future<void> setHaptics(bool on) async {
    emit(state.copyWith(haptics: on));
    await _store.write(hapticsKey, '$on');
  }

  static Locale? _supported(String? code) {
    for (final locale in AppLocalizations.supportedLocales) {
      if (locale.languageCode == code) return locale;
    }
    return null;
  }
}
