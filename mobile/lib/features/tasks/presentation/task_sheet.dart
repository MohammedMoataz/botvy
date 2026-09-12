import 'dart:async';

import 'package:flutter/material.dart';

import '../../../app/l10n/app_localizations.dart';
import '../../../core/db/database.dart';
import '../application/recurrence.dart';
import '../application/tasks_cubit.dart';
import 'tasks_page.dart' show deleteTaskWithUndo, parseHexColor;

/// Creates or edits a task.
///
/// A bottom sheet rather than a page, and one sheet for both, because a task is
/// six fields and every one of them is optional except the title: a member
/// typing "call the dentist" should be able to save on the first line, and a
/// member who wants a date, a time, a priority, a label, a repeat and an
/// estimate should not have to go anywhere else for them.
///
/// The save is local and immediate. Nothing here awaits the network, which is
/// what makes creating a task in airplane mode indistinguishable from creating
/// one on wifi.
Future<void> showTaskSheet(
  BuildContext context,
  TasksCubit cubit, {
  LocalTask? task,
}) => showModalBottomSheet<void>(
  context: context,
  isScrollControlled: true,
  builder: (_) => Padding(
    // The keyboard's own inset. Without it the title field is under the
    // keyboard on every phone smaller than the one it was built on.
    padding: EdgeInsets.only(
      bottom: MediaQuery.of(context).viewInsets.bottom,
    ),
    child: _TaskSheet(cubit: cubit, task: task),
  ),
);

class _TaskSheet extends StatefulWidget {
  const _TaskSheet({required this.cubit, this.task});

  final TasksCubit cubit;
  final LocalTask? task;

  @override
  State<_TaskSheet> createState() => _TaskSheetState();
}

class _TaskSheetState extends State<_TaskSheet> {
  late final TextEditingController _title = TextEditingController(
    text: widget.task?.title ?? '',
  );
  late final TextEditingController _notes = TextEditingController(
    text: widget.task?.notes ?? '',
  );

  DateTime? _dueDate;
  TimeOfDay? _dueTime;
  late int _priority = widget.task?.priority ?? 4;
  late String? _labelId = widget.task?.labelId;
  late String? _repeat = _repeatOf(widget.task);
  late int? _estimate = widget.task?.estimatedMinutes;

  @override
  void initState() {
    super.initState();
    final due = widget.task?.dueAt?.toLocal();
    if (due != null) {
      _dueDate = DateTime(due.year, due.month, due.day);
      // A date with no time is an all-day task, and an all-day task alarms
      // once, at the moment the row carries — so the time picker stays empty
      // rather than defaulting to something the member never chose.
      if (widget.task?.allDay == false) {
        _dueTime = TimeOfDay(hour: due.hour, minute: due.minute);
      }
    }
  }

  @override
  void dispose() {
    _title.dispose();
    _notes.dispose();
    super.dispose();
  }

  static String? _repeatOf(LocalTask? task) {
    final rule = Recurrence.decode(task?.recurrenceJson);
    if (rule == null) return null;
    for (final entry in kRepeatChoices.entries) {
      if (entry.value == rule.rrule) return entry.key;
    }
    // A rule this build's picker cannot express — one the web app or the chat
    // extractor made. Left unselected rather than mapped to the nearest offer,
    // because saving would then rewrite the member's rule into a different one.
    return null;
  }

