import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';

import '../../../app/l10n/app_localizations.dart';
import '../../../core/db/database.dart';
import '../application/recurrence.dart';
import '../application/tasks_cubit.dart';
import 'label_editor.dart';
import 'task_sheet.dart';

/// The member's task lists.
///
/// One screen for all six views rather than six screens, because they differ
/// only in which rows they hold and every one of them wants the same row
/// widget, the same swipes and the same editor. A tab bar would fix the number
/// of views; the views are a `switch` on an enum instead, which is what lets
/// "by label" be as many lists as the member has labels.
class TasksPage extends StatelessWidget {
  const TasksPage({super.key});

  @override
  Widget build(BuildContext context) {
    final t = AppLocalizations.of(context);

    return BlocConsumer<TasksCubit, TasksState>(
      listenWhen: (before, after) =>
          after.problem != null && before.problem != after.problem,
      listener: (context, state) {
        // The server's own sentence, or the local duplicate-name refusal. Shown
        // and then cleared, so it does not follow the member to the next screen.
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(state.problem!)),
        );
        context.read<TasksCubit>().clearProblem();
      },
      builder: (context, state) {
        final cubit = context.read<TasksCubit>();

        return Scaffold(
          appBar: AppBar(
            title: Text(_viewTitle(t, state)),
            actions: [
              PopupMenuButton<TaskView>(
                icon: const Icon(Icons.filter_list),
                onSelected: (view) => unawaited(cubit.show(view)),
                itemBuilder: (context) => [
                  PopupMenuItem(value: TaskView.today, child: Text(t.taskToday)),
                  PopupMenuItem(
                    value: TaskView.upcoming,
                    child: Text(t.taskUpcoming),
                  ),
                  PopupMenuItem(
                    value: TaskView.overdue,
                    child: Text(t.taskOverdue),
                  ),
                  PopupMenuItem(
                    value: TaskView.completed,
                    child: Text(t.taskCompleted),
                  ),
                  PopupMenuItem(
                    value: TaskView.deleted,
                    child: Text(t.taskDeleted),
                  ),
                ],
              ),
              IconButton(
                icon: const Icon(Icons.label_outline),
                tooltip: t.labels,
                onPressed: () => unawaited(
                  Navigator.of(context).push(
                    MaterialPageRoute<void>(
                      builder: (_) => BlocProvider.value(
                        value: cubit,
                        child: const LabelEditorPage(),
                      ),
                    ),
                  ),
                ),
              ),
            ],
          ),
          floatingActionButton: FloatingActionButton(
            onPressed: () => unawaited(showTaskSheet(context, cubit)),
            child: const Icon(Icons.add),
          ),
          body: state.loading
              ? const Center(child: CircularProgressIndicator())
              : Column(
                  children: [
                    if (state.labels.isNotEmpty) _LabelFilters(state: state),
                    Expanded(child: _TaskList(state: state)),
                  ],
                ),
        );
      },
    );
  }

  String _viewTitle(AppLocalizations t, TasksState state) =>
      switch (state.view) {
        TaskView.today => t.taskToday,
        TaskView.upcoming => t.taskUpcoming,
        TaskView.overdue => t.taskOverdue,
        TaskView.completed => t.taskCompleted,
        TaskView.deleted => t.taskDeleted,
        TaskView.label => t.taskByLabel,
      };
}

/// The label chips, with each label's open count.
///
/// The count comes from one grouped query on the state rather than a query per
/// chip: a member with fifteen labels would otherwise pay fifteen round trips
/// to the database on every rebuild of a row.
class _LabelFilters extends StatelessWidget {
  const _LabelFilters({required this.state});

  final TasksState state;

  @override
  Widget build(BuildContext context) {
    final cubit = context.read<TasksCubit>();
    return SingleChildScrollView(
      scrollDirection: Axis.horizontal,
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
      child: Row(
        children: [
          for (final label in state.labels)
            Padding(
              padding: const EdgeInsetsDirectional.only(end: 8),
              child: FilterChip(
                avatar: CircleAvatar(
                  backgroundColor: parseHexColor(label.color),
                  radius: 8,
                ),
                label: Text('${label.name} ${state.openCounts[label.id] ?? 0}'),
                selected:
                    state.view == TaskView.label && state.labelId == label.id,
                onSelected: (selected) => unawaited(
                  selected
                      ? cubit.show(TaskView.label, labelId: label.id)
                      : cubit.show(TaskView.today),
                ),
              ),
            ),
        ],
      ),
    );
  }
}

class _TaskList extends StatelessWidget {
  const _TaskList({required this.state});

  final TasksState state;

