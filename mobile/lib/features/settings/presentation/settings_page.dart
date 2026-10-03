import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:go_router/go_router.dart';

import '../../../app/appearance/appearance_cubit.dart';
import '../../../app/l10n/app_localizations.dart';
import '../../../app/router.dart';
import '../../../app/tokens.dart';
import '../../../core/api/api_client.dart';
import '../../../core/db/database.dart';
import '../../../ui/confirm_dialog.dart';
import '../../../ui/section.dart';
import '../../../ui/settings_tiles.dart';
import '../../../ui/states.dart';
import '../../profile/data/profile_mirror.dart';

/// The version Settings → About shows, passed by the release build as a
/// dart-define (`.github/workflows/release.yml`); a debug build says "dev".
const String _version = String.fromEnvironment(
  'BOTVY_VERSION',
  defaultValue: 'dev',
);

/// Every setting a member may change, in one place and in sections (030).
///
/// The member's preferences are the ones `PreferencesPage` used to hold, and
/// they behave as they did: every control writes immediately rather than
/// collecting into a Save button — these are independent settings, not one
/// form, and the server reports which fields moved so a single-field patch is
/// the cheap case. Each value is validated by the server against the schema of
/// its own `settings.defaults.*` entry, so this screen offers controls that
/// cannot express an invalid value and shows the server's refusal if one gets
/// through anyway.
///
/// Appearance is the phone's own and applies at once; see [AppearanceCubit].
class SettingsPage extends StatefulWidget {
  const SettingsPage({
    super.key,
    required this.mirror,
    required this.serverOrigin,
    required this.onSignOut,
  });

  final ProfileMirror mirror;

  /// Where the app points, shown under the gateway row.
  final String serverOrigin;

  /// Called after the member confirms.
  final Future<void> Function() onSignOut;

  @override
  State<SettingsPage> createState() => _SettingsPageState();
}

class _SettingsPageState extends State<SettingsPage> {
  UserPreference? _prefs;
  bool _saving = false;
  String? _problem;

  @override
  void initState() {
    super.initState();
    unawaited(_load());
  }

  Future<void> _load() async {
    final prefs = await widget.mirror.readPreferences();
    if (mounted) setState(() => _prefs = prefs);
  }

