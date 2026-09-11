import 'dart:async';

import 'package:flutter/material.dart';

import '../../../app/l10n/app_localizations.dart';
import '../../athlete/application/athlete.dart';
import '../../athlete/application/athlete_cubit.dart';
import '../../athlete/presentation/athlete_sheets.dart';
import 'onboarding_steps.dart';

/// Where P6's step sits in the walkthrough.
///
/// 400, after P1's name (100), time zone (200) and daily times (300). The
/// orders are sparse for exactly this — a later phase contributes a step
/// without renumbering anybody else's — and P8's meals question has 500 and the
/// whole space between 300 and 400 still free.
const int kAthleteStepOrder = 400;

/// The sports-and-slots step (T664, FR-016).
///
/// Registered from here rather than listed in the walkthrough, the way
/// `registerIdentitySteps` is: the onboarding feature does not import every
/// other feature to find its steps, and this phase's arrival is one call in
/// `di.dart`.
///
/// ## A member who already has slots is not asked again
///
/// [OnboardingStep.isNeeded] reads the athlete profile and skips the step when
/// the timetable is already set — a member who told the coach "gym Monday and
/// Wednesday at six" in the chat, or who registered on another device and is
/// signing in on this one, has answered. Asking again is how a walkthrough
/// earns its reputation, and the registry anticipates it.
///
/// The check is on **slots** and not on sports. Sports without slots is a
/// half-answered question — it shapes the picker and nothing else — and the
/// thing FR-016 exists for is that "an athlete arrives with a week already
/// shaped", which only slots do.
void registerAthleteSteps(OnboardingRegistry registry, AthleteCubit cubit) {
  registry.register(
    OnboardingStep(
      id: 'athlete.sportsAndSlots',
      order: kAthleteStepOrder,
      isNeeded: () async {
        // The cubit's own read, so this asks the same question the Athlete
        // screen does rather than a second copy of it against the same table.
        await cubit.refresh();
        return cubit.state.slots.isEmpty;
      },
      build: (context, onDone) => _AthleteStep(cubit: cubit, onDone: onDone),
    ),
  );
}

class _AthleteStep extends StatefulWidget {
  const _AthleteStep({required this.cubit, required this.onDone});

  final AthleteCubit cubit;
  final VoidCallback onDone;

  @override
  State<_AthleteStep> createState() => _AthleteStepState();
}

class _AthleteStepState extends State<_AthleteStep> {
  @override
  Widget build(BuildContext context) {
    final t = AppLocalizations.of(context);
    final state = widget.cubit.state;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          t.onboardingSports,
          style: Theme.of(context).textTheme.headlineSmall,
        ),
        const SizedBox(height: 8),
        Text(t.onboardingSportsBody),
        const SizedBox(height: 16),

        // The seven, inline rather than behind the sheet: this is the first
        // question and a step that opens a modal to be answered reads as a
        // detour. The member's own word still needs the sheet, which is what
        // the button below is for.
        Wrap(
          spacing: 8,
          runSpacing: 8,
          children: [
            for (final sport in kKnownSports)
              FilterChip(
                label: Text(t.sportName(sport)),
                selected: state.sports.contains(sport),
                onSelected: (on) => unawaited(_toggle(sport, on)),
              ),
            for (final own in state.sports)
              if (!kKnownSports.contains(own))
                InputChip(
                  label: Text(own),
                  selected: true,
                  onDeleted: () => unawaited(_toggle(own, false)),
                ),
          ],
        ),
        const SizedBox(height: 8),
        TextButton.icon(
          onPressed: () async {
            await showSportsPicker(context, widget.cubit);
            if (mounted) setState(() {});
          },
          icon: const Icon(Icons.add),
          label: Text(t.athleteOtherSport),
        ),

        const Divider(height: 32),
        Text(t.athleteSlots, style: Theme.of(context).textTheme.titleMedium),
        const SizedBox(height: 4),
        Text(t.onboardingSlotsBody),
        const SizedBox(height: 12),
        // The slot editor is the same sheet the Athlete screen uses, and
        // deliberately not a second simplified copy: the two would disagree
        // about what a slot is the first time one of them changed.
        FilledButton.icon(
          onPressed: () async {
            await showSlotEditor(context, widget.cubit);
            if (!mounted) return;
            setState(() {});
            // Only once the member has actually set one. A step that reported
            // itself done on a cancelled sheet would skip the question it
            // exists to ask — and the walkthrough is skippable by its own
            // Next button anyway, which is where "not now" belongs.
            if (widget.cubit.state.slots.isNotEmpty) widget.onDone();
          },
          icon: const Icon(Icons.schedule),
          label: Text(
            state.slots.isEmpty
                ? t.athleteSetSlots
                : '${t.athleteSlots} · ${state.slots.length}',
          ),
        ),
      ],
    );
  }

  Future<void> _toggle(String sport, bool on) async {
    final chosen = [...widget.cubit.state.sports];
    if (on) {
      if (!chosen.contains(sport)) chosen.add(sport);
    } else {
      chosen.remove(sport);
    }
    await widget.cubit.setSports(chosen);
    if (mounted) setState(() {});
  }
}
