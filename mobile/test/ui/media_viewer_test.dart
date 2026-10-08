// 032: a saved link's pictures open full screen, zoomable and swipeable, and
// links inside the summary are tappable.
import 'package:botvy/app/l10n/app_localizations.dart';
import 'package:botvy/ui/linkified_text.dart';
import 'package:botvy/ui/media_viewer.dart';
import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_test/flutter_test.dart';

Widget _app(Widget child) => MaterialApp(
  localizationsDelegates: const [
    AppLocalizations.delegate,
    GlobalMaterialLocalizations.delegate,
    GlobalWidgetsLocalizations.delegate,
  ],
  home: child,
);

void main() {
  group('linkRanges', () {
    test('finds http(s) links and leaves the sentence punctuation outside', () {
      const text = 'Read https://example.com/a?b=1. Also (http://x.io/y), done';
      final found = [
        for (final (start, end) in linkRanges(text)) text.substring(start, end),
      ];
      expect(found, ['https://example.com/a?b=1', 'http://x.io/y']);
    });

    test('a javascript: address is not a link', () {
      expect(linkRanges('click javascript:alert(1) now'), isEmpty);
    });
  });

  testWidgets('a link in text is drawn as a separate, tappable span', (
    tester,
  ) async {
    await tester.pumpWidget(
      _app(const Scaffold(body: LinkifiedText('see https://example.com now'))),
    );
    await tester.pumpAndSettle();

    final rich = tester.widget<Text>(find.byType(Text)).textSpan! as TextSpan;
    final spans = rich.children!.cast<TextSpan>();
    expect(spans.map((span) => span.text), [
      'see ',
      'https://example.com',
      ' now',
    ]);
    expect(spans[1].recognizer, isNotNull);
    expect(spans[0].recognizer, isNull);
  });

  testWidgets('the viewer opens at the tapped picture, swipes, and closes', (
    tester,
  ) async {
    await tester.pumpWidget(
      _app(
        Builder(
          builder: (context) => Scaffold(
            body: TextButton(
              onPressed: () => showMediaViewer(
                context,
                items: const [
                  MediaViewerItem(url: 'https://img.test/1.png', caption: 'one'),
                  MediaViewerItem(url: 'https://img.test/2.png', caption: 'two'),
                ],
                initialIndex: 1,
              ),
              child: const Text('open'),
            ),
          ),
        ),
      ),
    );
    await tester.pumpAndSettle();
    await tester.tap(find.text('open'));
    await tester.pumpAndSettle();

    expect(find.text('2 / 2'), findsOneWidget);
    expect(find.text('two'), findsOneWidget);
    expect(find.byType(InteractiveViewer), findsOneWidget);

    await tester.fling(find.byType(PageView), const Offset(600, 0), 1000);
    await tester.pumpAndSettle();
    expect(find.text('1 / 2'), findsOneWidget);
    expect(find.text('one'), findsOneWidget);

    await tester.tap(find.byKey(const ValueKey('media-viewer-close')));
    await tester.pumpAndSettle();
    expect(find.text('open'), findsOneWidget);
    expect(find.byType(MediaViewer), findsNothing);
  });
}
