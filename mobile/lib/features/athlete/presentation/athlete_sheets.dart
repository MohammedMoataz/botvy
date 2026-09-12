import 'package:flutter/material.dart';
import 'package:uuid/uuid.dart';

import '../../../app/l10n/app_localizations.dart';
import '../application/athlete.dart';
import '../application/athlete_cubit.dart';

const Uuid _uuid = Uuid();

/// The sports picker: the seven, plus the member's own word (FR-001).
///
/// The custom sport is a **text field and not a bucket**, which is the one
/// thing about this screen worth stating: storing the literal `other` would
/// lose the only part the member actually told us. A member whose sport is
/// padel picks nothing from the list, types `padel`, and sees `padel`
/// everywhere afterwards.
Future<void> showSportsPicker(BuildContext context, AthleteCubit cubit) =>
    showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      builder: (sheet) => _SportsSheet(cubit: cubit),
    );

class _SportsSheet extends StatefulWidget {
  const _SportsSheet({required this.cubit});

  final AthleteCubit cubit;

  @override
  State<_SportsSheet> createState() => _SportsSheetState();
}

class _SportsSheetState extends State<_SportsSheet> {
  late final List<String> _chosen = [...widget.cubit.state.sports];
  final _custom = TextEditingController();

  @override
  void dispose() {
    _custom.dispose();
    super.dispose();
  }

  /// Whatever the member typed that is not one of the seven, so it can be
  /// listed as a chip of its own and removed like any other.
  List<String> get _ownWords => [
    for (final sport in _chosen)
      if (!kKnownSports.contains(sport)) sport,
  ];

  @override
  Widget build(BuildContext context) {
    final t = AppLocalizations.of(context);

    return Padding(
      padding: EdgeInsets.only(
        left: 16,
        right: 16,
        top: 16,
        // The keyboard's own height, so the text field is not covered by it.
        bottom: 16 + MediaQuery.viewInsetsOf(context).bottom,
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            t.athleteChooseSports,
            style: Theme.of(context).textTheme.titleMedium,
          ),
          const SizedBox(height: 12),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: [
              for (final sport in kKnownSports)
                FilterChip(
                  label: Text(t.sportName(sport)),
                  selected: _chosen.contains(sport),
                  onSelected: (on) => setState(() {
                    if (on) {
                      _chosen.add(sport);
                    } else {
                      _chosen.remove(sport);
                    }
                  }),
                ),
              for (final own in _ownWords)
                InputChip(
                  label: Text(own),
                  selected: true,
                  onDeleted: () => setState(() => _chosen.remove(own)),
                ),
            ],
          ),
          const SizedBox(height: 12),
          TextField(
            controller: _custom,
            decoration: InputDecoration(
              labelText: t.athleteOtherSport,
              suffixIcon: IconButton(
                icon: const Icon(Icons.add),
                onPressed: _addOwn,
              ),
            ),
            textInputAction: TextInputAction.done,
            onSubmitted: (_) => _addOwn(),
          ),
          const SizedBox(height: 16),
          Align(
            alignment: AlignmentDirectional.centerEnd,
            child: FilledButton(
              onPressed: () async {
                // The typed word counts even if the member never pressed the
                // plus: they typed it and then pressed Save, which is the same
                // statement.
                _addOwn();
                await widget.cubit.setSports(_chosen);
                if (context.mounted) Navigator.of(context).pop();
              },
              child: Text(t.athleteSave),
            ),
          ),
        ],
      ),
    );
  }

  void _addOwn() {
    final typed = _custom.text.trim();
    if (typed.isEmpty || _chosen.contains(typed)) return;
    setState(() {
      _chosen.add(typed);
      _custom.clear();
    });
  }
}

/// The weekly timetable: day, time, length, sport, optional place (FR-002).
///
/// The whole list is saved at once, as `PUT /athlete/slots` replaces it — and
/// **a slot keeping its id keeps its sessions**, which is why an id is minted
/// when a row is added and never on an edit. Renaming the sport on Monday's
/// slot must not orphan the sessions the server already created from it.
///
/// Nothing here deletes a session. Changing slots affects *future* sessions
/// only, and that is the server materialiser's half; deleting the past would
/// throw away exactly the record story 1 scenario 2 asks to keep.
Future<void> showSlotEditor(BuildContext context, AthleteCubit cubit) =>
    showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      builder: (sheet) => _SlotSheet(cubit: cubit),
    );

class _SlotSheet extends StatefulWidget {
  const _SlotSheet({required this.cubit});

  final AthleteCubit cubit;

  @override
  State<_SlotSheet> createState() => _SlotSheetState();
}

class _SlotSheetState extends State<_SlotSheet> {
  late final List<WeeklySlot> _slots = [...widget.cubit.state.slots];

  /// What a new slot's sport should be: the member's first chosen sport, and
  /// `gym` only for somebody who has chosen none. Guessing from the list is
  /// better than an empty field they have to fill on every row.
  String get _defaultSport => widget.cubit.state.sports.isNotEmpty
      ? widget.cubit.state.sports.first
      : kKnownSports.first;

