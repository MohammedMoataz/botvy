import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:go_router/go_router.dart';

import '../../../app/l10n/app_localizations.dart';
import '../../../core/db/database.dart';
import '../application/knowledge_cubit.dart';
import '../../../ui/scroll_aware_fab.dart';
import '../../../app/tokens.dart';
import '../../../ui/states.dart';

/// What the member saved to read, and what Botvy proposed from it (T741, T742).
///
/// Two tabs rather than two screens, because they are two halves of one idea:
/// the links are what the member put in and the suggestions are what came out,
/// and a member wondering "did anything come of that article" should not have
/// to go looking somewhere else.
class KnowledgePage extends StatefulWidget {
  const KnowledgePage({super.key});

  @override
  State<KnowledgePage> createState() => _KnowledgePageState();
}

class _KnowledgePageState extends State<KnowledgePage>
    with SingleTickerProviderStateMixin {
  late final TabController _tabs = TabController(length: 2, vsync: this);

  @override
  void initState() {
    super.initState();
    final cubit = context.read<KnowledgeCubit>();
    unawaited(cubit.refresh());
    // The inbox is a network read, so it is fetched once on open rather than
    // watched: a member who has no connection still gets the links tab, which
    // is entirely local.
    unawaited(cubit.loadSuggestions());
  }

  @override
  void dispose() {
    _tabs.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final t = AppLocalizations.of(context);

    return BlocConsumer<KnowledgeCubit, KnowledgeState>(
      listenWhen: (before, after) =>
          after.problem != null && before.problem != after.problem,
      listener: (context, state) {
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text(state.problem!)));
        context.read<KnowledgeCubit>().clearProblem();
      },
      builder: (context, state) {
        final cubit = context.read<KnowledgeCubit>();

        return Scaffold(
          appBar: AppBar(
            title: Text(t.knowledgeTitle),
            bottom: TabBar(
              controller: _tabs,
              tabs: [
                Tab(text: t.knowledgeTitle),
                Tab(text: t.knowledgeSuggestions),
              ],
            ),
          ),
          floatingActionButton: ScrollAwareFab(
            icon: Icons.add_link,
            label: t.knowledgeAdd,
            tooltip: t.knowledgeAdd,
            onPressed: () => unawaited(_saveSheet(context, cubit)),
          ),
          body: TabBarView(
            controller: _tabs,
            children: [
              _LinkList(state: state, cubit: cubit),
              _SuggestionList(state: state, cubit: cubit),
            ],
          ),
        );
      },
    );
  }
}

/// The save sheet: a URL and, optionally, what it is about.
///
/// The tags are the one thing the member can usefully say that the server
/// cannot work out, because they are what the suggestion saga matches against a
/// session's sport. Everything else — the kind, the title, the summary — is the
/// server's to discover, and asking the member for any of it would be asking
/// them to do the reading.
Future<void> _saveSheet(BuildContext context, KnowledgeCubit cubit) async {
  final t = AppLocalizations.of(context);
  final url = TextEditingController();
  final tags = TextEditingController();

  await showModalBottomSheet<void>(
    context: context,
    isScrollControlled: true,
    builder: (sheet) => Padding(
      padding: EdgeInsetsDirectional.only(
        start: BotvySpace.lg,
        end: BotvySpace.lg,
        top: BotvySpace.lg,
        bottom: MediaQuery.of(sheet).viewInsets.bottom + BotvySpace.lg,
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          TextField(
            controller: url,
            autofocus: true,
            keyboardType: TextInputType.url,
            decoration: InputDecoration(labelText: t.knowledgeUrl),
          ),
          const SizedBox(height: BotvySpace.md),
          TextField(
            controller: tags,
            decoration: InputDecoration(labelText: t.knowledgeTags),
          ),
          const SizedBox(height: BotvySpace.lg),
          FilledButton(
            onPressed: () async {
              final saved = await cubit.save(
                url.text,
                tags: [
                  for (final raw in tags.text.split(','))
                    if (raw.trim().isNotEmpty) raw.trim(),
                ],
              );
              if (saved != null && sheet.mounted) Navigator.of(sheet).pop();
            },
            child: Text(t.knowledgeSaveAction),
          ),
        ],
      ),
    ),
  );

  url.dispose();
  tags.dispose();
}