  Future<void> _patch(Map<String, dynamic> patch) async {
    setState(() {
      _saving = true;
      _problem = null;
    });
    try {
      final updated = await widget.mirror.patchPreferences(patch);
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

  Future<void> _signOut() async {
    final t = AppLocalizations.of(context);
    final confirmed = await showConfirmDialog(
      context,
      title: t.signOutConfirm,
      confirmLabel: t.signOut,
      destructive: true,
    );
    if (confirmed) await widget.onSignOut();
  }

  @override
  Widget build(BuildContext context) {
    final t = AppLocalizations.of(context);
    final prefs = _prefs;
    final enabled = !_saving;

    return Scaffold(
      body: CustomScrollView(
        slivers: [
          SliverAppBar.large(title: Text(t.settingsTitle)),
          if (_problem != null) SliverToBoxAdapter(child: _Problem(_problem!)),
          SliverList.list(
            children: [
              Section(
                title: t.sectionAccount,
                children: [
                  NavTile(
                    icon: Icons.person_outline,
                    title: t.profileTitle,
                    onTap: () => context.push(Routes.profile),
                  ),
                  DangerTile(
                    icon: Icons.logout,
                    title: t.signOut,
                    onTap: () => unawaited(_signOut()),
                  ),
                ],
              ),
              const _AppearanceSection(),
              if (prefs == null)
                const Padding(
                  padding: EdgeInsetsDirectional.all(BotvySpace.xl),
                  child: LoadingView(),
                )
              else ...[
                Section(
                  title: t.sectionDailyRhythm,
                  children: [
                    for (final (label, field, value) in [
                      (
                        t.planTomorrowTime,
                        'planTomorrowTime',
                        prefs.planTomorrowTime,
                      ),
                      (t.endOfDayTime, 'endOfDayTime', prefs.endOfDayTime),
                      (
                        t.morningBriefingTime,
                        'morningBriefingTime',
                        prefs.morningBriefingTime,
                      ),
                      (
                        t.nextPracticeCutoff,
                        'nextPracticeCutoff',
                        prefs.nextPracticeCutoff,
                      ),
                    ])
                      _TimeTile(
                        icon: Icons.schedule,
                        label: label,
                        value: value,
                        enabled: enabled,
                        onChanged: (v) => unawaited(_patch({field: v})),
                      ),
                    SwitchTile(
                      icon: Icons.nightlight_outlined,
                      title: t.checkinEnabled,
                      value: prefs.checkinEnabled,
                      onChanged: enabled
                          ? (v) => unawaited(_patch({'checkinEnabled': v}))
                          : null,
                    ),
                  ],
                ),
                Section(
                  title: t.sectionNotifications,
                  children: [
                    // Both halves of quiet hours together: the server's schema
                    // is one object, and sending half of it would fail
                    // validation rather than patching one field.
                    _TimeTile(
                      icon: Icons.bedtime_outlined,
                      label: t.quietFrom,
                      help: t.quietHoursHelp,
                      value: prefs.quietFrom,
                      enabled: enabled,
                      onChanged: (v) => unawaited(
                        _patch({
                          'quietHours': {'from': v, 'to': prefs.quietTo},
                        }),
                      ),
                    ),
                    _TimeTile(
                      icon: Icons.wb_sunny_outlined,
                      label: t.quietTo,
                      value: prefs.quietTo,
                      enabled: enabled,
                      onChanged: (v) => unawaited(
                        _patch({
                          'quietHours': {'from': prefs.quietFrom, 'to': v},
                        }),
                      ),
                    ),
                    _LeadTimes(
                      values: prefs.leadTimes,
                      enabled: enabled,
                      onChanged: (v) => unawaited(_patch({'leadTimes': v})),
                    ),
                  ],
                ),
                Section(
                  title: t.sectionPlanning,
                  children: [
                    ChoiceTile<String>(
                      icon: Icons.view_week_outlined,
                      title: t.weekStartsOn,
                      value: prefs.weekStartsOn,
                      options: {
                        'monday': t.monday,
                        'sunday': t.sunday,
                        'saturday': t.saturday,
                      },
                      onChanged: (v) => unawaited(_patch({'weekStartsOn': v})),
                    ),
                    _MeetingLength(
                      minutes: prefs.meetingDurationMin,
                      enabled: enabled,
                      onChanged: (v) =>
                          unawaited(_patch({'meetingDurationMin': v})),
                    ),
                    ChoiceTile<String>(
                      icon: Icons.restaurant_menu,
                      title: t.mealMode,
                      value: prefs.mealMode,
                      options: {
                        'llm': t.mealModeLlm,
                        'library': t.mealModeLibrary,
                      },
                      onChanged: (v) => unawaited(_patch({'mealMode': v})),
                    ),
                    SwitchTile(
                      icon: Icons.auto_awesome_outlined,
                      title: t.aiSuggestions,
                      value: prefs.aiSuggestions,
                      onChanged: enabled
                          ? (v) => unawaited(_patch({'aiSuggestions': v}))
                          : null,
                    ),
                  ],
                ),
              ],
              Section(
                title: t.sectionConnection,
                children: [
                  NavTile(
                    icon: Icons.dns_outlined,
                    title: t.serverSettings,
                    subtitle: widget.serverOrigin,
                    onTap: () => context.push(Routes.server),
                  ),
                ],
              ),
              Section(
                title: t.sectionAbout,
                children: [
                  ListTile(
                    leading: const Icon(Icons.info_outline),
                    title: Text(t.appVersion),
                    subtitle: const Text(_version),
                  ),
                  NavTile(
                    icon: Icons.description_outlined,
                    title: t.licences,
                    onTap: () => showLicensePage(
                      context: context,
                      applicationName: t.appTitle,
                      applicationVersion: _version,
                    ),
                  ),
                ],
              ),
              const SizedBox(height: BotvySpace.xxl),
            ],
          ),
        ],
      ),
    );
  }
}

class _AppearanceSection extends StatelessWidget {
  const _AppearanceSection();

  @override
  Widget build(BuildContext context) {
    final t = AppLocalizations.of(context);
    final cubit = context.watch<AppearanceCubit>();
    final state = cubit.state;
    return Section(
      title: t.sectionAppearance,
      children: [
        ListTile(
          leading: const Icon(Icons.palette_outlined),
          title: Text(t.theme),
          subtitle: Padding(
            padding: const EdgeInsetsDirectional.only(top: BotvySpace.sm),
            child: SegmentedButton<ThemeMode>(
              showSelectedIcon: false,
              segments: [
                ButtonSegment(
                  value: ThemeMode.system,
                  label: Text(t.themeSystem),
                ),
                ButtonSegment(
                  value: ThemeMode.light,
                  label: Text(t.themeLight),
                ),
                ButtonSegment(value: ThemeMode.dark, label: Text(t.themeDark)),
              ],
              selected: {state.themeMode},
              onSelectionChanged: (s) =>
                  unawaited(cubit.setThemeMode(s.single)),
            ),
          ),
        ),
        ChoiceTile<String>(
          icon: Icons.language,
          title: t.language,
          value: state.locale?.languageCode ?? '',
          // Each language in its own name, so a member who cannot read the
          // current one can still find theirs.
          options: {'': t.languageSystem, 'en': 'English', 'ar': 'العربية'},
          onChanged: (code) =>
              unawaited(cubit.setLocale(code.isEmpty ? null : Locale(code))),
        ),
        SwitchTile(
          icon: Icons.vibration,
          title: t.haptics,
          value: state.haptics,
          onChanged: (v) => unawaited(cubit.setHaptics(v)),
        ),
      ],
    );
  }
}

class _Problem extends StatelessWidget {
  const _Problem(this.text);

  final String text;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Padding(
      padding: const EdgeInsetsDirectional.symmetric(
        horizontal: BotvySpace.lg,
        vertical: BotvySpace.sm,
      ),
      child: Card.filled(
        margin: EdgeInsetsDirectional.zero,
        color: scheme.errorContainer,
        child: Padding(
          padding: const EdgeInsetsDirectional.all(BotvySpace.md),
          child: Text(text, style: TextStyle(color: scheme.onErrorContainer)),
        ),
      ),
    );
  }
}

/// One wall-clock time, through the platform picker.
///
/// A picker rather than a text field, because the server's schema is `HH:mm`
/// and a keyboard is how `9:5` and `21.00` get typed. The control cannot
/// produce an invalid value, so the validation on the other side never has to
/// refuse one.
class _TimeTile extends StatelessWidget {
  const _TimeTile({
    required this.icon,
    required this.label,
    this.help,
    required this.value,
    required this.enabled,
    required this.onChanged,
  });

