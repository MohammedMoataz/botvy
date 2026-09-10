import 'dart:async';

import 'package:flutter/material.dart';

import '../../../core/db/database.dart';
import '../../../core/notifications/alert_plan.dart' show decodeStringList;
import '../../../core/notifications/local_notifications.dart'
    show deviceTimezone;
import '../../../core/recurrence/expander.dart';
import '../../../core/recurrence/rule_words.dart';
import '../application/meetings_cubit.dart';
import 'repeat_picker.dart';

/// Where a meeting is. At least one half is required (FR-001), and both are
/// allowed — a room that is also dialled into is one meeting, not two.
enum _Where { online, place, both }

/// Creates or edits a meeting.
///
/// A sheet rather than a page, as the task editor is, and one sheet for both:
/// the difference between creating and editing a meeting is which values the
/// fields start with.
///
/// The save is local and immediate. Nothing here awaits the network, which is
/// what makes creating a meeting in airplane mode indistinguishable from
/// creating one on wifi.
Future<void> showMeetingSheet(
  BuildContext context,
  MeetingsCubit cubit, {
  LocalMeeting? meeting,
}) => showModalBottomSheet<void>(
  context: context,
  isScrollControlled: true,
  builder: (_) => Padding(
    // The keyboard's own inset. Without it the title field is under the
    // keyboard on every phone smaller than the one it was built on.
    padding: EdgeInsets.only(bottom: MediaQuery.of(context).viewInsets.bottom),
    child: _MeetingSheet(cubit: cubit, meeting: meeting),
  ),
);

class _MeetingSheet extends StatefulWidget {
  const _MeetingSheet({required this.cubit, this.meeting});

  final MeetingsCubit cubit;
  final LocalMeeting? meeting;

  @override
  State<_MeetingSheet> createState() => _MeetingSheetState();
}

class _MeetingSheetState extends State<_MeetingSheet> {
  late final TextEditingController _title = TextEditingController(
    text: widget.meeting?.title ?? '',
  );
  late final TextEditingController _description = TextEditingController(
    text: widget.meeting?.description ?? '',
  );
  late final TextEditingController _link = TextEditingController(
    text: MeetingLocation.decode(widget.meeting?.locationJson).onlineLink ?? '',
  );
  late final TextEditingController _address = TextEditingController(
    text: MeetingLocation.decode(widget.meeting?.locationJson).address ?? '',
  );
  late final TextEditingController _prepNotes = TextEditingController(
    text: widget.meeting?.prepNotes ?? '',
  );

  late DateTime _date;
  late TimeOfDay _time;
  late int _durationMin;
  late int _prepMinutes = widget.meeting?.prepMinutes ?? 0;
  late Set<int> _offsets;
  late _Where _where;
  RepeatSpec? _repeat;

  /// The rule as stored, when this build cannot express it in the picker.
  ///
  /// Shown verbatim and left alone rather than rewritten: a `BYSETPOS` rule
  /// from the web app silently turned into "every month" would move a series
  /// the member never touched.
  String? _rawRule;

  /// Non-null when the series is pinned to a place's clock (FR-007).
  String? _lockTimezone;

  /// The handset's own zone name, for the toggle's label — "keep this on
  /// Africa/Cairo's clock". Read once, asynchronously, and only used as the
  /// *offer*: what gets stored is the member's profile zone, which is the one
  /// every other time in the app is resolved against.
  String? _deviceZone;

  bool _saving = false;
  String? _error;

