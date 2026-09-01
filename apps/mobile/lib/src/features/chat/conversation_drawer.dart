import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../app_providers.dart';
import '../../db/database.dart';
import 'conversations_controller.dart';

/// The chat list.
///
/// A drawer rather than a pushed screen: ChatScreen is the root widget with a
/// free leading slot, so this costs one `drawer:` property and Flutter supplies
/// the hamburger, the edge swipe and back-dismissal — no route, and nothing to
/// reconcile with the imperative Navigator the rest of the app uses. A pushed
/// list would also sit *below* the chat in the back stack, when it is above it.
class ConversationDrawer extends ConsumerWidget {
  const ConversationDrawer({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final chats = ref.watch(conversationsControllerProvider);
    final controller = ref.read(conversationsControllerProvider.notifier);
    final currentId = ref.watch(currentConversationIdProvider);

    return Drawer(
      child: SafeArea(
        child: Column(
          children: [
            ListTile(
              leading: const Icon(Icons.add_comment_outlined),
              title: const Text('New chat'),
              onTap: () {
                ref.read(activeConversationProvider.notifier).select(controller.startNew());
                Navigator.of(context).pop();
              },
            ),
            const Divider(height: 1),
            Expanded(
              child: chats.loading
                  ? const Center(child: CircularProgressIndicator())
                  : chats.items.isEmpty
                      ? Center(
                          child: Padding(
                            padding: const EdgeInsets.all(24),
                            child: Text(
                              chats.showArchived
                                  ? 'Nothing archived.'
                                  : 'No chats yet. Say something to start one.',
                              textAlign: TextAlign.center,
                            ),
                          ),
                        )
                      : ListView.builder(
                          itemCount: chats.items.length,
                          itemBuilder: (context, i) => _ChatTile(
                            chat: chats.items[i],
                            selected: chats.items[i].id == currentId,
                          ),
                        ),
            ),
            const Divider(height: 1),
            SwitchListTile(
              title: const Text('Show archived'),
              value: chats.showArchived,
              onChanged: (_) => controller.toggleArchivedView(),
            ),
          ],
        ),
      ),
    );
  }
}

class _ChatTile extends ConsumerWidget {
  const _ChatTile({required this.chat, required this.selected});

  final LocalConversation chat;
  final bool selected;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return FutureBuilder<String>(
      future: _label(ref),
      builder: (context, snapshot) => ListTile(
        selected: selected,
        leading: Icon(
          chat.isCoaching
              ? Icons.self_improvement
              : chat.pinned
                  ? Icons.push_pin
                  : Icons.chat_bubble_outline,
        ),
        title: Text(
          snapshot.data ?? conversationLabel(chat, null),
          maxLines: 1,
          overflow: TextOverflow.ellipsis,
        ),
        subtitle: chat.pushAttempts >= AppDatabase.maxPushAttempts
            ? const Text('Waiting to sync — tap to retry')
            : null,
        onTap: () {
          if (chat.pushAttempts >= AppDatabase.maxPushAttempts) {
            ref.read(conversationsControllerProvider.notifier).retry(chat.id);
          }
          ref.read(activeConversationProvider.notifier).select(chat.id);
          Navigator.of(context).pop();
        },
        trailing: IconButton(
          icon: const Icon(Icons.more_vert),
          tooltip: 'Chat options',
          onPressed: () => _showActions(context, ref, snapshot.data ?? ''),
        ),
      ),
    );
  }

  /// The stored name, or the first thing said in the chat.
  Future<String> _label(WidgetRef ref) async {
    if (chat.title.trim().isNotEmpty || chat.isCoaching) {
      return conversationLabel(chat, null);
    }
    final messages = await ref
        .read(databaseProvider)
        .watchConversationMessages(chat.id, includeUnassigned: chat.isCoaching)
        .first;
    final firstUser = messages.where((m) => m.role == 'user');
    return conversationLabel(chat, firstUser.isEmpty ? null : firstUser.first.content);
  }

  Future<void> _showActions(BuildContext context, WidgetRef ref, String label) async {
    final controller = ref.read(conversationsControllerProvider.notifier);

    await showModalBottomSheet<void>(
      context: context,
      builder: (sheetContext) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            ListTile(
              leading: const Icon(Icons.drive_file_rename_outline),
              title: const Text('Rename'),
              onTap: () {
                Navigator.of(sheetContext).pop();
                _rename(context, controller, label);
              },
            ),
            ListTile(
              leading: Icon(chat.pinned ? Icons.push_pin_outlined : Icons.push_pin),
              title: Text(chat.pinned ? 'Unpin' : 'Pin to top'),
              onTap: () {
                Navigator.of(sheetContext).pop();
                controller.setPinned(chat.id, !chat.pinned);
              },
            ),
            // The coaching chat has to stay visible and has to exist: the
            // nightly check-in and program land in it.
            if (!chat.isCoaching) ...[
              ListTile(
                leading: Icon(chat.archived ? Icons.unarchive_outlined : Icons.archive_outlined),
                title: Text(chat.archived ? 'Unarchive' : 'Archive'),
                onTap: () {
                  Navigator.of(sheetContext).pop();
                  controller.setArchived(chat.id, !chat.archived);
                },
              ),
              ListTile(
                leading: const Icon(Icons.delete_outline),
                title: const Text('Delete'),
                onTap: () {
                  Navigator.of(sheetContext).pop();
                  _confirmDelete(context, controller, label);
                },
              ),
            ],
          ],
        ),
      ),
    );
  }

  Future<void> _rename(
    BuildContext context,
    ConversationsController controller,
    String label,
  ) async {
    final field = TextEditingController(text: chat.title.isEmpty ? label : chat.title);
    final name = await showDialog<String>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: const Text('Rename chat'),
        content: TextField(
          controller: field,
          autofocus: true,
          textInputAction: TextInputAction.done,
          decoration: const InputDecoration(hintText: 'Chat name'),
          onSubmitted: (value) => Navigator.of(dialogContext).pop(value),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(dialogContext).pop(),
            child: const Text('Cancel'),
          ),
          FilledButton(
            onPressed: () => Navigator.of(dialogContext).pop(field.text),
            child: const Text('Save'),
          ),
        ],
      ),
    );
    field.dispose();
    if (name != null && name.trim().isNotEmpty) {
      await controller.rename(chat.id, name);
    }
  }

  Future<void> _confirmDelete(
    BuildContext context,
    ConversationsController controller,
    String label,
  ) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: const Text('Delete chat?'),
        content: Text('"$label" and everything said in it will be removed.'),
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
    if (confirmed == true) await controller.remove(chat.id);
  }
}
