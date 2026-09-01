import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';

import '../../app_providers.dart';
import '../../db/database.dart';
import '../settings/coaching_controller.dart';
import 'streak.dart';

/// Everything the device already knows about how the days have gone.
///
/// Read straight from the local tables, so it opens with no connection — which
/// is the point: the check-ins and programs are on the phone now, not only in
/// the gateway's database.
class _History {
  const _History({required this.checkins, required this.workouts});

  final List<LocalCheckin> checkins;
  final List<LocalWorkout> workouts;
}

final _historyProvider = FutureProvider.autoDispose<_History>((ref) async {
  final db = ref.watch(databaseProvider);
  ref.watch(syncServiceProvider).kick();
  return _History(
    checkins: await db.recentCheckins(),
    workouts: await db.recentWorkouts(),
  );
});

class HistoryScreen extends ConsumerWidget {
  const HistoryScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final history = ref.watch(_historyProvider);
    final profile = ref.watch(coachingControllerProvider).profile;

    return Scaffold(
      appBar: AppBar(title: const Text('History')),
      body: history.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => Center(
          child: Padding(padding: const EdgeInsets.all(32), child: Text('$e')),
        ),
        data: (data) {
          if (data.checkins.isEmpty && data.workouts.isEmpty) {
            return RefreshIndicator(
              onRefresh: () async => ref.invalidate(_historyProvider),
              child: ListView(
                children: const [
                  SizedBox(height: 120),
                  Padding(
                    padding: EdgeInsets.all(32),
                    child: Text(
                      'Nothing here yet. Turn on the daily check-in in Settings and '
                      'your answers and plans will collect here.',
                      textAlign: TextAlign.center,
                    ),
                  ),
                ],
              ),
            );
          }

          final days = [
            for (final c in data.checkins) (date: c.checkinDate, adhered: c.adhered),
          ];
          final today = todayLocal();

          return RefreshIndicator(
            onRefresh: () async => ref.invalidate(_historyProvider),
            child: ListView(
              padding: const EdgeInsets.fromLTRB(16, 12, 16, 32),
              children: [
                _Summary(
                  streak: currentStreak(days, today),
                  ratio: completionRatio(days, today),
                  answered: answeredCount(days, today),
                  awaiting: profile?.awaitingCheckin ?? false,
                ),
                if (data.checkins.isNotEmpty) ...[
                  const _Heading('Check-ins'),
                  for (final c in data.checkins) _CheckinTile(checkin: c),
                ],
                if (data.workouts.isNotEmpty) ...[
                  const _Heading('Programs'),
                  for (final w in data.workouts) _WorkoutTile(workout: w),
                ],
              ],
            ),
          );
        },
      ),
    );
  }
}

class _Summary extends StatelessWidget {
  const _Summary({
    required this.streak,
    required this.ratio,
    required this.answered,
    required this.awaiting,
  });

  final int streak;
  final double ratio;

  /// Days answered in the last week — the denominator behind [ratio], shown so
  /// "100%" off two answers cannot read as a perfect week.
  final int answered;
  final bool awaiting;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final text = Theme.of(context).textTheme;

    return Card(
      margin: const EdgeInsets.only(bottom: 16),
      child: Padding(
        padding: const EdgeInsets.all(18),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              crossAxisAlignment: CrossAxisAlignment.baseline,
              textBaseline: TextBaseline.alphabetic,
              children: [
                Text('$streak', style: text.displaySmall?.copyWith(color: scheme.primary)),
                const SizedBox(width: 8),
                Text(streak == 1 ? 'day streak' : 'day streak', style: text.titleMedium),
              ],
            ),
            const SizedBox(height: 6),
            Text(
              answered == 0
                  ? 'No check-ins answered this week yet'
                  : '${(ratio * 100).round()}% of $answered '
                      '${answered == 1 ? 'answer' : 'answers'} this week went to plan',
              style: text.bodyMedium?.copyWith(color: scheme.onSurfaceVariant),
            ),
            if (awaiting) ...[
              const SizedBox(height: 12),
              Row(
                children: [
                  Icon(Icons.hourglass_bottom, size: 16, color: scheme.tertiary),
                  const SizedBox(width: 6),
                  Expanded(
                    child: Text(
                      'Botvy is waiting on today\'s answer — reply in the chat.',
                      style: text.bodySmall,
                    ),
                  ),
                ],
              ),
            ],
          ],
        ),
      ),
    );
  }
}

class _Heading extends StatelessWidget {
  const _Heading(this.text);

  final String text;

  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.only(top: 8, bottom: 4),
        child: Text(text, style: Theme.of(context).textTheme.titleMedium),
      );
}

class _CheckinTile extends StatelessWidget {
  const _CheckinTile({required this.checkin});

  final LocalCheckin checkin;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return ListTile(
      contentPadding: EdgeInsets.zero,
      leading: Icon(
        checkin.adhered ? Icons.check_circle : Icons.remove_circle_outline,
        color: checkin.adhered ? scheme.primary : scheme.outline,
      ),
      title: Text(_prettyDate(checkin.checkinDate)),
      subtitle: checkin.rawReply == null ? null : Text(checkin.rawReply!),
    );
  }
}

class _WorkoutTile extends StatelessWidget {
  const _WorkoutTile({required this.workout});

  final LocalWorkout workout;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final groups = _decode(workout.muscleGroups);
    final planned = workout.source == 'planned';

    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 6),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Text(_prettyDate(workout.workoutDate),
                  style: Theme.of(context).textTheme.titleSmall),
              const SizedBox(width: 8),
              Chip(
                // 'reported' means the user told Botvy what they actually did,
                // which always outranks a generated plan for the same day.
                label: Text(planned ? 'planned' : 'you did this'),
                visualDensity: VisualDensity.compact,
                labelStyle: Theme.of(context).textTheme.labelSmall,
                backgroundColor: planned ? scheme.surfaceContainerHighest : scheme.primaryContainer,
              ),
            ],
          ),
          if (groups.isNotEmpty)
            Padding(
              padding: const EdgeInsets.only(top: 2),
              child: Text(groups.join(' · '),
                  style: TextStyle(color: scheme.onSurfaceVariant, fontSize: 13)),
            ),
          if (workout.notes != null)
            Padding(
              padding: const EdgeInsets.only(top: 2),
              child: Text(workout.notes!, style: const TextStyle(fontSize: 13)),
            ),
        ],
      ),
    );
  }
}

String _prettyDate(String isoDate) {
  final parsed = DateTime.tryParse(isoDate);
  return parsed == null ? isoDate : DateFormat('EEE d MMM').format(parsed);
}

List<String> _decode(String encoded) {
  try {
    return (jsonDecode(encoded) as List).map((e) => '$e').toList();
  } catch (_) {
    return const [];
  }
}
