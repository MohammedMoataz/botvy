import 'dart:async';

import 'package:flutter/material.dart';

import '../../../app/di.dart';
import '../../../app/l10n/app_localizations.dart';
import '../../../core/api/api_client.dart';
import '../../../core/db/database.dart';
import '../../profile/data/profile_mirror.dart';

/// The knobs a member may turn.
///
/// Every control writes immediately rather than collecting into a Save button.
/// These are eleven independent settings, not one form: a member who changes
/// their morning briefing and then backs out should not lose it, and the server
/// reports which fields moved so a single-field patch is the cheap case rather
/// than the awkward one.
///
/// Each value is validated by the server against the zod schema of its own
/// `settings.defaults.*` entry, so this screen deliberately does *not*
/// re-implement the rules — it offers controls that cannot express an invalid
/// value, and shows the server's refusal if one gets through anyway.
class PreferencesPage extends StatefulWidget {
  const PreferencesPage({super.key});

  @override
  State<PreferencesPage> createState() => _PreferencesPageState();
}

class _PreferencesPageState extends State<PreferencesPage> {
  final _mirror = sl<ProfileMirror>();

  UserPreference? _prefs;
  bool _saving = false;
  String? _problem;

  @override
  void initState() {
    super.initState();
    unawaited(_load());
  }

  Future<void> _load() async {
    final prefs = await _mirror.readPreferences();
    if (mounted) setState(() => _prefs = prefs);
  }

  Future<void> _patch(Map<String, dynamic> patch) async {
    setState(() {
      _saving = true;
      _problem = null;
    });
    try {
      final updated = await _mirror.patchPreferences(patch);
      if (mounted) setState(() => _prefs = updated);
    } on ApiException catch (e) {
      if (!mounted) return;
      final t = AppLocalizations.of(context);
      // The server's refusal, shown as its own message: "endOfDayTime: a
      // wall-clock time as HH:mm" names the field and the rule, and a generic
      // "something went wrong" would throw both away.
      setState(() => _problem = e.isOffline ? t.offline : e.message);
      // And re-read, so a refused control snaps back to what is actually
      // stored rather than sitting on the value that was rejected.
      await _load();
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final t = AppLocalizations.of(context);
    final prefs = _prefs;

    return Scaffold(
      appBar: AppBar(title: Text(t.preferencesTitle)),
      body: prefs == null
          ? const Center(child: CircularProgressIndicator())
          : ListView(
              padding: const EdgeInsets.all(16),
              children: [
                if (_problem != null)
                  Container(
                    margin: const EdgeInsets.only(bottom: 16),
                    padding: const EdgeInsets.all(12),
                    decoration: BoxDecoration(
                      color: Theme.of(context).colorScheme.errorContainer,
                      borderRadius: BorderRadius.circular(8),
                    ),
                    child: Text(
                      _problem!,
                      style: TextStyle(
                        color: Theme.of(context).colorScheme.onErrorContainer,
                      ),
                    ),
                  ),

                _Heading(t.dailyTimes),
                _TimeRow(
                  label: t.planTomorrowTime,
                  value: prefs.planTomorrowTime,
                  enabled: !_saving,
                  onChanged: (v) => unawaited(_patch({'planTomorrowTime': v})),
                ),
                _TimeRow(
                  label: t.endOfDayTime,
                  value: prefs.endOfDayTime,
                  enabled: !_saving,
                  onChanged: (v) => unawaited(_patch({'endOfDayTime': v})),
                ),
                _TimeRow(
                  label: t.morningBriefingTime,
                  value: prefs.morningBriefingTime,
                  enabled: !_saving,
                  onChanged: (v) =>
                      unawaited(_patch({'morningBriefingTime': v})),
                ),
                _TimeRow(
                  label: t.nextPracticeCutoff,
                  value: prefs.nextPracticeCutoff,
                  enabled: !_saving,
                  onChanged: (v) =>
                      unawaited(_patch({'nextPracticeCutoff': v})),
                ),

                const Divider(height: 32),
                _Heading(t.quietHours),
                Text(t.quietHoursHelp,
                    style: Theme.of(context).textTheme.bodySmall),
                _TimeRow(
                  label: t.quietFrom,
                  value: prefs.quietFrom,
                  enabled: !_saving,
                  // Both halves together: the server's schema is one object,
                  // and sending half of it would fail validation rather than
                  // patching one field.
                  onChanged: (v) => unawaited(
                    _patch({
                      'quietHours': {'from': v, 'to': prefs.quietTo},
                    }),
                  ),
                ),
                _TimeRow(
                  label: t.quietTo,
                  value: prefs.quietTo,
                  enabled: !_saving,
                  onChanged: (v) => unawaited(
                    _patch({
                      'quietHours': {'from': prefs.quietFrom, 'to': v},
                    }),
                  ),
                ),

                const Divider(height: 32),
                _Heading(t.leadTimes),
                Text(t.leadTimesHelp,
                    style: Theme.of(context).textTheme.bodySmall),
                _LeadTimes(
                  values: prefs.leadTimes,
                  enabled: !_saving,
                  onChanged: (v) => unawaited(_patch({'leadTimes': v})),
                ),

                const Divider(height: 32),
                DropdownButtonFormField<String>(
                  initialValue: prefs.weekStartsOn,
                  decoration: InputDecoration(labelText: t.weekStartsOn),
                  items: [
                    DropdownMenuItem(value: 'monday', child: Text(t.monday)),
                    DropdownMenuItem(value: 'sunday', child: Text(t.sunday)),
                    DropdownMenuItem(value: 'saturday', child: Text(t.saturday)),
                  ],
                  onChanged: _saving
                      ? null
                      : (v) {
                          if (v != null) unawaited(_patch({'weekStartsOn': v}));
                        },
                ),
                const SizedBox(height: 16),

                DropdownButtonFormField<String>(
                  initialValue: prefs.mealMode,
                  decoration: InputDecoration(labelText: t.mealMode),
                  items: [
                    DropdownMenuItem(value: 'llm', child: Text(t.mealModeLlm)),
                    DropdownMenuItem(
                      value: 'library',
                      child: Text(t.mealModeLibrary),
                    ),
                  ],
                  onChanged: _saving
                      ? null
                      : (v) {
                          if (v != null) unawaited(_patch({'mealMode': v}));
                        },
                ),
                const SizedBox(height: 16),

                // 5 to 480 on the server; the slider cannot leave that range,
                // which is the point of using one.
                Text('${t.meetingDuration}: ${prefs.meetingDurationMin} min'),
                Slider(
                  value: prefs.meetingDurationMin.clamp(5, 240).toDouble(),
                  min: 5,
                  max: 240,
                  divisions: 47,
                  label: '${prefs.meetingDurationMin}',
                  onChanged: _saving ? null : (_) {},
                  onChangeEnd: (v) => unawaited(
                    _patch({'meetingDurationMin': v.round()}),
                  ),
                ),

                SwitchListTile(
                  title: Text(t.checkinEnabled),
                  value: prefs.checkinEnabled,
                  onChanged: _saving
                      ? null
                      : (v) => unawaited(_patch({'checkinEnabled': v})),
                ),
                SwitchListTile(
                  title: Text(t.aiSuggestions),
                  value: prefs.aiSuggestions,
                  onChanged: _saving
                      ? null
                      : (v) => unawaited(_patch({'aiSuggestions': v})),
                ),
              ],
            ),
    );
  }
}

class _Heading extends StatelessWidget {
  const _Heading(this.text);

