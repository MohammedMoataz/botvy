import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:uuid/uuid.dart';

import '../../../app/l10n/app_localizations.dart';
import '../../../core/db/database.dart';
import '../application/athlete.dart';
import '../application/athlete_cubit.dart';
import '../application/programs_cubit.dart';
import 'athlete_page.dart' show StatusText;

const Uuid _uuid = Uuid();

/// How long the logger waits before writing the draft.
///
/// One write per stepper tap would be one database write, one `pendingOp` and
/// one alarm re-plan per tap: six exercises of four sets is upwards of seventy
/// of them, and SC-003 gives the whole session ninety seconds. One write per
/// *pause* is the same durability — the member has to stop moving for half a
/// second, and they do it constantly — for a fraction of the work.
///
/// Short enough that leaving the screen never loses anything: every exit path
/// flushes first, so this only bounds how much is at risk if the app is killed
/// mid-tap.
const Duration kLoggerSaveDebounce = Duration(milliseconds: 600);

/// One session, and the set logger (T652).
///
/// **The control layout is the feature, not decoration.** SC-003 is a full
/// six-exercise gym session logged in under ninety seconds, which rules out a
/// keyboard per number: the steppers are what a member with chalk on their
/// hands can hit, and "repeat last" is what makes the second week of a program
/// three taps instead of twenty-four. Everything here writes to the phone's own
/// row, so all of it works in a basement.
class SessionPage extends StatefulWidget {
  const SessionPage({required this.sessionId, super.key});

  final String sessionId;

  @override
  State<SessionPage> createState() => _SessionPageState();
}

class _SessionPageState extends State<SessionPage> {
  /// Both cubits, held rather than read from `context` at the point of use.
  ///
  /// The draft is flushed from [dispose], where `context.read` is no longer
  /// safe — the element is being unmounted and the provider lookup may throw —
  /// and losing the member's last set to that would be the worst possible
  /// moment for it.
  late final AthleteCubit _cubit = context.read<AthleteCubit>();
  late final ProgramsCubit _programs = context.read<ProgramsCubit>();

