import 'dart:async';
import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';

import '../../../app/l10n/app_localizations.dart';
import '../../../core/db/database.dart';
import '../application/nutrition_cubit.dart';

/// The member's meals, and what today says about food (T841).
///
/// One screen and not two: the day's line sits above the library because the
/// library is *what the line is made of* in "my meals" mode, and a member
/// wondering why their day looks thin should find the answer — an empty list —
/// on the same screen rather than somewhere else.
class NutritionPage extends StatefulWidget {
  const NutritionPage({super.key});

  @override
  State<NutritionPage> createState() => _NutritionPageState();
}

class _NutritionPageState extends State<NutritionPage> {
  @override
  void initState() {
    super.initState();
    unawaited(context.read<NutritionCubit>().refresh());
  }

  @override
  Widget build(BuildContext context) {
    final t = AppLocalizations.of(context);

    return BlocConsumer<NutritionCubit, NutritionState>(
      listenWhen: (before, after) =>
          after.problem != null && before.problem != after.problem,
      listener: (context, state) {
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text(state.problem!)));
        context.read<NutritionCubit>().clearProblem();
      },
      builder: (context, state) {
        final cubit = context.read<NutritionCubit>();

        return Scaffold(
          appBar: AppBar(title: Text(t.nutritionTitle)),
          floatingActionButton: FloatingActionButton.extended(
            onPressed: () => _editMeal(context, cubit, null),
            icon: const Icon(Icons.add),
            label: Text(t.nutritionAdd),
          ),
          body: state.loading
              ? const Center(child: CircularProgressIndicator())
              : RefreshIndicator(
                  onRefresh: cubit.refresh,
                  child: ListView(
                    padding: const EdgeInsets.only(bottom: 96),
                    children: [
                      _TodayCard(state: state),
                      _KindFilter(state: state),
                      if (state.meals.isEmpty)
                        _Empty(t: t)
                      else
                        for (final meal in state.meals)
                          _MealTile(
                            meal: meal,
                            onEdit: () => _editMeal(context, cubit, meal),
                            onDelete: () => cubit.remove(meal.id),
                          ),
                    ],
                  ),
                ),
        );
      },
    );
  }

  /// The editor, for a new meal or an existing one.
  ///
  /// One sheet for both, because the fields are the same and a second form is a
  /// second place for a validation rule to be missing from.
  Future<void> _editMeal(
    BuildContext context,
    NutritionCubit cubit,
    LocalMeal? meal,
  ) async {
    final t = AppLocalizations.of(context);
    final name = TextEditingController(text: meal?.name ?? '');
    final ingredients = TextEditingController(
      text: meal == null
          ? ''
          : (jsonDecode(meal.ingredientsJson) as List).join(', '),
    );
    var kind = meal?.kind ?? 'any';

    final saved = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      builder: (sheet) => Padding(
        padding: EdgeInsets.only(
          left: 16,
          right: 16,
          top: 16,
          bottom: MediaQuery.of(sheet).viewInsets.bottom + 16,
        ),
        child: StatefulBuilder(
          builder: (sheet, setSheetState) => Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              TextField(
                controller: name,
                autofocus: true,
                decoration: InputDecoration(labelText: t.nutritionName),
              ),
              const SizedBox(height: 12),
              TextField(
                controller: ingredients,
                decoration: InputDecoration(
                  labelText: t.nutritionIngredients,
                  // Said plainly rather than left as a blank box: the allergen
                  // check on the server reads the name **and** the ingredients
                  // together, so a member whose "mum's stew" contains peanuts
                  // is protected only if they wrote that down.
                  helperText: t.nutritionIngredientsHelp,
                  helperMaxLines: 2,
                ),
              ),
              const SizedBox(height: 12),
              Wrap(
                spacing: 8,
                children: [
                  for (final option in mealKinds)
                    ChoiceChip(
                      label: Text(t.nutritionKind(option)),
                      selected: kind == option,
                      onSelected: (_) => setSheetState(() => kind = option),
                    ),
                ],
              ),
              const SizedBox(height: 16),
              FilledButton(
                onPressed: () => Navigator.of(sheet).pop(true),
                child: Text(t.nutritionSaveAction),
              ),
            ],
          ),
        ),
      ),
    );

    if (saved != true) return;
    final parts = [
      for (final part in ingredients.text.split(','))
        if (part.trim().isNotEmpty) part.trim(),
    ];

    if (meal == null) {
      await cubit.add(name.text, kind: kind, ingredients: parts);
    } else {
      await cubit.edit(
        meal.id,
        name: name.text,
        kind: kind,
        ingredients: parts,
      );
    }
  }
}

/// Today's half, with the two things a member can do about it (FR-010).
class _TodayCard extends StatelessWidget {
  const _TodayCard({required this.state});