  @override
  void initState() {
    super.initState();

    final meeting = widget.meeting;
    // `toLocal()` here and only here: the pickers work in the handset's clock
    // because that is the clock the member is looking at while they type. What
    // is *stored* goes back through `toUtc`, and every later read resolves it
    // against the profile's zone — see `core/recurrence/expander.dart`.
    final start = (meeting?.startAt ?? _nextHalfHour()).toLocal();
    _date = DateTime(start.year, start.month, start.day);
    _time = TimeOfDay(hour: start.hour, minute: start.minute);
    _durationMin = meeting?.durationMin ?? widget.cubit.state.defaultDurationMin;
    _lockTimezone = meeting?.lockTimezone;

    final location = MeetingLocation.decode(meeting?.locationJson);
    _where = location.onlineLink != null && location.address != null
        ? _Where.both
        : (location.address != null ? _Where.place : _Where.online);

    final stored = MeetingRecurrence.decode(meeting?.recurrenceJson);
    if (stored != null) {
      _repeat = RepeatSpec.parse(stored.rrule);
      if (_repeat == null) _rawRule = stored.rrule;
    }

    _offsets = _initialOffsets(meeting);

    unawaited(_readDeviceZone());
  }

  /// The reminder offsets, in minutes before.
  ///
  /// A meeting that already exists carries its own — stored at creation, so a
  /// later change to the member's defaults never silently moves the warnings of
  /// a meeting that already exists, which is the server's rule too. A new one
  /// starts from the member's `defaults.leadTimes` preference (FR-003), read
  /// from the mirror and converted from the `1h`/`30m` labels the row stores.
  Set<int> _initialOffsets(LocalMeeting? meeting) {
    if (meeting != null) {
      return {
        for (final raw in decodeStringList(meeting.reminderOffsetsJson))
          if (int.tryParse(raw) != null) int.parse(raw),
      };
    }
    return {...widget.cubit.state.defaultReminderOffsets};
  }

  /// The handset's zone, through the helper the scheduler already uses — which
  /// answers `UTC` rather than throwing when the platform cannot say. It is
  /// only ever the *fallback* label: what gets pinned is the profile's zone,
  /// because that is the clock every other time in the app is resolved against.
  Future<void> _readDeviceZone() async {
    final zone = await deviceTimezone();
    if (mounted) setState(() => _deviceZone = zone);
  }

  @override
  void dispose() {
    _title.dispose();
    _description.dispose();
    _link.dispose();
    _address.dispose();
    _prepNotes.dispose();
    super.dispose();
  }

