import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:go_router/go_router.dart';

import '../../../app/l10n/app_localizations.dart';
import '../../../app/router.dart';
import '../../../core/db/database.dart';
import '../application/athlete.dart';
import '../application/athlete_cubit.dart';
import 'athlete_sheets.dart';

/// The athlete's week (T651).
///
/// Everything on it comes from the phone's own tables, so it draws identically
/// on a plane and on wifi — the same promise Home makes and for the same
/// reason. In particular the next-practice card is computed **here**, by the
/// phone's port of the server's rule, rather than fetched: `nextPractice` is a
/// GraphQL query the extension and the web app use, and a request on this
/// screen's critical path would make the one screen a member opens most the
/// one screen that needs signal.
class AthletePage extends StatelessWidget {
  const AthletePage({super.key});

  @override
  Widget build(BuildContext context) {
    final t = AppLocalizations.of(context);

    return BlocConsumer<AthleteCubit, AthleteState>(
      listenWhen: (before, after) =>
          after.problem != null && before.problem != after.problem,
      listener: (context, state) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(state.problem!)),
        );
        context.read<AthleteCubit>().clearProblem();
      },
      builder: (context, state) {
        final cubit = context.read<AthleteCubit>();

        return Scaffold(
          appBar: AppBar(
            title: Text(t.athleteTitle),
            actions: [
              IconButton(
                icon: const Icon(Icons.list_alt),
                tooltip: t.programsTitle,
                onPressed: () => context.push(Routes.programs),
              ),
              IconButton(
                icon: const Icon(Icons.sports_score),
                tooltip: t.athleteSports,
                onPressed: () => unawaited(showSportsPicker(context, cubit)),
              ),
              IconButton(
                icon: const Icon(Icons.schedule),
                tooltip: t.athleteSlots,
                onPressed: () => unawaited(showSlotEditor(context, cubit)),
              ),
            ],
          ),
          floatingActionButton: FloatingActionButton(
            tooltip: t.athleteAddSession,
            onPressed: () => unawaited(showSessionCreator(context, cubit)),
            child: const Icon(Icons.add),
          ),
          body: state.loading
              ? const Center(child: CircularProgressIndicator())
              : RefreshIndicator(
                  // Re-reads the *database*, not the network — the engine has
                  // its own triggers, and re-reading is the honest answer to a
                  // member who wants to be sure the screen is current.
                  onRefresh: cubit.refresh,
                  child: ListView(
                    padding: const EdgeInsets.all(12),
                    children: [
                      NextPracticeCard(state: state),
                      // Story 1 scenario 3, verbatim: no slots at all invites
                      // the member to set them rather than showing an empty
                      // grid. It replaces the week rather than sitting above
                      // it, because an empty grid underneath would be the
                      // thing the requirement exists to avoid.
                      if (state.noSlots)
                        const _NoSlotsCard()
                      else
                        _WeekCard(state: state),
                    ],
                  ),
                ),
        );
      },
    );
  }
}

/// The practice happening now or next, with its three empty states (FR-006).
///
/// The three reasons are three different sentences, and that is why the rule
/// answers a reason rather than a nullable session: "here is today's", "today
/// is behind you, here is the next one" and "you have nothing scheduled" are
/// news of three different kinds, and a card that inferred them from a null
/// would say the third when it meant the second.
class NextPracticeCard extends StatelessWidget {
  const NextPracticeCard({required this.state, super.key});

  final AthleteState state;

