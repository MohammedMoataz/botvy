import 'dart:async';

import 'package:flutter/foundation.dart' show listEquals;
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';

import '../../../app/di.dart';
import '../../../app/l10n/app_localizations.dart';
import '../../../core/api/api_client.dart';
import '../../../core/db/database.dart';
import '../../../core/notifications/local_notifications.dart'
    show deviceTimezone;
import '../../auth/application/auth_cubit.dart';
import '../data/profile_mirror.dart';
import 'tag_editor.dart';
import '../../../app/tokens.dart';
import '../../../ui/save_bar.dart';
import '../../../ui/states.dart';

/// The member's own facts.
///
/// Reads from the local mirror, so it opens instantly and works with no
/// connection. Writes go to the server and take the server's answer back —
/// which is why every save re-renders from the mirror rather than from what was
/// typed: the server trims the name and lower-cases the tag lists, and a screen
/// showing `Peanuts` over a stored `peanuts` would report a change on the next
/// save that is not one.
///
/// ## One form, one Save (031)
///
/// Edits collect in a draft and go to the server in one patch when the member
/// presses Save. Before 031 each field saved on its own, and the name and the
/// time zone only when the keyboard's done key was pressed — a member who
/// typed a name and pressed back lost it without a word. One patch is also
/// what the server is built for: it raises a single `ProfileUpdated` naming
/// the fields that moved, and that event reschedules the member's day, so
/// field-by-field saves rescheduled it once per field. Leaving with unsaved
/// edits asks first.
///
/// Body metrics are not part of the draft. A reading is a new record with its
/// own Add button, not a field to edit.
class ProfilePage extends StatefulWidget {
  const ProfilePage({super.key});

  @override
  State<ProfilePage> createState() => _ProfilePageState();
}

class _ProfilePageState extends State<ProfilePage> {
  final _mirror = sl<ProfileMirror>();
  final _name = TextEditingController();
  final _zone = TextEditingController();

  Profile? _profile;
  String _locale = 'en';
  List<String> _likes = const [];
  List<String> _dislikes = const [];
  List<String> _allergies = const [];
  List<String> _symptoms = const [];

  bool _saving = false;
  String? _problem;

  @override
  void initState() {
    super.initState();
    // Typing changes whether there is anything to save.
    _name.addListener(_touch);
    _zone.addListener(_touch);
    unawaited(_load());
  }

  @override
  void dispose() {
    _name.dispose();
    _zone.dispose();
    super.dispose();
  }

  void _touch() => setState(() {});

  Future<void> _load() async {
    final profile = await _mirror.readProfile();
    if (!mounted) return;
    setState(() => _reset(profile));
  }

  /// The draft, set back to what is stored.
  void _reset(Profile? profile) {
    _profile = profile;
    if (profile == null) return;
    _name.text = profile.displayName ?? '';
    _zone.text = profile.timezone;
    _locale = profile.locale;
    _likes = profile.foodLikes;
    _dislikes = profile.foodDislikes;
    _allergies = profile.allergies;
    _symptoms = profile.symptoms;
  }

  /// Only the fields that differ from what is stored.
  Map<String, dynamic> get _changes {
    final p = _profile;
    if (p == null) return const {};
    final name = _name.text.trim();
    final zone = _zone.text.trim();
    return {
      if (name != (p.displayName ?? '')) 'displayName': name,
      if (zone.isNotEmpty && zone != p.timezone) 'timezone': zone,
      if (_locale != p.locale) 'locale': _locale,
      if (!listEquals(_likes, p.foodLikes)) 'foodLikes': _likes,
      if (!listEquals(_dislikes, p.foodDislikes)) 'foodDislikes': _dislikes,
      if (!listEquals(_allergies, p.allergies)) 'allergies': _allergies,
      if (!listEquals(_symptoms, p.symptoms)) 'symptoms': _symptoms,
    };
  }

