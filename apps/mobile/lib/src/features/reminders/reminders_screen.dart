import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../api/models.dart';
import '../../app_providers.dart';
import 'reminders_controller.dart';

/// Offsets offered in the editor. The user's own default comes from the
/// gateway; this is only the menu of what can be picked.
const _leadChoices = <String, String>{
  '1d': '1 day',
  '3h': '3 hours',
  '1h': '1 hour',
  '30m': '30 min',
  '10m': '10 min',
  '0m': 'At time',
};

class RemindersScreen extends ConsumerWidget {
  const RemindersScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final reminders = ref.watch(remindersControllerProvider);
    final controller = ref.read(remindersControllerProvider.notifier);

    return Scaffold(
      appBar: AppBar(title: const Text('Reminders')),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: () => _edit(context, ref, null),
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
          Expanded(child: _body(context, ref, reminders, controller)),
        ],
      ),
    );
  }

  Widget _body(
    BuildContext context,
    WidgetRef ref,
    RemindersState reminders,
    RemindersController controller,
  ) {
    if (reminders.loading) {
      return const Center(child: CircularProgressIndicator());
    }
    if (reminders.items.isEmpty) {
      return RefreshIndicator(
        onRefresh: controller.refresh,
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
      onRefresh: controller.refresh,
      child: ListView.separated(
        padding: const EdgeInsets.only(bottom: 88),
        itemCount: reminders.items.length,
        separatorBuilder: (_, __) => const Divider(height: 1),
        itemBuilder: (context, i) {
          final reminder = reminders.items[i];
          return _ReminderTile(
            reminder: reminder,
            onDone: () => controller.markDone(reminder.id),
            onCancel: () => controller.cancel(reminder.id),
            onEdit: () => _edit(context, ref, reminder),
            onDelete: () => _confirmDelete(context, controller, reminder),
          );
        },
      ),
    );
  }

  Future<void> _edit(BuildContext context, WidgetRef ref, Reminder? existing) async {
    final db = ref.read(databaseProvider);
    final leadDefaults = existing?.leadTimes ?? await defaultLeadTimes(db);
    if (!context.mounted) return;

    final draft = await showModalBottomSheet<_Draft>(
      context: context,
      isScrollControlled: true,
      builder: (_) => _EditSheet(existing: existing, leadTimes: leadDefaults),
    );
    if (draft == null) return;

    final controller = ref.read(remindersControllerProvider.notifier);
    if (existing == null) {
      await controller.create(draft.title, draft.remindAt, leadTimes: draft.leadTimes);
    } else {
      await controller.edit(
        existing.id,
        title: draft.title,
        remindAt: draft.remindAt,
        leadTimes: draft.leadTimes,
      );
    }
    if (!context.mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: Text('Reminder set for ${formatRemindAt(draft.remindAt)}')),
    );
  }

  Future<void> _confirmDelete(
    BuildContext context,
    RemindersController controller,
    Reminder reminder,
  ) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: const Text('Delete reminder?'),
        content: Text('"${reminder.title}" will be removed permanently.'),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(dialogContext).pop(false),
            child: const Text('Keep'),
          ),
          FilledButton(
            onPressed: () => Navigator.of(dialogContext).pop(true),
            child: const Text('Delete'),
          ),
        ],
      ),
    );
    if (confirmed == true) await controller.remove(reminder.id);
  }
}

class _ReminderTile extends StatelessWidget {
  const _ReminderTile({
    required this.reminder,
    required this.onDone,
    required this.onCancel,
    required this.onEdit,
    required this.onDelete,
  });

  final Reminder reminder;
  final VoidCallback onDone;
  final VoidCallback onCancel;
  final VoidCallback onEdit;
  final VoidCallback onDelete;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final finished = !reminder.isActive;
    final labels = reminder.leadTimes.map((l) => _leadChoices[l] ?? l).join(' · ');

