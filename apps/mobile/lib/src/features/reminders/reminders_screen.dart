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
          Padding(
            padding: const EdgeInsets.fromLTRB(12, 8, 12, 4),
            child: SegmentedButton<bool>(
              segments: [
                const ButtonSegment(value: false, label: Text('Active')),
                ButtonSegment(
                  value: true,
                  label: Text(reminders.deleted.isEmpty
                      ? 'Deleted'
                      : 'Deleted (${reminders.deleted.length})'),
                ),
              ],
              selected: {reminders.showDeleted},
              onSelectionChanged: (_) => controller.toggleDeletedView(),
            ),
          ),
          Expanded(
            child: reminders.showDeleted
                ? _deletedBody(context, reminders, controller)
                : _body(context, ref, reminders, controller),
          ),
        ],
      ),
    );
  }

  /// Recently deleted, with what each one was and a way back.
  ///
  /// Bounded by the gateway's own tombstone horizon rather than by anything
  /// kept here: once the server purges a tombstone it stops appearing in a full
  /// snapshot, and the row goes with it.
  Widget _deletedBody(
    BuildContext context,
    RemindersState reminders,
    RemindersController controller,
  ) {
    if (reminders.deleted.isEmpty) {
      return RefreshIndicator(
        onRefresh: controller.refresh,
        child: ListView(
          children: const [
            SizedBox(height: 120),
            Padding(
              padding: EdgeInsets.all(32),
              child: Text(
                'Nothing deleted recently.\nDeleted reminders stay here for a while, then go for good.',
                textAlign: TextAlign.center,
              ),
            ),
          ],
        ),
      );
    }

    return RefreshIndicator(
      onRefresh: controller.refresh,
      child: ListView.separated(
        padding: const EdgeInsets.only(bottom: 88),
        itemCount: reminders.deleted.length,
        separatorBuilder: (_, __) => const Divider(height: 1),
        itemBuilder: (context, i) {
          final reminder = reminders.deleted[i];
          return _DeletedTile(
            reminder: reminder,
            onRestore: () async {
              await controller.restore(reminder.id);
              if (!context.mounted) return;
              ScaffoldMessenger.of(context).showSnackBar(
                SnackBar(content: Text('"${reminder.title}" restored')),
              );
            },
          );
        },
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
            onRetry: () => controller.retry(reminder.id),
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
        content: Text(
          '"${reminder.title}" moves to Deleted. You can restore it from there.',
        ),
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
    if (confirmed != true) return;

    await controller.remove(reminder.id);
    if (!context.mounted) return;
    // The undo the user actually wants is the one for the tap they just
    // regretted; the Deleted view is for the ones they regret later.
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text('"${reminder.title}" deleted'),
        action: SnackBarAction(
          label: 'Undo',
          onPressed: () => controller.restore(reminder.id),
        ),
      ),
    );
  }
}

/// One row in the undo list: what it was, when it went, and a way back.
class _DeletedTile extends StatelessWidget {
  const _DeletedTile({required this.reminder, required this.onRestore});

  final Reminder reminder;
  final VoidCallback onRestore;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final state = reminder.state();

    return ListTile(
      leading: Icon(
        switch (state) {
          ReminderState.completed => Icons.check_circle_outline,
          ReminderState.cancelled => Icons.cancel_outlined,
          ReminderState.overdue => Icons.alarm_on,
          ReminderState.upcoming => Icons.alarm,
        },
        color: scheme.outline,
      ),
      title: Text(reminder.title, style: TextStyle(color: scheme.onSurfaceVariant)),
      subtitle: Text([
        state.label,
        formatRemindAt(reminder.remindAt),
        if (reminder.pendingSync) 'waiting to sync',
      ].join('  ·  ')),
      trailing: TextButton.icon(
        onPressed: onRestore,
        icon: const Icon(Icons.restore, size: 18),
        label: const Text('Restore'),
      ),
    );
  }
}

class _ReminderTile extends StatelessWidget {
  const _ReminderTile({
    required this.reminder,
    required this.onDone,
    required this.onCancel,
    required this.onEdit,
    required this.onDelete,
    required this.onRetry,
  });

  final Reminder reminder;
  final VoidCallback onDone;
  final VoidCallback onCancel;
  final VoidCallback onEdit;
  final VoidCallback onDelete;
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final finished = !reminder.isActive;
    final labels = reminder.leadTimes.map((l) => _leadChoices[l] ?? l).join(' · ');

    final tile = ListTile(
      leading: Icon(
        switch (reminder.state()) {
          ReminderState.completed => Icons.check_circle_outline,
          ReminderState.cancelled => Icons.cancel_outlined,
          ReminderState.overdue => Icons.alarm_on,
          ReminderState.upcoming => Icons.alarm,
        },
        color: finished
            ? scheme.outline
            : reminder.state() == ReminderState.overdue
                ? scheme.error
                : scheme.primary,
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
              // Overdue is the one state with no stored counterpart: an active
              // reminder whose moment has passed. Saying so is the difference
              // between "you have not dealt with this" and silence.
              if (finished || reminder.state() == ReminderState.overdue)
                reminder.state().label,
              if (!finished && labels.isNotEmpty) 'alerts: $labels',
            ].join('  ·  ')),
          ),
          if (reminder.syncFailed) ...[
            const SizedBox(width: 6),
            // The edit is still here — the server refused it enough times that
            // we stopped re-sending. Tapping asks again.
            InkWell(
              onTap: onRetry,
              child: Icon(Icons.sync_problem, size: 16, color: scheme.error),
            ),
          ] else if (reminder.pendingSync) ...[
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
