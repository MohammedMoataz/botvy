// The settings hub (spec 030, US4): seven sections in order, every existing
// preference still writes the same field, appearance changes apply at once.
import 'package:botvy/app/appearance/appearance_cubit.dart';
import 'package:botvy/app/l10n/app_localizations.dart';
import 'package:botvy/core/api/api_client.dart';
import 'package:botvy/core/db/database.dart';
import 'package:botvy/features/profile/data/profile_mirror.dart';
import 'package:botvy/features/settings/presentation/settings_page.dart';
import 'package:drift/native.dart';
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_test/flutter_test.dart';

const _preferences = {
  'userId': 'user-1',
  'planTomorrowTime': '21:00',
  'endOfDayTime': '22:00',
  'morningBriefingTime': '08:00',
  'nextPracticeCutoff': '21:00',
  'leadTimes': ['1h', '0m'],
  'quietHours': {'from': '22:00', 'to': '07:00'},
  'weekStartsOn': 'monday',
  'checkinEnabled': true,
  'meetingDurationMin': 30,
  'mealMode': 'llm',
  'aiSuggestions': true,
};

/// Records what the page asks the server to change, and answers with the
/// stored row — the page's contract with the mirror, without a server.
class _RecordingMirror extends ProfileMirror {
  _RecordingMirror(super.api, super.db);

  final patches = <Map<String, dynamic>>[];

  @override
  Future<UserPreference?> patchPreferences(Map<String, dynamic> patch) async {
    patches.add(patch);
    return readPreferences();
  }
}

void main() {
  late AppDatabase db;
  late _RecordingMirror mirror;
  late AppearanceCubit appearance;

  setUp(() async {
    db = AppDatabase.forTesting(NativeDatabase.memory());
    final api = ApiClient(
      TokenStore(InMemorySecretStore()),
      baseUrl: 'http://test.invalid',
    );
    mirror = _RecordingMirror(api, db);
    await mirror.writePreferences(_preferences);
    appearance = AppearanceCubit(InMemorySecretStore());
  });

  tearDown(() => db.close());

  Future<void> pump(WidgetTester tester) async {
    tester.view.physicalSize = const Size(400, 4000);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.reset);
    await tester.pumpWidget(
      BlocProvider<AppearanceCubit>.value(
        value: appearance,
        child: MaterialApp(
          localizationsDelegates: const [
            AppLocalizations.delegate,
            GlobalMaterialLocalizations.delegate,
            GlobalWidgetsLocalizations.delegate,
          ],
          home: SettingsPage(
            mirror: mirror,
            serverOrigin: 'https://botvy.example',
            onSignOut: () async {},
          ),
        ),
      ),
    );
    await tester.pumpAndSettle();
  }

  testWidgets('seven sections, in order', (tester) async {
    await pump(tester);
    const titles = [
      'Account',
      'Appearance',
      'Daily rhythm',
      'Notifications',
      'Planning',
      'Connection',
      'About',
    ];
    final tops = [
      for (final title in titles) tester.getTopLeft(find.text(title)).dy,
    ];
    expect(tops, [...tops]..sort());
  });

  testWidgets('every preference is still there', (tester) async {
    await pump(tester);
    final t = AppLocalizations(const Locale('en'));
    for (final label in [
      t.planTomorrowTime,
      t.endOfDayTime,
      t.morningBriefingTime,
      t.nextPracticeCutoff,
      t.checkinEnabled,
      t.quietFrom,
      t.quietTo,
      t.weekStartsOn,
      t.meetingDuration,
      t.mealMode,
      t.aiSuggestions,
    ]) {
      expect(find.text(label), findsOneWidget, reason: label);
    }
  });

  testWidgets('a switch writes the same field it always did', (tester) async {
    await pump(tester);
    await tester.tap(
      find.text(AppLocalizations(const Locale('en')).aiSuggestions),
    );
    await tester.pumpAndSettle();
    expect(mirror.patches, [
      {'aiSuggestions': false},
    ]);
  });

  testWidgets('the theme segment changes the theme at once', (tester) async {
    await pump(tester);
    await tester.tap(find.text('Dark'));
    await tester.pumpAndSettle();
    expect(appearance.state.themeMode, ThemeMode.dark);
  });

  testWidgets('the gateway row shows where the app points', (tester) async {
    await pump(tester);
    expect(find.text('https://botvy.example'), findsOneWidget);
  });
}