  final String text;

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.only(bottom: 8),
    child: Text(text, style: Theme.of(context).textTheme.titleMedium),
  );
}

/// One wall-clock time, through the platform picker.
///
/// A picker rather than a text field, because the server's schema is `HH:mm`
/// and a keyboard is how `9:5` and `21.00` get typed. The control cannot
/// produce an invalid value, so the validation on the other side never has to
/// refuse one.
class _TimeRow extends StatelessWidget {
  const _TimeRow({
    required this.label,
    required this.value,
    required this.enabled,
    required this.onChanged,
  });

  final String label;
  final String value;
  final bool enabled;
  final void Function(String) onChanged;

  @override
  Widget build(BuildContext context) => ListTile(
    contentPadding: EdgeInsets.zero,
    title: Text(label),
    trailing: Text(value, style: Theme.of(context).textTheme.titleMedium),
    enabled: enabled,
    onTap: () async {
      final parts = value.split(':');
      final picked = await showTimePicker(
        context: context,
        initialTime: TimeOfDay(
          hour: int.tryParse(parts.first) ?? 8,
          minute: int.tryParse(parts.last) ?? 0,
        ),
      );
      if (picked == null) return;
      final formatted =
          '${picked.hour.toString().padLeft(2, '0')}:'
          '${picked.minute.toString().padLeft(2, '0')}';
      if (formatted != value) onChanged(formatted);
    },
  );
}

/// The lead times, as a fixed set of offers.
///
/// Chips rather than free text: the server's schema is `\d+[mhd]` with at most
/// six entries, and offering the six that make sense is both easier to use and
/// impossible to get wrong.
class _LeadTimes extends StatelessWidget {
  const _LeadTimes({
    required this.values,
    required this.enabled,
    required this.onChanged,
  });

  static const List<String> _offered = ['0m', '10m', '30m', '1h', '2h', '1d'];

  final List<String> values;
  final bool enabled;
  final void Function(List<String>) onChanged;

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.symmetric(vertical: 8),
    child: Wrap(
      spacing: 8,
      children: _offered.map((offer) {
        final selected = values.contains(offer);
        return FilterChip(
          label: Text(offer),
          selected: selected,
          onSelected: !enabled
              ? null
              : (_) {
                  final next = selected
                      ? values.where((v) => v != offer).toList()
                      // Kept in the order they are offered, so the list reads
                      // the same on every device rather than in tap order.
                      : [..._offered.where((o) => values.contains(o) || o == offer)];
                  // The server caps it at six, which is also how many are
                  // offered — so this can only be reached by an older client.
                  if (next.isEmpty) return;
                  onChanged(next);
                },
        );
      }).toList(),
    ),
  );
}
