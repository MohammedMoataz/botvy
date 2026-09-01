import 'package:botvy/src/api/models.dart';
import 'package:botvy/src/features/chat/chat_screen.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

/// The complaint this covers: the model answers in markdown and the app used
/// to print the syntax. These assert on rendered text, so a `#` or a `*`
/// appearing on screen fails the test.
Widget _wrap(Widget child) => MaterialApp(home: Scaffold(body: child));

void main() {
  testWidgets('an assistant reply renders markdown rather than its syntax',
      (tester) async {
    await tester.pumpWidget(_wrap(const AssistantMarkdown(
      content: '# Today\n\nYou have **two** things:\n\n- Dentist\n- Gym\n',
    )));

    expect(find.textContaining('Today'), findsOneWidget);
    expect(find.textContaining('#'), findsNothing);
    expect(find.textContaining('**'), findsNothing);
    // The bullets become their own widgets, not one line of hyphens.
    expect(find.textContaining('Dentist'), findsOneWidget);
    expect(find.textContaining('- Dentist'), findsNothing);
  });

  testWidgets('a link renders as text without its brackets', (tester) async {
    await tester.pumpWidget(_wrap(const AssistantMarkdown(
      content: 'See [the docs](https://example.com) for more.',
    )));

    expect(find.textContaining('the docs'), findsOneWidget);
    expect(find.textContaining('https://example.com'), findsNothing);
  });

  testWidgets('a half-arrived reply renders as the plain text it is so far',
      (tester) async {
    // Mid-stream the markdown is incomplete; it must not throw, and it
    // corrects itself once the closing syntax arrives.
    await tester.pumpWidget(_wrap(const AssistantMarkdown(content: 'Here is **bo')));

    expect(tester.takeException(), isNull);
    expect(find.textContaining('Here is'), findsOneWidget);
  });

  testWidgets("a user's own asterisks stay literal", (tester) async {
    await tester.pumpWidget(_wrap(
      ChatBubble(message: ChatMessage(role: 'user', content: 'use the *.dart files')),
    ));

    expect(find.text('use the *.dart files'), findsOneWidget);
  });
}
