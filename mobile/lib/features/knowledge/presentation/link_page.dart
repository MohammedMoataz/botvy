import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';

import '../../../app/l10n/app_localizations.dart';
import '../../../core/db/database.dart';
import '../application/knowledge_cubit.dart';

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
          ? const Center(child: CircularProgressIndicator())
          : row == null
              ? Center(child: Text(t.knowledgeEmptyTitle))
              : RefreshIndicator(
                  onRefresh: _load,
                  child: ListView(
                    padding: const EdgeInsets.all(16),
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
      Text(row.url, style: Theme.of(context).textTheme.bodySmall),
      const SizedBox(height: 12),

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
        const SizedBox(height: 4),
        Text(doc['summary'] as String? ?? ''),

        // The spec's own edge case, said plainly rather than left as a gap the
        // member has to notice.
        if (doc['hadTranscript'] == false) ...[
          const SizedBox(height: 8),
          Text(
            t.knowledgeNoTranscript,
            style: Theme.of(context).textTheme.bodySmall,
          ),
        ],

        if ((doc['keyPoints'] as List? ?? const []).isNotEmpty) ...[
          const SizedBox(height: 16),
          Text(
            t.knowledgeKeyPoints,
            style: Theme.of(context).textTheme.titleMedium,
          ),
          const SizedBox(height: 4),
          for (final point in doc['keyPoints'] as List) Text('• $point'),
        ],

        if ((doc['media'] as List? ?? const []).isNotEmpty) ...[
          const SizedBox(height: 16),
          SizedBox(
            height: 140,
            child: ListView(
              scrollDirection: Axis.horizontal,
              children: [
                for (final raw in doc['media'] as List)
                  if (context
                          .read<KnowledgeCubit>()
                          .mediaUrl((raw as Map)['url'] as String?) !=
                      null)
                    Padding(
                      padding: const EdgeInsetsDirectional.only(end: 8),
                      child: Image.network(
                        context
                            .read<KnowledgeCubit>()
                            .mediaUrl(raw['url'] as String?)!,
                        // A picture that will not load is a picture; it is not
                        // an error worth interrupting the summary for.
                        errorBuilder: (_, __, ___) => const SizedBox.shrink(),
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
        const SizedBox(height: 16),
        Text(t.knowledgeVideos, style: Theme.of(context).textTheme.titleMedium),
        for (final raw in _detail!['children'] as List)
          ListTile(
            dense: true,
            title: Text((raw as Map)['title'] as String? ?? raw['url'] as String),
            subtitle: Text(
              _phaseLabel(t, phaseOf(raw['status'] as String? ?? 'queued')),
            ),
          ),
      ],

      const SizedBox(height: 24),
      OutlinedButton.icon(
        onPressed: () => _open(context, row.url),
        icon: const Icon(Icons.open_in_new),
        label: Text(t.knowledgeOpenOriginal),
      ),
    ];
  }
}

void _open(BuildContext context, String url) {
  // Deliberately not `url_launcher`: this app has no such dependency today, and
  // adding one for a single button is a dependency for a sentence. The address
  // is shown at the top of this screen and is selectable, which is the honest
  // interim — and the day a second screen wants to open a link outside the app
  // is the day it earns the package.
  ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(url)));
}

String _phaseLabel(AppLocalizations t, LinkPhase phase) => switch (phase) {
  LinkPhase.waiting => t.knowledgeWaiting,
  LinkPhase.reading => t.knowledgeReading,
  LinkPhase.summarising => t.knowledgeSummarising,
  LinkPhase.done => t.knowledgeDone,
  LinkPhase.failed => t.knowledgeFailed,
};