  LocalSession? _session;
  List<TrainingExercise> _exercises = const [];
  final _notes = TextEditingController();
  Timer? _pending;
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    unawaited(_load());
  }

  @override
  void dispose() {
    // The draft, before the screen goes. `dispose` cannot await, so the write
    // is started and forgotten — it is a local sqlite write and the cubit owns
    // it, so it completes whether or not this widget is still mounted.
    _pending?.cancel();
    if (_session != null) unawaited(_save());
    _notes.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    final session = await _cubit.byId(widget.sessionId);
    if (!mounted) return;
    setState(() {
      _session = session;
      _exercises = decodeExercises(session?.exercisesJson ?? '[]');
      _notes.text = session?.notes ?? '';
      _loading = false;
    });
  }

  /// Re-arms the debounce. Every edit goes through here.
  void _touch() {
    _pending?.cancel();
    _pending = Timer(kLoggerSaveDebounce, () => unawaited(_save()));
  }

  Future<void> _save() async {
    final session = _session;
    if (session == null) return;
    await _cubit.saveExercises(
      session.id,
      _exercises,
      notes: _notes.text.trim().isEmpty ? null : _notes.text.trim(),
      clearNotes: _notes.text.trim().isEmpty,
    );
  }

  /// A status change, with the draft flushed first.
  ///
  /// The order matters: completing a session writes `status` and `completedAt`,
  /// and a draft saved *after* that would be a second write with the same
  /// `pendingOp` carrying the sets — harmless — but a draft never saved at all
  /// would lose the last set the member typed before they pressed Completed,
  /// which is the most likely moment for them to press it.
  Future<void> _act(Future<void> Function(String id) action) async {
    final session = _session;
    if (session == null) return;
    _pending?.cancel();
    await _save();
    await action(session.id);
    await _load();
  }

  @override
  Widget build(BuildContext context) {
    final t = AppLocalizations.of(context);
    final session = _session;

    if (_loading) {
      return const Scaffold(body: Center(child: CircularProgressIndicator()));
    }
    if (session == null) {
      return Scaffold(
        appBar: AppBar(),
        body: Center(child: Text(t.athleteNoneTitle)),
      );
    }

    final shape = setShapeFor(session.sport);
    final now = DateTime.now().toUtc();
    final cubit = _cubit;

    return Scaffold(
      appBar: AppBar(
        title: Text(
          session.title.isEmpty ? t.sportName(session.sport) : session.title,
        ),
        actions: [
          PopupMenuButton<String>(
            onSelected: (action) => unawaited(
              _act((id) => switch (action) {
                'complete' => cubit.complete(id),
                'cancel' => cubit.cancel(id),
                'skip' => cubit.skip(id),
                'reopen' => cubit.reopen(id),
                _ => Future<void>.value(),
              }),
            ),
            itemBuilder: (context) => [
              PopupMenuItem(value: 'complete', child: Text(t.sessionComplete)),
              PopupMenuItem(value: 'cancel', child: Text(t.sessionCancel)),
              PopupMenuItem(value: 'skip', child: Text(t.sessionSkip)),
              // Only for a session the member has already dealt with: "put it
              // back" on a planned session is a button with nothing to undo.
              if (session.status != 'planned')
                PopupMenuItem(value: 'reopen', child: Text(t.sessionReopen)),
            ],
          ),
        ],
      ),
      body: ListView(
        padding: const EdgeInsets.all(12),
        children: [
          Card(
            child: Padding(
              padding: const EdgeInsets.all(12),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Text(
                        TimeOfDay.fromDateTime(
                          session.plannedAt.toLocal(),
                        ).format(context),
                      ),
                      const SizedBox(width: 8),
                      Text(t.athleteMinutes(session.durationMin)),
                      const Spacer(),
                      StatusText(session: session, now: now),
                    ],
                  ),
                  // A missed session is loggable, and saying so is the point of
                  // the line: "missed" is a reading of the clock and not an
                  // outcome, so there is nothing to correct before logging it
                  // late (FR-018).
                  if (isMissed(session, now)) ...[
                    const SizedBox(height: 6),
                    Text(
                      t.sessionMissedStillLoggable,
                      style: Theme.of(context).textTheme.bodySmall,
                    ),
                  ],
                ],
              ),
            ),
          ),

          if (_exercises.isEmpty)
            Padding(
              padding: const EdgeInsets.symmetric(vertical: 24),
              child: Center(child: Text(t.sessionNoExercises)),
            )
          else
            // The SDK's own `ReorderableListView` — no package (plan § Mobile,
            // "no new package on either side"). `shrinkWrap` with the outer
            // scroll disabled, because it is nested in the page's own list.
            ReorderableListView(
              shrinkWrap: true,
              physics: const NeverScrollableScrollPhysics(),
              buildDefaultDragHandles: false,
              // `onReorderItem` and not the deprecated `onReorder`, and the
              // difference is exactly the trap this used to carry: `onReorder`
              // reports a `to` that counts the list *with* the dragged row
              // still in it, so removing first and inserting at the raw index
              // moves an item one place short whenever it travels downwards.
              // `onReorderItem` has already made that adjustment, so the index
              // is the final one and nothing here or in the cubit adjusts it
              // again — which would be the same off-by-one wearing a new name.
              onReorderItem: (from, to) {
                _pending?.cancel();
                unawaited(
                  cubit
                      .reorderExercises(session.id, _exercises, from, to)
                      .then((_) => _load()),
                );
              },
              children: [
                for (var index = 0; index < _exercises.length; index++)
                  _ExerciseCard(
                    key: ValueKey(_exercises[index].id),
                    index: index,
                    exercise: _exercises[index],
                    shape: shape,
                    onChanged: (next) {
                      setState(() => _exercises[index] = next);
                      _touch();
                    },
                    onRemove: () {
                      setState(() => _exercises.removeAt(index));
                      _touch();
                    },
                    onRepeatLast: () => unawaited(_repeatLast(index)),
                  ),
              ],
            ),

          const SizedBox(height: 8),
          Row(
            children: [
              TextButton.icon(
                onPressed: _addExercise,
                icon: const Icon(Icons.add),
                label: Text(t.sessionAddExercise),
              ),
              const Spacer(),
              TextButton.icon(
                onPressed: () => unawaited(_pickWorkout()),
                icon: const Icon(Icons.library_books_outlined),
                label: Text(t.sessionApplyWorkout),
              ),
            ],
          ),

          const SizedBox(height: 8),
          TextField(
            controller: _notes,
            decoration: InputDecoration(
              labelText: t.sessionNotes,
              border: const OutlineInputBorder(),
            ),
            minLines: 2,
            maxLines: 5,
            onChanged: (_) => _touch(),
          ),
        ],
      ),
    );
  }

  void _addExercise() {
    setState(
      () => _exercises = [
        ..._exercises,
        TrainingExercise(
          // Minted here because the editor reorders exercises and a member
          // logging a set has to say *which* one: an array index is not a name.
          id: _uuid.v7(),
          name: '',
          sets: const [TrainingSet()],
        ),
      ],
    );
    _touch();
  }

  /// The same sets this member did last time, copied in (T652).
  ///
  /// Copied as **targets from the actuals**, which is what "repeat last" means
  /// to somebody in a gym: last week's eighty kilos is this week's plan, and it
  /// is not yet this week's achievement. Copying them into the actuals would
  /// record a session the member has not done.
  Future<void> _repeatLast(int index) async {
    final t = AppLocalizations.of(context);
    final exercise = _exercises[index];
    final previous = await _cubit.lastLogged(exercise.name);
    if (!mounted) return;

    if (previous == null || previous.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(t.sessionRepeatLastNone)),
      );
      return;
    }

    setState(
      () => _exercises[index] = exercise.copyWith(
        sets: [
          for (final set in previous)
            TrainingSet(
              targetReps: set.actualReps ?? set.targetReps,
              targetWeightKg: set.actualWeightKg ?? set.targetWeightKg,
              targetDurationSec: set.actualDurationSec ?? set.targetDurationSec,
              targetDistanceM: set.actualDistanceM ?? set.targetDistanceM,
            ),
        ],
      ),
    );
    _touch();
  }

  /// A library entry dropped into this session (FR-009, story 5).
  Future<void> _pickWorkout() async {
    final t = AppLocalizations.of(context);
    final session = _session;
    if (session == null) return;

    final programs = _programs;
    await programs.refresh();
    if (!mounted) return;

    final workouts = programs.state.workouts;
    if (workouts.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(t.workoutsNone)),
      );
      return;
    }

    final chosen = await showModalBottomSheet<String>(
      context: context,
      builder: (sheet) => SafeArea(
        child: ListView(
          shrinkWrap: true,
          children: [
            for (final workout in workouts)
              ListTile(
                title: Text(workout.name),
                subtitle: Text(
                  AppLocalizations.of(sheet).sportName(workout.sport),
                ),
                onTap: () => Navigator.of(sheet).pop(workout.id),
              ),
          ],
        ),
      ),
    );
    if (chosen == null || !mounted) return;

    // The draft first, so the copy does not overwrite a set the member typed
    // before reaching for the library.
    _pending?.cancel();
    await _save();
    await _cubit.applyWorkout(session.id, chosen);
    await _load();
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: Text(t.workoutApplied)),
    );
  }
}