  final IconData icon;
  final String label;
  final String? help;
  final String value;
  final bool enabled;
  final void Function(String) onChanged;

  @override
  Widget build(BuildContext context) => ListTile(
    leading: Icon(icon),
    title: Text(label),
    subtitle: help == null ? null : Text(help!),
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

/// The default meeting length. 5 to 480 on the server; the slider cannot leave
/// that range, which is the point of using one.
class _MeetingLength extends StatelessWidget {
  const _MeetingLength({
    required this.minutes,
    required this.enabled,
    required this.onChanged,
  });

  final int minutes;
  final bool enabled;
  final ValueChanged<int> onChanged;

  @override
  Widget build(BuildContext context) {
    final t = AppLocalizations.of(context);
    return ListTile(
      leading: const Icon(Icons.timelapse),
      title: Text(t.meetingDuration),
      trailing: Text(
        t.minutes(minutes),
        style: Theme.of(context).textTheme.titleMedium,
      ),
      subtitle: Slider(
        value: minutes.clamp(5, 240).toDouble(),
        min: 5,
        max: 240,
        divisions: 47,
        label: t.minutes(minutes),
        onChanged: enabled ? (_) {} : null,
        onChangeEnd: (v) => onChanged(v.round()),
      ),
    );
  }
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
  Widget build(BuildContext context) {
    final t = AppLocalizations.of(context);
    return ListTile(
      leading: const Icon(Icons.notifications_active_outlined),
      title: Text(t.leadTimes),
      subtitle: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(t.leadTimesHelp),
          const SizedBox(height: BotvySpace.sm),
          Wrap(
            spacing: BotvySpace.sm,
            runSpacing: BotvySpace.xs,
            children: [
              for (final offer in _offered)
                FilterChip(
                  label: Text(offer),
                  selected: values.contains(offer),
                  onSelected: !enabled
                      ? null
                      : (_) {
                          final selected = values.contains(offer);
                          final next = selected
                              ? values.where((v) => v != offer).toList()
                              // Kept in the order they are offered, so the
                              // list reads the same on every device rather
                              // than in tap order.
                              : [
                                  ..._offered.where(
                                    (o) => values.contains(o) || o == offer,
                                  ),
                                ];
                          // The server refuses an empty list; the last chip
                          // stays on.
                          if (next.isEmpty) return;
                          onChanged(next);
                        },
                ),
            ],
          ),
        ],
      ),
    );
  }
}