class _LinkList extends StatelessWidget {
  const _LinkList({required this.state, required this.cubit});

  final KnowledgeState state;
  final KnowledgeCubit cubit;

  @override
  Widget build(BuildContext context) {
    final t = AppLocalizations.of(context);
    if (state.loading) {
      return const LoadingView();
    }

    return RefreshIndicator(
      onRefresh: cubit.refresh,
      child: ListView(
        padding: const EdgeInsetsDirectional.fromSTEB(
          BotvySpace.md,
          BotvySpace.md,
          BotvySpace.md,
          fabClearance,
        ),
        children: [
          // The filter is by the member's three words, not the server's six
          // states: `fetching` and `extracting` are one thing from outside.
          SingleChildScrollView(
            scrollDirection: Axis.horizontal,
            child: Row(
              children: [
                ChoiceChip(
                  label: Text(t.knowledgeAll),
                  selected: state.filter == null,
                  onSelected: (_) => unawaited(cubit.showOnly(null)),
                ),
                for (final phase in LinkPhase.values)
                  Padding(
                    padding: const EdgeInsetsDirectional.only(start: BotvySpace.sm),
                    child: ChoiceChip(
                      label: Text(_phaseLabel(t, phase)),
                      selected: state.filter == phase,
                      onSelected: (_) => unawaited(cubit.showOnly(phase)),
                    ),
                  ),
              ],
            ),
          ),
          const SizedBox(height: BotvySpace.md),
          if (state.links.isEmpty)
            Padding(
              padding: const EdgeInsetsDirectional.symmetric(vertical: BotvySpace.xxl),
              child: Column(
                children: [
                  Text(
                    t.knowledgeEmptyTitle,
                    style: Theme.of(context).textTheme.titleMedium,
                  ),
                  const SizedBox(height: BotvySpace.sm),
                  Text(t.knowledgeEmptyBody, textAlign: TextAlign.center),
                ],
              ),
            )
          else
            for (final link in state.links)
              _LinkTile(link: link, cubit: cubit, busy: state.busy),
        ],
      ),
    );
  }
}

class _LinkTile extends StatelessWidget {
  const _LinkTile({
    required this.link,
    required this.cubit,
    required this.busy,
  });

  final LocalLink link;
  final KnowledgeCubit cubit;
  final Set<String> busy;

  @override
  Widget build(BuildContext context) {
    final t = AppLocalizations.of(context);
    final phase = phaseOf(link.status);

    return Card.filled(
      child: ListTile(
        leading: Icon(_kindIcon(link.kind)),
        title: Text(link.title ?? link.url, maxLines: 2),
        subtitle: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Chip(
                  label: Text(_phaseLabel(t, phase)),
                  visualDensity: VisualDensity.compact,
                ),
                if (link.skippedCount != null && link.skippedCount! > 0)
                  Padding(
                    padding: const EdgeInsetsDirectional.only(start: BotvySpace.sm),
                    child: Text(t.knowledgeSkipped(link.skippedCount!)),
                  ),
              ],
            ),
            // FR-003: a failure shows its reason and its attempt count, beside
            // a retry that works. A red chip with no sentence is a dead end.
            if (phase == LinkPhase.failed && link.failReason != null)
              Padding(
                padding: const EdgeInsetsDirectional.only(top: BotvySpace.xs),
                child: Text(
                  '${link.failReason!}  (${link.attempts})',
                  style: TextStyle(color: Theme.of(context).colorScheme.error),
                ),
              ),
          ],
        ),
        trailing: PopupMenuButton<String>(
          enabled: !busy.contains(link.id),
          onSelected: (choice) => unawaited(
            choice == 'retry' ? cubit.retry(link.id) : cubit.remove(link.id),
          ),
          itemBuilder: (context) => [
            if (phase == LinkPhase.failed)
              PopupMenuItem(value: 'retry', child: Text(t.knowledgeRetry)),
            PopupMenuItem(value: 'remove', child: Text(t.knowledgeRemove)),
          ],
        ),
        onTap: () => context.push('/knowledge/${link.id}'),
      ),
    );
  }
}