/// One exercise, its sets, and the controls that suit the sport.
class _ExerciseCard extends StatelessWidget {
  const _ExerciseCard({
    required this.index,
    required this.exercise,
    required this.shape,
    required this.onChanged,
    required this.onRemove,
    required this.onRepeatLast,
    super.key,
  });

  final int index;
  final TrainingExercise exercise;
  final SetShape shape;
  final ValueChanged<TrainingExercise> onChanged;
  final VoidCallback onRemove;
  final VoidCallback onRepeatLast;

  @override
  Widget build(BuildContext context) {
    final t = AppLocalizations.of(context);

    return Card(
      margin: const EdgeInsets.only(bottom: 8),
      child: Padding(
        padding: const EdgeInsets.all(8),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                // The drag handle, so a list nested in a scrolling page is
                // reordered deliberately rather than by any long press on a
                // number the member is trying to type.
                ReorderableDragStartListener(
                  index: index,
                  child: const Padding(
                    padding: EdgeInsets.only(right: 8),
                    child: Icon(Icons.drag_handle),
                  ),
                ),
                Expanded(
                  child: TextFormField(
                    initialValue: exercise.name,
                    decoration: InputDecoration(
                      labelText: t.sessionExerciseName,
                      isDense: true,
                    ),
                    onChanged: (name) => onChanged(exercise.copyWith(name: name)),
                  ),
                ),
                IconButton(
                  icon: const Icon(Icons.history),
                  tooltip: t.sessionRepeatLast,
                  onPressed: onRepeatLast,
                ),
                IconButton(
                  icon: const Icon(Icons.delete_outline),
                  onPressed: onRemove,
                ),
              ],
            ),
            for (var setIndex = 0; setIndex < exercise.sets.length; setIndex++)
              _SetRow(
                ordinal: setIndex + 1,
                set: exercise.sets[setIndex],
                shape: shape,
                onChanged: (next) {
                  final sets = [...exercise.sets];
                  sets[setIndex] = next;
                  onChanged(exercise.copyWith(sets: sets));
                },
                onRemove: () {
                  final sets = [...exercise.sets]..removeAt(setIndex);
                  onChanged(exercise.copyWith(sets: sets));
                },
              ),
            Align(
              alignment: AlignmentDirectional.centerStart,
              child: TextButton.icon(
                onPressed: () {
                  // The new set inherits the previous one's targets, which is
                  // what "three sets of eight" means in practice: a member
                  // adding a second set almost never wants a blank one.
                  final last = exercise.sets.isEmpty
                      ? const TrainingSet()
                      : exercise.sets.last;
                  onChanged(
                    exercise.copyWith(
                      sets: [
                        ...exercise.sets,
                        TrainingSet(
                          targetReps: last.targetReps,
                          targetWeightKg: last.targetWeightKg,
                          targetDurationSec: last.targetDurationSec,
                          targetDistanceM: last.targetDistanceM,
                        ),
                      ],
                    ),
                  );
                },
                icon: const Icon(Icons.add),
                label: Text(t.sessionAddSet),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// One set: the pair of controls its sport asks for, and a tick.
///
/// Which pair is [setShapeFor]'s answer and not this widget's opinion — the
/// same function the server has, so the editor and the coach agree about what a
/// set of swimming is. It is a *hint*: nothing refuses a set carrying the other
/// pair, so a member who times their squats keeps what they typed.
class _SetRow extends StatelessWidget {
  const _SetRow({
    required this.ordinal,
    required this.set,
    required this.shape,
    required this.onChanged,
    required this.onRemove,
  });

  final int ordinal;
  final TrainingSet set;
  final SetShape shape;
  final ValueChanged<TrainingSet> onChanged;
  final VoidCallback onRemove;

  @override
  Widget build(BuildContext context) {
    final t = AppLocalizations.of(context);

    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 2),
      child: Row(
        children: [
          SizedBox(width: 20, child: Text('$ordinal')),
          ...switch (shape) {
            SetShape.reps => [
              _Stepper(
                label: t.sessionReps,
                value: set.actualReps ?? set.targetReps,
                target: set.targetReps,
                step: 1,
                onChanged: (v) => onChanged(set.copyWith(actualReps: v)),
              ),
              _Stepper(
                label: t.sessionWeight,
                value: (set.actualWeightKg ?? set.targetWeightKg)?.round(),
                target: set.targetWeightKg?.round(),
                // Two and a half kilos, which is the smallest pair of plates in
                // most gyms — a one-kilo step would be three taps for every
                // change a member actually makes.
                step: 2,
                onChanged: (v) =>
                    onChanged(set.copyWith(actualWeightKg: v?.toDouble())),
              ),
            ],
            SetShape.distance => [
              _Stepper(
                label: t.sessionDistance,
                value: set.actualDistanceM ?? set.targetDistanceM,
                target: set.targetDistanceM,
                step: 100,
                onChanged: (v) => onChanged(set.copyWith(actualDistanceM: v)),
              ),
              _Stepper(
                label: t.sessionDuration,
                // Minutes on screen, seconds in the row: the column is seconds
                // because a four-hundred-metre interval is timed in them, and
                // nobody logs a swim by tapping a seconds stepper.
                value: _toMinutes(set.actualDurationSec ?? set.targetDurationSec),
                target: _toMinutes(set.targetDurationSec),
                step: 1,
                onChanged: (v) => onChanged(
                  set.copyWith(actualDurationSec: v == null ? null : v * 60),
                ),
              ),
            ],
            SetShape.duration => [
              _Stepper(
                label: t.sessionDuration,
                value: _toMinutes(set.actualDurationSec ?? set.targetDurationSec),
                target: _toMinutes(set.targetDurationSec),
                step: 5,
                onChanged: (v) => onChanged(
                  set.copyWith(actualDurationSec: v == null ? null : v * 60),
                ),
              ),
            ],
          },
          // Separate from having typed a number, on purpose: a member can tick
          // three sets off without typing anything, and a set with a weight
          // typed and not ticked is one they are part way through. Inferring
          // one from the other collapses the two.
          Checkbox(
            value: set.done,
            onChanged: (on) => onChanged(set.copyWith(done: on ?? false)),
          ),
          IconButton(
            icon: const Icon(Icons.close, size: 18),
            visualDensity: VisualDensity.compact,
            onPressed: onRemove,
          ),
        ],
      ),
    );
  }
}

/// A quick +/- control, with the planned number beside the actual one.
///
/// Both are shown because FR-004 asks for it: what was done sits next to what
/// was planned, and neither overwrites the other. A single field would make the
/// plan disappear the moment the member started logging.
class _Stepper extends StatelessWidget {
  const _Stepper({
    required this.label,
    required this.value,
    required this.target,
    required this.step,
    required this.onChanged,
  });

  final String label;
  final int? value;
  final int? target;
  final int step;
  final ValueChanged<int?> onChanged;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Expanded(
      child: Row(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          IconButton(
            icon: const Icon(Icons.remove, size: 18),
            visualDensity: VisualDensity.compact,
            // Never below nought, and nought is a real answer: a set the member
            // attempted and could not finish is nought reps, not a blank.
            onPressed: () {
              final next = (value ?? target ?? 0) - step;
              onChanged(next < 0 ? 0 : next);
            },
          ),
          Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Text(
                value == null ? '—' : '$value',
                style: theme.textTheme.titleMedium,
              ),
              Text(
                target == null ? label : '$label · $target',
                style: theme.textTheme.bodySmall?.copyWith(
                  color: theme.colorScheme.outline,
                ),
              ),
            ],
          ),
          IconButton(
            icon: const Icon(Icons.add, size: 18),
            visualDensity: VisualDensity.compact,
            onPressed: () => onChanged((value ?? target ?? 0) + step),
          ),
        ],
      ),
    );
  }
}

int? _toMinutes(int? seconds) => seconds == null ? null : (seconds / 60).round();
