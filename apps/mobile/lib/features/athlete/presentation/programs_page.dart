import 'dart:async';
import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';

import '../../../app/l10n/app_localizations.dart';
import '../../../core/api/api_client.dart';
import '../../../core/db/database.dart';
import '../application/athlete.dart';
import '../application/programs_cubit.dart';

/// Programs and the workout library (T653).
///
/// Two lists on one screen rather than two screens, because they are the same
/// idea at two sizes — a program is weeks of sessions, a workout is one
/// session's worth of exercises — and a member reaching for either is reaching
/// for "something I saved earlier".
class ProgramsPage extends StatelessWidget {
  const ProgramsPage({super.key});

  @override
  Widget build(BuildContext context) {
    final t = AppLocalizations.of(context);

    return BlocConsumer<ProgramsCubit, ProgramsState>(
      listenWhen: (before, after) =>
          after.problem != null && before.problem != after.problem,
      listener: (context, state) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(state.problem!)),
        );
        context.read<ProgramsCubit>().clearProblem();
      },
      builder: (context, state) {
        final cubit = context.read<ProgramsCubit>();

        return Scaffold(
          appBar: AppBar(
            title: Text(t.programsTitle),
            actions: [
              // Active and archived, as two views of one list. Archived is
              // where a program goes rather than where it dies: the sessions it
              // already filled keep their content (FR-008, story 4 scenario 4),
              // so the member can still read what it did.
              PopupMenuButton<bool>(
                icon: const Icon(Icons.filter_list),
                onSelected: (archived) =>
                    unawaited(cubit.showArchived(archived)),
                itemBuilder: (context) => [
                  PopupMenuItem(value: false, child: Text(t.programsActive)),
                  PopupMenuItem(value: true, child: Text(t.programsArchived)),
                ],
              ),
            ],
          ),
          body: state.loading
              ? const Center(child: CircularProgressIndicator())
              : RefreshIndicator(
                  onRefresh: cubit.refresh,
                  child: ListView(
                    padding: const EdgeInsets.all(12),
                    children: [
                      if (state.programs.isEmpty)
                        Padding(
                          padding: const EdgeInsets.symmetric(vertical: 24),
                          child: Center(child: Text(t.programsNone)),
                        )
                      else
                        for (final program in state.programs)
                          _ProgramCard(
                            program: program,
                            archived: state.showArchived,
                          ),

                      const Divider(height: 32),
                      Text(
                        t.workoutsTitle,
                        style: Theme.of(context).textTheme.titleMedium,
                      ),
                      if (state.workouts.isEmpty)
                        Padding(
                          padding: const EdgeInsets.symmetric(vertical: 16),
                          child: Text(t.workoutsNone),
                        )
                      else
                        for (final workout in state.workouts)
                          _WorkoutRow(workout: workout),
                    ],
                  ),
                ),
        );
      },
    );
  }
}

class _ProgramCard extends StatelessWidget {
  const _ProgramCard({required this.program, required this.archived});

  final LocalProgram program;
  final bool archived;

