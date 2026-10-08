import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';

import '../../../app/l10n/app_localizations.dart';
import '../../../core/db/database.dart';
import '../application/knowledge_cubit.dart';
import '../../../app/tokens.dart';
import '../../../ui/linkified_text.dart';
import '../../../ui/media_viewer.dart';
import '../../../ui/states.dart';

/// The link's images, as one horizontal strip of thumbnails.
const double _mediaStripHeight = 140;

/// One saved link: what Botvy read, so the member does not have to (FR-006).
///
/// ## Local first, then the summary
///
/// The row comes from drift and renders immediately — the title, the state, the
/// link out — and the *document* is fetched over GraphQL afterwards. That
/// ordering is the whole design: a knowledge document is up to sixty thousand
/// characters and is never synced, so a member with no connection still gets a
/// usable screen and is told, in one sentence, that the summary lives on the
/// server.
///
/// ## Nothing here loads an image from the source
///
/// Every picture comes through Botvy's own signed `/media` path (FR-008), which
/// the server put on the view. A URL that is null means this installation has
/// no signing secret, and a null renders as no picture — never as a fallback to
/// the source's own address, which would quietly defeat the requirement on
/// exactly the installation whose Owner had not finished configuring it.
class LinkPage extends StatefulWidget {
  const LinkPage({required this.linkId, super.key});

  final String linkId;

  @override
  State<LinkPage> createState() => _LinkPageState();
}

class _LinkPageState extends State<LinkPage> {
  LocalLink? _row;
  Map<String, dynamic>? _detail;
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    unawaited(_load());
  }

  Future<void> _load() async {
    final cubit = context.read<KnowledgeCubit>();
    final row = await cubit.byId(widget.linkId);
    if (!mounted) return;
    setState(() {
      _row = row;
      _loading = false;
    });

    final detail = await cubit.detail(widget.linkId);
    if (!mounted) return;
    setState(() => _detail = detail);
  }

  @override
  Widget build(BuildContext context) {
    final t = AppLocalizations.of(context);
    final row = _row;

    return Scaffold(
      appBar: AppBar(title: Text(row?.title ?? t.knowledgeTitle)),
      body: _loading
          ? const LoadingView()
          : row == null
              ? EmptyState(
                  icon: Icons.link_off,
                  message: t.knowledgeEmptyTitle,
                )
              : RefreshIndicator(
                  onRefresh: _load,
                  child: ListView(
                    padding: const EdgeInsetsDirectional.all(BotvySpace.lg),
                    children: _body(context, t, row),
                  ),
                ),
    );
  }

  List<Widget> _body(
    BuildContext context,
    AppLocalizations t,
    LocalLink row,
  ) {
    final doc = _detail?['doc'] as Map<String, dynamic>?;
    final phase = phaseOf(row.status);

    return [
      // The address itself is a link now (032), not only text to copy.
      LinkifiedText(row.url, style: Theme.of(context).textTheme.bodySmall),
      const SizedBox(height: BotvySpace.md),

      if (phase == LinkPhase.failed && row.failReason != null)
        Text(
          row.failReason!,
          style: TextStyle(color: Theme.of(context).colorScheme.error),
        )
      else if (doc == null && phase != LinkPhase.done)
        Text(t.knowledgeNoSummaryYet)
      else if (doc == null)
        // Done on the server, and this device could not reach it. A sentence
        // rather than a spinner: the member has everything the local row holds
        // and nothing is being retried behind the scenes.
        Text(t.knowledgeOffline),

      if (doc != null) ...[
        Text(t.knowledgeSummary, style: Theme.of(context).textTheme.titleMedium),
        const SizedBox(height: BotvySpace.xs),
        LinkifiedText(doc['summary'] as String? ?? ''),

        // The spec's own edge case, said plainly rather than left as a gap the
        // member has to notice.
        if (doc['hadTranscript'] == false) ...[
          const SizedBox(height: BotvySpace.sm),
          Text(
            t.knowledgeNoTranscript,
            style: Theme.of(context).textTheme.bodySmall,
          ),
        ],

        if ((doc['keyPoints'] as List? ?? const []).isNotEmpty) ...[
          const SizedBox(height: BotvySpace.lg),
          Text(
            t.knowledgeKeyPoints,
            style: Theme.of(context).textTheme.titleMedium,
          ),
          const SizedBox(height: BotvySpace.xs),
          for (final point in doc['keyPoints'] as List)
            LinkifiedText('• $point'),
        ],

        if (_media(context, doc).isNotEmpty) ...[
          const SizedBox(height: BotvySpace.lg),
          SizedBox(
            height: _mediaStripHeight,
            child: ListView(
              scrollDirection: Axis.horizontal,
              children: [
                for (final (index, item) in _media(context, doc).indexed)
                  Padding(
                    padding: const EdgeInsetsDirectional.only(
                      end: BotvySpace.sm,
                    ),
                    child: _Thumbnail(
                      key: ValueKey('link-media-$index'),
                      item: item,
                      onTap: () => _openMedia(context, doc, item),
                    ),
                  ),
              ],
            ),
          ),
        ],
      ],

      // A playlist's videos, each with its own state — which is the whole
      // reason a playlist becomes one entry per video rather than one blob.
      if ((_detail?['children'] as List? ?? const []).isNotEmpty) ...[
        const SizedBox(height: BotvySpace.lg),
        Text(t.knowledgeVideos, style: Theme.of(context).textTheme.titleMedium),
        for (final raw in _detail!['children'] as List)
          ListTile(
            dense: true,
            // Each video opens where it lives (032).
            onTap: () => openExternalLink(raw['url'] as String? ?? ''),
            trailing: const Icon(Icons.open_in_new),
            title: Text((raw as Map)['title'] as String? ?? raw['url'] as String),
            subtitle: Text(
              _phaseLabel(t, phaseOf(raw['status'] as String? ?? 'queued')),
            ),
          ),
      ],

      const SizedBox(height: BotvySpace.xl),
      OutlinedButton.icon(
        onPressed: () => unawaited(_open(context, row.url)),
        icon: const Icon(Icons.open_in_new),
        label: Text(t.knowledgeOpenOriginal),
      ),
    ];
  }
}

