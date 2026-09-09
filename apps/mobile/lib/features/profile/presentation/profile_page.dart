import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:go_router/go_router.dart';

import '../../../app/di.dart';
import '../../../app/l10n/app_localizations.dart';
import '../../../app/router.dart';
import '../../../core/api/api_client.dart';
import '../../../core/db/database.dart';
import '../../../core/notifications/local_notifications.dart'
    show deviceTimezone;
import '../../auth/application/auth_cubit.dart';
import '../data/profile_mirror.dart';
import 'tag_editor.dart';

/// The member's own facts.
///
/// Reads from the local mirror, so it opens instantly and works with no
/// connection. Writes go to the server and take the server's answer back —
/// which is why every save re-renders from the mirror rather than from what was
/// typed: the server trims the name and lower-cases the tag lists, and a screen
/// showing `Peanuts` over a stored `peanuts` would report a change on the next
/// save that is not one.
class ProfilePage extends StatefulWidget {
  const ProfilePage({super.key});

  @override
  State<ProfilePage> createState() => _ProfilePageState();
}

class _ProfilePageState extends State<ProfilePage> {
  final _mirror = sl<ProfileMirror>();
  final _name = TextEditingController();

  Profile? _profile;
  bool _saving = false;
  String? _problem;

  @override
  void initState() {
    super.initState();
    unawaited(_load());
  }

  @override
  void dispose() {
    _name.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    final profile = await _mirror.readProfile();
    if (!mounted) return;
    setState(() {
      _profile = profile;
      _name.text = profile?.displayName ?? '';
    });
  }

  /// One save for the whole form.
  ///
  /// The server raises a single `ProfileUpdated` naming the fields that moved,
  /// and a screen that saved field by field would raise several — rescheduling
  /// the member's day once per keystroke group rather than once per visit.
  Future<void> _save(Map<String, dynamic> patch) async {
    setState(() {
      _saving = true;
      _problem = null;
    });
    try {
      final updated = await _mirror.patchProfile(patch);
      if (!mounted) return;
      setState(() {
        _profile = updated;
        _name.text = updated?.displayName ?? '';
      });
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() => _problem = e.isOffline
          ? AppLocalizations.of(context).offline
          : AppLocalizations.of(context).somethingWentWrong);
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final t = AppLocalizations.of(context);
    final profile = _profile;

    return Scaffold(
      appBar: AppBar(
        title: Text(t.profileTitle),
        actions: [
          IconButton(
            icon: const Icon(Icons.tune),
            tooltip: t.preferencesTitle,
            onPressed: () => context.push(Routes.preferences),
          ),
          // Also reachable from the sign-in screen, which is where it matters
          // most. Here too, because an address that worked can stop working -
          // a tunnel hostname changes, a machine moves - and by then the
          // member is signed in and would otherwise have to sign out to fix it.
          IconButton(
            icon: const Icon(Icons.dns_outlined),
            tooltip: t.serverSettings,
            onPressed: () => context.push(Routes.server),
          ),
          IconButton(
            icon: const Icon(Icons.logout),
            tooltip: t.signOut,
            onPressed: () => unawaited(context.read<AuthCubit>().signOut()),
          ),
        ],
      ),
      body: profile == null
          ? const Center(child: CircularProgressIndicator())
          : ListView(
              padding: const EdgeInsets.all(16),
              children: [
                if (context.read<AuthCubit>().state.mustChangePassword)
                  _Notice(text: t.changeYourPassword, severity: _Severity.warn),
                if (_problem != null)
                  _Notice(text: _problem!, severity: _Severity.error),

                TextField(
                  controller: _name,
                  decoration: InputDecoration(labelText: t.displayName),
                  onSubmitted: (value) =>
                      unawaited(_save({'displayName': value.trim()})),
                ),
                const SizedBox(height: 16),

                _TimezoneField(
                  value: profile.timezone,
                  saving: _saving,
                  onChanged: (zone) => unawaited(_save({'timezone': zone})),
                ),
                const SizedBox(height: 16),

                _LanguageField(
                  value: profile.locale,
                  onChanged: (locale) => unawaited(_save({'locale': locale})),
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
                  values: profile.foodLikes,
                  onChanged: (v) => unawaited(_save({'foodLikes': v})),
                ),
                TagEditor(
                  label: t.foodDislikes,
                  hint: t.addTagHint,
                  values: profile.foodDislikes,
                  onChanged: (v) => unawaited(_save({'foodDislikes': v})),
                ),
                TagEditor(
                  label: t.allergies,
                  hint: t.addTagHint,
                  // Spelled out, because this list is a safety input rather
                  // than a preference: meal suggestions withhold anything on
                  // it, and a member who does not know that will not fill it in.
                  help: t.allergiesHelp,
                  values: profile.allergies,
                  onChanged: (v) => unawaited(_save({'allergies': v})),
                ),
                TagEditor(
                  label: t.symptoms,
                  hint: t.addTagHint,
                  values: profile.symptoms,
                  onChanged: (v) => unawaited(_save({'symptoms': v})),
                ),
              ],
            ),
    );
  }

  Future<void> _addMetric(Map<String, dynamic> metric) async {
    setState(() => _saving = true);
    try {
      final updated = await _mirror.recordMetric(metric);
      if (mounted) setState(() => _profile = updated);
    } on ApiException {
      if (mounted) {
        setState(() => _problem = AppLocalizations.of(context).somethingWentWrong);
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
  const _TimezoneField({
    required this.value,
    required this.saving,
    required this.onChanged,
  });

  final String value;
  final bool saving;
  final void Function(String) onChanged;

  @override
  Widget build(BuildContext context) {
    final t = AppLocalizations.of(context);
    return Row(
      children: [
        Expanded(
          child: TextField(
            key: ValueKey(value),
            controller: TextEditingController(text: value),
            decoration: InputDecoration(labelText: t.timezone),
            onSubmitted: onChanged,
          ),
        ),
        IconButton(
          icon: const Icon(Icons.my_location),
          tooltip: t.timezone,
          onPressed: saving
              ? null
              : () async {
                  final detected = await deviceTimezoneOrNull();
                  if (detected != null && detected != value) onChanged(detected);
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
        const SizedBox(height: 8),

        if (profile.bmi != null)
          Text('${t.bmi}: ${profile.bmi}',
              style: Theme.of(context).textTheme.bodyLarge),

        Row(
          children: [
            Expanded(child: _number(_weight, t.weightKg)),
            const SizedBox(width: 8),
            Expanded(child: _number(_height, t.heightCm)),
            const SizedBox(width: 8),
            Expanded(child: _number(_fat, t.bodyFatPct)),
          ],
        ),
        if (_problem != null)
          Padding(
            padding: const EdgeInsets.only(top: 8),
            child: Text(
              _problem!,
              style: TextStyle(color: Theme.of(context).colorScheme.error),
            ),
          ),
        const SizedBox(height: 8),
        OutlinedButton.icon(
          icon: const Icon(Icons.add),
          label: Text(t.addMetric),
          onPressed: _submit,
        ),

        const SizedBox(height: 8),
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
      margin: const EdgeInsets.only(bottom: 16),
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: background,
        borderRadius: BorderRadius.circular(8),
      ),
      child: Text(text, style: TextStyle(color: foreground)),
    );
  }
}
