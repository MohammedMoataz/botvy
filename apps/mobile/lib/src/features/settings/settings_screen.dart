import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../api/api_client.dart';
import '../../api/models.dart';
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