  Future<void> _save() async {
    final changes = _changes;
    if (changes.isEmpty) return;
    final t = AppLocalizations.of(context);
    final messenger = ScaffoldMessenger.of(context);
    setState(() {
      _saving = true;
      _problem = null;
    });
    try {
      final updated = await _mirror.patchProfile(changes);
      if (!mounted) return;
      setState(() => _reset(updated));
      messenger.showSnackBar(SnackBar(content: Text(t.saved)));
    } on ApiException catch (e) {
      // The draft stays as typed, so a refused save can be fixed and retried
      // rather than typed again.
      if (!mounted) return;
      setState(() => _problem = e.isOffline ? t.offline : t.somethingWentWrong);
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final t = AppLocalizations.of(context);
    final profile = _profile;
    final dirty = _changes.isNotEmpty;

    return UnsavedChangesGuard(
      dirty: dirty,
      child: Scaffold(
        appBar: AppBar(title: Text(t.profileTitle)),
        bottomNavigationBar: profile == null
            ? null
            : SaveBar(
                dirty: dirty,
                saving: _saving,
                onSave: () => unawaited(_save()),
              ),
        body: profile == null
            ? const LoadingView()
            : ListView(
                padding: const EdgeInsetsDirectional.all(BotvySpace.lg),
                children: [
                  if (context.read<AuthCubit>().state.mustChangePassword)
                    _Notice(
                      text: t.changeYourPassword,
                      severity: _Severity.warn,
                    ),
                  if (_problem != null)
                    _Notice(text: _problem!, severity: _Severity.error),
                  TextField(
                    key: const ValueKey('profile-name'),
                    controller: _name,
                    decoration: InputDecoration(labelText: t.displayName),
                  ),
                  const SizedBox(height: BotvySpace.lg),
                  _TimezoneField(controller: _zone, enabled: !_saving),
                  const SizedBox(height: BotvySpace.lg),
                  _LanguageField(
                    value: _locale,
                    onChanged: (locale) => setState(() => _locale = locale),
                  ),
                  const Divider(height: 32),
                  _Metrics(
                    profile: profile,
                    onAdd: (metric) => unawaited(_addMetric(metric)),
                  ),
                  const Divider(height: 32),
                  TagEditor(
                    label: t.foodLikes,
                    hint: t.addTagHint,
                    values: _likes,
                    onChanged: (v) => setState(() => _likes = v),
                  ),
                  TagEditor(
                    label: t.foodDislikes,
                    hint: t.addTagHint,
                    values: _dislikes,
                    onChanged: (v) => setState(() => _dislikes = v),
                  ),
                  TagEditor(
                    label: t.allergies,
                    hint: t.addTagHint,
                    // Spelled out, because this list is a safety input rather
                    // than a preference: meal suggestions withhold anything on
                    // it, and a member who does not know that will not fill it in.
                    help: t.allergiesHelp,
                    values: _allergies,
                    onChanged: (v) => setState(() => _allergies = v),
                  ),
                  TagEditor(
                    label: t.symptoms,
                    hint: t.addTagHint,
                    values: _symptoms,
                    onChanged: (v) => setState(() => _symptoms = v),
                  ),
                ],
              ),
      ),
    );
  }

  Future<void> _addMetric(Map<String, dynamic> metric) async {
    setState(() => _saving = true);
    try {
      final updated = await _mirror.recordMetric(metric);
      // The reading only: the rest of the draft is the member's and unsaved.
      if (mounted) setState(() => _profile = updated);
    } on ApiException {
      if (mounted) {
        setState(
            () => _problem = AppLocalizations.of(context).somethingWentWrong);
      }
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }
}

/// The time zone, detected but editable.
///
/// Detected because asking somebody to find `Africa/Cairo` in a list of four
/// hundred is a worse first experience than offering the one their phone is
/// already in; editable because a member who travels or whose phone is wrong
/// has to be able to fix it. Every reminder they ever get is resolved against
/// this value, which is why it is on the profile and not a device setting.
class _TimezoneField extends StatelessWidget {
  const _TimezoneField({required this.controller, required this.enabled});

  final TextEditingController controller;
  final bool enabled;

  @override
  Widget build(BuildContext context) {
    final t = AppLocalizations.of(context);
    return Row(
      children: [
        Expanded(
          child: TextField(
            controller: controller,
            decoration: InputDecoration(labelText: t.timezone),
          ),
        ),
        IconButton(
          icon: const Icon(Icons.my_location),
          tooltip: t.timezone,
          onPressed: !enabled
              ? null
              : () async {
                  final detected = await deviceTimezoneOrNull();
                  if (detected != null) controller.text = detected;
                },
        ),
      ],
    );
  }
}

/// The device's zone, or nothing.
///
/// Wrapped so a platform that cannot answer does not take the screen down with
/// it — a phone with no time zone is a strange phone, but it is still somebody's.
Future<String?> deviceTimezoneOrNull() async {
  try {
    return await deviceTimezone();
  } catch (_) {
    return null;
  }
}

class _LanguageField extends StatelessWidget {
  const _LanguageField({required this.value, required this.onChanged});

  final String value;
  final void Function(String) onChanged;

  @override
  Widget build(BuildContext context) {
    final t = AppLocalizations.of(context);
    return DropdownButtonFormField<String>(
      // Keyed on the value, so a save or a reset that changes it redraws the
      // field rather than leaving the old initial value showing.
      key: ValueKey(value),
      initialValue: value,
      decoration: InputDecoration(labelText: t.language),
      items: const [
        DropdownMenuItem(value: 'en', child: Text('English')),
        DropdownMenuItem(value: 'ar', child: Text('العربية')),
      ],
      onChanged: (v) {
        if (v != null) onChanged(v);
      },
    );
  }
}

class _Metrics extends StatefulWidget {
  const _Metrics({required this.profile, required this.onAdd});

  final Profile profile;
  final void Function(Map<String, dynamic>) onAdd;

  @override
  State<_Metrics> createState() => _MetricsState();
}

class _MetricsState extends State<_Metrics> {
  final _weight = TextEditingController();
  final _height = TextEditingController();
  final _fat = TextEditingController();
  String? _problem;

  @override
  void dispose() {
    _weight.dispose();
    _height.dispose();
    _fat.dispose();
    super.dispose();
  }

  void _submit() {
    final t = AppLocalizations.of(context);
    final metric = <String, dynamic>{
      'recordedAt': DateTime.now().toUtc().toIso8601String(),
      if (double.tryParse(_weight.text) != null)
        'weightKg': double.parse(_weight.text),
      if (double.tryParse(_height.text) != null)
        'heightCm': double.parse(_height.text),
      if (double.tryParse(_fat.text) != null)
        'bodyFatPct': double.parse(_fat.text),
    };

    // A reading with no reading in it. The server refuses it too; catching it
    // here saves a round trip and says so beside the fields.
    if (metric.length == 1) {
      setState(() => _problem = t.needOneMeasurement);
      return;
    }

    setState(() => _problem = null);
    widget.onAdd(metric);
    _weight.clear();
    _height.clear();
    _fat.clear();
  }

  @override
  Widget build(BuildContext context) {
    final t = AppLocalizations.of(context);
    final profile = widget.profile;
    final metrics = profile.metrics;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(t.bodyMetrics, style: Theme.of(context).textTheme.titleMedium),
        const SizedBox(height: BotvySpace.sm),
        if (profile.bmi != null)
          Text('${t.bmi}: ${profile.bmi}',
              style: Theme.of(context).textTheme.bodyLarge),
        Row(
          children: [
            Expanded(child: _number(_weight, t.weightKg)),
            const SizedBox(width: BotvySpace.sm),
            Expanded(child: _number(_height, t.heightCm)),
            const SizedBox(width: BotvySpace.sm),
            Expanded(child: _number(_fat, t.bodyFatPct)),
          ],
        ),
        if (_problem != null)
          Padding(
            padding: const EdgeInsetsDirectional.only(top: BotvySpace.sm),
            child: Text(
              _problem!,
              style: TextStyle(color: Theme.of(context).colorScheme.error),
            ),
          ),
        const SizedBox(height: BotvySpace.sm),
        OutlinedButton.icon(
          icon: const Icon(Icons.add),
          label: Text(t.addMetric),
          onPressed: _submit,
        ),
        const SizedBox(height: BotvySpace.sm),
        if (metrics.isEmpty)
          Text(t.noMetricsYet, style: Theme.of(context).textTheme.bodySmall)
        else
          // Newest first: the last reading is the one somebody came to see.
          ...metrics.reversed.take(10).map(
                (row) => ListTile(
                  dense: true,
                  contentPadding: EdgeInsets.zero,
                  title: Text(
                    [
                      if (row['weightKg'] != null) '${row['weightKg']} kg',
                      if (row['heightCm'] != null) '${row['heightCm']} cm',
                      if (row['bodyFatPct'] != null) '${row['bodyFatPct']}%',
                    ].join('  ·  '),
                  ),
                  subtitle: Text(
                    DateTime.tryParse('${row['recordedAt']}')
                            ?.toLocal()
                            .toString()
                            .split('.')
                            .first ??
                        '',
                  ),
                ),
              ),
      ],
    );
  }

  Widget _number(TextEditingController controller, String label) => TextField(
        controller: controller,
        keyboardType: const TextInputType.numberWithOptions(decimal: true),
        decoration: InputDecoration(labelText: label),
      );
}

enum _Severity { warn, error }

class _Notice extends StatelessWidget {
  const _Notice({required this.text, required this.severity});

  final String text;
  final _Severity severity;

  @override
  Widget build(BuildContext context) {
    final colours = Theme.of(context).colorScheme;
    final background = severity == _Severity.error
        ? colours.errorContainer
        : colours.tertiaryContainer;
    final foreground = severity == _Severity.error
        ? colours.onErrorContainer
        : colours.onTertiaryContainer;

    return Container(
      margin: const EdgeInsetsDirectional.only(bottom: BotvySpace.lg),
      padding: const EdgeInsetsDirectional.all(BotvySpace.md),
      decoration: BoxDecoration(
        color: background,
        borderRadius: BorderRadius.circular(BotvyRadius.lg),
      ),
      child: Text(text, style: TextStyle(color: foreground)),
    );
  }
}
