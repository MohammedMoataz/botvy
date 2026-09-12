import 'package:flutter/material.dart';

import '../../../app/l10n/app_localizations.dart';
import '../../profile/data/profile_mirror.dart';
import 'onboarding_steps.dart';

/// The steps this phase contributes: name, time zone, and a look at the three
/// daily times.
///
/// Registered from here rather than listed in the walkthrough, so P6's sports
/// question and P8's meals question can arrive the same way — by calling
/// `register`, without editing the page that shows them.
///
/// Orders are sparse (100, 200, 300) so a later phase can slot something
/// between two without renumbering either.
void registerIdentitySteps(OnboardingRegistry registry, ProfileMirror mirror) {
  registry
    ..register(
      OnboardingStep(
        id: 'identity.name',
        order: 100,
        // Skipped for anybody who gave a name when they registered. Asking
        // again is how a walkthrough earns its reputation.
        isNeeded: () async {
          final profile = await mirror.readProfile();
          return (profile?.displayName ?? '').isEmpty;
        },
        build: (context, onDone) => _NameStep(mirror: mirror, onDone: onDone),
      ),
    )
    ..register(
      OnboardingStep(
        id: 'identity.timezone',
        order: 200,
        // Always shown, even though registration sends a zone. It is the one
        // answer every reminder the member ever gets is resolved against, and
        // a phone that guessed wrong is worth catching here rather than three
        // weeks of alarms later.
        build: (context, onDone) =>
            _TimezoneStep(mirror: mirror, onDone: onDone),
      ),
    )
    ..register(
      OnboardingStep(
        id: 'identity.times',
        order: 300,
        build: (context, onDone) => _TimesStep(mirror: mirror),
      ),
    );
}

class _NameStep extends StatefulWidget {
  const _NameStep({required this.mirror, required this.onDone});

  final ProfileMirror mirror;
  final VoidCallback onDone;

  @override
  State<_NameStep> createState() => _NameStepState();
}

class _NameStepState extends State<_NameStep> {
  final _controller = TextEditingController();

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final t = AppLocalizations.of(context);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(t.welcomeTitle, style: Theme.of(context).textTheme.headlineSmall),
        const SizedBox(height: 8),
        Text(t.welcomeBody),
        const SizedBox(height: 24),
        TextField(
          controller: _controller,
          decoration: InputDecoration(labelText: t.displayName),
          textInputAction: TextInputAction.done,
          onSubmitted: (value) async {
            final name = value.trim();
            // An empty name is a valid answer — the member declined — and
            // writing one would be a patch that changes nothing.
            if (name.isNotEmpty) {
              await widget.mirror.patchProfile({'displayName': name});
            }
            widget.onDone();
          },
        ),
      ],
    );
  }
}

class _TimezoneStep extends StatefulWidget {
  const _TimezoneStep({required this.mirror, required this.onDone});

  final ProfileMirror mirror;
  final VoidCallback onDone;

  @override
  State<_TimezoneStep> createState() => _TimezoneStepState();
}

class _TimezoneStepState extends State<_TimezoneStep> {
  String? _zone;

  @override
  void initState() {
    super.initState();
    _read();
  }

  Future<void> _read() async {
    final profile = await widget.mirror.readProfile();
    if (mounted) setState(() => _zone = profile?.timezone);
  }

  @override
  Widget build(BuildContext context) {
    final t = AppLocalizations.of(context);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          t.onboardingTimezone,
          style: Theme.of(context).textTheme.headlineSmall,
        ),
        const SizedBox(height: 8),
        Text(t.onboardingTimezoneBody),
        const SizedBox(height: 24),
        // Shown as a fact to confirm rather than a field to fill. It was
        // detected from the handset at registration, and the common case is
        // that it is already right.
        ListTile(
          contentPadding: EdgeInsets.zero,
          leading: const Icon(Icons.public),
          title: Text(_zone ?? '…'),
          subtitle: Text(t.timezone),
        ),
      ],
    );
  }
}

class _TimesStep extends StatefulWidget {
  const _TimesStep({required this.mirror});

  final ProfileMirror mirror;

  @override
  State<_TimesStep> createState() => _TimesStepState();
}

class _TimesStepState extends State<_TimesStep> {
  UserPreferenceView? _view;

  @override
  void initState() {
    super.initState();
    _read();
  }

  Future<void> _read() async {
    final prefs = await widget.mirror.readPreferences();
    if (!mounted || prefs == null) return;
    setState(
      () => _view = UserPreferenceView(
        plan: prefs.planTomorrowTime,
        endOfDay: prefs.endOfDayTime,
        morning: prefs.morningBriefingTime,
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final t = AppLocalizations.of(context);
    final view = _view;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          t.onboardingTimes,
          style: Theme.of(context).textTheme.headlineSmall,
        ),
        const SizedBox(height: 8),
        Text(t.onboardingTimesBody),
        const SizedBox(height: 24),
        // A preview, not an editor. The member has just arrived and has no
        // basis yet for choosing a briefing time; Preferences is where they
        // change it once they do, and this is so they know it exists.
        if (view == null)
          const Center(child: CircularProgressIndicator())
        else ...[
          _row(context, Icons.wb_sunny_outlined, t.morningBriefingTime, view.morning),
          _row(context, Icons.event_note_outlined, t.planTomorrowTime, view.plan),
          _row(context, Icons.nightlight_outlined, t.endOfDayTime, view.endOfDay),
        ],
      ],
    );
  }

  Widget _row(BuildContext context, IconData icon, String label, String value) =>
      ListTile(
        contentPadding: EdgeInsets.zero,
        leading: Icon(icon),
        title: Text(label),
        trailing: Text(value, style: Theme.of(context).textTheme.titleMedium),
      );
}

/// Just the three times, so the step does not hold a whole drift row it does
/// not read.
class UserPreferenceView {
  const UserPreferenceView({
    required this.plan,
    required this.endOfDay,
    required this.morning,
  });

  final String plan;
  final String endOfDay;
  final String morning;
}
