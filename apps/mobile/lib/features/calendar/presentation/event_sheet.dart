import 'dart:async';

import 'package:flutter/material.dart';

import '../../../core/db/database.dart';
import '../../../core/recurrence/expander.dart';
import '../../../core/recurrence/rule_words.dart';
import '../../meetings/presentation/repeat_picker.dart';
import '../application/calendar_cubit.dart';

/// Creates or edits a personal event — a birthday, a holiday, a block of focus
/// time (FR-011).
///
/// It lives in the calendar feature rather than in one of its own, because an
/// event has no list of its own: it exists to appear on the calendar, and this
/// sheet is reached from the day it belongs on. A `features/events` slice would
/// be a feature whose only screen is a sheet the calendar opens.
///
/// It shares the meetings feature's [showRepeatPicker], deliberately. FR-011 is
/// that a repeating event ends, skips and moves exactly as a repeating meeting
/// does, and the two editors asking the same question with two pickers is how
/// "the last day of the month" would come to mean two different things.
Future<void> showEventSheet(
  BuildContext context,
  CalendarCubit cubit, {
  LocalCalendarEvent? event,
  DateTime? on,
}) => showModalBottomSheet<void>(
  context: context,
  isScrollControlled: true,
  builder: (_) => Padding(
    padding: EdgeInsets.only(bottom: MediaQuery.of(context).viewInsets.bottom),
    child: _EventSheet(cubit: cubit, event: event, on: on),
  ),
);

class _EventSheet extends StatefulWidget {
  const _EventSheet({required this.cubit, this.event, this.on});

  final CalendarCubit cubit;
  final LocalCalendarEvent? event;

  /// The day the sheet was opened from, so a new event starts on the date the
  /// member was already looking at rather than on today.
  final DateTime? on;

  @override
  State<_EventSheet> createState() => _EventSheetState();
}

class _EventSheetState extends State<_EventSheet> {
  late final TextEditingController _title = TextEditingController(
    text: widget.event?.title ?? '',
  );
  late final TextEditingController _notes = TextEditingController(
    text: widget.event?.notes ?? '',
  );

  late DateTime _date;
  late TimeOfDay _from;
  late TimeOfDay _to;
  late bool _allDay = widget.event?.allDay ?? false;
  late String? _color = widget.event?.color;
  RepeatSpec? _repeat;
  String? _rawRule;
  bool _saving = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    final event = widget.event;
    // The handset's clock for the pickers, because that is the clock the member
    // is looking at while they type; what is stored goes back through `toUtc`
    // and every later read resolves it against the profile's zone.
    final start = (event?.startAt ?? widget.on ?? DateTime.now()).toLocal();
    final end = (event?.endAt ?? start.add(const Duration(hours: 1))).toLocal();
    _date = DateTime(start.year, start.month, start.day);
    _from = TimeOfDay(hour: start.hour, minute: start.minute);
    _to = TimeOfDay(hour: end.hour, minute: end.minute);

