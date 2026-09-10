import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:go_router/go_router.dart';

import '../../../app/l10n/app_localizations.dart';
import '../../../app/router.dart';
import '../../rhythm/application/rhythm_cubit.dart';
import '../../rhythm/presentation/checkin_sheet.dart';
import '../../rhythm/presentation/confirm_plan_sheet.dart';
import '../application/home_cubit.dart';
import 'home_dials.dart';

/// The day at a glance (US5).
///
/// Everything on it comes from the phone's own database — see [HomeCubit] — so
/// it draws identically on a plane and on wifi. Nothing here awaits a request,
/// and that is not an optimisation: SC-005 is that Home renders today's plan
/// offline in under 300 ms, and a screen with a network call on its critical
/// path cannot promise that at all.
class HomePage extends StatelessWidget {
  const HomePage({super.key});

  @override
  Widget build(BuildContext context) {
    final t = AppLocalizations.of(context);

    // A builder and not a consumer: this screen has no failure of its own to
    // report. It reads the database and writes nothing — ticking a task off
    // goes through `TasksCubit`, which surfaces a refusal on its own state and
    // its own screen — so a `problem` field here would be one nothing could
    // ever set, and a snack bar for it would be a branch no test could reach.
    return BlocBuilder<HomeCubit, HomeState>(
      builder: (context, state) {
        return Scaffold(
          appBar: AppBar(
            // The greeting is the title, so it does not cost a row of its own
            // on a screen whose whole job is to be read in one look. The name
            // is dropped rather than defaulted when the profile mirror is
            // empty — a member who signed in on a plane gets "Hello", not
            // "Hello, null".
            title: Text(
              state.displayName == null || state.displayName!.isEmpty
                  ? t.homeGreetingNoName
                  : t.homeGreeting(state.displayName!),
            ),
            actions: [
              // First, because it is what this phase makes the app for: the
              // rest of Home is a list of what the member already knows and
              // this is where they can ask.
              IconButton(
                icon: const Icon(Icons.forum_outlined),
                tooltip: t.chatsTitle,
                onPressed: () => context.push(Routes.chats),
              ),
              IconButton(
                icon: const Icon(Icons.checklist),
                tooltip: t.taskToday,
                onPressed: () => context.push(Routes.tasks),
              ),
              IconButton(
                icon: const Icon(Icons.notifications_none),
                tooltip: t.remindersTitle,
                onPressed: () => context.push(Routes.reminders),
              ),
              IconButton(
                icon: const Icon(Icons.person_outline),
                tooltip: t.profileTitle,
                onPressed: () => context.push(Routes.profile),
              ),
            ],
          ),
          body: state.loading
              ? const Center(child: CircularProgressIndicator())
              : RefreshIndicator(
                  // A pull-to-refresh that re-reads the *database*, not the
                  // network. The sync engine has its own triggers; what this is
                  // for is the member who wants to be sure the screen is
                  // current, and re-reading is the honest answer to that.
                  onRefresh: () => context.read<HomeCubit>().refresh(),
                  child: ListView(
                    padding: const EdgeInsets.all(12),
                    children: [
                      if (state.draft != null) const _PlanTomorrowCard(),
                      if (state.awaitingCheckin) const _CheckinCard(),
                      _TodayCard(state: state),
                      _StreakCard(state: state),
                    ],
                  ),
                ),
        );
      },
    );
  }
}

/// Today's plan: the ring, the tasks, the training slot and the meal line.
class _TodayCard extends StatelessWidget {
  const _TodayCard({required this.state});

  final HomeState state;

  @override
  Widget build(BuildContext context) {
    final t = AppLocalizations.of(context);
    final cubit = context.read<HomeCubit>();

    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Expanded(
                  child: Text(
                    t.homeTodayPlan,
                    style: Theme.of(context).textTheme.titleMedium,
                  ),
                ),
                // The ring only when there is something to count. A 0/0 ring is
                // a shape that says nothing, next to a sentence that already
                // says it.
                if (state.totalCount > 0)
                  CompletionRing(
                    done: state.doneCount,
                    total: state.totalCount,
                  ),
              ],
            ),

            // The empty day, said plainly. The spec asks for this in three
            // places (US1 acceptance 6, FR-001a, the edge cases) because v1
            // sent an empty bulleted list instead, which reads as a bug in the
            // product rather than as a quiet day.
            if (state.emptyDay)
              Padding(
                padding: const EdgeInsets.only(top: 12),
                child: Text(t.homeNothingPlanned),
              ),

            for (final task in state.planTasks)
              CheckboxListTile(
                value: task.done,
                onChanged: (on) => unawaited(
                  cubit.toggleTask(task.id, done: on ?? false),
                ),
                title: Text(
                  task.title,
                  style: task.done
                      ? TextStyle(
                          decoration: TextDecoration.lineThrough,
                          color: Theme.of(context).colorScheme.outline,
                        )
                      : null,
                ),
                subtitle: task.deferCount > 0
                    ? Text(t.taskCarriedOver(task.deferCount))
                    : null,
                controlAffinity: ListTileControlAffinity.leading,
                contentPadding: EdgeInsets.zero,
                dense: true,
              ),

            if (state.training != null)
              _Line(
                icon: Icons.fitness_center,
                label: t.homeTraining,
                value: [
                  state.training!.title,
                  if (state.training!.startAt != null)
                    TimeOfDay.fromDateTime(
                      state.training!.startAt!.toLocal(),
                    ).format(context),
                ].where((part) => part.isNotEmpty).join(' · '),
              ),

            // The meal line is absent until P8, and absent again whenever the
            // model could not draft it (FR-012). Both are the same null here,
            // and neither is worth a placeholder.
            if (state.mealLine != null && state.mealLine!.isNotEmpty)
              _Line(
                icon: Icons.restaurant,
                label: t.homeMeals,
                value: state.mealLine!,
              ),
          ],
        ),
      ),
    );
  }
}

