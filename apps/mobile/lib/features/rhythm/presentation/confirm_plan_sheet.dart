import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';

import '../../../app/l10n/app_localizations.dart';
import '../application/daily_plan.dart';
import '../application/rhythm_cubit.dart';
import 'rhythm_problem.dart';

/// Confirming tomorrow.
///
/// Opened from the Home card and from a `botvy://rhythm/plan/<date>`
/// notification tap. [date] is the plan's own local date and is passed rather
/// than derived, because the notification that carries it was composed at
/// 21:00 in the member's zone and the tap can land at any hour after — deriving
/// "tomorrow" from the moment of the tap would confirm the wrong day for
/// anybody who read the notification after midnight.
Future<void> showConfirmPlanSheet(
  BuildContext context,
  RhythmCubit cubit, {
  String? date,
}) async {
  await cubit.openPlan(date: date);
  if (!context.mounted) return;

  await showModalBottomSheet<void>(
    context: context,
    isScrollControlled: true,
    builder: (_) => BlocProvider<RhythmCubit>.value(
      value: cubit,
      child: const _ConfirmPlanSheet(),
    ),
  );
}

class _ConfirmPlanSheet extends StatefulWidget {
  const _ConfirmPlanSheet();

  @override
  State<_ConfirmPlanSheet> createState() => _ConfirmPlanSheetState();
}

class _ConfirmPlanSheetState extends State<_ConfirmPlanSheet> {
  /// The ids the member has ticked.
  ///
  /// Seeded from the draft rather than empty: the whole point of the draft is
  /// that confirming it is one tap, and an empty selection would make the
  /// member re-pick what Botvy just proposed. Held in the widget and not in the
  /// cubit because it is an unsent edit to a form — the cubit's state is what
  /// the database says, and mixing the two would make a sync pass mid-sheet
  /// discard the member's ticks.
  Set<String>? _chosen;

  /// Tri-state, and it has to be. `null` is "the member did not say", which
  /// leaves the draft's slot alone; `false` is "there is no training tomorrow",
  /// which clears it. A `bool` here would silently send `false` for every
  /// member who never touched the control, and clear a slot they never
  /// mentioned.
  bool? _training;

  @override
  Widget build(BuildContext context) {
    final t = AppLocalizations.of(context);

    return BlocConsumer<RhythmCubit, RhythmSheetState>(
      listenWhen: (before, after) =>
          before.settled != after.settled && after.settled != null,
      listener: (context, state) {
        // Closed by the outcome rather than by the button's own `onPressed`, so
        // a refused command leaves the sheet open with the member's selection
        // intact instead of vanishing and losing it.
        Navigator.of(context).maybePop();
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(
              state.settled == RhythmOutcome.skipped
                  ? t.rhythmPlanSkipped
                  : t.rhythmPlanConfirmed,
            ),
          ),
        );
      },
      builder: (context, state) {
        final cubit = context.read<RhythmCubit>();

        // Seeded from the snapshot, decoded **once**. Asking "is this one in
        // the plan?" per candidate would decode the JSON as many times as the
        // member has open tasks, on every rebuild — and every tick is a
        // rebuild.
        final chosen = _chosen ??= {
          for (final entry in decodePlanSnapshot(state.plan?.tasksJson ?? ''))
            if (entry['id'] is String) entry['id'] as String,
        };

        if (state.loading) {
          return const SafeArea(
            child: Padding(
              padding: EdgeInsets.all(32),
              child: Center(child: CircularProgressIndicator()),
            ),
          );
        }

        // No draft for that date. Reached by a notification tap on a day the
        // plan has since been erased, or by an operator's manual prompt for a
        // date the member never had — and it says so rather than offering an
        // empty form that would POST a confirm for a plan the server does not
        // hold.
        if (state.plan == null) {
          return SafeArea(
            child: Padding(
              padding: const EdgeInsets.all(24),
              child: Text(t.rhythmNothingDrafted),
            ),
          );
        }

        return SafeArea(
          child: Padding(
            padding: const EdgeInsets.all(16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              mainAxisSize: MainAxisSize.min,
              children: [
                Text(
                  t.rhythmConfirmTitle,
                  style: Theme.of(context).textTheme.titleMedium,
                ),
                Text(
                  state.date,
                  style: Theme.of(context).textTheme.bodySmall,
                ),
                const SizedBox(height: 4),
                Text(
                  t.rhythmConfirmBody,
                  style: Theme.of(context).textTheme.bodySmall,
                ),
                const SizedBox(height: 8),

                if (state.candidates.isEmpty)
                  Padding(
                    padding: const EdgeInsets.symmetric(vertical: 16),
                    child: Text(t.rhythmNoCandidates),
                  )
                else
                  // Bounded and scrollable. A member with fifty open tasks
                  // would otherwise push the two buttons off the bottom of a
                  // sheet that cannot scroll to them.
                  Flexible(
                    child: ListView(
                      shrinkWrap: true,
                      children: [
                        for (final task in state.candidates)
                          CheckboxListTile(
                            value: chosen.contains(task.id),
                            onChanged: state.busy
                                ? null
                                : (on) => setState(() {
                                    if (on == true) {
                                      chosen.add(task.id);
                                    } else {
                                      chosen.remove(task.id);
                                    }
                                  }),
                            title: Text(task.title),
                            // The carried-over count, and only when there is
                            // one: "carried over 0×" is noise on every task
                            // that has never slipped. FR-002 is that a task
                            // being offered again shows how many times it has
                            // been carried, which is the fact that makes a
                            // member either do it or drop it.
                            subtitle: task.deferCount > 0
                                ? Text(t.taskCarriedOver(task.deferCount))
                                : null,
                            controlAffinity: ListTileControlAffinity.leading,
                            dense: true,
                          ),
                      ],
                    ),
                  ),

                const Divider(),
                Text(
                  t.rhythmTraining,
                  style: Theme.of(context).textTheme.bodySmall,
                ),
                const SizedBox(height: 4),
                // Three choices, not a switch. A switch has two positions and
                // one of them would have to stand for "did not say", which is
                // exactly the state that must not be confused with "no".
                SegmentedButton<int>(
                  showSelectedIcon: false,
                  segments: [
                    ButtonSegment(
                      value: 0,
                      label: Text(t.rhythmTrainingAsProposed),
                    ),
                    ButtonSegment(value: 1, label: Text(t.rhythmTrainingYes)),
                    ButtonSegment(value: 2, label: Text(t.rhythmTrainingNo)),
                  ],
                  selected: {
                    switch (_training) {
                      null => 0,
                      true => 1,
                      false => 2,
                    },
                  },
                  onSelectionChanged: state.busy
                      ? null
                      : (picked) => setState(() {
                          _training = switch (picked.first) {
                            1 => true,
                            2 => false,
                            _ => null,
                          };
                        }),
                ),

                if (state.problem != null)
                  RhythmProblem(problem: state.problem!),

                const SizedBox(height: 12),
                FilledButton(
                  onPressed: state.busy
                      ? null
                      : () => unawaited(
                          cubit.confirm(
                            taskIds: chosen.toList(),
                            training: _training,
                          ),
                        ),
                  child: Text(t.rhythmConfirmAction),
                ),
                TextButton(
                  onPressed: state.busy ? null : () => unawaited(cubit.skip()),
                  child: Text(t.rhythmSkipAction),
                ),
              ],
            ),
          ),
        );
      },
    );
  }
}