  final NutritionState state;

  @override
  Widget build(BuildContext context) {
    final t = AppLocalizations.of(context);
    final cubit = context.read<NutritionCubit>();
    final today = state.today;

    return Card(
      margin: const EdgeInsets.fromLTRB(12, 12, 12, 4),
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              t.nutritionTodayTitle,
              style: Theme.of(context).textTheme.titleMedium,
            ),
            const SizedBox(height: 8),
            Text(
              today.hasMeals
                  ? today.line!
                  // A code, rendered here. `nutritionWithheld` answers the
                  // plain "nothing planned yet" for a null, which is a day
                  // nobody has chosen rather than a day that was refused.
                  : t.nutritionWithheld(today.reason),
            ),
            const SizedBox(height: 8),
            Text(
              state.mode == 'library' ? t.nutritionModeLibrary : t.nutritionModeLlm,
              style: Theme.of(context).textTheme.labelMedium,
            ),
            const SizedBox(height: 8),
            Row(
              children: [
                TextButton.icon(
                  onPressed: state.busy ? null : cubit.regenerateToday,
                  icon: const Icon(Icons.refresh),
                  label: Text(t.nutritionRegenerate),
                ),
                if (today.hasMeals && state.meals.isNotEmpty)
                  TextButton.icon(
                    onPressed: state.busy
                        ? null
                        : () => _pickMine(context, cubit, state),
                    icon: const Icon(Icons.swap_horiz),
                    label: Text(t.nutritionUseMine),
                  ),
              ],
            ),
          ],
        ),
      ),
    );
  }

  /// Which slot, then which meal — in that order, because the slot is the thing
  /// being replaced and a member who picks a meal first has already forgotten
  /// what it is replacing.
  Future<void> _pickMine(
    BuildContext context,
    NutritionCubit cubit,
    NutritionState state,
  ) async {
    final names = state.today.line!.split(', ');

    final slot = await showModalBottomSheet<int>(
      context: context,
      builder: (sheet) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            for (var index = 0; index < names.length; index += 1)
              ListTile(
                title: Text(names[index]),
                onTap: () => Navigator.of(sheet).pop(index),
              ),
          ],
        ),
      ),
    );
    if (slot == null || !context.mounted) return;

    final meal = await showModalBottomSheet<LocalMeal>(
      context: context,
      builder: (sheet) => SafeArea(
        child: ListView(
          shrinkWrap: true,
          children: [
            for (final meal in state.meals)
              ListTile(
                title: Text(meal.name),
                subtitle: Text(AppLocalizations.of(sheet).nutritionKind(meal.kind)),
                onTap: () => Navigator.of(sheet).pop(meal),
              ),
          ],
        ),
      ),
    );
    if (meal == null) return;

    await cubit.replaceToday(slot, meal.id);
  }
}

class _KindFilter extends StatelessWidget {
  const _KindFilter({required this.state});

  final NutritionState state;

  @override
  Widget build(BuildContext context) {
    final t = AppLocalizations.of(context);
    final cubit = context.read<NutritionCubit>();

    return SingleChildScrollView(
      scrollDirection: Axis.horizontal,
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
      child: Row(
        children: [
          for (final kind in mealKinds)
            Padding(
              padding: const EdgeInsets.only(right: 8),
              child: FilterChip(
                label: Text(t.nutritionKind(kind)),
                selected: state.kind == kind,
                onSelected: (on) => cubit.showOnly(on ? kind : null),
              ),
            ),
        ],
      ),
    );
  }
}

class _MealTile extends StatelessWidget {
  const _MealTile({
    required this.meal,
    required this.onEdit,
    required this.onDelete,
  });

  final LocalMeal meal;
  final VoidCallback onEdit;
  final VoidCallback onDelete;

  @override
  Widget build(BuildContext context) {
    final t = AppLocalizations.of(context);
    final ingredients =
        (jsonDecode(meal.ingredientsJson) as List).cast<Object?>();

    return ListTile(
      title: Text(meal.name),
      subtitle: Text(
        [
          t.nutritionKind(meal.kind),
          if (ingredients.isNotEmpty) ingredients.join(', '),
        ].join(' · '),
      ),
      onTap: onEdit,
      trailing: IconButton(
        icon: const Icon(Icons.delete_outline),
        tooltip: t.nutritionDelete,
        onPressed: onDelete,
      ),
    );
  }
}

class _Empty extends StatelessWidget {
  const _Empty({required this.t});

  final AppLocalizations t;

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.all(32),
    child: Column(
      children: [
        Text(t.nutritionEmptyTitle, style: Theme.of(context).textTheme.titleMedium),
        const SizedBox(height: 8),
        Text(t.nutritionEmptyBody, textAlign: TextAlign.center),
      ],
    ),
  );
}
