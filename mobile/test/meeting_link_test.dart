// 032, T3211 and T3230: a link-shaped address opens as a link, and the
// preview card's three states.
import 'dart:async';

import 'package:botvy/core/recurrence/expander.dart';
import 'package:botvy/features/meetings/application/link_preview.dart';
import 'package:botvy/features/meetings/application/location_link.dart';
import 'package:botvy/features/meetings/presentation/meetings_page.dart';
import 'package:botvy/ui/link_preview_card.dart';
import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  group('linkUriOf', () {
    // value -> the URI it opens, or null when it is not an openable link.
    const cases = <String, String?>{
      'https://maps.app.goo.gl/abc': 'https://maps.app.goo.gl/abc',
      'http://example.com/room': 'http://example.com/room',
      'www.example.com/x': 'https://www.example.com/x',
      'zoom.us/j/123': 'https://zoom.us/j/123',
      'javascript:alert(1)': null,
      'javascript: alert(1)': null,
      'file:///etc/passwd': null,
      'geo:30.04,31.23': null,
      '12 Tahrir Square, Cairo': null,
      'Office: 3rd floor': null,
    };
    cases.forEach((value, expected) {
      test(value, () => expect(linkUriOf(value)?.toString(), expected));
    });

    test('a refused scheme is still link-shaped, so it never reaches a map',
        () {
      expect(isLinkShaped('javascript:alert(1)'), isTrue);
      expect(isLinkShaped('12 Tahrir Square, Cairo'), isFalse);
    });
  });

  group('openMeetingLocation', () {
    Future<List<Uri>> opened(MeetingLocation location) async {
      final seen = <Uri>[];
      await openMeetingLocation(
        location,
        launch: (uri) async {
          seen.add(uri);
          return true;
        },
      );
      return seen;
    }

    test('a link-shaped address opens the link itself', () async {
      expect(
        await opened(const MeetingLocation(address: 'maps.app.goo.gl/abc')),
        [Uri.parse('https://maps.app.goo.gl/abc')],
      );
    });

    test('a plain address is still a map search', () async {
      final uris = await opened(const MeetingLocation(address: 'Tahrir Sq'));
      expect(uris.single.scheme, 'geo');
    });

    test('a javascript: address opens nothing', () async {
      expect(
        await opened(const MeetingLocation(address: 'javascript:alert(1)')),
        isEmpty,
      );
    });

    test('a scheme-less online link gets https', () async {
      expect(
        await opened(const MeetingLocation(onlineLink: 'zoom.us/j/1')),
        [Uri.parse('https://zoom.us/j/1')],
      );
    });
  });

  group('linkPreviewFrom', () {
    test('reads the GraphQL answer', () {
      final data = linkPreviewFrom({
        'title': 'Dentist',
        'siteName': 'Maps',
        'image': null,
        'place': {'lat': 30, 'lng': 31.5},
      })!;
      expect(data.title, 'Dentist');
      expect(data.lat, 30.0);
      expect(data.hasPlace, isTrue);
      expect(linkPreviewFrom(null), isNull);
    });
  });

  group('LinkPreviewCard', () {
    Widget host(Future<LinkPreviewData?> Function() load) => MaterialApp(
          home: Scaffold(body: LinkPreviewCard(load: load)),
        );

    testWidgets('loading shows a bar', (tester) async {
      final pending = Completer<LinkPreviewData?>();
      await tester.pumpWidget(host(() => pending.future));
      expect(find.byType(LinearProgressIndicator), findsOneWidget);
      pending.complete(null);
      await tester.pumpAndSettle();
    });

    testWidgets('success shows the site and title', (tester) async {
      await tester.pumpWidget(
        host(
          () async =>
              const LinkPreviewData(title: 'Weekly sync', siteName: 'Zoom'),
        ),
      );
      await tester.pumpAndSettle();
      expect(find.text('Weekly sync'), findsOneWidget);
      expect(find.text('Zoom'), findsOneWidget);
      expect(find.byType(FlutterMap), findsNothing);
    });

    testWidgets('a place shows a map with the OSM attribution', (tester) async {
      await tester.pumpWidget(
        host(() async => const LinkPreviewData(lat: 30.04, lng: 31.23)),
      );
      await tester.pump();
      await tester.pump();
      expect(find.byType(FlutterMap), findsOneWidget);
      expect(find.textContaining('OpenStreetMap contributors'), findsOneWidget);
    });

    testWidgets('a failure shows nothing', (tester) async {
      await tester.pumpWidget(host(() async => throw Exception('offline')));
      await tester.pumpAndSettle();
      expect(find.byType(Card), findsNothing);
      expect(find.byType(LinearProgressIndicator), findsNothing);
    });
  });
}
