import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';

import '../../../app/l10n/app_localizations.dart';
import '../../../core/db/database.dart';
import '../application/reminders_cubit.dart';
import 'reminder_sheet.dart';

/// The member's reminders.
///
/// Four lists, and the one worth explaining is Deleted: it offers restore,
/// reactivate and erase, because a deleted reminder keeps the status it had.
/// Restoring it brings back a *done* reminder as done — which is right, and
/// also why reactivating is a separate action that asks for a new moment.
class RemindersPage extends StatelessWidget {
  const RemindersPage({super.key});

  @override
  Widget build(BuildContext context) {
    final t = AppLocalizations.of(context);

    return BlocConsumer<RemindersCubit, RemindersState>(
      listenWhen: (before, after) =>
          after.problem != null && before.problem != after.problem,
      listener: (context, state) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(state.problem!)),
        );
        context.read<RemindersCubit>().clearProblem();
      },
      builder: (context, state) {
        final cubit = context.read<RemindersCubit>();

        return Scaffold(
          appBar: AppBar(
            title: Text(t.remindersTitle),
            actions: [
              PopupMenuButton<ReminderView>(
                icon: const Icon(Icons.filter_list),
                onSelected: (view) => unawaited(cubit.show(view)),
                itemBuilder: (context) => [
                  PopupMenuItem(
                    value: ReminderView.upcoming,
                    child: Text(t.reminderUpcoming),
                  ),
                  PopupMenuItem(
                    value: ReminderView.overdue,
                    child: Text(t.reminderOverdue),
                  ),
                  PopupMenuItem(
                    value: ReminderView.done,
                    child: Text(t.reminderDone),
                  ),
                  PopupMenuItem(
                    value: ReminderView.deleted,
                    child: Text(t.reminderDeleted),
                  ),
                ],
              ),
            ],
          ),
          floatingActionButton: FloatingActionButton(
            onPressed: () => unawaited(showReminderSheet(context, cubit)),
            child: const Icon(Icons.add),
          ),
          body: state.loading
              ? const Center(child: CircularProgressIndicator())
              : state.reminders.isEmpty
                  ? Center(child: Text(t.reminderNothingHere))
                  : ListView.builder(
                      itemCount: state.reminders.length,
                      itemBuilder: (context, index) => _ReminderRow(
                        reminder: state.reminders[index],
                        view: state.view,
                        blocked: state.blocked.contains(
                          state.reminders[index].id,
                        ),
                      ),
                    ),
        );
      },
    );
  }
}

class _ReminderRow extends StatelessWidget {
  const _ReminderRow({
    required this.reminder,
    required this.view,
    required this.blocked,
  });

  final LocalReminder reminder;
  final ReminderView view;

  /// The engine has stopped re-sending this row.
  final bool blocked;

  @override
  Widget build(BuildContext context) {
    final t = AppLocalizations.of(context);
    final cubit = context.read<RemindersCubit>();
    // The moment the alarm actually fires: the server calls it `effectiveAt`,
    // and it is what the list is sorted on. The original `remindAt` is still
    // shown below, because a member who snoozed twice wants to know when they
    // had meant to be reminded.
    final effectiveAt = reminder.snoozedUntil ?? reminder.remindAt;

    if (view == ReminderView.deleted) {
      return ListTile(
        title: Text(reminder.title),
        subtitle: Text('${_statusText(t, reminder.status)} · ${t.reminderDeleted}'),
        trailing: PopupMenuButton<String>(
          onSelected: (action) async {
            switch (action) {
              case 'restore':
                await cubit.restore(reminder.id);
              case 'reactivate':
                final moment = await pickMoment(context, effectiveAt);
                if (moment != null) {
                  // Restored first, then given its new moment: reactivating a
                  // tombstone would leave an active reminder in the Deleted
                  // list, which is two states at once.
                  await cubit.restore(reminder.id);
                  await cubit.reactivate(reminder.id, moment);
                }
              case 'erase':
                await cubit.erase(reminder.id);
            }
          },
          itemBuilder: (context) => [
            PopupMenuItem(value: 'restore', child: Text(t.reminderRestore)),
            PopupMenuItem(
              value: 'reactivate',
              child: Text(t.reminderReactivate),
            ),
            PopupMenuItem(value: 'erase', child: Text(t.reminderErase)),
          ],
        ),
      );
    }

    return ListTile(
      leading: _SyncBadge(pendingOp: reminder.pendingOp, blocked: blocked),
      title: Text(reminder.title),
      subtitle: Text(
        [
          _momentText(context, effectiveAt),
          if (reminder.snoozedUntil != null)
            t.reminderSnoozedFrom(_momentText(context, reminder.remindAt)),
          if (reminder.status != 'active') _statusText(t, reminder.status),
          if (blocked) t.syncNotSaved,
        ].join(' · '),
      ),
      trailing: reminder.status != 'active'
          ? null
          : Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                IconButton(
                  icon: const Icon(Icons.snooze),
                  tooltip: t.reminderSnooze,
                  onPressed: () => unawaited(cubit.snooze(reminder.id)),
                ),
                IconButton(
                  icon: const Icon(Icons.check),
                  tooltip: t.reminderComplete,
                  onPressed: () => unawaited(cubit.complete(reminder.id)),
                ),
              ],
            ),
      onTap: blocked
          // A blocked row's tap is the retry. The member's edit is still here
          // and still theirs; what it needs is another attempt, not an editor.
          ? () => unawaited(cubit.retry(reminder.id))
          : () => unawaited(showReminderSheet(context, cubit, reminder: reminder)),
      onLongPress: () => unawaited(_deleteWithUndo(context, cubit, reminder)),
    );
  }
}

/// Whether this row is saved, waiting, or stuck.
///
/// Three states and not two: "waiting" is the ordinary offline case and needs
/// no attention, where "stuck" is an edit that has been refused five times and
/// will not go up on its own. Collapsing them would either alarm a member who
/// is simply on a plane or say nothing about an edit that is never going to
/// save.
class _SyncBadge extends StatelessWidget {
  const _SyncBadge({required this.pendingOp, required this.blocked});

  final String? pendingOp;
  final bool blocked;

  @override
  Widget build(BuildContext context) {
    if (blocked) {
      return Icon(
        Icons.error_outline,
        color: Theme.of(context).colorScheme.error,
      );
    }
    if (pendingOp != null) {
      return Icon(
        Icons.cloud_upload_outlined,
        color: Theme.of(context).colorScheme.outline,
      );
    }
    return Icon(
      Icons.cloud_done_outlined,
      color: Theme.of(context).colorScheme.outline,
    );
  }
}

Future<void> _deleteWithUndo(
  BuildContext context,
  RemindersCubit cubit,
  LocalReminder reminder,
) async {
  final t = AppLocalizations.of(context);
  final messenger = ScaffoldMessenger.of(context);
  await cubit.delete(reminder.id);
  messenger.showSnackBar(
    SnackBar(
      content: Text(t.reminderDeletedMessage(reminder.title)),
      action: SnackBarAction(
        label: t.undo,
        onPressed: () => unawaited(cubit.restore(reminder.id)),
      ),
    ),
  );
}

String _statusText(AppLocalizations t, String status) => switch (status) {
  'done' => t.reminderDone,
  'cancelled' => t.reminderCancelled,
  _ => t.reminderActive,
};

String _momentText(BuildContext context, DateTime instant) {
  final local = instant.toLocal();
  return '${local.year}-${local.month.toString().padLeft(2, '0')}-'
      '${local.day.toString().padLeft(2, '0')} '
      '${TimeOfDay.fromDateTime(local).format(context)}';
}
