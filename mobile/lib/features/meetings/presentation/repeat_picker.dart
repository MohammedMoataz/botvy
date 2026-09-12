import 'dart:async';

import 'package:flutter/material.dart';

import '../../../core/recurrence/rule_words.dart';

/// The repeat picker, in the member's own words (FR-004).
///
/// Opened by a meeting's editor and by a personal event's, which is why it
/// takes a [RepeatSpec] and hands one back rather than reaching for a cubit:
/// the two owning tables are different and the question is the same.
///
/// ## It asks about the 31st rather than working it out
///
/// The monthly row offers "on the `<n>`th" and "on the last day" as separate
/// choices, and that is the whole reason this screen exists rather than a
/// dropdown of five canned rules. `BYMONTHDAY=31` skips February — which is
/// right for "pay the rent on the 31st" — and `BYMONTHDAY=-1` lands on the
/// 28th or 29th, which is right for "the last working day of the month". Both
/// are correct and they are different intentions; guessing from the start date
/// is how a meeting either disappears in February or silently moves for
/// somebody who meant the 31st. The confirmation line at the bottom says which
/// was chosen, in words, before the member can save.
Future<RepeatSpec?> showRepeatPicker(
  BuildContext context, {
  RepeatSpec? initial,
  required DateTime startAt,
}) => showModalBottomSheet<RepeatSpec?>(
  context: context,
  isScrollControlled: true,
  builder: (_) => _RepeatPicker(initial: initial, startAt: startAt),
);

class _RepeatPicker extends StatefulWidget {
  const _RepeatPicker({required this.startAt, this.initial});

  final RepeatSpec? initial;

  /// The meeting's own start, in the member's local time. Two defaults come
  /// from it — the weekday a weekly rule starts on and the day-of-month a
  /// monthly one uses — so a member who picks "every week" gets the day they
  /// already chose rather than an arbitrary Monday.
  final DateTime startAt;

  @override
  State<_RepeatPicker> createState() => _RepeatPickerState();
}

class _RepeatPickerState extends State<_RepeatPicker> {
  late RepeatSpec _spec = widget.initial ??
      RepeatSpec(
        freq: RepeatFreq.weekly,
        byDays: {widget.startAt.weekday},
        monthDay: widget.startAt.day,
      );

  late final TextEditingController _count = TextEditingController(
    text: '${widget.initial?.count ?? 6}',
  );