  @override
  Widget build(BuildContext context) {
    final t = AppLocalizations.of(context);
    final sports = <String>[
      ...widget.cubit.state.sports,
      for (final known in kKnownSports)
        if (!widget.cubit.state.sports.contains(known)) known,
    ];

    return SafeArea(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(t.athleteSlots, style: Theme.of(context).textTheme.titleMedium),
            const SizedBox(height: 8),
            Flexible(
              child: ListView.builder(
                shrinkWrap: true,
                itemCount: _slots.length,
                itemBuilder: (context, index) => _SlotRow(
                  slot: _slots[index],
                  sports: sports,
                  onChanged: (next) => setState(() => _slots[index] = next),
                  onRemove: () => setState(() => _slots.removeAt(index)),
                ),
              ),
            ),
            const SizedBox(height: 8),
            Row(
              children: [
                TextButton.icon(
                  onPressed: () => setState(
                    () => _slots.add(
                      WeeklySlot(
                        // Minted once, here. See the function's note: the id is
                        // what keeps a slot's existing sessions when the member
                        // edits its time.
                        id: _uuid.v7(),
                        weekday: DateTime.monday,
                        start: '18:00',
                        durationMin: 60,
                        sport: _defaultSport,
                      ),
                    ),
                  ),
                  icon: const Icon(Icons.add),
                  label: Text(t.athleteAddSlot),
                ),
                const Spacer(),
                FilledButton(
                  onPressed: () async {
                    await widget.cubit.setSlots(_slots);
                    if (context.mounted) Navigator.of(context).pop();
                  },
                  child: Text(t.athleteSave),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

class _SlotRow extends StatelessWidget {
  const _SlotRow({
    required this.slot,
    required this.sports,
    required this.onChanged,
    required this.onRemove,
  });

  final WeeklySlot slot;
  final List<String> sports;
  final ValueChanged<WeeklySlot> onChanged;
  final VoidCallback onRemove;

  @override
  Widget build(BuildContext context) {
    final t = AppLocalizations.of(context);

    return Card(
      margin: const EdgeInsets.only(bottom: 8),
      child: Padding(
        padding: const EdgeInsets.all(8),
        child: Column(
          children: [
            Row(
              children: [
                Expanded(
                  child: DropdownButtonFormField<int>(
                    initialValue: slot.weekday,
                    decoration: InputDecoration(labelText: t.athleteSlotDay),
                    items: [
                      for (var day = 1; day <= 7; day++)
                        DropdownMenuItem(
                          value: day,
                          child: Text(t.weekdayName(day)),
                        ),
                    ],
                    onChanged: (day) =>
                        onChanged(slot.copyWith(weekday: day ?? slot.weekday)),
                  ),
                ),
                const SizedBox(width: 8),
                Expanded(
                  child: TextButton(
                    // The member's *wall clock*, stored as `HH:mm` and never as
                    // an instant: "18:00 on Mondays" is a statement about their
                    // own clock, so it survives a move to another zone.
                    onPressed: () async {
                      final parts = slot.start.split(':');
                      final picked = await showTimePicker(
                        context: context,
                        initialTime: TimeOfDay(
                          hour: int.tryParse(parts.first) ?? 18,
                          minute: int.tryParse(parts.last) ?? 0,
                        ),
                      );
                      if (picked == null) return;
                      onChanged(
                        slot.copyWith(
                          start: '${picked.hour.toString().padLeft(2, '0')}:'
                              '${picked.minute.toString().padLeft(2, '0')}',
                        ),
                      );
                    },
                    child: Text('${t.athleteSlotTime}: ${slot.start}'),
                  ),
                ),
                IconButton(
                  icon: const Icon(Icons.delete_outline),
                  onPressed: onRemove,
                ),
              ],
            ),
            Row(
              children: [
                Expanded(
                  child: DropdownButtonFormField<String>(
                    initialValue: sports.contains(slot.sport)
                        ? slot.sport
                        : sports.first,
                    decoration: InputDecoration(labelText: t.athleteSports),
                    items: [
                      for (final sport in sports)
                        DropdownMenuItem(
                          value: sport,
                          child: Text(t.sportName(sport)),
                        ),
                    ],
                    onChanged: (sport) =>
                        onChanged(slot.copyWith(sport: sport ?? slot.sport)),
                  ),
                ),
                const SizedBox(width: 8),
                Expanded(
                  child: DropdownButtonFormField<int>(
                    initialValue: _lengths.contains(slot.durationMin)
                        ? slot.durationMin
                        : 60,
                    decoration: InputDecoration(labelText: t.athleteSlotLength),
                    items: [
                      for (final minutes in _lengths)
                        DropdownMenuItem(
                          value: minutes,
                          child: Text(t.athleteMinutes(minutes)),
                        ),
                    ],
                    onChanged: (minutes) => onChanged(
                      slot.copyWith(durationMin: minutes ?? slot.durationMin),
                    ),
                  ),
                ),
              ],
            ),
            TextFormField(
              initialValue: slot.location ?? '',
              decoration: InputDecoration(labelText: t.athleteSlotPlace),
              onChanged: (place) => onChanged(
                place.trim().isEmpty
                    ? slot.copyWith(clearLocation: true)
                    : slot.copyWith(location: place.trim()),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// The lengths a slot offers. Six hours is the server's own cap — longer than
/// any session, because a training camp is not a slot.
const List<int> _lengths = [30, 45, 60, 75, 90, 120, 180];

/// A session the member adds by hand, for a day their timetable does not cover.
///
/// The id is minted by [AthleteCubit.createSession] and not here, because that
/// is the guarantee rather than a detail: the server accepts the client's id,
/// so a create pushed twice is one session (SC-004).
Future<void> showSessionCreator(BuildContext context, AthleteCubit cubit) =>
    showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      builder: (sheet) => _SessionCreator(cubit: cubit),
    );

class _SessionCreator extends StatefulWidget {
  const _SessionCreator({required this.cubit});

  final AthleteCubit cubit;

  @override
  State<_SessionCreator> createState() => _SessionCreatorState();
}

class _SessionCreatorState extends State<_SessionCreator> {
  final _title = TextEditingController();
  late String _sport = widget.cubit.state.sports.isNotEmpty
      ? widget.cubit.state.sports.first
      : kKnownSports.first;
  late DateTime _day = DateTime.now();
  TimeOfDay _time = const TimeOfDay(hour: 18, minute: 0);
  int _durationMin = 60;

  @override
  void dispose() {
    _title.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final t = AppLocalizations.of(context);
    final sports = <String>[
      ...widget.cubit.state.sports,
      for (final known in kKnownSports)
        if (!widget.cubit.state.sports.contains(known)) known,
    ];

    return Padding(
      padding: EdgeInsets.only(
        left: 16,
        right: 16,
        top: 16,
        bottom: 16 + MediaQuery.viewInsetsOf(context).bottom,
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            t.athleteAddSession,
            style: Theme.of(context).textTheme.titleMedium,
          ),
          const SizedBox(height: 12),
          TextField(
            controller: _title,
            decoration: InputDecoration(labelText: t.sessionExerciseName),
          ),
          const SizedBox(height: 8),
          DropdownButtonFormField<String>(
            initialValue: _sport,
            decoration: InputDecoration(labelText: t.athleteSports),
            items: [
              for (final sport in sports)
                DropdownMenuItem(value: sport, child: Text(t.sportName(sport))),
            ],
            onChanged: (sport) => setState(() => _sport = sport ?? _sport),
          ),
          Row(
            children: [
              Expanded(
                child: TextButton(
                  onPressed: () async {
                    final picked = await showDatePicker(
                      context: context,
                      initialDate: _day,
                      // Relative to now, never a written date: a picker bounded
                      // by a literal year starts refusing the member's own week
                      // the day the clock reaches it.
                      firstDate: DateTime.now().subtract(
                        const Duration(days: 365),
                      ),
                      lastDate: DateTime.now().add(const Duration(days: 365)),
                    );
                    if (picked != null) setState(() => _day = picked);
                  },
                  child: Text(
                    '${_day.year}-${_day.month.toString().padLeft(2, '0')}-'
                    '${_day.day.toString().padLeft(2, '0')}',
                  ),
                ),
              ),
              Expanded(
                child: TextButton(
                  onPressed: () async {
                    final picked = await showTimePicker(
                      context: context,
                      initialTime: _time,
                    );
                    if (picked != null) setState(() => _time = picked);
                  },
                  child: Text(_time.format(context)),
                ),
              ),
            ],
          ),
          DropdownButtonFormField<int>(
            initialValue: _durationMin,
            decoration: InputDecoration(labelText: t.athleteSlotLength),
            items: [
              for (final minutes in _lengths)
                DropdownMenuItem(
                  value: minutes,
                  child: Text(t.athleteMinutes(minutes)),
                ),
            ],
            onChanged: (minutes) =>
                setState(() => _durationMin = minutes ?? _durationMin),
          ),
          const SizedBox(height: 16),
          Align(
            alignment: AlignmentDirectional.centerEnd,
            child: FilledButton(
              onPressed: () async {
                final title = _title.text.trim();
                await widget.cubit.createSession(
                  // The member picked a day and a time on their own handset,
                  // which is their own clock: a local `DateTime` is exactly
                  // right here and is converted to an instant by the cubit.
                  plannedAt: DateTime(
                    _day.year,
                    _day.month,
                    _day.day,
                    _time.hour,
                    _time.minute,
                  ),
                  sport: _sport,
                  // A session with no name is still a session — the sport reads
                  // fine on its own — so an empty title falls back rather than
                  // refusing the member's tap.
                  title: title.isEmpty ? t.sportName(_sport) : title,
                  durationMin: _durationMin,
                );
                if (context.mounted) Navigator.of(context).pop();
              },
              child: Text(t.athleteSave),
            ),
          ),
        ],
      ),
    );
  }
}
