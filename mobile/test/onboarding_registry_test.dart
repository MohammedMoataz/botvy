import 'package:botvy/features/onboarding/application/onboarding_steps.dart';
import 'package:flutter/widgets.dart';
import 'package:flutter_test/flutter_test.dart';

OnboardingStep _step(
  String id,
  int order, {
  Future<bool> Function()? isNeeded,
}) => OnboardingStep(
  id: id,
  order: order,
  isNeeded: isNeeded,
  build: (context, onDone) => const SizedBox.shrink(),
);

void main() {
  late OnboardingRegistry registry;

  setUp(() => registry = OnboardingRegistry());

  /// The whole point of the registry: a later phase contributes a step without
  /// editing the walkthrough, and the order it lands in is the order it asked
  /// for rather than the order it registered.
  test('steps come back in order, not in registration order', () async {
    registry
      ..register(_step('third', 300))
      ..register(_step('first', 100))
      ..register(_step('second', 200));

    final steps = await registry.applicable();

    expect(steps.map((s) => s.id), ['first', 'second', 'third']);
  });

  /// Orders are sparse so a phase can insert between two without renumbering
  /// either — which would otherwise be a change to somebody else's file.
  test('a step can be inserted between two existing ones', () async {
    registry
      ..register(_step('name', 100))
      ..register(_step('times', 300))
      ..register(_step('sports', 200));

    final steps = await registry.applicable();

    expect(steps.map((s) => s.id), ['name', 'sports', 'times']);
  });

  /// Asking a member something they already answered at registration is how a
  /// walkthrough earns its reputation.
  test('a step that is not needed is left out', () async {
    registry
      ..register(_step('always', 100))
      ..register(_step('answered', 200, isNeeded: () async => false));

    final steps = await registry.applicable();

    expect(steps.map((s) => s.id), ['always']);
  });

  test('a step with no isNeeded is always included', () async {
    registry.register(_step('always', 100));

    expect((await registry.applicable()).map((s) => s.id), ['always']);
  });

  /// Hot restart in development runs registration twice. Two copies of one
  /// step would make the member answer it twice.
  test('registering the same id twice leaves one step', () async {
    registry
      ..register(_step('name', 100))
      ..register(_step('name', 100));

    expect(await registry.applicable(), hasLength(1));
  });

  /// The replacement wins, so a hot restart picks up the edited version rather
  /// than the one that was already there.
  test('re-registering an id replaces it', () async {
    registry
      ..register(_step('name', 100))
      ..register(_step('name', 900));

    expect(registry.all.single.order, 900);
  });

  test('an empty registry is an empty walkthrough, not an error', () async {
    expect(await registry.applicable(), isEmpty);
  });
}
