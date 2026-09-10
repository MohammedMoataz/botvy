import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';

import '../../../app/l10n/app_localizations.dart';
import '../../../core/db/database.dart';
import '../application/conversations_cubit.dart';

/// The member's chats, in two sections.
///
/// One list with a divider rather than two lists or a tab bar: Coach and
/// Planner are *places* — always the same two, always at the top — and
/// everything else is a recency list under them (US3). A tab bar would put them
/// behind a gesture, and two scroll views would let the pinned pair scroll away.
class ConversationsPage extends StatelessWidget {
  const ConversationsPage({super.key, required this.onOpen});

  /// Opening a chat is navigation, and navigation belongs to the router rather
  /// than to this widget: the same list is reached from Home and from a
  /// notification's deep link, and a `context.push` compiled in here would be
  /// wrong for one of them.
  final void Function(String conversationId) onOpen;

  @override
  Widget build(BuildContext context) {
    final t = AppLocalizations.of(context);

    return BlocConsumer<ConversationsCubit, ConversationsState>(
      listenWhen: (before, after) =>
          before.problem != after.problem ||
          before.refusal != after.refusal ||
          before.opened != after.opened,
      listener: (context, state) {
        final cubit = context.read<ConversationsCubit>();

        final opened = state.opened;
        if (opened != null) {
          // Cleared before navigating, so a rebuild on the way back does not
          // push the same chat again.
          cubit.clearOpened();
          onOpen(opened);
          return;
        }

        final refusal = state.refusal;
        if (refusal != null) {
          unawaited(_showProtected(context, cubit, refusal));
          return;
        }

        final problem = state.problem;
        if (problem != null) {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(content: Text(_problemText(t, problem))),
          );
          cubit.clearProblem();
        }
      },
      builder: (context, state) {
        final cubit = context.read<ConversationsCubit>();

        return Scaffold(
          appBar: AppBar(title: Text(t.chatsTitle)),
          floatingActionButton: FloatingActionButton(
            tooltip: t.chatNewChat,
            onPressed: state.busy ? null : () => unawaited(cubit.create()),
            child: const Icon(Icons.add_comment_outlined),
          ),
          body: state.loading
              ? const Center(child: CircularProgressIndicator())
              : ListView(
                  children: [
                    if (state.pinned.isNotEmpty) _SectionHeader(t.chatPinned),
                    for (final row in state.pinned)
                      _ConversationTile(
                        conversation: row,
                        onOpen: () => onOpen(row.id),
                      ),
                    // The divider is the whole point of the section: it is what
                    // says the two above are not simply the most recent two.
                    if (state.pinned.isNotEmpty && state.others.isNotEmpty)
                      const Divider(height: 1),
                    if (state.others.isNotEmpty) _SectionHeader(t.chatOthers),
                    for (final row in state.others)
                      _ConversationTile(
                        conversation: row,
                        onOpen: () => onOpen(row.id),
                      ),
                    if (state.pinned.isEmpty && state.others.isEmpty)
                      Padding(
                        padding: const EdgeInsets.all(24),
                        child: Text(
                          t.chatNoneYet,
                          textAlign: TextAlign.center,
                        ),
                      ),
                  ],
                ),
        );
      },
    );
  }

  /// The refusal, with the way out attached.
  ///
  /// A dialog and not a snack bar, because it carries an action the member is
  /// meant to consider: US3 says the refusal comes "with an explanation" and
  /// that "clearing is offered instead", and an offer that disappears after
  /// four seconds is not one.
  Future<void> _showProtected(
    BuildContext context,
    ConversationsCubit cubit,
    ProtectedRefusal refusal,
  ) async {
    final t = AppLocalizations.of(context);
    cubit.clearRefusal();

    final clear = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: Text(t.chatProtectedTitle),
        // The server's own sentence when it sent one: it knows which rule
        // refused, and this build may predate the rule.
        content: Text(
          refusal.message.isEmpty ? t.chatProtectedBody : refusal.message,
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(context).pop(false),
            child: Text(t.dismiss),
          ),
          TextButton(
            onPressed: () => Navigator.of(context).pop(true),
            child: Text(t.chatClearInstead),
          ),
        ],
      ),
    );

    if (clear == true) await cubit.clear(refusal.conversationId);
  }

  static String _problemText(AppLocalizations t, String problem) =>
      switch (problem) {
        ConversationsCubit.offlineProblem => t.chatOffline,
        ConversationsCubit.refusedProblem => t.chatRefused,
        _ => problem,
      };
}