  @override
  Widget build(BuildContext context) {
    final t = AppLocalizations.of(context);
    final cubit = context.read<ProgramsCubit>();
    final weeks = _weekCount(program.weeksJson);

    return Card(
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(program.title, style: Theme.of(context).textTheme.titleMedium),
            const SizedBox(height: 4),
            Wrap(
              spacing: 8,
              children: [
                Chip(
                  label: Text(t.sportName(program.sport)),
                  visualDensity: VisualDensity.compact,
                ),
                Text(t.programWeeks(weeks)),
                // Which week is running, for a program that has been applied.
                // The date is what the server computes the week index from long
                // after the apply, which is how week four of a four-week
                // program lands when the horizon reaches it.
                if (program.appliedStartDate != null)
                  Text('${t.programApplyFrom} ${program.appliedStartDate}'),
              ],
            ),
            const SizedBox(height: 8),
            Row(
              children: [
                if (!archived)
                  TextButton.icon(
                    onPressed: () => unawaited(_apply(context, cubit)),
                    icon: const Icon(Icons.play_arrow),
                    label: Text(t.programApply),
                  ),
                const Spacer(),
                if (!archived)
                  TextButton(
                    onPressed: () => unawaited(cubit.archive(program.id)),
                    child: Text(t.programArchive),
                  ),
              ],
            ),
          ],
        ),
      ),
    );
  }

  /// Applies the program, warning first (story 4 scenario 2).
  ///
  /// The two calls are the whole rule: the first one is honest — it asks the
  /// server to apply and takes `409` as an answer rather than an error — and the
  /// second one carries `force: true` only after the member has read the list
  /// and agreed. Nothing retries on its own, because a warning that is
  /// dismissed by the code is not a warning.
  Future<void> _apply(BuildContext context, ProgramsCubit cubit) async {
    final t = AppLocalizations.of(context);
    final messenger = ScaffoldMessenger.of(context);

    final picked = await showDatePicker(
      context: context,
      initialDate: DateTime.now(),
      // Relative to now, never a written year: a picker bounded by a literal
      // date starts refusing the member's own week the day the clock reaches
      // it.
      firstDate: DateTime.now().subtract(const Duration(days: 7)),
      lastDate: DateTime.now().add(const Duration(days: 365)),
    );
    if (picked == null) return;

    final startDate = '${picked.year}-'
        '${picked.month.toString().padLeft(2, '0')}-'
        '${picked.day.toString().padLeft(2, '0')}';

    final first = await cubit.apply(program.id, startDate: startDate);
    if (first == null) return;

    if (first.applied) {
      messenger.showSnackBar(SnackBar(content: Text(t.programApplied)));
      return;
    }

    if (first.wouldReplace.isEmpty) {
      // Refused with nothing to show. Not an error the member can act on, so
      // it is reported rather than retried — retrying with `force` here would
      // be forcing something nobody was warned about.
      messenger.showSnackBar(SnackBar(content: Text(t.somethingWentWrong)));
      return;
    }

    if (!context.mounted) return;
    final agreed = await showDialog<bool>(
      context: context,
      builder: (dialog) => AlertDialog(
        title: Text(t.programReplaceTitle),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(t.programReplaceBody),
            const SizedBox(height: 12),
            // Named, not counted. "3 sessions would be replaced" tells the
            // member nothing they can weigh; the titles and the days are what
            // they decide on.
            for (final session in first.wouldReplace.take(10))
              Text('· ${_replacedLine(dialog, session)}'),
          ],
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(dialog).pop(false),
            child: Text(t.programKeep),
          ),
          FilledButton(
            onPressed: () => Navigator.of(dialog).pop(true),
            child: Text(t.programReplaceConfirm),
          ),
        ],
      ),
    );
    if (agreed != true) return;

    final second = await cubit.apply(
      program.id,
      startDate: startDate,
      force: true,
    );
    if (second?.applied == true) {
      messenger.showSnackBar(SnackBar(content: Text(t.programApplied)));
    }
  }
}

class _WorkoutRow extends StatelessWidget {
  const _WorkoutRow({required this.workout});

  final LocalWorkout workout;

  @override
  Widget build(BuildContext context) {
    final t = AppLocalizations.of(context);
    final cubit = context.read<ProgramsCubit>();
    final exercises = decodeExercises(workout.exercisesJson);

    return ListTile(
      contentPadding: EdgeInsets.zero,
      title: Text(workout.name),
      // The sport and how much is in it. Applying one to a session is done from
      // the *session*, where the member is when they want it — see
      // `session_page.dart`'s library picker — rather than from here, which
      // would need a session picker nobody has a reason to open.
      subtitle: Text(
        '${t.sportName(workout.sport)} · ${exercises.length}',
      ),
      trailing: IconButton(
        icon: const Icon(Icons.delete_outline),
        onPressed: () => unawaited(cubit.deleteWorkout(workout.id)),
      ),
    );
  }
}

/// One session an apply would overwrite, as a line the member can weigh.
String _replacedLine(BuildContext context, ReplacedSession session) {
  final when = session.plannedAt;
  if (when == null) return session.title;
  final time = TimeOfDay.fromDateTime(when.toLocal()).format(context);
  return '${session.title} · $time';
}

/// How many weeks a program holds.
///
/// Read from the JSON rather than stored as a count, because two numbers that
/// must agree are one number and a bug. Never throws: a program the phone
/// cannot parse reads as nought weeks rather than taking the list down.
int _weekCount(String weeksJson) {
  if (weeksJson.isEmpty) return 0;
  try {
    final decoded = jsonDecode(weeksJson);
    return decoded is List ? decoded.length : 0;
  } catch (_) {
    return 0;
  }
}
