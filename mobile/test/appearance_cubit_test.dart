import 'package:botvy/app/appearance/appearance_cubit.dart';
import 'package:botvy/core/api/api_client.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test('nothing stored: follow the handset, haptics on', () async {
    final cubit = AppearanceCubit(InMemorySecretStore());
    await cubit.restore();
    expect(cubit.state.themeMode, ThemeMode.system);
    expect(cubit.state.locale, isNull);
    expect(cubit.state.haptics, isTrue);
  });

  test('choices are stored and come back on the next start', () async {
    final store = InMemorySecretStore();
    final first = AppearanceCubit(store);
    await first.setThemeMode(ThemeMode.dark);
    await first.setLocale(const Locale('ar'));
    await first.setHaptics(false);

    final second = AppearanceCubit(store);
    await second.restore();
    expect(second.state.themeMode, ThemeMode.dark);
    expect(second.state.locale, const Locale('ar'));
    expect(second.state.haptics, isFalse);
  });

  test('back to the handset language forgets the stored one', () async {
    final store = InMemorySecretStore();
    final cubit = AppearanceCubit(store);
    await cubit.setLocale(const Locale('ar'));
    await cubit.setLocale(null);

    final next = AppearanceCubit(store);
    await next.restore();
    expect(next.state.locale, isNull);
  });

  test('a value this build does not know is ignored, not thrown', () async {
    final store = InMemorySecretStore();
    await store.write(AppearanceCubit.themeKey, 'sepia');
    await store.write(AppearanceCubit.localeKey, 'fr');
    await store.write(AppearanceCubit.hapticsKey, 'maybe');

    final cubit = AppearanceCubit(store);
    await cubit.restore();
    expect(cubit.state, const AppearanceState());
  });
}