class _SectionHeader extends StatelessWidget {
  const _SectionHeader(this.label);

  final String label;

  @override
  Widget build(BuildContext context) => Padding(
    // Directional so the inset is on the leading edge in both languages: a
    // hard `left` here indents an Arabic heading away from the text it heads.
    padding: const EdgeInsetsDirectional.only(
      start: 16,
      end: 16,
      top: 16,
      bottom: 4,
    ),
    child: Text(
      label,
      // `start`, not `left`.
      textAlign: TextAlign.start,
      style: Theme.of(context).textTheme.labelLarge?.copyWith(
        color: Theme.of(context).colorScheme.primary,
      ),
    ),
  );
}

class _ConversationTile extends StatelessWidget {
  const _ConversationTile({required this.conversation, required this.onOpen});

  final LocalConversation conversation;
  final VoidCallback onOpen;

  @override
  Widget build(BuildContext context) {
    final t = AppLocalizations.of(context);
    final cubit = context.read<ConversationsCubit>();

    return ListTile(
      leading: Icon(switch (conversation.kind) {
        ChatKinds.coach => Icons.favorite_outline,
        ChatKinds.planner => Icons.event_note_outlined,
        _ => Icons.chat_bubble_outline,
      }),
      title: Text(_title(t, conversation)),
      onTap: onOpen,
      trailing: PopupMenuButton<_ChatAction>(
        onSelected: (action) => unawaited(_run(context, cubit, action)),
        itemBuilder: (context) => [
          PopupMenuItem(
            value: _ChatAction.clear,
            child: Text(t.chatClear),
          ),
          // The three that a pinned chat refuses are still offered, and
          // deliberately. Hiding them would be this build deciding what the
          // server's rule is — and the rule is the server's (a third pinned
          // kind seeded by the operator would be refused too, and this list
          // would not know). Attempting one is answered with the explanation
          // and the offer to clear, which is what US3 asks for.
          PopupMenuItem(
            value: _ChatAction.rename,
            child: Text(t.chatRename),
          ),
          PopupMenuItem(
            value: _ChatAction.unpin,
            child: Text(conversation.pinned ? t.chatUnpin : t.chatArchive),
          ),
          PopupMenuItem(value: _ChatAction.delete, child: Text(t.delete)),
        ],
      ),
    );
  }

  Future<void> _run(
    BuildContext context,
    ConversationsCubit cubit,
    _ChatAction action,
  ) async {
    switch (action) {
      case _ChatAction.clear:
        await cubit.clear(conversation.id);
      case _ChatAction.rename:
        final title = await _askForTitle(context, conversation.title);
        if (title != null && title.isNotEmpty) {
          await cubit.rename(conversation, title);
        }
      case _ChatAction.unpin:
        // One menu entry for two commands, because they are the same gesture
        // from the member's side — "get this out of my way" — and which one
        // applies depends on where the chat already is.
        await (conversation.pinned
            ? cubit.unpin(conversation)
            : cubit.archive(conversation));
      case _ChatAction.delete:
        await cubit.remove(conversation);
    }
  }

  Future<String?> _askForTitle(BuildContext context, String current) {
    final t = AppLocalizations.of(context);
    final controller = TextEditingController(text: current);

    return showDialog<String>(
      context: context,
      builder: (context) => AlertDialog(
        title: Text(t.chatRename),
        content: TextField(
          controller: controller,
          autofocus: true,
          textInputAction: TextInputAction.done,
          onSubmitted: (value) => Navigator.of(context).pop(value),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(context).pop(),
            child: Text(t.dismiss),
          ),
          TextButton(
            onPressed: () => Navigator.of(context).pop(controller.text),
            child: Text(t.save),
          ),
        ],
      ),
    );
  }

  /// The two pinned chats are named by the app, not by the row.
  ///
  /// Their titles are seeded on the server in one language, and a member
  /// reading Arabic would otherwise find "Coach" at the top of an Arabic
  /// screen. Every other chat keeps its own title, which is the member's own
  /// opening words and must never be translated.
  static String _title(AppLocalizations t, LocalConversation row) =>
      switch (row.kind) {
        ChatKinds.coach => t.chatCoach,
        ChatKinds.planner => t.chatPlanner,
        _ => row.title.isEmpty ? t.chatUntitled : row.title,
      };
}

enum _ChatAction { clear, rename, unpin, delete }
