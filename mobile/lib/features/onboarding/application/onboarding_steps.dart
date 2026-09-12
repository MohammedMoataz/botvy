import 'package:flutter/widgets.dart';

/// One step in the first-run walkthrough.
///
/// A registry rather than a fixed list, because later phases add their own:
/// P6 wants to ask which sports the member does, P8 which meals they keep. A
/// hard-coded sequence here would mean every one of those phases editing this
/// file, and the merge conflict would be in the one place that decides what a
/// new member sees.
///
/// A step contributes a widget and nothing else. It does not know its position,
/// it cannot skip ahead, and it reports completion by calling `onDone` — so
/// reordering the walkthrough is reordering a list, not rewriting three
/// screens' worth of navigation.
class OnboardingStep {
  const OnboardingStep({
    required this.id,
    required this.order,
    required this.build,
    this.isNeeded,
  });

  /// Stable across releases: it is what a resumed walkthrough remembers.
  final String id;

  /// Where this step sits. Sparse on purpose — 100, 200, 300 — so a later
  /// phase can insert between two without renumbering either.
  final int order;

  final Widget Function(BuildContext context, VoidCallback onDone) build;

  /// Whether this step applies at all.
  ///
  /// A member who registered with a name and a time zone has already answered
  /// two of these, and asking again is how a walkthrough earns its reputation.
  /// Absent means always shown.
  final Future<bool> Function()? isNeeded;
}

/// Where the steps are collected.
///
/// Registered at boot rather than imported into the walkthrough, so a feature
/// module owns its own step and the onboarding feature does not import every
/// other feature to find them.
class OnboardingRegistry {
  final List<OnboardingStep> _steps = [];

  void register(OnboardingStep step) {
    // Replaced rather than duplicated: hot restart in development runs the
    // registration twice, and two copies of the same step would make the
    // member answer it twice.
    _steps.removeWhere((existing) => existing.id == step.id);
    _steps.add(step);
  }

  /// The steps that apply, in order.
  Future<List<OnboardingStep>> applicable() async {
    final sorted = [..._steps]..sort((a, b) => a.order.compareTo(b.order));
    final out = <OnboardingStep>[];
    for (final step in sorted) {
      if (step.isNeeded == null || await step.isNeeded!()) out.add(step);
    }
    return out;
  }

  /// Everything registered, applicable or not. For tests and diagnostics.
  List<OnboardingStep> get all =>
      [..._steps]..sort((a, b) => a.order.compareTo(b.order));
}
