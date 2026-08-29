import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../api/models.dart';
import 'reminders_controller.dart';

class RemindersScreen extends ConsumerWidget {
  const RemindersScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final reminders = ref.watch(remindersControllerProvider);
    final controller = ref.read(remindersControllerProvider.notifier);

    return Scaffold(
      appBar: AppBar(title: const Text('Reminders')),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: reminders.busy ? null : () => _create(context, ref),
        icon: const Icon(Icons.add_alarm),
        label: const Text('New'),
      ),
      body: Column(
        children: [
          if (reminders.error != null)
            MaterialBanner(
              content: Text(reminders.error!),
              actions: [
                TextButton(
                  onPressed: controller.clearError,
                  child: const Text('Dismiss'),
                ),
              ],
            ),
          Expanded(child: _body(reminders, controller)),
        ],
      ),
    );
  }

  Widget _body(RemindersState reminders, RemindersController controller) {
    if (reminders.loading) {
      return const Center(child: CircularProgressIndicator());
    }
    if (reminders.items.isEmpty) {
      return RefreshIndicator(
        onRefresh: controller.load,
        // A ListView (not a bare Center) so pull-to-refresh still works when
        // there is nothing to scroll.
        child: ListView(
          children: const [
            SizedBox(height: 120),
            Padding(
              padding: EdgeInsets.all(32),
              child: Text('No reminders yet. Tap New to add one.',
                  textAlign: TextAlign.center),
            ),
          ],
        ),
      );
    }
    return RefreshIndicator(
      onRefresh: controller.load,
      child: ListView.separated(
        padding: const EdgeInsets.only(bottom: 88),
        itemCount: reminders.items.length,
        separatorBuilder: (_, __) => const Divider(height: 1),
        itemBuilder: (context, i) => _ReminderTile(
          reminder: reminders.items[i],
          onCancel: controller.cancel,
        ),
      ),
    );
  }

  Future<void> _create(BuildContext context, WidgetRef ref) async {
    final draft = await showModalBottomSheet<_Draft>(
      context: context,
      isScrollControlled: true,
      builder: (_) => const _CreateSheet(),
    );
    if (draft == null) return;
    final ok = await ref
        .read(remindersControllerProvider.notifier)
        .create(draft.title, draft.remindAt);
    if (ok && context.mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Reminder set for '
            '${formatRemindAt(draft.remindAt)}')),
      );
    }
  }
}

class _ReminderTile extends StatelessWidget {
  const _ReminderTile({required this.reminder, required this.onCancel});

  final Reminder reminder;
  final Future<void> Function(String id) onCancel;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final done = !reminder.isActive;
    final labels = reminder.notifications.map((n) => n.label).join(' · ');

    final tile = ListTile(
      leading: Icon(
        switch (reminder.status) {
          'done' => Icons.check_circle_outline,
          'cancelled' => Icons.cancel_outlined,
          _ => Icons.alarm,
        },
        color: done ? scheme.outline : scheme.primary,
      ),
      title: Text(
        reminder.title,
        style: TextStyle(
          decoration: reminder.status == 'cancelled'
              ? TextDecoration.lineThrough
              : null,
          color: done ? scheme.outline : null,
        ),
      ),
      subtitle: Text([
        formatRemindAt(reminder.remindAt),
        if (done) reminder.status,
        // An empty list is normal: lead times already in the past are dropped
        // by the gateway.
        if (labels.isNotEmpty) 'alerts: $labels',
      ].join('  ·  ')),
      trailing: reminder.isActive
          ? IconButton(
              icon: const Icon(Icons.close),
              tooltip: 'Cancel reminder',
              onPressed: () => onCancel(reminder.id),
            )
          : null,
    );

    if (!reminder.isActive) return tile;

    return Dismissible(
      key: ValueKey(reminder.id),
      direction: DismissDirection.endToStart,
      background: Container(
        alignment: Alignment.centerRight,
        padding: const EdgeInsets.only(right: 20),
        color: scheme.errorContainer,
        child: Icon(Icons.cancel, color: scheme.onErrorContainer),
      ),
      // Always false: a cancelled reminder stays in the list with a new
      // status, so the row must not be removed from the tree.
      confirmDismiss: (_) async {
        await onCancel(reminder.id);
        return false;
      },
      child: tile,
    );
  }
}

class _Draft {
  const _Draft(this.title, this.remindAt);

  final String title;
  final DateTime remindAt;
}

class _CreateSheet extends StatefulWidget {
  const _CreateSheet();

  @override
  State<_CreateSheet> createState() => _CreateSheetState();
}

class _CreateSheetState extends State<_CreateSheet> {
  final _title = TextEditingController();
  DateTime _when = DateTime.now().add(const Duration(hours: 1));

  @override
  void dispose() {
    _title.dispose();
    super.dispose();
  }

  Future<void> _pick() async {
    final now = DateTime.now();
    final date = await showDatePicker(
      context: context,
      initialDate: _when.isBefore(now) ? now : _when,
      firstDate: DateTime(now.year, now.month, now.day),
      lastDate: DateTime(now.year + 5),
    );
    if (date == null || !mounted) return;
    final time = await showTimePicker(
      context: context,
      initialTime: TimeOfDay.fromDateTime(_when),
    );
    if (time == null || !mounted) return;
    setState(() {
      _when = DateTime(date.year, date.month, date.day, time.hour, time.minute);
    });
  }

  @override
  Widget build(BuildContext context) {
    final valid =
        _title.text.trim().isNotEmpty && _when.isAfter(DateTime.now());

    return Padding(
      // Lift the sheet above the keyboard.
      padding: EdgeInsets.only(
        left: 16,
        right: 16,
        top: 16,
        bottom: MediaQuery.of(context).viewInsets.bottom + 16,
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text('New reminder',
              style: Theme.of(context).textTheme.titleMedium),
          const SizedBox(height: 12),
          TextField(
            controller: _title,
            autofocus: true,
            textCapitalization: TextCapitalization.sentences,
            decoration: const InputDecoration(
              labelText: 'What should I remind you about?',
              border: OutlineInputBorder(),
            ),
            onChanged: (_) => setState(() {}),
          ),
          const SizedBox(height: 8),
          ListTile(
            contentPadding: EdgeInsets.zero,
            leading: const Icon(Icons.schedule),
            title: Text(formatRemindAt(_when)),
            subtitle: _when.isAfter(DateTime.now())
                ? null
                : Text('Pick a time in the future',
                    style: TextStyle(
                        color: Theme.of(context).colorScheme.error)),
            trailing: TextButton(onPressed: _pick, child: const Text('Change')),
            onTap: _pick,
          ),
          const SizedBox(height: 8),
          FilledButton(
            onPressed: valid
                ? () =>
                    Navigator.of(context).pop(_Draft(_title.text.trim(), _when))
                : null,
            child: const Text('Create'),
          ),
        ],
      ),
    );
  }
}
