/// Whether a meeting's location string is a link, and what it opens (032).
///
/// Mirrors `backend/src/contexts/meetings/domain/location-link.ts`, which
/// refuses anything but `http(s)` at the write; duplicated because it crosses a
/// language boundary. A row synced before that rule existed can still hold a
/// `javascript:` address, so this answers null for one rather than trusting
/// the server alone.
library;

final _hostile = RegExp(r'^\s*(?:javascript|vbscript|data|file|blob|about)\s*:',
    caseSensitive: false);
final _scheme = RegExp(r'^([a-z][a-z0-9+-]*):', caseSensitive: false);
final _www = RegExp(r'^www\.', caseSensitive: false);
final _host = RegExp(r'^[^\s/:]+\.[a-z]{2,}(/\S*)?$', caseSensitive: false);

String? _schemeOf(String value) {
  final hostile = _hostile.firstMatch(value);
  if (hostile != null) {
    return hostile.group(0)!.replaceAll(RegExp(r'[\s:]'), '').toLowerCase();
  }
  final match = _scheme.firstMatch(value);
  if (match == null) return null;
  // "Office: 3rd floor" is an address with a colon, not a scheme.
  if (RegExp(r'\s').hasMatch(value) &&
      !value.startsWith('${match.group(1)}://')) {
    return null;
  }
  return match.group(1)!.toLowerCase();
}

/// A scheme, a `www.`, or `host.tld` followed by a path or nothing.
bool isLinkShaped(String raw) {
  final value = raw.trim();
  return _schemeOf(value) != null ||
      _www.hasMatch(value) ||
      _host.hasMatch(value);
}

/// The `http(s)` URI a link-shaped value opens, `https://` added when it has
/// no scheme; null for a plain address or any other scheme.
Uri? linkUriOf(String raw) {
  final value = raw.trim();
  if (!isLinkShaped(value)) return null;
  final scheme = _schemeOf(value);
  if (scheme == null) return Uri.tryParse('https://$value');
  if (scheme != 'http' && scheme != 'https') return null;
  return Uri.tryParse(value);
}