    final tile = ListTile(
      leading: Icon(
        switch (reminder.status) {
          'done' => Icons.check_circle_outline,
          'cancelled' => Icons.cancel_outlined,
          _ => Icons.alarm,
        },
        color: finished ? scheme.outline : scheme.primary,
      ),
      title: Text(
        reminder.title,
        style: TextStyle(
          decoration: finished ? TextDecoration.lineThrough : null,
          color: finished ? scheme.outline : null,
        ),
      ),
      subtitle: Row(
        children: [
          Expanded(
            child: Text([
              formatRemindAt(reminder.remindAt),
              if (finished) reminder.status,
              if (!finished && labels.isNotEmpty) 'alerts: $labels',
            ].join('  ·  ')),
          ),
          if (reminder.pendingSync) ...[
            const SizedBox(width: 6),
            Icon(Icons.sync, size: 14, color: scheme.outline),
          ],
        ],
      ),
      // A finished reminder is not inert: deleting it is the only way it ever
      // leaves the list, which is what the old screen made impossible.
      trailing: finished
          ? IconButton(
              icon: const Icon(Icons.delete_outline),
              tooltip: 'Delete permanently',
              onPressed: onDelete,
            )
          : IconButton(
              icon: const Icon(Icons.close),
              tooltip: 'Cancel reminder',
              onPressed: onCancel,
            ),
      onTap: finished ? null : onEdit,
    );

    if (finished) return tile;

    return Dismissible(
      key: ValueKey(reminder.id),
      background: Container(
        alignment: Alignment.centerLeft,
        padding: const EdgeInsets.only(left: 20),
        color: scheme.primaryContainer,
        child: Icon(Icons.check, color: scheme.onPrimaryContainer),
      ),
      secondaryBackground: Container(
        alignment: Alignment.centerRight,
        padding: const EdgeInsets.only(right: 20),
        color: scheme.errorContainer,
        child: Icon(Icons.cancel, color: scheme.onErrorContainer),
      ),
      // Always false: the row stays in the list with a new status rather than
      // vanishing, so it must not be removed from the tree here.
      confirmDismiss: (direction) async {
        if (direction == DismissDirection.startToEnd) {
          onDone();
        } else {
          onCancel();
        }
        return false;
      },
      child: tile,
    );
  }
}

class _Draft {
  const _Draft(this.title, this.remindAt, this.leadTimes);

  final String title;
  final DateTime remindAt;
  final List<String> leadTimes;
}

/// Serves both new and existing reminders — the fields are identical, and two
/// copies of a date picker is two places for them to drift apart.
class _EditSheet extends StatefulWidget {
  const _EditSheet({required this.existing, required this.leadTimes});

  final Reminder? existing;
  final List<String> leadTimes;

  @override
  State<_EditSheet> createState() => _EditSheetState();
}

class _EditSheetState extends State<_EditSheet> {
  late final TextEditingController _title =
      TextEditingController(text: widget.existing?.title ?? '');
  late DateTime _when =
      widget.existing?.remindAt ?? DateTime.now().add(const Duration(hours: 1));
  late final Set<String> _leads = {...widget.leadTimes};

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
    final editing = widget.existing != null;
    final valid = _title.text.trim().isNotEmpty && _when.isAfter(DateTime.now());

    return Padding(
      // Lift the sheet above the keyboard.
      padding: EdgeInsets.only(
        left: 16,
        right: 16,
        top: 16,
        bottom: MediaQuery.of(context).viewInsets.bottom + 16,
      ),
      child: SingleChildScrollView(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text(editing ? 'Edit reminder' : 'New reminder',
                style: Theme.of(context).textTheme.titleMedium),
            const SizedBox(height: 12),
            TextField(
              controller: _title,
              autofocus: !editing,
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
                      style: TextStyle(color: Theme.of(context).colorScheme.error)),
              trailing: TextButton(onPressed: _pick, child: const Text('Change')),
              onTap: _pick,
            ),
            const Align(
              alignment: Alignment.centerLeft,
              child: Padding(
                padding: EdgeInsets.only(top: 8, bottom: 4),
                child: Text('Alert me'),
              ),
            ),
            Wrap(
              spacing: 8,
              children: [
                for (final entry in _leadChoices.entries)
                  FilterChip(
                    label: Text(entry.value),
                    selected: _leads.contains(entry.key),
                    onSelected: (on) => setState(() {
                      // At least one alert, or the reminder is silent.
                      if (on) {
                        _leads.add(entry.key);
                      } else if (_leads.length > 1) {
                        _leads.remove(entry.key);
                      }
                    }),
                  ),
              ],
            ),
            const SizedBox(height: 12),
            FilledButton(
              onPressed: valid
                  ? () => Navigator.of(context).pop(
                        _Draft(_title.text.trim(), _when, _leads.toList()),
                      )
                  : null,
              child: Text(editing ? 'Save' : 'Create'),
            ),
          ],
        ),
      ),
    );
  }
}