/// One labelled fact under the plan.
class _Line extends StatelessWidget {
  const _Line({required this.icon, required this.label, required this.value});

  final IconData icon;
  final String label;
  final String value;

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.only(top: 8),
    child: Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Icon(icon, size: 18, color: Theme.of(context).colorScheme.outline),
        const SizedBox(width: 8),
        Expanded(
          child: Text.rich(
            TextSpan(
              children: [
                TextSpan(
                  text: '$label: ',
                  style: Theme.of(context).textTheme.bodySmall,
                ),
                TextSpan(text: value),
              ],
            ),
          ),
        ),
      ],
    ),
  );
}

/// The streak, and the week that produced it.
class _StreakCard extends StatelessWidget {
  const _StreakCard({required this.state});

  final HomeState state;

  @override
  Widget build(BuildContext context) {
    final t = AppLocalizations.of(context);

    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Expanded(
                  child: Text(
                    t.homeStreak,
                    style: Theme.of(context).textTheme.titleMedium,
                  ),
                ),
                Text(
                  t.homeStreakDays(state.streakCurrent),
                  style: Theme.of(context).textTheme.titleLarge,
                ),
              ],
            ),
            // The best run, and only once there has been one worth naming.
            // "Best 0" on day one is a scoreboard telling somebody they have
            // achieved nothing.
            if (state.streakBest > 0)
              Text(
                t.homeStreakBest(state.streakBest),
                style: Theme.of(context).textTheme.bodySmall,
              ),
            const SizedBox(height: 12),
            Text(t.homeWeek, style: Theme.of(context).textTheme.bodySmall),
            const SizedBox(height: 6),
            AdherenceStrip(week: state.week),
          ],
        ),
      ),
    );
  }
}

/// The draft awaiting an answer.
class _PlanTomorrowCard extends StatelessWidget {
  const _PlanTomorrowCard();

  @override
  Widget build(BuildContext context) {
    final t = AppLocalizations.of(context);
    final date = context.select<HomeCubit, String>(
      (cubit) => cubit.state.draft?.date ?? cubit.state.tomorrow,
    );

    return Card(
      child: ListTile(
        leading: const Icon(Icons.event_note),
        title: Text(t.homePlanTomorrow),
        subtitle: Text(t.homePlanTomorrowBody),
        trailing: const Icon(Icons.chevron_right),
        // Straight to the sheet rather than through the route. The route exists
        // for the notification tap, which arrives with no screen behind it; a
        // tap from here already has one, and pushing a route to show a sheet
        // over the screen the member is looking at would put Home on the stack
        // twice.
        onTap: () => unawaited(
          showConfirmPlanSheet(context, _rhythm(context), date: date),
        ),
      ),
    );
  }
}

/// The check-in question, while the window is open.
class _CheckinCard extends StatelessWidget {
  const _CheckinCard();

  @override
  Widget build(BuildContext context) {
    final t = AppLocalizations.of(context);

    return Card(
      child: ListTile(
        leading: const Icon(Icons.mood),
        title: Text(t.rhythmCheckinTitle),
        subtitle: Text(t.homeCheckinBody),
        trailing: const Icon(Icons.chevron_right),
        onTap: () => unawaited(showCheckinSheet(context, _rhythm(context))),
      ),
    );
  }
}

/// The rhythm cubit, from the widget tree.
///
/// Read from the tree rather than from the service locator so that a widget
/// test can provide its own — the sheets are the only part of this feature that
/// talks to the network, and a test of Home must be able to open one without
/// one existing.
RhythmCubit _rhythm(BuildContext context) => context.read<RhythmCubit>();
