/// Incremental Server-Sent Events parser.
///
/// The gateway's `POST /chat` streams blocks like:
///
///     event: token
///     data:  alice
///
/// Note the two spaces: SSE strips exactly ONE space after the colon, so the
/// token's own leading space survives. Getting that wrong glues words together.
///
/// Pure and synchronous on purpose -- no Flutter binding, no sockets -- so it
/// is testable from a fixture string (see test/sse_test.dart).
class SseEvent {
  const SseEvent(this.event, this.data);

  /// The `event:` field, or `message` when the block omits one.
  final String event;

  /// The `data:` payload. Multiple `data:` lines are joined with `\n`,
  /// per the SSE spec.
  final String data;

  @override
  String toString() => 'SseEvent($event, ${data.length} chars)';
}

/// Feed network chunks in with [add]; get whole events out.
/// Partial blocks are held in an internal buffer until they complete.
class SseParser {
  String _buffer = '';

  /// Parses whatever is now complete. A chunk may contain zero, one, or many
  /// events, and may split a single event anywhere -- including mid `\r\n`.
  List<SseEvent> add(String chunk) {
    // Normalise the whole pending buffer, not just the new chunk: a chunk
    // boundary can fall between the `\r` and the `\n` of one line terminator.
    // This is idempotent, and the buffer only ever holds one unfinished block.
    _buffer = (_buffer + chunk).replaceAll('\r\n', '\n').replaceAll('\r', '\n');

    final events = <SseEvent>[];
    while (true) {
      final end = _buffer.indexOf('\n\n');
      if (end < 0) break;
      final block = _buffer.substring(0, end);
      _buffer = _buffer.substring(end + 2);
      final event = _parseBlock(block);
      if (event != null) events.add(event);
    }
    return events;
  }

  /// Anything left unterminated when the stream ends. The gateway always
  /// closes after `event: done`, so this is normally empty.
  String get pending => _buffer;

  static SseEvent? _parseBlock(String block) {
    var event = 'message';
    final data = <String>[];
    var sawData = false;

    for (final line in block.split('\n')) {
      if (line.isEmpty) continue;
      if (line.startsWith(':')) continue; // comment / keep-alive colon line

      final colon = line.indexOf(':');
      final field = colon < 0 ? line : line.substring(0, colon);
      var value = colon < 0 ? '' : line.substring(colon + 1);
      if (value.startsWith(' ')) {
        value = value.substring(1); // exactly one space, never trim()
      }

      if (field == 'event') {
        event = value;
      } else if (field == 'data') {
        data.add(value);
        sawData = true;
      }
      // `id:` and `retry:` are ignored -- the gateway never sends them.
    }

    if (!sawData && event == 'message') return null;
    return SseEvent(event, data.join('\n'));
  }
}