  /// The zone the "keep this on `<place>`'s clock" toggle offers.
  ///
  /// The member's profile zone first, because that is the clock every other
  /// time in the app is resolved against; the handset's only as a fallback for
  /// a member whose profile has not synced yet.
  String get _pinZone =>
      widget.cubit.state.timezone ?? _deviceZone ?? 'this device';

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
              widget.meeting == null ? 'New meeting' : 'Meeting',
              style: theme.textTheme.titleLarge,
            ),
            const SizedBox(height: 12),

            TextField(
              controller: _title,
              autofocus: widget.meeting == null,
              textCapitalization: TextCapitalization.sentences,
              decoration: const InputDecoration(labelText: 'Name'),
            ),
            const SizedBox(height: 8),
            TextField(
              controller: _description,
              maxLines: 3,
              minLines: 1,
              textCapitalization: TextCapitalization.sentences,
              decoration: const InputDecoration(labelText: 'Description'),
            ),

            const SizedBox(height: 16),
            Row(
              children: [
                Expanded(
                  child: OutlinedButton.icon(
                    icon: const Icon(Icons.event),
                    label: Text(_dateText(_date)),
                    onPressed: () => unawaited(_pickDate()),
                  ),
                ),
                const SizedBox(width: 8),
                Expanded(
                  child: OutlinedButton.icon(
                    icon: const Icon(Icons.schedule),
                    label: Text(_time.format(context)),
                    onPressed: () => unawaited(_pickTime()),
                  ),
                ),
              ],
            ),

            const SizedBox(height: 12),
            Row(
              children: [
                const Text('Length'),
                const SizedBox(width: 12),
                DropdownButton<int>(
                  value: _durationLengths.contains(_durationMin)
                      ? _durationMin
                      : null,
                  hint: Text('$_durationMin min'),
                  items: [
                    for (final minutes in _durationLengths)
                      DropdownMenuItem(
                        value: minutes,
                        child: Text(_lengthText(minutes)),
                      ),
                  ],
                  onChanged: (minutes) => setState(
                    () => _durationMin = minutes ?? _durationMin,
                  ),
                ),
              ],
            ),

            const Divider(height: 32),
            Text('Where', style: theme.textTheme.titleMedium),
            const SizedBox(height: 8),
            SegmentedButton<_Where>(
              segments: const [
                ButtonSegment(value: _Where.online, label: Text('Link')),
                ButtonSegment(value: _Where.place, label: Text('Address')),
                ButtonSegment(value: _Where.both, label: Text('Both')),
              ],
              selected: {_where},
              onSelectionChanged: (choice) =>
                  setState(() => _where = choice.first),
            ),
            if (_where != _Where.place) ...[
              const SizedBox(height: 8),
              TextField(
                controller: _link,
                keyboardType: TextInputType.url,
                decoration: const InputDecoration(
                  labelText: 'Joining link',
                  hintText: 'https://…',
                ),
              ),
            ],
            if (_where != _Where.online) ...[
              const SizedBox(height: 8),
              TextField(
                controller: _address,
                textCapitalization: TextCapitalization.sentences,
                decoration: const InputDecoration(labelText: 'Address'),
              ),
            ],

            const Divider(height: 32),
            Text('Preparation', style: theme.textTheme.titleMedium),
            const SizedBox(height: 8),
            Row(
              children: [
                const Text('Time needed'),
                const SizedBox(width: 12),
                DropdownButton<int>(
                  value: _prepLengths.contains(_prepMinutes)
                      ? _prepMinutes
                      : 0,
                  items: [
                    for (final minutes in _prepLengths)
                      DropdownMenuItem(
                        value: minutes,
                        child: Text(minutes == 0 ? 'None' : '$minutes min'),
                      ),
                  ],
                  onChanged: (minutes) =>
                      setState(() => _prepMinutes = minutes ?? 0),
                ),
              ],
            ),
            TextField(
              controller: _prepNotes,
              maxLines: 3,
              minLines: 1,
              textCapitalization: TextCapitalization.sentences,
              decoration: const InputDecoration(labelText: 'What to prepare'),
            ),

            const Divider(height: 32),
            Text('Remind me', style: theme.textTheme.titleMedium),
            const SizedBox(height: 8),
            Wrap(
              spacing: 6,
              children: [
                for (final minutes in _offsetChoices)
                  FilterChip(
                    label: Text(_offsetText(minutes)),
                    selected: _offsets.contains(minutes),
                    onSelected: (on) => setState(() {
                      if (on) {
                        _offsets.add(minutes);
                      } else {
                        _offsets.remove(minutes);
                      }
                    }),
                  ),
              ],
            ),

            const Divider(height: 32),
            ListTile(
              contentPadding: EdgeInsets.zero,
              leading: const Icon(Icons.repeat),
              title: Text(_repeatText()),
              trailing: const Icon(Icons.chevron_right),
              onTap: () => unawaited(_pickRepeat()),
            ),
            if (_rawRule != null)
              Padding(
                padding: const EdgeInsets.only(bottom: 8),
                child: Text(
                  'This repeat was set elsewhere and is kept as it is.',
                  style: theme.textTheme.bodySmall,
                ),
              ),

            // FR-007's travel clause, as one switch. Off is the default and it
            // is the right default: a member's 18:00 routine is at 18:00
            // wherever they are. On is for the meeting that belongs to a place
            // — a class, a clinic appointment, a call with an office that is
            // not moving.
            SwitchListTile(
              contentPadding: EdgeInsets.zero,
              value: _lockTimezone != null,
              title: Text("Keep this on $_pinZone's clock"),
              subtitle: Text(
                _lockTimezone == null
                    ? 'Moves with you when you travel.'
                    : 'Stays at this local time in $_lockTimezone.',
              ),
              onChanged: (on) => setState(() {
                final zone = widget.cubit.state.timezone ?? _deviceZone;
                // Nothing to pin to. Left off rather than pinned to a guess: a
                // series pinned to the wrong zone drifts for ever and the
                // member has no way to see why.
                _lockTimezone = on && zone != null ? zone : null;
              }),
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
                TextButton(
                  onPressed: () => Navigator.of(context).pop(),
                  child: const Text('Cancel'),
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

  String _repeatText() {
    if (_rawRule != null) return _rawRule!;
    final repeat = _repeat;
    return repeat == null
        ? 'Does not repeat'
        : repeat.describe(Localizations.localeOf(context).languageCode);
  }

  Future<void> _pickDate() async {
    final chosen = await showDatePicker(
      context: context,
      initialDate: _date,
      // Relative to today, never a pinned year. A meeting in the past can
      // still be recorded — FR-013 says so — so the lower bound is generous
      // rather than "today".
      firstDate: DateTime.now().subtract(const Duration(days: 730)),
      lastDate: DateTime.now().add(const Duration(days: 3650)),
    );
    if (chosen == null || !mounted) return;
    setState(() => _date = chosen);
  }

  Future<void> _pickTime() async {
    final chosen = await showTimePicker(context: context, initialTime: _time);
    if (chosen == null || !mounted) return;
    setState(() => _time = chosen);
  }

  Future<void> _pickRepeat() async {
    final chosen = await showRepeatPicker(
      context,
      initial: _repeat,
      startAt: _startAt().toLocal(),
    );
    if (!mounted) return;
    setState(() {
      _repeat = chosen;
      // A rule the picker could not read is replaced the moment the member
      // sets one themselves — they have now said what they want, which is the
      // only thing that may overwrite it.
      _rawRule = null;
    });
  }

  DateTime _startAt() => DateTime(
    _date.year,
    _date.month,
    _date.day,
    _time.hour,
    _time.minute,
  ).toUtc();

  MeetingLocation _location() => MeetingLocation(
    onlineLink: _where == _Where.place ? null : _trimToNull(_link.text),
    address: _where == _Where.online ? null : _trimToNull(_address.text),
  );

  /// The recurrence to store, or null for a meeting that does not repeat.
  ///
  /// `dtstart` is the meeting's own start, always. It is what both expanders
  /// anchor the rule on, and a `dtstart` that drifted from `startAt` would put
  /// the series and the meeting on different dates.
  MeetingRecurrence? _recurrence(DateTime startAt) {
    if (_rawRule != null) {
      return MeetingRecurrence(dtstart: startAt, rrule: _rawRule!);
    }
    final repeat = _repeat;
    if (repeat == null) return null;
    return MeetingRecurrence(dtstart: startAt, rrule: repeat.toRrule());
  }

  Future<void> _save() async {
    final title = _title.text.trim();
    final location = _location();

    if (title.isEmpty) {
      setState(() => _error = 'A meeting needs a name.');
      return;
    }
    // FR-001, checked here rather than only on the server: the two failure
    // modes of a meeting with no location are a member who cannot join it and
    // a member who does not know where to go, and neither is recoverable from
    // the row. The server refuses it too — as `invalid`, three seconds later,
    // with no screen still open to say so.
    if (location.isEmpty) {
      setState(() => _error = 'A meeting needs a link or an address.');
      return;
    }

    setState(() {
      _saving = true;
      _error = null;
    });

    final startAt = _startAt();
    final recurrence = _recurrence(startAt);
    final existing = widget.meeting;

    if (existing == null) {
      await widget.cubit.create(
        title: title,
        startAt: startAt,
        location: location,
        description: _description.text,
        durationMin: _durationMin,
        lockTimezone: _lockTimezone,
        prepNotes: _prepNotes.text,
        prepMinutes: _prepMinutes,
        reminderOffsets: _offsets.toList(),
        recurrence: recurrence,
      );
      if (mounted) Navigator.of(context).pop();
      return;
    }

    // The repeat goes first and separately, because it is the one edit that can
    // be refused: a rule change that would discard an occurrence the member
    // moved is confirmed before anything is written. Doing the details first
    // would leave them saved and the dialog still open, so a member who said
    // "no" would find half their edit applied.
    final orphans = await widget.cubit.editSeries(existing.id, recurrence);
    if (orphans.isNotEmpty) {
      if (!mounted) return;
      final confirmed = await _confirmDiscard(orphans);
      if (!confirmed) {
        if (mounted) setState(() => _saving = false);
        return;
      }
      await widget.cubit.editSeries(existing.id, recurrence, force: true);
    }

    await widget.cubit.edit(
      existing.id,
      title: title,
      description: _description.text,
      startAt: startAt,
      durationMin: _durationMin,
      location: location,
      prepNotes: _prepNotes.text,
      prepMinutes: _prepMinutes,
      reminderOffsets: _offsets.toList(),
      lockTimezone: _lockTimezone,
      clearLockTimezone: _lockTimezone == null,
    );

    if (mounted) Navigator.of(context).pop();
  }

  /// The warning before a series edit discards a moved occurrence.
  ///
  /// The spec's edge case, and the reason the cubit refuses the edit rather
  /// than applying it: a moved occurrence is the member's own decision about a
  /// particular date, and losing it without being asked is exactly the
  /// "damaged the series" failure this phase exists to avoid. The moments are
  /// named, because "one or more occurrences" is not something anybody can
  /// answer.
  Future<bool> _confirmDiscard(List<DateTime> orphans) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: const Text('Discard moved occurrences?'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              'This repeat no longer includes '
              '${orphans.length == 1 ? 'a date' : '${orphans.length} dates'} '
              'you had moved:',
            ),
            const SizedBox(height: 8),
            for (final moment in orphans.take(5))
              Text('· ${_dateText(moment.toLocal())}'),
            if (orphans.length > 5) Text('· and ${orphans.length - 5} more'),
          ],
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(dialogContext).pop(false),
            child: const Text('Keep the old repeat'),
          ),
          FilledButton(
            onPressed: () => Navigator.of(dialogContext).pop(true),
            child: const Text('Discard and save'),
          ),
        ],
      ),
    );
    return confirmed ?? false;
  }
}

