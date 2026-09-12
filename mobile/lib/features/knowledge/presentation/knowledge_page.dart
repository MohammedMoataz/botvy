import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:go_router/go_router.dart';

import '../../../app/l10n/app_localizations.dart';
import '../../../core/db/database.dart';
import '../application/knowledge_cubit.dart';

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
          floatingActionButton: FloatingActionButton.extended(
            onPressed: () => unawaited(_saveSheet(context, cubit)),
            icon: const Icon(Icons.add_link),
            label: Text(t.knowledgeAdd),
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
      padding: EdgeInsets.only(
        left: 16,
        right: 16,
        top: 16,
        bottom: MediaQuery.of(sheet).viewInsets.bottom + 16,
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
          const SizedBox(height: 12),
          TextField(
            controller: tags,
            decoration: InputDecoration(labelText: t.knowledgeTags),
          ),
          const SizedBox(height: 16),
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
      return const Center(child: CircularProgressIndicator());
    }

    return RefreshIndicator(
      onRefresh: cubit.refresh,
      child: ListView(
        padding: const EdgeInsets.all(12),
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
                    padding: const EdgeInsetsDirectional.only(start: 8),
                    child: ChoiceChip(
                      label: Text(_phaseLabel(t, phase)),
                      selected: state.filter == phase,
                      onSelected: (_) => unawaited(cubit.showOnly(phase)),
                    ),
                  ),
              ],
            ),
          ),
          const SizedBox(height: 12),
          if (state.links.isEmpty)
            Padding(
              padding: const EdgeInsets.symmetric(vertical: 32),
              child: Column(
                children: [
                  Text(
                    t.knowledgeEmptyTitle,
                    style: Theme.of(context).textTheme.titleMedium,
                  ),
                  const SizedBox(height: 8),
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

    return Card(
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
                    padding: const EdgeInsetsDirectional.only(start: 8),
                    child: Text(t.knowledgeSkipped(link.skippedCount!)),
                  ),
              ],
            ),
            // FR-003: a failure shows its reason and its attempt count, beside
            // a retry that works. A red chip with no sentence is a dead end.
            if (phase == LinkPhase.failed && link.failReason != null)
              Padding(
                padding: const EdgeInsets.only(top: 4),
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
          padding: const EdgeInsets.all(32),
          child: Text(t.knowledgeSuggestionsEmpty, textAlign: TextAlign.center),
        ),
      );
    }

    return RefreshIndicator(
      onRefresh: cubit.loadSuggestions,
      child: ListView(
        padding: const EdgeInsets.all(12),
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

    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              draft['title'] as String? ?? '',
              style: Theme.of(context).textTheme.titleMedium,
            ),
            Text('${card['sport']} · ${card['forDate']}'),
            const SizedBox(height: 8),
            for (final raw in exercises)
              Text('• ${(raw as Map)['name']}'),
            if (card['rationale'] is String &&
                (card['rationale'] as String).isNotEmpty) ...[
              const SizedBox(height: 8),
              Text(card['rationale'] as String),
            ],
            // The citation, and it is not decoration: nothing here is Botvy's
            // own claim about training, it is a reading of things the member
            // chose to save (FR-007, story 3).
            if (sources.isNotEmpty) ...[
              const SizedBox(height: 8),
              Text(
                '${t.knowledgeSources}: '
                '${[for (final s in sources) (s as Map)['title'] ?? s['url']].join(', ')}',
                style: Theme.of(context).textTheme.bodySmall,
              ),
            ],
            const SizedBox(height: 12),
            Row(
              mainAxisAlignment: MainAxisAlignment.end,
              children: [
                TextButton(
                  onPressed: working ? null : () => unawaited(cubit.dismiss(id)),
                  child: Text(t.knowledgeDismiss),
                ),
                const SizedBox(width: 8),
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
