import 'dart:async';
import 'dart:convert';

import 'package:flutter/material.dart';

import '../../../app/l10n/app_localizations.dart';
import '../../../core/db/database.dart';
import '../application/reminders_cubit.dart';

/// The lead times a reminder can carry of its own.
///
/// The same six the preferences screen offers, and for the same reason: the
/// server's schema is `\d+[mhd]` with at most six entries, and offering the six
/// that make sense is both easier to use and impossible to get wrong.
///
/// Leaving them all unselected is meaningful — it stores an empty list, which
/// means "the member's defaults" and therefore follows a later change to them.
const List<String> kLeadOffers = ['0m', '10m', '30m', '1h', '2h', '1d'];

Future<void> showReminderSheet(
  BuildContext context,
  RemindersCubit cubit, {
  LocalReminder? reminder,
}) => showModalBottomSheet<void>(
  context: context,
  isScrollControlled: true,
  builder: (_) => Padding(
    padding: EdgeInsets.only(bottom: MediaQuery.of(context).viewInsets.bottom),
    child: _ReminderSheet(cubit: cubit, reminder: reminder),
  ),
);

class _ReminderSheet extends StatefulWidget {
  const _ReminderSheet({required this.cubit, this.reminder});

  final RemindersCubit cubit;
  final LocalReminder? reminder;

  @override
  State<_ReminderSheet> createState() => _ReminderSheetState();
}

class _ReminderSheetState extends State<_ReminderSheet> {
  late final TextEditingController _title = TextEditingController(
    text: widget.reminder?.title ?? '',
  );
  late DateTime _moment =
      widget.reminder?.remindAt.toLocal() ??
      // An hour from now, rounded to the next quarter: a default nobody has to
      // fix, where "now" would be a reminder that fires before the sheet closes.
      _roundUp(DateTime.now().add(const Duration(hours: 1)));
  late final Set<String> _leads = _decodeLeads(widget.reminder?.leadTimesJson);

  static Set<String> _decodeLeads(String? encoded) {
    if (encoded == null || encoded.isEmpty) return {};
    try {
      final decoded = jsonDecode(encoded);
      return decoded is List ? decoded.map((e) => '$e').toSet() : {};
    } catch (_) {
      return {};
    }
  }

  static DateTime _roundUp(DateTime moment) {
    final minutes = (moment.minute / 15).ceil() * 15;
    return DateTime(
      moment.year,
      moment.month,
      moment.day,
      moment.hour,
    ).add(Duration(minutes: minutes));
  }

  @override
  void dispose() {
    _title.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final t = AppLocalizations.of(context);

    return SafeArea(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          mainAxisSize: MainAxisSize.min,
          children: [
            TextField(
              controller: _title,
              autofocus: widget.reminder == null,
              textCapitalization: TextCapitalization.sentences,
              decoration: InputDecoration(labelText: t.reminderTitle),
              onSubmitted: (_) => unawaited(_save()),
            ),
            const SizedBox(height: 16),
            OutlinedButton.icon(
              icon: const Icon(Icons.event, size: 18),
              label: Text(_momentLabel(context, _moment)),
              onPressed: () async {
                final picked = await pickMoment(context, _moment);
                if (picked != null) setState(() => _moment = picked);
              },
            ),
            const SizedBox(height: 16),
            Text(t.leadTimes, style: Theme.of(context).textTheme.bodySmall),
            Text(
              t.reminderLeadsHelp,
              style: Theme.of(context).textTheme.bodySmall,
            ),
            const SizedBox(height: 8),
            Wrap(
              spacing: 8,
              children: [
                for (final offer in kLeadOffers)
                  FilterChip(
                    label: Text(offer),
                    selected: _leads.contains(offer),
                    onSelected: (selected) => setState(() {
                      if (selected) {
                        _leads.add(offer);
                      } else {
                        _leads.remove(offer);
                      }
                    }),
                  ),
              ],
            ),
            const SizedBox(height: 20),
            FilledButton(onPressed: _save, child: Text(t.save)),
          ],
        ),
      ),
    );
  }

  Future<void> _save() async {
    if (_title.text.trim().isEmpty) return;
    final navigator = Navigator.of(context);
    // Kept in the order they are offered, so the list reads the same on every
    // device rather than in tap order.
    final leads = kLeadOffers.where(_leads.contains).toList();

    if (widget.reminder == null) {
      await widget.cubit.create(
        title: _title.text,
        remindAt: _moment,
        leadTimes: leads,
      );
    } else {
      await widget.cubit.edit(
        widget.reminder!.id,
        title: _title.text,
        remindAt: _moment,
        leadTimes: leads,
      );
    }
    navigator.pop();
  }
}

/// A date and then a time, as one answer.
///
/// Two pickers rather than one control, because that is what the platform
/// offers — and the pair cannot express an invalid moment, which is why nothing
/// downstream has to validate one.
Future<DateTime?> pickMoment(BuildContext context, DateTime initial) async {
  final now = DateTime.now();
  final date = await showDatePicker(
    context: context,
    initialDate: initial.toLocal(),
    firstDate: DateTime(now.year - 1),
    lastDate: DateTime(now.year + 5),
  );
  if (date == null || !context.mounted) return null;

  final time = await showTimePicker(
    context: context,
    initialTime: TimeOfDay.fromDateTime(initial.toLocal()),
  );
  if (time == null) return null;

  return DateTime(date.year, date.month, date.day, time.hour, time.minute);
}

String _momentLabel(BuildContext context, DateTime moment) {
  final local = moment.toLocal();
  return '${local.year}-${local.month.toString().padLeft(2, '0')}-'
      '${local.day.toString().padLeft(2, '0')} '
      '${TimeOfDay.fromDateTime(local).format(context)}';
}
