import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:go_router/go_router.dart';

import '../../../app/l10n/app_localizations.dart';
import '../../../app/router.dart';
import '../../../core/db/database.dart';
import '../../athlete/application/athlete_cubit.dart';
import '../../athlete/presentation/athlete_page.dart' show StatusText;

/// Today's training, as its own kind of row (T642, FR-010).
///
/// ## It is not a task, and it cannot be ticked off here
///
/// Story 6 scenario 1 asks for the day's training to appear at its time,
/// *distinct from tasks*, and to be impossible to complete as if it were one.
/// So this row has **no checkbox**, and that absence is the requirement rather
/// than a styling choice: `test/athlete_cubit_test.dart` asserts no
/// `CheckboxListTile` and no `Checkbox` is built for it, because "we did not
/// add one" is not something a future edit can be trusted to remember. A
/// session is completed, cancelled or skipped — three outcomes and a length —
/// and a tick would flatten all of that into "done", on the one screen where
/// the member is least likely to have meant it. Tapping opens the session,
/// where the three real actions are.
///
/// ## It watches the `sessions` table, not the plan snapshot
///
/// `daily_plans.trainingJson` is the *evening's* summary of what today was
/// going to hold, written by the 22:00 touch and never rewritten — and that is
/// the right thing for it to be. Drawing this row from it would mean a session
/// completed or skipped at seven in the morning still reading as planned until
/// tomorrow's plan arrived, and offline it would never arrive at all. So the
/// row is a `StreamBuilder` over the phone's own rows, which change the instant
/// the member acts on them, with no network anywhere on the path (plan
/// § Mobile). The snapshot line on Home's plan card stays exactly what it was.
class TrainingRow extends StatelessWidget {
  const TrainingRow({
    required this.date,
    this.timezone,
    super.key,
  });

  /// The member's local date, `YYYY-MM-DD`, as Home resolved it against the
  /// *profile's* zone. Passed in rather than worked out here: a widget reading
  /// `DateTime.now()` would use the handset's clock, which is the three-hour
  /// shift principle XI exists to stop.
  final String date;

  final String? timezone;

  @override
  Widget build(BuildContext context) {
    final cubit = context.read<AthleteCubit>();

    return StreamBuilder<List<LocalSession>>(
      stream: cubit.watchDay(date, timezone: timezone),
      builder: (context, snapshot) {
        final sessions = snapshot.data ?? const <LocalSession>[];
        // Nothing today is a rest day, and a rest day is stored as nothing
        // (FR-013). No row, no placeholder: Home's plan card already says when
        // the day is quiet, and a second widget saying it again reads as a
        // broken screen.
        if (sessions.isEmpty) return const SizedBox.shrink();

        return Card(
          child: Column(
            children: [
              for (final session in sessions)
                _SessionRow(session: session),
            ],
          ),
        );
      },
    );
  }
}

class _SessionRow extends StatelessWidget {
  const _SessionRow({required this.session});

  final LocalSession session;

  @override
  Widget build(BuildContext context) {
    final t = AppLocalizations.of(context);
    // Read here rather than carried on the state, because this row rebuilds
    // when the stream ticks and not when Home reloads — so a state's clock
    // would be the one from whenever Home last refreshed, which on a phone
    // left open overnight is yesterday's reading of "missed".
    final now = DateTime.now().toUtc();

    return ListTile(
      // Deliberately a `ListTile` and never a `CheckboxListTile`: see the class
      // note. The icon is the one Home already uses for training, so the row
      // reads as the same thing in both places.
      leading: const Icon(Icons.fitness_center),
      title: Text(
        session.title.isEmpty ? t.sportName(session.sport) : session.title,
      ),
      subtitle: Row(
        children: [
          Text(
            TimeOfDay.fromDateTime(session.plannedAt.toLocal()).format(context),
          ),
          const SizedBox(width: 8),
          Text(t.sportName(session.sport)),
          const SizedBox(width: 8),
          // Including the derived "missed" reading, which is the same function
          // the card and the week view ask — three screens, one answer.
          StatusText(session: session, now: now),
        ],
      ),
      trailing: const Icon(Icons.chevron_right),
      onTap: () => context.push(Routes.session(session.id)),
    );
  }
}
