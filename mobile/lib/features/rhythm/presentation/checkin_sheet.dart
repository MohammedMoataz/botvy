import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';

import '../../../app/l10n/app_localizations.dart';
import '../application/rhythm_cubit.dart';
import 'rhythm_problem.dart';

/// How the day went.
///
/// Opened from the Home card and from a `botvy://rhythm/checkin` notification
/// tap. Until P4 teaches the chat gateway to read a reply in the coach
/// conversation, this sheet is the *only* way to answer — and it stays the
/// permanent path for the notification action either way (plan.md, "Check-in").
///
/// The date is resolved in the member's own zone by the cubit, not here and not
/// from `DateTime.now()`: somebody answering at 00:30 is answering about the day
/// that just ended, and taking the date from the handset's clock would file it
/// against tomorrow for anybody east of UTC.
Future<void> showCheckinSheet(
  BuildContext context,
  RhythmCubit cubit, {
  String? date,
}) async {
  await cubit.openCheckin(date: date);
  if (!context.mounted) return;

  await showModalBottomSheet<void>(
    context: context,
    isScrollControlled: true,
    builder: (_) => Padding(
      padding: EdgeInsets.only(bottom: MediaQuery.of(context).viewInsets.bottom),
      child: BlocProvider<RhythmCubit>.value(
        value: cubit,
        child: const _CheckinSheet(),
      ),
    ),
  );
}

class _CheckinSheet extends StatefulWidget {
  const _CheckinSheet();

  @override
  State<_CheckinSheet> createState() => _CheckinSheetState();
}

class _CheckinSheetState extends State<_CheckinSheet> {
  /// 0..100, and 0 is a real answer.
  ///
  /// Starts at 50 rather than at 0 because the slider has to start somewhere
  /// and the middle is the only value that does not put words in the member's
  /// mouth. What must never happen is a **0 the member did not choose** being
  /// sent as their mood — hence [_moodTouched]: the field is only sent once
  /// they have actually moved it, so declining to answer stores null and the
  /// week strip draws that day as unanswered rather than as their worst.
  double _mood = 50;
  bool _moodTouched = false;

  /// Tri-state for the same reason the confirm sheet's training is: "did not
  /// say" is not "no". A day the member answered with a mood and no verdict is
  /// not a broken streak.
  bool? _adhered;

  final TextEditingController _note = TextEditingController();

  @override
  void dispose() {
    _note.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final t = AppLocalizations.of(context);

    return BlocConsumer<RhythmCubit, RhythmSheetState>(
      listenWhen: (before, after) =>
          before.settled != after.settled && after.settled != null,
      listener: (context, state) {
        Navigator.of(context).maybePop();
        ScaffoldMessenger.of(
          context,
        ).showSnackBar(SnackBar(content: Text(t.rhythmCheckinSaved)));
      },
      builder: (context, state) {
        final cubit = context.read<RhythmCubit>();

        return SafeArea(
          child: Padding(
            padding: const EdgeInsets.all(16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              mainAxisSize: MainAxisSize.min,
              children: [
                Text(
                  t.rhythmCheckinTitle,
                  style: Theme.of(context).textTheme.titleMedium,
                ),
                Text(state.date, style: Theme.of(context).textTheme.bodySmall),
                const SizedBox(height: 16),

                Text(t.rhythmMood, style: Theme.of(context).textTheme.bodySmall),
                Slider(
                  value: _mood,
                  min: 0,
                  max: 100,
                  // Whole numbers, and twenty-one stops rather than a hundred
                  // and one: the server takes an integer 0..100 and nobody can
                  // meaningfully distinguish a mood of 63 from one of 64.
                  divisions: 20,
                  label: '${_mood.round()}',
                  onChanged: state.busy
                      ? null
                      : (value) => setState(() {
                          _mood = value;
                          _moodTouched = true;
                        }),
                ),

                const SizedBox(height: 8),
                Text(
                  t.rhythmFollowed,
                  style: Theme.of(context).textTheme.bodySmall,
                ),
                const SizedBox(height: 4),
                SegmentedButton<int>(
                  showSelectedIcon: false,
                  segments: [
                    ButtonSegment(value: 1, label: Text(t.rhythmYes)),
                    ButtonSegment(value: 2, label: Text(t.rhythmNo)),
                  ],
                  // Empty until the member picks one, which is what keeps
                  // "did not say" expressible. `emptySelectionAllowed` is what
                  // makes an unset segmented button legal at all.
                  emptySelectionAllowed: true,
                  selected: {
                    if (_adhered == true) 1,
                    if (_adhered == false) 2,
                  },
                  onSelectionChanged: state.busy
                      ? null
                      : (picked) => setState(() {
                          _adhered = picked.isEmpty ? null : picked.first == 1;
                        }),
                ),

                const SizedBox(height: 16),
                TextField(
                  controller: _note,
                  textCapitalization: TextCapitalization.sentences,
                  maxLines: 3,
                  minLines: 1,
                  enabled: !state.busy,
                  decoration: InputDecoration(labelText: t.rhythmNote),
                ),

                if (state.problem != null)
                  RhythmProblem(problem: state.problem!),

                const SizedBox(height: 12),
                FilledButton(
                  onPressed: state.busy
                      ? null
                      : () => unawaited(
                          cubit.recordCheckin(
                            // Only when it was actually moved. See
                            // [_moodTouched]: sending the slider's starting
                            // position would record a mood nobody gave.
                            mood: _moodTouched ? _mood.round() : null,
                            adhered: _adhered,
                            note: _note.text.trim().isEmpty
                                ? null
                                : _note.text.trim(),
                          ),
                        ),
                  child: Text(t.save),
                ),
              ],
            ),
          ),
        );
      },
    );
  }
}