  @override
  Widget build(BuildContext context) {
    final t = AppLocalizations.of(context);
    if (state.tasks.isEmpty) {
      return Center(child: Text(t.taskNothingHere));
    }

    // Today is the one view with headings, and they are the point of it:
    // today's own work is separated from what slipped, so the eye lands on what
    // is late without the overdue tasks being hidden behind a second tab.
    //
    // Assembled as a flat list of *entries* — a heading marker or a row's task
    // — and then handed to `ListView.builder`. A `ListView(children: [...])`
    // would be shorter and would construct a widget per task on every build:
    // two thousand `_TaskRow`s to show twelve. That is the difference between
    // the 300 ms SC-005 asks for and several seconds, and it is why the entry
    // list holds references rather than widgets.
    final entries = state.view == TaskView.today
        ? _todayEntries(state, t)
        : [for (final task in state.tasks) task];

    return ListView.builder(
      itemCount: entries.length,
      itemBuilder: (context, index) {
        final entry = entries[index];
        if (entry is String) return _Heading(entry);
        if (entry is _Note) {
          return Padding(
            padding: const EdgeInsets.all(16),
            child: Text(entry.text),
          );
        }
        return _TaskRow(task: entry as LocalTask, view: state.view);
      },
    );
  }

  /// Today's rows, with its headings in place.
  List<Object> _todayEntries(TasksState state, AppLocalizations t) {
    final overdue = state.overdueGroup;
    final today = state.todayGroup;
    return [
      if (overdue.isNotEmpty) t.taskOverdue,
      ...overdue,
      t.taskToDoToday,
      // The heading stays even with nothing under it: "nothing due today" is
      // information, where an absent section reads as a list that failed to
      // load.
      if (today.isEmpty) _Note(t.taskNothingToday),
      ...today,
    ];
  }
}

/// A line of body text in the entry list, told apart from a heading by its
/// type. Three lines of class rather than a sentinel value, because the
/// alternative is an `index == 1` special case in the builder.
class _Note {
  const _Note(this.text);

  final String text;
}

class _Heading extends StatelessWidget {
  const _Heading(this.text);

  final String text;

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.fromLTRB(16, 16, 16, 4),
    child: Text(text, style: Theme.of(context).textTheme.titleSmall),
  );
}

/// One task.
///
/// The label's name and colour come from the snapshot on the row, not from a
/// lookup in the label list: that is what the snapshot is for, and it is what
/// lets a list of two thousand render without a join.
class _TaskRow extends StatelessWidget {
  const _TaskRow({required this.task, required this.view});

  final LocalTask task;
  final TaskView view;

  @override
  Widget build(BuildContext context) {
    final t = AppLocalizations.of(context);
    final cubit = context.read<TasksCubit>();

    if (view == TaskView.deleted) {
      return ListTile(
        title: Text(task.title),
        // The status a deleted task had, spelt out. The Deleted view exists to
        // show whether the thing was finished, dropped or never dealt with —
        // which is why a delete never rewrites the status.
        subtitle: Text('${_statusText(t, task.status)} · ${t.taskDeleted}'),
        trailing: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            IconButton(
              icon: const Icon(Icons.restore),
              tooltip: t.taskRestore,
              onPressed: () => unawaited(cubit.restore(task.id)),
            ),
            IconButton(
              icon: const Icon(Icons.delete_forever),
              tooltip: t.taskEraseForGood,
              onPressed: () => unawaited(cubit.purge(task.id)),
            ),
          ],
        ),
      );
    }

    final row = ListTile(
      leading: task.status == 'open'
          ? IconButton(
              icon: const Icon(Icons.circle_outlined),
              onPressed: () => unawaited(cubit.complete(task.id)),
            )
          : IconButton(
              icon: const Icon(Icons.check_circle),
              onPressed: () => unawaited(cubit.reopen(task.id)),
            ),
      title: Text(
        task.title,
        style: task.status == 'open'
            ? null
            : const TextStyle(decoration: TextDecoration.lineThrough),
      ),
      subtitle: _subtitle(context, t),
      trailing: _PriorityMark(priority: task.priority),
      onTap: () => unawaited(showTaskSheet(context, cubit, task: task)),
      // Long press deletes, with the undo in the same message. Deliberately
      // not a third swipe direction: there are only two, and losing a task to
      // a mis-swipe is a worse trade than one extra gesture.
      onLongPress: () => unawaited(deleteTaskWithUndo(context, cubit, task)),
    );

    // Swipe to complete one way and to cancel the other. `confirmDismiss`
    // rather than `onDismissed`: the row is not removed from the list by the
    // gesture but by the re-read the write triggers, and letting Dismissible
    // remove it too would leave the list one widget short of its data.
    return Dismissible(
      key: ValueKey(task.id),
      background: _SwipeHint(
        icon: Icons.check,
        label: t.taskComplete,
        alignment: AlignmentDirectional.centerStart,
      ),
      secondaryBackground: _SwipeHint(
        icon: Icons.block,
        label: t.taskCancel,
        alignment: AlignmentDirectional.centerEnd,
      ),
      confirmDismiss: (direction) async {
        if (direction == DismissDirection.startToEnd) {
          await cubit.complete(task.id);
        } else {
          await cubit.cancel(task.id);
        }
        return false;
      },
      child: row,
    );
  }

  Widget? _subtitle(BuildContext context, AppLocalizations t) {
    final pieces = <String>[
      if (task.dueAt != null)
        task.allDay
            ? _dateText(task.dueAt!)
            : '${_dateText(task.dueAt!)} ${_timeText(context, task.dueAt!)}',
      if (task.recurrenceJson != null &&
          Recurrence.decode(task.recurrenceJson) != null)
        t.taskRepeats,
      if (task.estimatedMinutes != null) '${task.estimatedMinutes} min',
      // How many times the member has pushed this forward. Shown because that
      // is the point of counting it: five carries is a task that needs
      // breaking up, not another day.
      if (task.deferCount > 0) t.taskCarriedOver(task.deferCount),
      if (task.completedAt != null)
        '${t.taskCompleted} ${_dateText(task.completedAt!)}',
      // The row has an edit this device has not managed to upload. Said out
      // loud, because an edit that is quietly not being saved is the worst
      // thing this screen can do.
      if (task.pendingOp != null) t.taskNotSyncedYet,
    ];

    if (pieces.isEmpty && task.labelName == null) return null;

    return Row(
      children: [
        if (task.labelName != null) ...[
          Container(
            width: 8,
            height: 8,
            decoration: BoxDecoration(
              color: parseHexColor(task.labelColor),
              shape: BoxShape.circle,
            ),
          ),
          const SizedBox(width: 6),
          Text(task.labelName!),
          if (pieces.isNotEmpty) const Text(' · '),
        ],
        Expanded(child: Text(pieces.join(' · '), overflow: TextOverflow.ellipsis)),
      ],
    );
  }
}