  @override
  Widget build(BuildContext context) {
    final t = AppLocalizations.of(context);
    final session = state.next.session;

    if (session == null) {
      return Card(
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                t.athleteNoneTitle,
                style: Theme.of(context).textTheme.titleMedium,
              ),
              const SizedBox(height: 6),
              // "Says so plainly and offers to add one" — story 2 scenario 3.
              // The offer is the half that is easy to leave out, and a plain
              // sentence with nothing to do next is a dead end on the screen
              // the member opened to find out what is next.
              Text(t.athleteNoneBody),
              const SizedBox(height: 12),
              Align(
                alignment: AlignmentDirectional.centerStart,
                child: FilledButton.icon(
                  onPressed: () => unawaited(
                    showSessionCreator(context, context.read<AthleteCubit>()),
                  ),
                  icon: const Icon(Icons.add),
                  label: Text(t.athleteAddSession),
                ),
              ),
            ],
          ),
        ),
      );
    }

    final now = state.now ?? DateTime.now().toUtc();
    final label = switch (state.next.reason) {
      NextPracticeReason.today => t.athleteToday,
      // One word for both remaining reasons, deliberately: `after-cutoff`
      // means "this is a future session", which is the honest reading whether
      // the evening cut-off has passed or today simply held nothing.
      NextPracticeReason.afterCutoff => t.athleteNext,
      NextPracticeReason.noneScheduled => t.athleteNext,
    };

    return Card(
      child: InkWell(
        onTap: () => context.push(Routes.session(session.id)),
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Expanded(
                    child: Text(
                      t.athleteNextPractice,
                      style: Theme.of(context).textTheme.bodySmall,
                    ),
                  ),
                  Chip(label: Text(label), visualDensity: VisualDensity.compact),
                ],
              ),
              const SizedBox(height: 4),
              Text(
                session.title.isEmpty
                    ? t.sportName(session.sport)
                    : session.title,
                style: Theme.of(context).textTheme.titleLarge,
              ),
              const SizedBox(height: 6),
              Wrap(
                spacing: 8,
                runSpacing: 4,
                children: [
                  _SportChip(sport: session.sport),
                  Text(_whenText(context, session, state)),
                  StatusText(session: session, now: now),
                ],
              ),
              if (session.focus != null && session.focus!.isNotEmpty) ...[
                const SizedBox(height: 6),
                Text(
                  session.focus!,
                  style: Theme.of(context).textTheme.bodySmall,
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }
}

/// The week, grouped by day, with a chip per sport (T651).
class _WeekCard extends StatelessWidget {
  const _WeekCard({required this.state});

  final AthleteState state;

  @override
  Widget build(BuildContext context) {
    final t = AppLocalizations.of(context);
    final cubit = context.read<AthleteCubit>();
    final now = state.now ?? DateTime.now().toUtc();

    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                IconButton(
                  icon: const Icon(Icons.chevron_left),
                  onPressed: () =>
                      unawaited(cubit.showWeek(state.weekOffset - 1)),
                ),
                Expanded(
                  child: Text(
                    state.weekOffset == 0
                        ? t.athleteThisWeek
                        : '${t.athleteWeek} ${state.weekOffset > 0 ? '+' : ''}${state.weekOffset}',
                    textAlign: TextAlign.center,
                    style: Theme.of(context).textTheme.titleMedium,
                  ),
                ),
                IconButton(
                  icon: const Icon(Icons.chevron_right),
                  onPressed: () =>
                      unawaited(cubit.showWeek(state.weekOffset + 1)),
                ),
              ],
            ),
            for (final date in state.week)
              _DayRow(
                date: date,
                today: state.today,
                sessions: state.sessionsByDate[date] ?? const [],
                now: now,
              ),
          ],
        ),
      ),
    );
  }
}

class _DayRow extends StatelessWidget {
  const _DayRow({
    required this.date,
    required this.today,
    required this.sessions,
    required this.now,
  });

  final String date;
  final String today;
  final List<LocalSession> sessions;
  final DateTime now;

  @override
  Widget build(BuildContext context) {
    final t = AppLocalizations.of(context);
    final theme = Theme.of(context);
    // 1..7, ISO: the same convention the slot stores and Dart's own
    // `DateTime.weekday` uses.
    final weekday = DateTime.parse(date).weekday;

    return Padding(
      padding: const EdgeInsets.only(top: 10),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            t.weekdayName(weekday),
            style: theme.textTheme.labelLarge?.copyWith(
              color: date == today ? theme.colorScheme.primary : null,
            ),
          ),
          // A rest day is a day with no session and nothing is stored to
          // represent one (FR-013), so its absence *is* the representation —
          // and it still needs a word on screen, or the row reads as a bug.
          if (sessions.isEmpty)
            Text(
              t.athleteRestDay,
              style: theme.textTheme.bodySmall?.copyWith(
                color: theme.colorScheme.outline,
              ),
            )
          else
            for (final session in sessions)
              ListTile(
                contentPadding: EdgeInsets.zero,
                dense: true,
                leading: _SportChip(sport: session.sport),
                title: Text(
                  session.title.isEmpty
                      ? t.sportName(session.sport)
                      : session.title,
                ),
                subtitle: Row(
                  children: [
                    Text(
                      TimeOfDay.fromDateTime(
                        session.plannedAt.toLocal(),
                      ).format(context),
                    ),
                    const SizedBox(width: 8),
                    StatusText(session: session, now: now),
                  ],
                ),
                onTap: () => context.push(Routes.session(session.id)),
              ),
        ],
      ),
    );
  }
}

