import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:latlong2/latlong.dart';

import '../app/tokens.dart';

/// What the server's `linkPreview` read said about a link or a place (032).
class LinkPreviewData {
  const LinkPreviewData({
    this.title,
    this.siteName,
    this.image,
    this.lat,
    this.lng,
  });

  final String? title;
  final String? siteName;
  final String? image;
  final double? lat;
  final double? lng;

  bool get hasText => title != null || siteName != null;
  bool get hasPlace => lat != null && lng != null;
  bool get isEmpty => !hasText && image == null && !hasPlace;
}

/// The height of a preview's image and of its map. A named number in the kit,
/// where the UI literal check allows one.
const double previewMediaHeight = 140;

/// A link's site, title and picture, and a map when it names a place.
///
/// [load] is called once, when the card is first built. Loading shows a thin
/// bar; a failure or an empty answer shows nothing, because the plain link the
/// card sits under is already the whole of what the member needs (offline is
/// the common case, not an error).
class LinkPreviewCard extends StatefulWidget {
  const LinkPreviewCard({
    super.key,
    required this.load,
    this.onTap,
    this.userAgentPackageName = 'org.botvy.botvy',
  });

  final Future<LinkPreviewData?> Function() load;
  final VoidCallback? onTap;

  /// Sent with every map tile, per the OpenStreetMap tile usage policy.
  final String userAgentPackageName;

  @override
  State<LinkPreviewCard> createState() => _LinkPreviewCardState();
}

class _LinkPreviewCardState extends State<LinkPreviewCard> {
  late final Future<LinkPreviewData?> _future = _safeLoad();

  Future<LinkPreviewData?> _safeLoad() async {
    try {
      return await widget.load();
    } catch (_) {
      return null;
    }
  }

  @override
  Widget build(BuildContext context) => FutureBuilder<LinkPreviewData?>(
        future: _future,
        builder: (context, snapshot) {
          if (snapshot.connectionState != ConnectionState.done) {
            return const Padding(
              padding:
                  EdgeInsetsDirectional.symmetric(horizontal: BotvySpace.lg),
              child: LinearProgressIndicator(),
            );
          }
          final data = snapshot.data;
          if (data == null || data.isEmpty) return const SizedBox.shrink();
          return Card(
            margin: const EdgeInsetsDirectional.symmetric(
              horizontal: BotvySpace.lg,
              vertical: BotvySpace.sm,
            ),
            clipBehavior: Clip.antiAlias,
            child: InkWell(
              onTap: widget.onTap,
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                mainAxisSize: MainAxisSize.min,
                children: [
                  if (data.image != null)
                    Image.network(
                      data.image!,
                      height: previewMediaHeight,
                      fit: BoxFit.cover,
                      // A dead image is no image, not a broken square.
                      errorBuilder: (context, error, stack) =>
                          const SizedBox.shrink(),
                    ),
                  if (data.hasText)
                    ListTile(
                      title: data.title == null
                          ? null
                          : Text(data.title!, maxLines: 2),
                      subtitle: data.siteName == null
                          ? null
                          : Text(data.siteName!, maxLines: 1),
                    ),
                  if (data.hasPlace)
                    MapThumbnail(
                      lat: data.lat!,
                      lng: data.lng!,
                      userAgentPackageName: widget.userAgentPackageName,
                    ),
                ],
              ),
            ),
          );
        },
      );
}

/// A small map with a pin, which does not pan or zoom: it shows where, and a
/// tap on the card around it opens the place in a real map.
class MapThumbnail extends StatelessWidget {
  const MapThumbnail({
    super.key,
    required this.lat,
    required this.lng,
    required this.userAgentPackageName,
  });

  final double lat;
  final double lng;
  final String userAgentPackageName;

  @override
  Widget build(BuildContext context) {
    final point = LatLng(lat, lng);
    return SizedBox(
      height: previewMediaHeight,
      // The card's InkWell takes the tap; the map underneath must not.
      child: IgnorePointer(
        child: FlutterMap(
          options: MapOptions(
            initialCenter: point,
            initialZoom: 15,
            interactionOptions: const InteractionOptions(
              flags: InteractiveFlag.none,
            ),
          ),
          children: [
            TileLayer(
              urlTemplate: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
              userAgentPackageName: userAgentPackageName,
            ),
            MarkerLayer(
              markers: [
                Marker(
                  point: point,
                  child: Icon(
                    Icons.place,
                    color: Theme.of(context).colorScheme.primary,
                  ),
                ),
              ],
            ),
            // Required by the tile policy, and visible rather than behind a
            // button: "flutter_map | © OpenStreetMap contributors".
            const SimpleAttributionWidget(
              source: Text('OpenStreetMap contributors'),
            ),
          ],
        ),
      ),
    );
  }
}
