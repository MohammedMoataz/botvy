import 'dart:async';

import 'package:flutter/foundation.dart' show listEquals, mapEquals;
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
import '../../../ui/save_bar.dart';
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
/// The member's preferences are the ones `PreferencesPage` used to hold. Since
/// 031 they collect in a draft and go to the server in one patch when the
/// member presses Save. Writing each control as it moved left nothing on the
/// screen saying anything had been saved, and members went looking for a
/// button that was not there. Leaving with unsaved edits asks first. Each
/// value is validated by the server against the schema of its own
/// `settings.defaults.*` entry, so this screen offers controls that cannot
/// express an invalid value and shows the server's refusal if one gets through
/// anyway.
///
/// Appearance is the phone's own and still applies at once (you see the theme
/// change as you pick it); see [AppearanceCubit]. It is not part of the draft.
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

  /// Edits not yet saved, keyed by the server's field name. A control that is
  /// moved back to the stored value drops out, so Save is only enabled when
  /// something would actually change.
  final Map<String, Object> _draft = {};

  @override
  void initState() {
    super.initState();
    unawaited(_load());
  }

  Future<void> _load() async {
    final prefs = await widget.mirror.readPreferences();
    if (mounted) setState(() => _prefs = prefs);
  }

  /// The value a control shows: the draft's if it has one, else the stored one.
  T _value<T extends Object>(String field, T stored) =>
      (_draft[field] as T?) ?? stored;

  void _edit(String field, Object value, Object stored) => setState(() {
        if (_same(value, stored)) {
          _draft.remove(field);
        } else {
          _draft[field] = value;
        }
      });

  Future<void> _save() async {
    if (_draft.isEmpty) return;
    final t = AppLocalizations.of(context);
    final messenger = ScaffoldMessenger.of(context);
    setState(() {
      _saving = true;
      _problem = null;
    });
    try {
      final updated = await widget.mirror.patchPreferences(Map.of(_draft));
      if (!mounted) return;
      setState(() {
        _prefs = updated;
        _draft.clear();
      });
      messenger.showSnackBar(SnackBar(content: Text(t.saved)));
    } on ApiException catch (e) {
      if (!mounted) return;
      // The server's refusal, shown as its own message: "endOfDayTime: a
      // wall-clock time as HH:mm" names the field and the rule, and a generic
      // "something went wrong" would throw both away. The draft stays, so the
      // member fixes the one field rather than redoing all of them.
      setState(() => _problem = e.isOffline ? t.offline : e.message);
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
    final dirty = _draft.isNotEmpty;
    final quietStored = prefs == null
        ? const <String, String>{}
        : {'from': prefs.quietFrom, 'to': prefs.quietTo};
    final quiet = _value<Map<String, String>>('quietHours', quietStored);

    return UnsavedChangesGuard(
      dirty: dirty,
      child: Scaffold(
        bottomNavigationBar: prefs == null
            ? null
            : SaveBar(
                dirty: dirty,
                saving: _saving,
                onSave: () => unawaited(_save()),
              ),
        body: CustomScrollView(
          slivers: [
            SliverAppBar.large(title: Text(t.settingsTitle)),
            if (_problem != null)
              SliverToBoxAdapter(child: _Problem(_problem!)),
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
                          value: _value(field, value),
                          enabled: enabled,
                          onChanged: (v) => _edit(field, v, value),
                        ),
                      SwitchTile(
                        icon: Icons.nightlight_outlined,
                        title: t.checkinEnabled,
                        value: _value('checkinEnabled', prefs.checkinEnabled),
                        onChanged: enabled
                            ? (v) => _edit(
                                  'checkinEnabled',
                                  v,
                                  prefs.checkinEnabled,
                                )
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
                        value: quiet['from']!,
                        enabled: enabled,
                        onChanged: (v) => _edit(
                            'quietHours',
                            {
                              'from': v,
                              'to': quiet['to']!,
                            },
                            quietStored),
                      ),
                      _TimeTile(
                        icon: Icons.wb_sunny_outlined,
                        label: t.quietTo,
                        value: quiet['to']!,
                        enabled: enabled,
                        onChanged: (v) => _edit(
                            'quietHours',
                            {
                              'from': quiet['from']!,
                              'to': v,
                            },
                            quietStored),
                      ),
                      _LeadTimes(
                        values: _value('leadTimes', prefs.leadTimes),
                        enabled: enabled,
                        onChanged: (v) =>
                            _edit('leadTimes', v, prefs.leadTimes),
                      ),
                    ],
                  ),
                  Section(
                    title: t.sectionPlanning,
                    children: [
                      ChoiceTile<String>(
                        icon: Icons.view_week_outlined,
                        title: t.weekStartsOn,
                        value: _value('weekStartsOn', prefs.weekStartsOn),
                        options: {
                          'monday': t.monday,
                          'sunday': t.sunday,
                          'saturday': t.saturday,
                        },
                        enabled: enabled,
                        onChanged: (v) =>
                            _edit('weekStartsOn', v, prefs.weekStartsOn),
                      ),
                      _MeetingLength(
                        minutes: _value(
                          'meetingDurationMin',
                          prefs.meetingDurationMin,
                        ),
                        enabled: enabled,
                        onChanged: (v) => _edit(
                          'meetingDurationMin',
                          v,
                          prefs.meetingDurationMin,
                        ),
                      ),
                      ChoiceTile<String>(
                        icon: Icons.restaurant_menu,
                        title: t.mealMode,
                        value: _value('mealMode', prefs.mealMode),
                        options: {
                          'llm': t.mealModeLlm,
                          'library': t.mealModeLibrary,
                        },
                        enabled: enabled,
                        onChanged: (v) => _edit('mealMode', v, prefs.mealMode),
                      ),
                      SwitchTile(
                        icon: Icons.auto_awesome_outlined,
                        title: t.aiSuggestions,
                        value: _value('aiSuggestions', prefs.aiSuggestions),
                        onChanged: enabled
                            ? (v) =>
                                _edit('aiSuggestions', v, prefs.aiSuggestions)
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
      ),
    );
  }
}

/// Equal as the server would store them: lists and the quiet-hours object by
/// content, everything else by value.
bool _same(Object a, Object b) => switch ((a, b)) {
      (final List<Object?> x, final List<Object?> y) => listEquals(x, y),
      (final Map<Object?, Object?> x, final Map<Object?, Object?> y) =>
        mapEquals(x, y),
      _ => a == b,
    };

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
          final formatted = '${picked.hour.toString().padLeft(2, '0')}:'
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