/// What a session's status reads as, including the one that is not a status.
///
/// "Missed" is `planned` plus a clock — [isMissed] — and is stored nowhere: the
/// card, this row and Today all ask the same function, which is why they cannot
/// disagree, and why logging a missed session late needs no correction first
/// (FR-018).
class StatusText extends StatelessWidget {
  const StatusText({required this.session, required this.now, super.key});

  final LocalSession session;
  final DateTime now;

  @override
  Widget build(BuildContext context) {
    final t = AppLocalizations.of(context);
    final theme = Theme.of(context);

    if (isMissed(session, now)) {
      return Text(
        t.athleteMissed,
        style: theme.textTheme.bodySmall?.copyWith(
          color: theme.colorScheme.error,
        ),
      );
    }

    final (text, colour) = switch (session.status) {
      'completed' => (t.athleteCompleted, theme.colorScheme.primary),
      'cancelled' => (t.athleteCancelled, theme.colorScheme.outline),
      'skipped' => (t.athleteSkipped, theme.colorScheme.outline),
      _ => (t.athletePlanned, theme.colorScheme.outline),
    };

    return Text(
      text,
      style: theme.textTheme.bodySmall?.copyWith(color: colour),
    );
  }
}

/// The invitation story 1 scenario 3 asks for.
class _NoSlotsCard extends StatelessWidget {
  const _NoSlotsCard();

  @override
  Widget build(BuildContext context) {
    final t = AppLocalizations.of(context);

    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              t.athleteNoSlotsTitle,
              style: Theme.of(context).textTheme.titleMedium,
            ),
            const SizedBox(height: 6),
            Text(t.athleteNoSlotsBody),
            const SizedBox(height: 12),
            Align(
              alignment: AlignmentDirectional.centerStart,
              child: FilledButton.icon(
                onPressed: () => unawaited(
                  showSlotEditor(context, context.read<AthleteCubit>()),
                ),
                icon: const Icon(Icons.schedule),
                label: Text(t.athleteSetSlots),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// One sport, as a chip.
///
/// Translated through [AppLocalizations.sportName], which falls back to the
/// stored word for anything outside the seven — a member whose sport is padel
/// sees `padel` rather than the word "other".
class _SportChip extends StatelessWidget {
  const _SportChip({required this.sport});

  final String sport;

  @override
  Widget build(BuildContext context) => Chip(
    label: Text(AppLocalizations.of(context).sportName(sport)),
    visualDensity: VisualDensity.compact,
    padding: EdgeInsets.zero,
  );
}

/// "Today at 18:00", or the weekday and the time for a future session.
String _whenText(
  BuildContext context,
  LocalSession session,
  AthleteState state,
) {
  final t = AppLocalizations.of(context);
  final time = TimeOfDay.fromDateTime(session.plannedAt.toLocal())
      .format(context);
  // The member's own local date, resolved by the cubit against the *profile's*
  // zone. Working it out from the handset's clock here is the shift principle
  // XI exists to stop, which is why this reads the grouping the cubit built
  // rather than formatting the instant.
  String? date;
  for (final entry in state.sessionsByDate.entries) {
    if (entry.value.any((row) => row.id == session.id)) {
      date = entry.key;
      break;
    }
  }

  if (date == null || date == state.today) return '${t.athleteToday} · $time';
  return '${t.weekdayName(DateTime.parse(date).weekday)} · $time';
}
