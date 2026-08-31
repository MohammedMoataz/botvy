import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../api/api_client.dart';
import '../../api/models.dart';
import '../../app_providers.dart';
import '../auth/auth_controller.dart';

class SettingsScreen extends ConsumerStatefulWidget {
  const SettingsScreen({super.key});

  @override
  ConsumerState<SettingsScreen> createState() => _SettingsScreenState();
}

class _SettingsScreenState extends ConsumerState<SettingsScreen> {
  late final TextEditingController _baseUrl =
      TextEditingController(text: ref.read(apiClientProvider).baseUrl);

  @override
  void dispose() {
    _baseUrl.dispose();
    super.dispose();
  }

  Future<void> _saveBaseUrl() async {
    final api = ref.read(apiClientProvider);
    api.baseUrl = _baseUrl.text;
    await api.tokens.writeBaseUrl(api.baseUrl);
    _baseUrl.text = api.baseUrl; // reflect the trimmed value
    ref.invalidate(healthProvider);
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: Text('Server set to ${api.baseUrl}')),
    );
  }

  @override
  Widget build(BuildContext context) {
    final auth = ref.watch(authControllerProvider);
    final health = ref.watch(healthProvider);

    return Scaffold(
      appBar: AppBar(title: const Text('Settings')),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          Text('Server', style: Theme.of(context).textTheme.titleMedium),
          const SizedBox(height: 8),
          TextField(
            controller: _baseUrl,
            keyboardType: TextInputType.url,
            autocorrect: false,
            decoration: const InputDecoration(
              labelText: 'Gateway base URL',
              helperText: 'Android emulator reaches the host at 10.0.2.2',
              border: OutlineInputBorder(),
            ),
            onSubmitted: (_) => _saveBaseUrl(),
          ),
          const SizedBox(height: 8),
          Align(
            alignment: Alignment.centerRight,
            child: FilledButton(
              onPressed: _saveBaseUrl,
              child: const Text('Save'),
            ),
          ),
          const SizedBox(height: 8),
          _HealthTile(health: health, onRetry: () => ref.invalidate(healthProvider)),
          const Divider(height: 40),
          const _CoachingSection(),
          const Divider(height: 40),
          Text('Account', style: Theme.of(context).textTheme.titleMedium),
          const SizedBox(height: 8),
          ListTile(
            contentPadding: EdgeInsets.zero,
            leading: const Icon(Icons.person_outline),
            title: Text(auth.email ?? 'Not signed in'),
            subtitle: Text(auth.signedIn ? 'Signed in' : 'Signed out'),
          ),
          if (auth.signedIn)
            Align(
              alignment: Alignment.centerLeft,
              child: OutlinedButton.icon(
                icon: const Icon(Icons.logout),
                label: const Text('Sign out'),
                onPressed: () async {
                  await ref.read(authControllerProvider.notifier).logout();
                  if (context.mounted) Navigator.of(context).pop();
                },
              ),
            ),
        ],
      ),
    );
  }
}

/// The profile the gateway keeps for this user: the timezone every reminder is
/// resolved against, and the coaching cycle's opt-in and times.
final _profileProvider = FutureProvider.autoDispose<CoachingProfile?>(
  (ref) => ref.watch(apiClientProvider).coachingProfile(),
);

const _weekdayNames = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

class _CoachingSection extends ConsumerWidget {
  const _CoachingSection();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final profile = ref.watch(_profileProvider);
    final scheduler = ref.watch(notificationSchedulerProvider);

    Future<void> patch(Map<String, dynamic> change) async {
      await ref.read(apiClientProvider).updateCoachingProfile(change);
      ref.invalidate(_profileProvider);
    }

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Text('Reminders & coaching', style: Theme.of(context).textTheme.titleMedium),
        const SizedBox(height: 8),
        if (!scheduler.exactAlarmsAllowed)
          // Reminders still arrive, just not to the minute — worth saying so
          // rather than letting a late alarm look like a bug.
          ListTile(
            contentPadding: EdgeInsets.zero,
            leading: Icon(Icons.warning_amber, color: Theme.of(context).colorScheme.error),
            title: const Text('Exact alarms are off'),
            subtitle: const Text(
              'Android may delay reminders by a few minutes. Enable "Alarms & '
              'reminders" for Botvy in system settings.',
            ),
          ),
        profile.when(
          loading: () => const Padding(
            padding: EdgeInsets.symmetric(vertical: 12),
            child: LinearProgressIndicator(),
          ),
          error: (e, _) => ListTile(
            contentPadding: EdgeInsets.zero,
            leading: const Icon(Icons.cloud_off),
            title: const Text('Coaching settings need a connection'),
            subtitle: Text('$e'),
          ),
          data: (data) => _CoachingFields(profile: data, onPatch: patch),
        ),
      ],
    );
  }
}

class _CoachingFields extends StatelessWidget {
  const _CoachingFields({required this.profile, required this.onPatch});