    final stored = MeetingRecurrence.decode(event?.recurrenceJson);
    if (stored != null) {
      _repeat = RepeatSpec.parse(stored.rrule);
      if (_repeat == null) _rawRule = stored.rrule;
    }
  }

  @override
  void dispose() {
    _title.dispose();
    _notes.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return SafeArea(
      child: SingleChildScrollView(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              widget.event == null ? 'New event' : 'Event',
              style: theme.textTheme.titleLarge,
            ),
            const SizedBox(height: 12),
            TextField(
              controller: _title,
              autofocus: widget.event == null,
              textCapitalization: TextCapitalization.sentences,
              decoration: const InputDecoration(labelText: 'Title'),
            ),

            const SizedBox(height: 16),
            OutlinedButton.icon(
              icon: const Icon(Icons.event),
              label: Text(_dateText(_date)),
              onPressed: () => unawaited(_pickDate()),
            ),

            SwitchListTile(
              contentPadding: EdgeInsets.zero,
              value: _allDay,
              title: const Text('All day'),
              // FR-011's other shape. A whole-day event is drawn apart from the
              // timed items rather than stretched across them (story 4), which
              // is why this is a flag on the row and not a 00:00–23:59 window.
              onChanged: (on) => setState(() => _allDay = on),
            ),

            if (!_allDay)
              Row(
                children: [
                  Expanded(
                    child: OutlinedButton(
                      onPressed: () => unawaited(_pickTime(from: true)),
                      child: Text('From ${_from.format(context)}'),
                    ),
                  ),
                  const SizedBox(width: 8),
                  Expanded(
                    child: OutlinedButton(
                      onPressed: () => unawaited(_pickTime(from: false)),
                      child: Text('To ${_to.format(context)}'),
                    ),
                  ),
                ],
              ),

            const SizedBox(height: 16),
            Text('Colour', style: theme.textTheme.titleMedium),
            const SizedBox(height: 8),
            Wrap(
              spacing: 8,
              children: [
                for (final hex in kEventColours)
                  GestureDetector(
                    onTap: () => setState(() => _color = hex),
                    child: Container(
                      width: 32,
                      height: 32,
                      decoration: BoxDecoration(
                        color: _hex(hex),
                        shape: BoxShape.circle,
                        border: _color == hex
                            ? Border.all(
                                color: theme.colorScheme.onSurface,
                                width: 3,
                              )
                            : null,
                      ),
                    ),
                  ),
                IconButton(
                  icon: const Icon(Icons.format_color_reset),
                  tooltip: 'No colour',
                  onPressed: () => setState(() => _color = null),
                ),
              ],
            ),

            const SizedBox(height: 8),
            ListTile(
              contentPadding: EdgeInsets.zero,
              leading: const Icon(Icons.repeat),
              title: Text(
                _rawRule ??
                    (_repeat?.describe(
                          Localizations.localeOf(context).languageCode,
                        ) ??
                        'Does not repeat'),
              ),
              trailing: const Icon(Icons.chevron_right),
              onTap: () => unawaited(_pickRepeat()),
            ),

            TextField(
              controller: _notes,
              maxLines: 3,
              minLines: 1,
              textCapitalization: TextCapitalization.sentences,
              decoration: const InputDecoration(labelText: 'Notes'),
            ),

            if (_error != null) ...[
              const SizedBox(height: 8),
              Text(
                _error!,
                style: theme.textTheme.bodyMedium?.copyWith(
                  color: theme.colorScheme.error,
                ),
              ),
            ],

            const SizedBox(height: 16),
            Row(
              children: [
                if (widget.event != null)
                  TextButton(
                    onPressed: () => unawaited(_delete()),
                    child: const Text('Delete'),
                  ),
                const Spacer(),
                FilledButton(
                  onPressed: _saving ? null : () => unawaited(_save()),
                  child: const Text('Save'),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }

  Future<void> _pickDate() async {
    final chosen = await showDatePicker(
      context: context,
      initialDate: _date,
      // Relative to now, never a pinned year: a birthday is in the past and a
      // holiday is in the future, so both bounds are generous.
      firstDate: DateTime.now().subtract(const Duration(days: 36500)),
      lastDate: DateTime.now().add(const Duration(days: 3650)),
    );
    if (chosen == null || !mounted) return;
    setState(() => _date = chosen);
  }

  Future<void> _pickTime({required bool from}) async {
    final chosen = await showTimePicker(
      context: context,
      initialTime: from ? _from : _to,
    );
    if (chosen == null || !mounted) return;
    setState(() {
      if (from) {
        _from = chosen;
        // The end follows the start when the member drags it past it, rather
        // than being refused: the server rejects an end at or before the start,
        // and a sheet that let them save it would show the refusal seconds
        // later with no screen open to explain it.
        if (_minutes(_to) <= _minutes(chosen)) {
          _to = TimeOfDay(
            hour: (chosen.hour + 1) % 24,
            minute: chosen.minute,
          );
        }
      } else {
        _to = chosen;
      }
    });
  }

  Future<void> _pickRepeat() async {
    final chosen = await showRepeatPicker(
      context,
      initial: _repeat,
      startAt: _date,
    );
    if (!mounted) return;
    setState(() {
      _repeat = chosen;
      _rawRule = null;
    });
  }

  ({DateTime startAt, DateTime endAt}) _window() {
    if (_allDay) {
      // Midnight to midnight, so the row *is* a whole day and the expander's
      // length arithmetic agrees with the flag. The server refuses a window
      // that is not positive, which is why this is a day and not a point.
      final start = DateTime(_date.year, _date.month, _date.day);
      return (
        startAt: start.toUtc(),
        endAt: DateTime(_date.year, _date.month, _date.day + 1).toUtc(),
      );
    }
    return (
      startAt: DateTime(
        _date.year,
        _date.month,
        _date.day,
        _from.hour,
        _from.minute,
      ).toUtc(),
      endAt: DateTime(
        _date.year,
        _date.month,
        _date.day,
        _to.hour,
        _to.minute,
      ).toUtc(),
    );
  }

  Future<void> _save() async {
    final title = _title.text.trim();
    if (title.isEmpty) {
      setState(() => _error = 'An event needs a title.');
      return;
    }

    setState(() {
      _saving = true;
      _error = null;
    });

    final window = _window();
    final rrule = _rawRule ?? _repeat?.toRrule();
    final recurrence = rrule == null
        ? null
        : MeetingRecurrence(dtstart: window.startAt, rrule: rrule);

    final existing = widget.event;
    if (existing == null) {
      await widget.cubit.createEvent(
        title: title,
        startAt: window.startAt,
        endAt: window.endAt,
        allDay: _allDay,
        color: _color,
        notes: _notes.text,
        recurrence: recurrence,
      );
    } else {
      await widget.cubit.editEvent(
        existing.id,
        title: title,
        notes: _notes.text,
        startAt: window.startAt,
        endAt: window.endAt,
        allDay: _allDay,
        color: _color,
        clearColor: _color == null,
        recurrence: recurrence,
        clearRecurrence: recurrence == null,
      );
    }

    if (mounted) Navigator.of(context).pop();
  }

  Future<void> _delete() async {
    final event = widget.event;
    if (event == null) return;
    final messenger = ScaffoldMessenger.of(context);
    Navigator.of(context).pop();
    await widget.cubit.deleteEvent(event.id);
    messenger.showSnackBar(
      SnackBar(
        content: Text('Deleted "${event.title}"'),
        action: SnackBarAction(
          label: 'Undo',
          onPressed: () => unawaited(widget.cubit.restoreEvent(event.id)),
        ),
      ),
    );
  }
}

/// The colours the picker offers.
///
/// A list here rather than the operator's `settings.labels.palette`: that
/// palette belongs to Planning's labels and an event is not a label, and a
/// registry key for it is a P5 scope question nobody has asked. A member who
/// wants another colour is a member who wants the web app, which is where a
/// free colour field belongs.
///
/// ponytail: if a member ever asks for their own colour here, the upgrade is a
/// `settings.calendar.eventPalette` key and this constant becomes its default.
const List<String> kEventColours = [
  '#0ea5e9',
  '#22c55e',
  '#eab308',
  '#f97316',
  '#ef4444',
  '#a855f7',
];

int _minutes(TimeOfDay time) => time.hour * 60 + time.minute;

Color _hex(String hex) {
  final cleaned = hex.replaceFirst('#', '');
  final value = int.tryParse(cleaned, radix: 16);
  if (value == null || cleaned.length != 6) return const Color(0xFF475569);
  return Color(0xFF000000 | value);
}

String _dateText(DateTime date) =>
    '${date.year}-${date.month.toString().padLeft(2, '0')}'
    '-${date.day.toString().padLeft(2, '0')}';