class _SuggestionList extends StatelessWidget {
  const _SuggestionList({required this.state, required this.cubit});

  final KnowledgeState state;
  final KnowledgeCubit cubit;

  @override
  Widget build(BuildContext context) {
    final t = AppLocalizations.of(context);

    if (state.suggestions.isEmpty) {
      return Center(
        child: Padding(
          padding: const EdgeInsetsDirectional.all(BotvySpace.xxl),
          child: Text(t.knowledgeSuggestionsEmpty, textAlign: TextAlign.center),
        ),
      );
    }

    return RefreshIndicator(
      onRefresh: cubit.loadSuggestions,
      child: ListView(
        padding: const EdgeInsetsDirectional.all(BotvySpace.md),
        children: [
          for (final card in state.suggestions)
            _SuggestionCard(card: card, cubit: cubit, busy: state.busy),
        ],
      ),
    );
  }
}

class _SuggestionCard extends StatelessWidget {
  const _SuggestionCard({
    required this.card,
    required this.cubit,
    required this.busy,
  });

  final SuggestionCard card;
  final KnowledgeCubit cubit;
  final Set<String> busy;

  @override
  Widget build(BuildContext context) {
    final t = AppLocalizations.of(context);
    final id = card['id'] as String? ?? '';
    final draft = card['draft'] as Map<String, dynamic>? ?? const {};
    final exercises = draft['exercises'] as List? ?? const [];
    final sources = card['sources'] as List? ?? const [];
    final working = busy.contains(id);

    return Card.filled(
      child: Padding(
        padding: const EdgeInsetsDirectional.all(BotvySpace.lg),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              draft['title'] as String? ?? '',
              style: Theme.of(context).textTheme.titleMedium,
            ),
            Text('${card['sport']} · ${card['forDate']}'),
            const SizedBox(height: BotvySpace.sm),
            for (final raw in exercises)
              Text('• ${(raw as Map)['name']}'),
            if (card['rationale'] is String &&
                (card['rationale'] as String).isNotEmpty) ...[
              const SizedBox(height: BotvySpace.sm),
              Text(card['rationale'] as String),
            ],
            // The citation, and it is not decoration: nothing here is Botvy's
            // own claim about training, it is a reading of things the member
            // chose to save (FR-007, story 3).
            if (sources.isNotEmpty) ...[
              const SizedBox(height: BotvySpace.sm),
              Text(
                '${t.knowledgeSources}: '
                '${[for (final s in sources) (s as Map)['title'] ?? s['url']].join(', ')}',
                style: Theme.of(context).textTheme.bodySmall,
              ),
            ],
            const SizedBox(height: BotvySpace.md),
            Row(
              mainAxisAlignment: MainAxisAlignment.end,
              children: [
                TextButton(
                  onPressed: working ? null : () => unawaited(cubit.dismiss(id)),
                  child: Text(t.knowledgeDismiss),
                ),
                const SizedBox(width: BotvySpace.sm),
                FilledButton(
                  onPressed: working ? null : () => unawaited(cubit.accept(id)),
                  child: Text(t.knowledgeAccept),
                ),
              ],
            ),
          ],
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

IconData _kindIcon(String kind) => switch (kind) {
  'video' => Icons.play_circle_outline,
  'playlist' => Icons.playlist_play,
  'website' => Icons.public,
  _ => Icons.article_outlined,
};
