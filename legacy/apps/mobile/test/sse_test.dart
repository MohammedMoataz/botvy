import 'package:botvy/src/api/sse.dart';
import 'package:flutter_test/flutter_test.dart';

/// The exact byte sequence observed from the running gateway.
const _fixture = 'event: heartbeat\n'
    'data: {}\n'
    '\n'
    'event: intent\n'
    'data: {"intent":"chat","fallback":true}\n'
    '\n'
    'event: token\n'
    'data: hello\n'
    '\n'
    'event: token\n'
    'data:  alice\n'
    '\n'
    'event: done\n'
    'data: {}\n'
    '\n';

void main() {
  test('parses the gateway stream into ordered events', () {
    final events = SseParser().add(_fixture);

    expect(events.map((e) => e.event).toList(),
        ['heartbeat', 'intent', 'token', 'token', 'done']);
    expect(events[1].data, '{"intent":"chat","fallback":true}');
    expect(events[2].data, 'hello');
    expect(events[4].data, '{}');
  });

  test('keeps the leading space of a token payload', () {
    // `data:  alice` -> ' alice'. Strip more than one space and the reply
    // renders as "helloalice".
    final events = SseParser().add(_fixture);
    final reply = events
        .where((e) => e.event == 'token')
        .map((e) => e.data)
        .join();
    expect(reply, 'hello alice');
  });

  test('reassembles events split across arbitrary chunk boundaries', () {
    final parser = SseParser();
    final collected = <SseEvent>[];
    // One character at a time: the worst case a socket can hand us.
    for (var i = 0; i < _fixture.length; i++) {
      collected.addAll(parser.add(_fixture[i]));
    }
    expect(collected.map((e) => e.event).toList(),
        ['heartbeat', 'intent', 'token', 'token', 'done']);
    expect(
        collected.where((e) => e.event == 'token').map((e) => e.data).join(),
        'hello alice');
    expect(parser.pending, isEmpty);
  });

  test('handles CRLF terminators split mid-pair', () {
    final parser = SseParser();
    final events = <SseEvent>[];
    events.addAll(parser.add('event: token\r\ndata: hi\r'));
    events.addAll(parser.add('\n\r\n'));
    expect(events.length, 1);
    expect(events.single.event, 'token');
    expect(events.single.data, 'hi');
  });

  test('joins multi-line data with a newline', () {
    // A token containing a newline arrives as two `data:` lines.
    final events = SseParser().add('event: token\ndata: line one\ndata: line two\n\n');
    expect(events.single.data, 'line one\nline two');
  });

  test('emits nothing for an incomplete trailing block', () {
    final parser = SseParser();
    expect(parser.add('event: token\ndata: partial'), isEmpty);
    expect(parser.pending, isNotEmpty);
  });
}