  @override
  void dispose() {
    _count.dispose();
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
            Text('Repeat', style: theme.textTheme.titleLarge),
            const SizedBox(height: 12),

            SegmentedButton<RepeatFreq>(
              segments: const [
                ButtonSegment(value: RepeatFreq.daily, label: Text('Daily')),
                ButtonSegment(value: RepeatFreq.weekly, label: Text('Weekly')),
                ButtonSegment(
                  value: RepeatFreq.monthly,
                  label: Text('Monthly'),
                ),
              ],
              selected: {_spec.freq},
              onSelectionChanged: (choice) =>
                  setState(() => _spec = _spec.copyWith(freq: choice.first)),
            ),

            const SizedBox(height: 16),
            Row(
              children: [
                const Text('Every'),
                const SizedBox(width: 12),
                DropdownButton<int>(
                  value: _spec.interval,
                  items: [
                    for (var every = 1; every <= 12; every++)
                      DropdownMenuItem(value: every, child: Text('$every')),
                  ],
                  onChanged: (every) => setState(
                    () => _spec = _spec.copyWith(interval: every ?? 1),
                  ),
                ),
                const SizedBox(width: 8),
                Text(switch (_spec.freq) {
                  RepeatFreq.daily => _spec.interval == 1 ? 'day' : 'days',
                  RepeatFreq.weekly => _spec.interval == 1 ? 'week' : 'weeks',
                  RepeatFreq.monthly =>
                    _spec.interval == 1 ? 'month' : 'months',
                }),
              ],
            ),

            if (_spec.freq == RepeatFreq.weekly) ...[
              const SizedBox(height: 16),
              Wrap(
                spacing: 6,
                children: [
                  for (var day = DateTime.monday; day <= DateTime.sunday; day++)
                    FilterChip(
                      label: Text(
                        weekdayName(
                          day,
                          Localizations.localeOf(context).languageCode,
                        ),
                      ),
                      selected: _spec.byDays.contains(day),
                      onSelected: (on) => setState(() {
                        final days = {..._spec.byDays};
                        if (on) {
                          days.add(day);
                        } else {
                          days.remove(day);
                        }
                        // Never empty: a weekly rule with no BYDAY falls back
                        // to the day the series starts on, which is correct
                        // RFC 5545 and reads on this screen as "no days
                        // selected" — a state the member cannot interpret. So
                        // the last chip cannot be turned off.
                        _spec = _spec.copyWith(
                          byDays: days.isEmpty ? _spec.byDays : days,
                        );
                      }),
                    ),
                ],
              ),
            ],

            if (_spec.freq == RepeatFreq.monthly) ...[
              const SizedBox(height: 16),
              // Two rules, said out loud. See the class note — this choice is
              // the reason the picker is a screen rather than a dropdown of
              // canned rules.
              SegmentedButton<MonthlyMode>(
                segments: [
                  ButtonSegment(
                    value: MonthlyMode.dayOfMonth,
                    label: Text('On the ${_ordinal(widget.startAt.day)}'),
                  ),
                  const ButtonSegment(
                    value: MonthlyMode.lastDay,
                    label: Text('Last day'),
                  ),
                ],
                selected: {_spec.monthly},
                onSelectionChanged: (choice) => setState(
                  () => _spec = _spec.copyWith(
                    monthly: choice.first,
                    monthDay: widget.startAt.day,
                  ),
                ),
              ),
              const SizedBox(height: 6),
              Text(
                _spec.monthly == MonthlyMode.lastDay
                    ? 'The 28th or 29th in February.'
                    : widget.startAt.day > 28
                          ? 'Months without a ${_ordinal(widget.startAt.day)} '
                                'are skipped.'
                          : 'The same date every month.',
                style: theme.textTheme.bodySmall,
              ),
            ],

            const Divider(height: 32),
            Text('Ends', style: theme.textTheme.titleMedium),
            const SizedBox(height: 8),
            SegmentedButton<RepeatEnd>(
              segments: const [
                ButtonSegment(value: RepeatEnd.never, label: Text('Never')),
                ButtonSegment(
                  value: RepeatEnd.afterCount,
                  label: Text('After'),
                ),
                ButtonSegment(value: RepeatEnd.onDate, label: Text('On date')),
              ],
              selected: {_spec.end},
              onSelectionChanged: (choice) {
                final end = choice.first;
                setState(
                  () => _spec = _spec.copyWith(
                    end: end,
                    count: end == RepeatEnd.afterCount
                        ? (int.tryParse(_count.text) ?? 6)
                        : null,
                  ),
                );
                // The date picker is opened by choosing the segment rather than
                // by a second tap: a member who picked "On date" and was shown
                // no date has chosen an end condition with no end in it.
                if (end == RepeatEnd.onDate) unawaited(_pickUntil());
              },
            ),

            if (_spec.end == RepeatEnd.afterCount) ...[
              const SizedBox(height: 12),
              Row(
                children: [
                  SizedBox(
                    width: 72,
                    child: TextField(
                      controller: _count,
                      keyboardType: TextInputType.number,
                      decoration: const InputDecoration(isDense: true),
                      onChanged: (raw) => setState(() {
                        final parsed = int.tryParse(raw);
                        _spec = _spec.copyWith(
                          count: parsed != null && parsed > 0 ? parsed : 1,
                        );
                      }),
                    ),
                  ),
                  const SizedBox(width: 12),
                  const Text('times'),
                ],
              ),
            ],

            if (_spec.end == RepeatEnd.onDate) ...[
              const SizedBox(height: 12),
              OutlinedButton.icon(
                icon: const Icon(Icons.event),
                label: Text(
                  _spec.until == null
                      ? 'Choose the last date'
                      : _dateText(_spec.until!),
                ),
                onPressed: () => unawaited(_pickUntil()),
              ),
            ],

            const Divider(height: 32),
            // The confirmation line: the rule in words, before it is saved.
            Text(
              _spec.describe(Localizations.localeOf(context).languageCode),
              style: theme.textTheme.titleMedium?.copyWith(
                color: theme.colorScheme.primary,
              ),
            ),
            const SizedBox(height: 16),
            Row(
              children: [
                // "Does not repeat" is a null answer and not a fourth
                // frequency: the caller stores null in `recurrence`, and a
                // `FREQ` meaning "once" would be a rule that has to be special
                // -cased by both expanders.
                TextButton(
                  onPressed: () => Navigator.of(context).pop<RepeatSpec?>(null),
                  child: const Text('Does not repeat'),
                ),
                const Spacer(),
                FilledButton(
                  onPressed: () =>
                      Navigator.of(context).pop<RepeatSpec?>(_spec),
                  child: const Text('Set repeat'),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }

  Future<void> _pickUntil() async {
    final chosen = await showDatePicker(
      context: context,
      initialDate: _spec.until ?? widget.startAt.add(const Duration(days: 90)),
      // Relative to the meeting's own start, never a pinned year: a bound
      // written as a literal date starts refusing legitimate choices the day
      // the clock reaches it.
      firstDate: widget.startAt,
      lastDate: DateTime(widget.startAt.year + 10),
    );
    if (chosen == null || !mounted) return;
    setState(
      () => _spec = _spec.copyWith(end: RepeatEnd.onDate, until: chosen),
    );
  }
}

String _dateText(DateTime date) =>
    '${date.year}-${date.month.toString().padLeft(2, '0')}'
    '-${date.day.toString().padLeft(2, '0')}';

String _ordinal(int day) {
  if (day >= 11 && day <= 13) return '${day}th';
  return switch (day % 10) {
    1 => '${day}st',
    2 => '${day}nd',
    3 => '${day}rd',
    _ => '${day}th',
  };
}