  final CoachingProfile? profile;
  final Future<void> Function(Map<String, dynamic>) onPatch;

  Future<void> _pickTime(
    BuildContext context,
    String field,
    String? current,
    String fallback,
  ) async {
    final parts = (current ?? fallback).split(':');
    final picked = await showTimePicker(
      context: context,
      initialTime: TimeOfDay(
        hour: int.tryParse(parts.first) ?? 21,
        minute: int.tryParse(parts.last) ?? 0,
      ),
    );
    if (picked == null) return;
    final value = '${picked.hour.toString().padLeft(2, '0')}:'
        '${picked.minute.toString().padLeft(2, '0')}';
    await onPatch({field: value});
  }

  @override
  Widget build(BuildContext context) {
    final optedIn = profile?.optedIn ?? false;
    final days = profile?.trainingDays ?? const <int>[];

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        ListTile(
          contentPadding: EdgeInsets.zero,
          leading: const Icon(Icons.public),
          title: const Text('Timezone'),
          // Set automatically from the handset on every sync: "8pm" has to mean
          // 8pm where the user is, and they should not have to say so twice.
          subtitle: Text('${profile?.timezone ?? 'detecting…'} · from this device'),
        ),
        SwitchListTile(
          contentPadding: EdgeInsets.zero,
          value: optedIn,
          title: const Text('Daily check-in & program'),
          subtitle: const Text('An evening check-in, and tomorrow\'s plan at night.'),
          onChanged: (on) => onPatch({'optedIn': on}),
        ),
        if (optedIn) ...[
          ListTile(
            contentPadding: EdgeInsets.zero,
            leading: const Icon(Icons.event_available),
            title: const Text('Check-in time'),
            subtitle: Text(profile?.checkinTime ?? '21:00 (default)'),
            onTap: () => _pickTime(context, 'checkinTime', profile?.checkinTime, '21:00'),
          ),
          ListTile(
            contentPadding: EdgeInsets.zero,
            leading: const Icon(Icons.fitness_center),
            title: const Text('Program time'),
            subtitle: Text(profile?.programTime ?? '22:00 (default)'),
            onTap: () => _pickTime(context, 'programTime', profile?.programTime, '22:00'),
          ),
          const Padding(
            padding: EdgeInsets.only(top: 8, bottom: 4),
            child: Text('Training days'),
          ),
          Wrap(
            spacing: 8,
            children: [
              for (var iso = 1; iso <= 7; iso++)
                FilterChip(
                  label: Text(_weekdayNames[iso - 1]),
                  selected: days.contains(iso),
                  onSelected: (on) => onPatch({
                    'trainingDays': [
                      for (final d in days)
                        if (d != iso) d,
                      if (on) iso,
                    ]..sort(),
                  }),
                ),
            ],
          ),
          const SizedBox(height: 8),
          // Allergies gate the generated plan: one containing a declared
          // allergen is withheld, not sent with a warning.
          TextFormField(
            initialValue: (profile?.allergies ?? const []).join(', '),
            decoration: const InputDecoration(
              labelText: 'Allergies',
              helperText: 'Comma separated. A plan containing one is never sent.',
              border: OutlineInputBorder(),
            ),
            onFieldSubmitted: (value) => onPatch({
              'allergies': [
                for (final a in value.split(','))
                  if (a.trim().isNotEmpty) a.trim(),
              ],
            }),
          ),
        ],
      ],
    );
  }
}

class _HealthTile extends StatelessWidget {
  const _HealthTile({required this.health, required this.onRetry});

  final AsyncValue<HealthStatus> health;
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) {
    return health.when(
      loading: () => const ListTile(
        contentPadding: EdgeInsets.zero,
        leading: SizedBox(
          height: 20,
          width: 20,
          child: CircularProgressIndicator(strokeWidth: 2),
        ),
        title: Text('Checking gateway...'),
      ),
      error: (e, _) => ListTile(
        contentPadding: EdgeInsets.zero,
        leading: Icon(Icons.cloud_off, color: Theme.of(context).colorScheme.error),
        title: const Text('Unreachable'),
        subtitle: Text('$e'),
        trailing: IconButton(
          icon: const Icon(Icons.refresh),
          onPressed: onRetry,
        ),
      ),
      data: (status) {
        final ok = status.ok;
        return ListTile(
          contentPadding: EdgeInsets.zero,
          leading: Icon(
            ok ? Icons.check_circle : Icons.error_outline,
            color: ok ? Colors.green : Theme.of(context).colorScheme.error,
          ),
          title: Text(ok ? 'Gateway healthy' : 'Gateway degraded'),
          subtitle: Text(
            'database: ${status.database}   ollama: ${status.ollama}',
          ),
          trailing: IconButton(
            icon: const Icon(Icons.refresh),
            onPressed: onRetry,
          ),
        );
      },
    );
  }
}
