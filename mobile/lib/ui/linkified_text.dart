import 'package:flutter/gestures.dart';
import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';

/// Opens an `http(s)` link in the browser or the app that owns it (032).
///
/// Anything else is refused: a summary is text read off somebody else's page,
/// and a `javascript:` or `file:` address in it must not become a tap target.
Future<bool> openExternalLink(String raw) async {
  final uri = Uri.tryParse(raw.trim());
  if (uri == null || (uri.scheme != 'http' && uri.scheme != 'https')) {
    return false;
  }
  return launchUrl(uri, mode: LaunchMode.externalApplication);
}

/// Where the links are in a string: `http(s)://…` up to whitespace, without
/// the punctuation a sentence puts after a link.
final RegExp _link = RegExp(r'''https?://[^\s<>"']+''', caseSensitive: false);

List<(int, int)> linkRanges(String text) {
  final ranges = <(int, int)>[];
  for (final match in _link.allMatches(text)) {
    var end = match.end;
    while (end > match.start && '.,;:!?)]}'.contains(text[end - 1])) {
      end--;
    }
    if (end > match.start) ranges.add((match.start, end));
  }
  return ranges;
}

/// Text whose `http(s)` links are tappable (032).
///
/// Stateful only to own its tap recognisers, which must be disposed.
class LinkifiedText extends StatefulWidget {
  const LinkifiedText(this.text, {this.style, super.key});

  final String text;
  final TextStyle? style;

  @override
  State<LinkifiedText> createState() => _LinkifiedTextState();
}

class _LinkifiedTextState extends State<LinkifiedText> {
  final List<TapGestureRecognizer> _taps = [];

  @override
  void dispose() {
    for (final tap in _taps) {
      tap.dispose();
    }
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    for (final tap in _taps) {
      tap.dispose();
    }
    _taps.clear();

    final text = widget.text;
    final ranges = linkRanges(text);
    if (ranges.isEmpty) return Text(text, style: widget.style);

    final linkStyle = TextStyle(
      color: Theme.of(context).colorScheme.primary,
      decoration: TextDecoration.underline,
    );
    final spans = <InlineSpan>[];
    var cursor = 0;
    for (final (start, end) in ranges) {
      if (start > cursor) spans.add(TextSpan(text: text.substring(cursor, start)));
      final url = text.substring(start, end);
      final tap = TapGestureRecognizer()..onTap = () => openExternalLink(url);
      _taps.add(tap);
      spans.add(TextSpan(text: url, style: linkStyle, recognizer: tap));
      cursor = end;
    }
    if (cursor < text.length) spans.add(TextSpan(text: text.substring(cursor)));

    return Text.rich(TextSpan(style: widget.style, children: spans));
  }
}
