// The stored appearance reaches the MaterialApp: theme mode, and a locale
// whose direction every screen below inherits.
import 'package:botvy/app/appearance/appearance_cubit.dart';
import 'package:botvy/core/api/api_client.dart';
import 'package:botvy/main.dart';
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';

Future<BuildContext> _pump(WidgetTester tester, AppearanceCubit cubit) async {
  late BuildContext captured;
  final router = GoRouter(
    routes: [
      GoRoute(
        path: '/',
        builder: (context, _) {
          captured = context;
          return const SizedBox.shrink();
        },
      ),
    ],
  );
  await tester.pumpWidget(
    BlocProvider<AppearanceCubit>.value(
      value: cubit,
      child: BotvyMaterialApp(router: router),
    ),
  );
  await tester.pumpAndSettle();
  return captured;
}

void main() {
  testWidgets('a stored Arabic choice lays the app out right to left', (
    tester,
  ) async {
    final store = InMemorySecretStore();
    await store.write(AppearanceCubit.localeKey, 'ar');
    await store.write(AppearanceCubit.themeKey, 'dark');
    final cubit = AppearanceCubit(store);
    await cubit.restore();

    final context = await _pump(tester, cubit);
    expect(Directionality.of(context), TextDirection.rtl);
    expect(Theme.of(context).brightness, Brightness.dark);
  });

  testWidgets('changing the language re-lays the app without a restart', (
    tester,
  ) async {
    final cubit = AppearanceCubit(InMemorySecretStore());
    await cubit.setLocale(const Locale('en'));
    final context = await _pump(tester, cubit);
    expect(Directionality.of(context), TextDirection.ltr);

    await cubit.setLocale(const Locale('ar'));
    await tester.pumpAndSettle();
    expect(Directionality.of(context), TextDirection.rtl);
  });
}
