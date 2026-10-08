import '../../../core/api/api_client.dart';
import '../../../ui/link_preview_card.dart';

/// The `linkPreview` read (032), for an online link or an address.
///
/// Throws when the phone is offline or the server refuses; the card treats
/// that as "no preview" and leaves the plain link on screen.
Future<LinkPreviewData?> fetchLinkPreview(
  ApiClient api, {
  String? url,
  String? address,
}) async {
  final data = await api.query(
    r'''
query LinkPreview($url: String, $address: String) {
  linkPreview(url: $url, address: $address) {
    title
    siteName
    image
    place { lat lng }
  }
}''',
    {'url': url, 'address': address},
  );
  return linkPreviewFrom(data['linkPreview']);
}

/// The GraphQL answer as the card's data; null for a missing preview.
LinkPreviewData? linkPreviewFrom(Object? raw) {
  if (raw is! Map) return null;
  final place = raw['place'];
  return LinkPreviewData(
    title: raw['title'] as String?,
    siteName: raw['siteName'] as String?,
    image: raw['image'] as String?,
    lat: place is Map ? (place['lat'] as num?)?.toDouble() : null,
    lng: place is Map ? (place['lng'] as num?)?.toDouble() : null,
  );
}