/// 1 highest … 4 none, exactly as the server numbers them.
class _PriorityMark extends StatelessWidget {
  const _PriorityMark({required this.priority});

  final int priority;

  @override
  Widget build(BuildContext context) {
    if (priority >= 4) return const SizedBox.shrink();
    final scheme = Theme.of(context).colorScheme;
    return Icon(
      Icons.flag,
      size: 18,
      color: switch (priority) {
        1 => scheme.error,
        2 => scheme.tertiary,
        _ => scheme.outline,
      },
    );
  }
}

class _SwipeHint extends StatelessWidget {
  const _SwipeHint({
    required this.icon,
    required this.label,
    required this.alignment,
  });

  final IconData icon;
  final String label;
  final AlignmentDirectional alignment;

  @override
  Widget build(BuildContext context) => Container(
    color: Theme.of(context).colorScheme.surfaceContainerHighest,
    padding: const EdgeInsets.symmetric(horizontal: 20),
    alignment: alignment,
    child: Row(
      mainAxisSize: MainAxisSize.min,
      children: [Icon(icon), const SizedBox(width: 8), Text(label)],
    ),
  );
}

/// Deletes with the undo offered in the same message.
///
/// The undo is the delete's whole safety net and it restores the task *exactly*
/// as it was, status included — which is only possible because a delete never
/// touched the status in the first place.
Future<void> deleteTaskWithUndo(
  BuildContext context,
  TasksCubit cubit,
  LocalTask task,
) async {
  final t = AppLocalizations.of(context);
  final messenger = ScaffoldMessenger.of(context);
  await cubit.delete(task.id);
  messenger.showSnackBar(
    SnackBar(
      content: Text(t.taskDeletedMessage(task.title)),
      action: SnackBarAction(
        label: t.undo,
        onPressed: () => unawaited(cubit.restore(task.id)),
      ),
    ),
  );
}

String _statusText(AppLocalizations t, String status) => switch (status) {
  'completed' => t.taskCompleted,
  'cancelled' => t.taskCancelled,
  _ => t.taskOpen,
};

String _dateText(DateTime instant) {
  final local = instant.toLocal();
  return '${local.year}-${local.month.toString().padLeft(2, '0')}-'
      '${local.day.toString().padLeft(2, '0')}';
}

String _timeText(BuildContext context, DateTime instant) =>
    TimeOfDay.fromDateTime(instant.toLocal()).format(context);

/// `#rrggbb` to a [Color].
///
/// A string rather than an index into the palette, because the palette is an
/// operator setting and may change under a label that was already given one of
/// its colours.
Color parseHexColor(String? hex) {
  final cleaned = (hex ?? '').replaceFirst('#', '');
  final value = int.tryParse(cleaned, radix: 16);
  if (value == null || cleaned.length != 6) return const Color(0xFF475569);
  return Color(0xFF000000 | value);
}