/// The next half hour, which is what a new meeting starts at.
DateTime _nextHalfHour() {
  final now = DateTime.now();
  final minute = now.minute < 30 ? 30 : 60;
  return DateTime(now.year, now.month, now.day, now.hour, minute).toUtc();
}

/// The lengths the dropdown offers. A meeting is at most eight hours — the
/// server's own bound — because a whole day is a personal event (FR-001).
const List<int> _durationLengths = [15, 30, 45, 60, 90, 120, 180, 240, 480];

const List<int> _prepLengths = [0, 5, 10, 15, 30, 45, 60, 120];

/// Minutes before the occurrence. `0` is "at the time it starts", which the
/// server labels `0m` and treats as the member's own moment — the one alert
/// quiet hours may never move.
const List<int> _offsetChoices = [1440, 60, 30, 10, 0];

String _offsetText(int minutes) => switch (minutes) {
  0 => 'At the time',
  1440 => '1 day before',
  60 => '1 hour before',
  _ => '$minutes min before',
};

String _lengthText(int minutes) =>
    minutes < 60 ? '$minutes min' : '${minutes ~/ 60} h';

String _dateText(DateTime date) =>
    '${date.year}-${date.month.toString().padLeft(2, '0')}'
    '-${date.day.toString().padLeft(2, '0')}';

String? _trimToNull(String value) {
  final trimmed = value.trim();
  return trimmed.isEmpty ? null : trimmed;
}
