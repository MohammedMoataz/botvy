import 'package:flutter/material.dart';

import '../app/l10n/app_localizations.dart';
import '../app/tokens.dart';

/// One picture the viewer can show.
class MediaViewerItem {
  const MediaViewerItem({required this.url, this.caption});

  final String url;
  final String? caption;
}

/// How far a picture can be pinched in.
const double _maxZoom = 5;

/// Opens pictures full screen, one page each, pinch- and double-tap-zoomable
/// (032).
///
/// A route rather than a dialog, so Android back closes it and the system
/// keeps the page under it alive. Black behind the picture whatever the theme,
/// because a picture is judged against black and a light scrim would make
/// every photo look washed out.
Future<void> showMediaViewer(
  BuildContext context, {
  required List<MediaViewerItem> items,
  int initialIndex = 0,
}) {
  return Navigator.of(context).push(
    PageRouteBuilder<void>(
      opaque: false,
      barrierColor: Colors.black,
      pageBuilder: (_, __, ___) =>
          MediaViewer(items: items, initialIndex: initialIndex),
      transitionsBuilder: (_, animation, __, child) =>
          FadeTransition(opacity: animation, child: child),
    ),
  );
}

class MediaViewer extends StatefulWidget {
  const MediaViewer({required this.items, this.initialIndex = 0, super.key});

  final List<MediaViewerItem> items;
  final int initialIndex;

  @override
  State<MediaViewer> createState() => _MediaViewerState();
}

class _MediaViewerState extends State<MediaViewer> {
  late final PageController _pages = PageController(
    initialPage: widget.initialIndex,
  );
  late int _index = widget.initialIndex;

  /// Zoomed in, a horizontal drag pans the picture instead of turning the page.
  bool _zoomed = false;

  @override
  void dispose() {
    _pages.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final t = AppLocalizations.of(context);
    final item = widget.items[_index];
    final count = widget.items.length;

    return Scaffold(
      backgroundColor: Colors.black,
      appBar: AppBar(
        backgroundColor: Colors.transparent,
        foregroundColor: Colors.white,
        leading: IconButton(
          key: const ValueKey('media-viewer-close'),
          icon: const Icon(Icons.close),
          tooltip: t.mediaViewerClose,
          onPressed: () => Navigator.of(context).pop(),
        ),
        title: count > 1 ? Text('${_index + 1} / $count') : null,
      ),
      body: Column(
        children: [
          Expanded(
            child: PageView.builder(
              controller: _pages,
              physics: _zoomed
                  ? const NeverScrollableScrollPhysics()
                  : const PageScrollPhysics(),
              itemCount: count,
              onPageChanged: (index) => setState(() {
                _index = index;
                _zoomed = false;
              }),
              itemBuilder: (context, index) => _ZoomablePicture(
                key: ValueKey('media-page-$index'),
                url: widget.items[index].url,
                onZoomChanged: (zoomed) {
                  if (zoomed != _zoomed) setState(() => _zoomed = zoomed);
                },
              ),
            ),
          ),
          if (item.caption != null && item.caption!.trim().isNotEmpty)
            SafeArea(
              top: false,
              child: Padding(
                padding: const EdgeInsetsDirectional.all(BotvySpace.lg),
                child: Text(
                  item.caption!,
                  textAlign: TextAlign.start,
                  style: const TextStyle(color: Colors.white),
                ),
              ),
            ),
        ],
      ),
    );
  }
}

class _ZoomablePicture extends StatefulWidget {
  const _ZoomablePicture({
    required this.url,
    required this.onZoomChanged,
    super.key,
  });

  final String url;
  final ValueChanged<bool> onZoomChanged;

  @override
  State<_ZoomablePicture> createState() => _ZoomablePictureState();
}

class _ZoomablePictureState extends State<_ZoomablePicture> {
  final _transform = TransformationController();
  TapDownDetails? _lastTap;

  @override
  void initState() {
    super.initState();
    _transform.addListener(_reportZoom);
  }

  @override
  void dispose() {
    _transform
      ..removeListener(_reportZoom)
      ..dispose();
    super.dispose();
  }

  void _reportZoom() =>
      widget.onZoomChanged(_transform.value.getMaxScaleOnAxis() > 1.01);

  /// Double tap: zoom in where tapped, or back out if already zoomed.
  void _toggleZoom() {
    if (_transform.value.getMaxScaleOnAxis() > 1.01) {
      _transform.value = Matrix4.identity();
      return;
    }
    final at = _lastTap?.localPosition ?? Offset.zero;
    const scale = 2.5;
    _transform.value = Matrix4.identity()
      ..translateByDouble(-at.dx * (scale - 1), -at.dy * (scale - 1), 0, 1)
      ..scaleByDouble(scale, scale, 1, 1);
  }

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onDoubleTapDown: (details) => _lastTap = details,
      onDoubleTap: _toggleZoom,
      child: InteractiveViewer(
        transformationController: _transform,
        maxScale: _maxZoom,
        child: Center(
          child: Image.network(
            widget.url,
            fit: BoxFit.contain,
            loadingBuilder: (context, child, progress) => progress == null
                ? child
                : const CircularProgressIndicator(color: Colors.white),
            errorBuilder: (_, __, ___) =>
                const Icon(Icons.broken_image_outlined, color: Colors.white),
          ),
        ),
      ),
    );
  }
}
