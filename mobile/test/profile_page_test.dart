// The profile is one form with one Save (031): edits wait in a draft, go to
// the server as a single patch of the fields that moved, and leaving with
// unsaved edits asks first.
import 'package:botvy/app/di.dart';
import 'package:botvy/app/l10n/app_localizations.dart';
import 'package:botvy/core/api/api_client.dart';
import 'package:botvy/core/db/database.dart';
import 'package:botvy/features/auth/application/auth_cubit.dart';
import 'package:botvy/features/profile/data/profile_mirror.dart';
import 'package:botvy/features/profile/presentation/profile_page.dart';
import 'package:drift/native.dart';
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_test/flutter_test.dart';

const _profile = {
  'userId': 'user-1',
  'displayName': 'Sam',
  'timezone': 'Africa/Cairo',
  'locale': 'en',
  'allergies': ['peanuts'],
};

/// Records each patch and answers as the server would: the stored row with
/// the patch applied.
class _RecordingMirror extends ProfileMirror {
  _RecordingMirror(super.api, super.db);

  final patches = <Map<String, dynamic>>[];

  @override
  Future<Profile?> patchProfile(Map<String, dynamic> patch) async {
    patches.add(patch);
    await writeProfile({..._profile, ...patch});
    return readProfile();
  }
}

void main() {
  late AppDatabase db;
  late _RecordingMirror mirror;
  late AuthCubit auth;

  setUp(() async {
    db = AppDatabase.forTesting(NativeDatabase.memory());
    final api = ApiClient(
      TokenStore(InMemorySecretStore()),
      baseUrl: 'http://test.invalid',
    );
    mirror = _RecordingMirror(api, db);
    await mirror.writeProfile(_profile);
    auth = AuthCubit(api, db, mirror);
    sl.registerSingleton<ProfileMirror>(mirror);
  });

  tearDown(() async {
    await sl.reset();
    await db.close();
  });

  Future<void> pump(WidgetTester tester) async {
    tester.view.physicalSize = const Size(400, 2400);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.reset);
    await tester.pumpWidget(
      BlocProvider<AuthCubit>.value(
        value: auth,
        child: MaterialApp(
          localizationsDelegates: const [
            AppLocalizations.delegate,
            GlobalMaterialLocalizations.delegate,
            GlobalWidgetsLocalizations.delegate,
          ],
          home: Builder(
            builder: (context) => Scaffold(
              body: TextButton(
                onPressed: () => Navigator.of(context).push(
                  MaterialPageRoute<void>(builder: (_) => const ProfilePage()),
                ),
                child: const Text('open'),
              ),
            ),
          ),
        ),
      ),
    );
    await tester.pumpAndSettle();
    await tester.tap(find.text('open'));
    await tester.pumpAndSettle();
  }

  FilledButton saveButton(WidgetTester tester) =>
      tester.widget<FilledButton>(find.byKey(const ValueKey('save-bar')));

  testWidgets('there is a Save button, off until something changes', (
    tester,
  ) async {
    await pump(tester);
    expect(find.byKey(const ValueKey('save-bar')), findsOneWidget);
    expect(saveButton(tester).onPressed, isNull);

    await tester.enterText(find.byKey(const ValueKey('profile-name')), 'Sami');
    await tester.pump();
    expect(saveButton(tester).onPressed, isNotNull);
  });

  testWidgets('a typed name is saved by Save, without the keyboard done key', (
    tester,
  ) async {
    await pump(tester);
    await tester.enterText(
      find.byKey(const ValueKey('profile-name')),
      '  Sami  ',
    );
    await tester.pump();
    await tester.tap(find.byKey(const ValueKey('save-bar')));
    await tester.pumpAndSettle();

    // Only the field that moved, trimmed.
    expect(mirror.patches, [
      {'displayName': 'Sami'},
    ]);
    expect(find.text('Saved.'), findsOneWidget);
    expect(saveButton(tester).onPressed, isNull);
  });

  testWidgets('leaving with unsaved edits asks, and Discard leaves', (
    tester,
  ) async {
    await pump(tester);
    await tester.enterText(find.byKey(const ValueKey('profile-name')), 'Sami');
    await tester.pump();

    await tester.pageBack();
    await tester.pumpAndSettle();
    expect(find.text('Discard your unsaved changes?'), findsOneWidget);

    await tester.tap(find.text('Discard'));
    await tester.pumpAndSettle();
    expect(find.text('open'), findsOneWidget);
    expect(mirror.patches, isEmpty);
  });

  testWidgets('leaving with nothing changed does not ask', (tester) async {
    await pump(tester);
    await tester.pageBack();
    await tester.pumpAndSettle();
    expect(find.text('open'), findsOneWidget);
  });
}