/// Opens the original. `url_launcher` arrived with meetings in 032, which was
/// the "second screen" this button had been waiting for; until it could open,
/// it only showed the address in a snackbar.
Future<void> _open(BuildContext context, String url) async {
  final opened = await openExternalLink(url);
  if (!opened && context.mounted) {
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(url)));
  }
}

/// One picture or video of the link, with the address it loads from.
class _Media {
  const _Media({required this.url, required this.isVideo, this.caption});

  final String url;
  final bool isVideo;
  final String? caption;
}

/// The link's media that this installation can show, in the server's order.
///
/// Only what comes through Botvy's own signed path (see the class comment): an
/// item whose url the cubit cannot resolve is left out rather than loaded from
/// the source.
List<_Media> _media(BuildContext context, Map<String, dynamic> doc) {
  final cubit = context.read<KnowledgeCubit>();
  return [
    for (final raw in doc['media'] as List? ?? const [])
      if (raw is Map && cubit.mediaUrl(raw['url'] as String?) != null)
        _Media(
          url: cubit.mediaUrl(raw['url'] as String?)!,
          isVideo: raw['type'] == 'video',
          caption: raw['caption'] as String?,
        ),
  ];
}

/// Pictures open full screen at the one tapped, with the others a swipe away;
/// a video opens where it lives.
void _openMedia(BuildContext context, Map<String, dynamic> doc, _Media tapped) {
  if (tapped.isVideo) {
    unawaited(openExternalLink(tapped.url));
    return;
  }
  final pictures = _media(context, doc).where((m) => !m.isVideo).toList();
  unawaited(
    showMediaViewer(
      context,
      items: [
        for (final picture in pictures)
          MediaViewerItem(url: picture.url, caption: picture.caption),
      ],
      initialIndex: pictures.indexWhere((m) => m.url == tapped.url),
    ),
  );
}

class _Thumbnail extends StatelessWidget {
  const _Thumbnail({required this.item, required this.onTap, super.key});

  final _Media item;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final t = AppLocalizations.of(context);
    return Semantics(
      button: true,
      label: item.caption ?? t.knowledgeOpenMedia,
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(BotvyRadius.md),
        child: ClipRRect(
          borderRadius: BorderRadius.circular(BotvyRadius.md),
          child: Stack(
            alignment: Alignment.center,
            children: [
              Image.network(
                item.url,
                // A picture that will not load is a picture; it is not an
                // error worth interrupting the summary for.
                errorBuilder: (_, __, ___) => const SizedBox.shrink(),
              ),
              if (item.isVideo)
                Icon(
                  Icons.play_circle_fill,
                  size: BotvySpace.xxl,
                  color: Theme.of(context).colorScheme.onPrimary,
                ),
            ],
          ),
        ),
      ),
    );
  }
}

String _phaseLabel(AppLocalizations t, LinkPhase phase) => switch (phase) {
  LinkPhase.waiting => t.knowledgeWaiting,
  LinkPhase.reading => t.knowledgeReading,
  LinkPhase.summarising => t.knowledgeSummarising,
  LinkPhase.done => t.knowledgeDone,
  LinkPhase.failed => t.knowledgeFailed,
};