  @override
  Widget build(BuildContext context) {
    final t = AppLocalizations.of(context);
    final state = widget.cubit.state;

    return SafeArea(
      child: SingleChildScrollView(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            TextField(
              controller: _title,
              autofocus: widget.task == null,
              textCapitalization: TextCapitalization.sentences,
              decoration: InputDecoration(labelText: t.taskTitle),
              onSubmitted: (_) => unawaited(_save()),
            ),
            const SizedBox(height: 12),
            TextField(
              controller: _notes,
              maxLines: 3,
              minLines: 1,
              decoration: InputDecoration(labelText: t.taskNotes),
            ),
            const SizedBox(height: 12),

            Row(
              children: [
                Expanded(
                  child: OutlinedButton.icon(
                    icon: const Icon(Icons.calendar_today, size: 18),
                    label: Text(
                      _dueDate == null ? t.taskNoDate : _dateLabel(_dueDate!),
                    ),
                    onPressed: _pickDate,
                  ),
                ),
                const SizedBox(width: 8),
                Expanded(
                  child: OutlinedButton.icon(
                    icon: const Icon(Icons.schedule, size: 18),
                    label: Text(
                      _dueTime == null
                          ? t.taskAllDay
                          : _dueTime!.format(context),
                    ),
                    // A time with no date would be a moment nobody can name.
                    // Disabled rather than silently assuming today: assuming
                    // is how a task lands on a day the member did not pick.
                    onPressed: _dueDate == null ? null : _pickTime,
                  ),
                ),
              ],
            ),
            if (_dueDate != null)
              Align(
                alignment: AlignmentDirectional.centerStart,
                child: TextButton(
                  onPressed: () => setState(() {
                    _dueDate = null;
                    _dueTime = null;
                  }),
                  child: Text(t.taskClearDate),
                ),
              ),

            const SizedBox(height: 8),
            Text(t.taskPriority, style: Theme.of(context).textTheme.bodySmall),
            Wrap(
              spacing: 8,
              children: [
                for (final level in [1, 2, 3, 4])
                  ChoiceChip(
                    label: Text(_priorityLabel(t, level)),
                    selected: _priority == level,
                    onSelected: (_) => setState(() => _priority = level),
                  ),
              ],
            ),

            const SizedBox(height: 12),
            Text(t.labels, style: Theme.of(context).textTheme.bodySmall),
            Wrap(
              spacing: 8,
              children: [
                ChoiceChip(
                  label: Text(t.taskNoLabel),
                  selected: _labelId == null,
                  onSelected: (_) => setState(() => _labelId = null),
                ),
                for (final label in state.labels)
                  ChoiceChip(
                    avatar: CircleAvatar(
                      backgroundColor: parseHexColor(label.color),
                      radius: 8,
                    ),
                    label: Text(label.name),
                    selected: _labelId == label.id,
                    onSelected: (_) => setState(() => _labelId = label.id),
                  ),
              ],
            ),

            const SizedBox(height: 12),
            Text(t.taskRepeat, style: Theme.of(context).textTheme.bodySmall),
            Wrap(
              spacing: 8,
              children: [
                ChoiceChip(
                  label: Text(t.taskNoRepeat),
                  selected: _repeat == null,
                  onSelected: (_) => setState(() => _repeat = null),
                ),
                for (final choice in kRepeatChoices.keys)
                  ChoiceChip(
                    label: Text(choice),
                    selected: _repeat == choice,
                    onSelected: (_) => setState(() => _repeat = choice),
                  ),
              ],
            ),

            const SizedBox(height: 12),
            Text(t.taskEstimate, style: Theme.of(context).textTheme.bodySmall),
            Wrap(
              spacing: 8,
              children: [
                for (final minutes in [null, 15, 30, 60, 120])
                  ChoiceChip(
                    label: Text(minutes == null ? t.taskNoEstimate : '$minutes'),
                    selected: _estimate == minutes,
                    onSelected: (_) => setState(() => _estimate = minutes),
                  ),
              ],
            ),

            const SizedBox(height: 20),
            FilledButton(onPressed: _save, child: Text(t.save)),
            if (widget.task != null)
              TextButton(
                onPressed: () async {
                  final navigator = Navigator.of(context);
                  await deleteTaskWithUndo(context, widget.cubit, widget.task!);
                  navigator.pop();
                },
                child: Text(t.delete),
              ),
          ],
        ),
      ),
    );
  }

  Future<void> _pickDate() async {
    final now = DateTime.now();
    final picked = await showDatePicker(
      context: context,
      initialDate: _dueDate ?? now,
      // Five years back and forward. A range rather than none, because
      // `showDatePicker` requires one, and one wide enough that nobody hits it.
      firstDate: DateTime(now.year - 5),
      lastDate: DateTime(now.year + 5),
    );
    if (picked != null) setState(() => _dueDate = picked);
  }

  Future<void> _pickTime() async {
    final picked = await showTimePicker(
      context: context,
      initialTime: _dueTime ?? const TimeOfDay(hour: 9, minute: 0),
    );
    if (picked != null) setState(() => _dueTime = picked);
  }

  Future<void> _save() async {
    if (_title.text.trim().isEmpty) return;
    final navigator = Navigator.of(context);

    // The due moment is built in the *handset's* local zone and stored as UTC.
    // That is the right zone here and only here: the member is looking at a
    // date picker on this device, so "17:00" means 17:00 where they are
    // standing. Every *read* of a due time resolves against the profile's zone
    // instead — the two are the same on the common path and deliberately not
    // conflated.
    final dueAt = _dueDate == null
        ? null
        : DateTime(
            _dueDate!.year,
            _dueDate!.month,
            _dueDate!.day,
            _dueTime?.hour ?? 0,
            _dueTime?.minute ?? 0,
          );
    final allDay = _dueTime == null;
    final rrule = _repeat == null ? null : kRepeatChoices[_repeat];
    final recurrence = rrule == null
        ? null
        : Recurrence(
            // `dtstart` is the series' own start, so a repeat with no date
            // starts now rather than at the epoch.
            dtstart: (dueAt ?? DateTime.now()).toUtc(),
            rrule: rrule,
            mode: RecurrenceMode.schedule,
            exdates: Recurrence.decode(widget.task?.recurrenceJson)?.exdates ??
                const [],
          );

    if (widget.task == null) {
      await widget.cubit.create(
        title: _title.text,
        notes: _notes.text,
        dueAt: dueAt,
        allDay: allDay,
        priority: _priority,
        labelId: _labelId,
        recurrence: recurrence,
        estimatedMinutes: _estimate,
      );
    } else {
      await widget.cubit.edit(
        widget.task!.id,
        title: _title.text,
        notes: _notes.text,
        dueAt: dueAt,
        clearDueAt: dueAt == null,
        allDay: allDay,
        priority: _priority,
        labelId: _labelId,
        clearLabel: _labelId == null,
        recurrence: recurrence,
        clearRecurrence: recurrence == null,
        estimatedMinutes: _estimate,
      );
    }

    navigator.pop();
  }

  String _priorityLabel(AppLocalizations t, int level) => switch (level) {
    1 => t.priorityHighest,
    2 => t.priorityHigh,
    3 => t.priorityNormal,
    _ => t.priorityNone,
  };

  String _dateLabel(DateTime date) =>
      '${date.year}-${date.month.toString().padLeft(2, '0')}-'
      '${date.day.toString().padLeft(2, '0')}';
}
