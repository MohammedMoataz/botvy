import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';

import '../../../app/l10n/app_localizations.dart';
import '../../../core/db/database.dart';
import '../application/chat_cubit.dart';
import '../application/conversations_cubit.dart';
import 'assistant_markdown.dart';

/// One conversation: its history, the answer as it is written, and the box.
///
/// Everything here lays out from the leading edge rather than from the left, so
/// an Arabic screen reads right to left throughout (FR-019) — the member's own
/// bubbles on the leading side of the column, Botvy's on the trailing side, the
/// quick-question chips scrolling from the leading edge, and the card rows and
/// section labels following the same direction. `AlignmentDirectional` and
/// `EdgeInsetsDirectional` are what do that; `Alignment.centerRight` and
/// `EdgeInsets.only(left:)` are what would quietly not.
class ChatPage extends StatefulWidget {
  const ChatPage({super.key, required this.conversationId, this.onOpenChat});

  final String conversationId;

  /// Navigating to the chat an answer was moved into. Null when there is
  /// nowhere to go — a test, or a screen with no router above it.
  final void Function(String conversationId)? onOpenChat;

  @override
  State<ChatPage> createState() => _ChatPageState();
}

class _ChatPageState extends State<ChatPage> {
  final TextEditingController _composer = TextEditingController();
  final ScrollController _scroll = ScrollController();

  @override
  void initState() {
    super.initState();
    // In `initState` rather than `build`: a route's build runs again for every
    // dependency change — the keyboard appearing, the locale, the theme — and
    // re-opening the conversation on each one would reset the screen under the
    // member's thumb.
    unawaited(context.read<ChatCubit>().open(widget.conversationId));
  }

  @override
  void dispose() {
    _composer.dispose();
    _scroll.dispose();
    super.dispose();
  }

  /// Keeps the newest bubble in view as the answer grows.
  ///
  /// After the frame, because the list has not been laid out yet when the state
  /// arrives and `maxScrollExtent` is still the old one. Jumped rather than
  /// animated: a token arrives every few milliseconds and an animation per
  /// token fights itself.
  void _stickToBottom() {
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!_scroll.hasClients) return;
      _scroll.jumpTo(_scroll.position.maxScrollExtent);
    });
  }

  @override
  Widget build(BuildContext context) {
    final t = AppLocalizations.of(context);

    return BlocConsumer<ChatCubit, ChatState>(
      listenWhen: (before, after) =>
          before.problem != after.problem ||
          before.messages.length != after.messages.length ||
          before.queued.length != after.queued.length ||
          before.streaming != after.streaming,
      listener: (context, state) {
        _stickToBottom();

        final problem = state.problem;
        if (problem == null) return;

        // The server's own sentence, unchanged, for a quota or an unavailable
        // model. It names the limit and the moment it resets **in the member's
        // own time zone** (FR-013), resolved on the server from the profile's
        // zone — re-deriving that here would be a second place to get the one
        // calculation this codebase has already got wrong once.
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(
              problem.verbatim ? problem.message : _problemText(t, problem),
            ),
            duration: const Duration(seconds: 8),
          ),
        );
        context.read<ChatCubit>().clearProblem();
      },
      builder: (context, state) {
        final cubit = context.read<ChatCubit>();

        return Scaffold(
          appBar: AppBar(
            title: Text(_title(t, state.conversation)),
            actions: [
              IconButton(
                icon: const Icon(Icons.cleaning_services_outlined),
                tooltip: t.chatClear,
                onPressed: () => unawaited(_confirmClear(context)),
              ),
            ],
          ),
          body: state.loading
              ? const Center(child: CircularProgressIndicator())
              : Column(
                  children: [
                    if (state.moved != null)
                      _MovedBanner(
                        notice: state.moved!,
                        onOpen: () {
                          final id = state.moved!.conversationId;
                          cubit.clearMoved();
                          widget.onOpenChat?.call(id);
                        },
                        onDismiss: cubit.clearMoved,
                      ),
                    Expanded(child: _Transcript(state: state, scroll: _scroll)),
                    if (state.quickQuestions.isNotEmpty && !state.awaiting)
                      _QuickQuestions(
                        questions: state.quickQuestions,
                        onPick: (question) =>
                            unawaited(cubit.send(question)),
                      ),
                    _Composer(
                      controller: _composer,
                      awaiting: state.awaiting,
                      onSend: () {
                        final text = _composer.text;
                        _composer.clear();
                        unawaited(cubit.send(text));
                      },
                      onStop: cubit.stop,
                    ),
                  ],
                ),
        );
      },
    );
  }

  Future<void> _confirmClear(BuildContext context) async {
    final t = AppLocalizations.of(context);
    final cubit = context.read<ChatCubit>();
    final conversations = context.read<ConversationsCubit>();

    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: Text(t.chatClear),
        // Said before rather than regretted after: FR-011 makes clearing
        // irreversible on every device on purpose, so the member has to be told
        // that before they tap it and not by a missing history afterwards.
        content: Text(t.chatClearWarning),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(context).pop(false),
            child: Text(t.dismiss),
          ),
          TextButton(
            onPressed: () => Navigator.of(context).pop(true),
            child: Text(t.chatClear),
          ),
        ],
      ),
    );
    if (confirmed != true) return;

    // The command belongs to the conversation cubit — it is the one writer for
    // that table — and the chat cubit re-reads it from the mirror on the next
    // pass. Two writers for one row is how the two copies start to disagree.
    await conversations.clear(widget.conversationId);
    await cubit.refresh();
  }

  static String _title(AppLocalizations t, LocalConversation? row) =>
      switch (row?.kind) {
        ChatKinds.coach => t.chatCoach,
        ChatKinds.planner => t.chatPlanner,
        _ => (row?.title.isEmpty ?? true) ? t.chatUntitled : row!.title,
      };

  static String _problemText(AppLocalizations t, ChatProblem problem) =>
      switch (problem.code) {
        'model_unavailable' => t.chatModelUnavailable,
        'rate_limited' => t.chatTooFast,
        'quota' => t.chatQuotaReached,
        'forbidden' => t.chatRefused,
        _ => problem.message.isEmpty ? t.somethingWentWrong : problem.message,
      };
}

/// The bubbles, the streaming answer, and the card.
class _Transcript extends StatelessWidget {
  const _Transcript({required this.state, required this.scroll});

  final ChatState state;
  final ScrollController scroll;

  @override
  Widget build(BuildContext context) {
    final t = AppLocalizations.of(context);

    if (state.messages.isEmpty &&
        state.queued.isEmpty &&
        state.streaming == null) {
      return Center(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Text(t.chatEmpty, textAlign: TextAlign.center),
        ),
      );
    }

    return ListView(
      controller: scroll,
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
      children: [
        for (final message in state.messages)
          _Bubble(
            content: message.content,
            mine: message.role == 'user',
            // Only the assistant's words go through the Markdown renderer. The
            // member's own text is drawn plain, so a pasted URL is text and not
            // a tap target and an underscore in a filename stays an underscore.
            markdown: message.role != 'user',
          ),
        // Queued after the stored history, because a message with a sequence
        // has been accepted and one without has not — so the waiting ones are
        // always the newest.
        for (final queued in state.queued)
          _Bubble(
            content: queued.body,
            mine: true,
            markdown: false,
            footnote: t.chatQueued,
          ),
        if (state.streaming != null)
          _Bubble(content: state.streaming!, mine: false, markdown: true),
        if (state.streaming == null && state.awaiting)
          Padding(
            padding: const EdgeInsetsDirectional.only(start: 8, top: 8),
            child: Row(
              children: [
                const SizedBox(
                  width: 14,
                  height: 14,
                  child: CircularProgressIndicator(strokeWidth: 2),
                ),
                const SizedBox(width: 8),
                Text(t.chatWriting),
              ],
            ),
          ),
        if (state.card != null) _CardAnswer(card: state.card!),
      ],
    );
  }
}

/// One message.
class _Bubble extends StatelessWidget {
  const _Bubble({
    required this.content,
    required this.mine,
    required this.markdown,
    this.footnote,
  });

  final String content;
  final bool mine;
  final bool markdown;

  /// "Waiting to send", under a queued message. Not a separate widget because
  /// it is one line of small text and only one caller has it.
  final String? footnote;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Align(
      // Directional, so the member's own bubbles sit on the trailing edge in
      // both languages: `Alignment.centerRight` would put an Arabic member's
      // messages on the same side as Botvy's.
      alignment: mine
          ? AlignmentDirectional.centerEnd
          : AlignmentDirectional.centerStart,
      child: Container(
        constraints: BoxConstraints(
          maxWidth: MediaQuery.sizeOf(context).width * 0.82,
        ),
        margin: const EdgeInsets.symmetric(vertical: 4),
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
        decoration: BoxDecoration(
          color: mine
              ? theme.colorScheme.primaryContainer
              : theme.colorScheme.surfaceContainerHighest,
          borderRadius: BorderRadius.circular(14),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            if (markdown)
              AssistantMarkdown(content)
            else
              Text(content, textAlign: TextAlign.start),
            if (footnote != null)
              Padding(
                padding: const EdgeInsets.only(top: 4),
                child: Text(
                  footnote!,
                  style: theme.textTheme.labelSmall,
                  textAlign: TextAlign.start,
                ),
              ),
          ],
        ),
      ),
    );
  }
}

/// A list answer, as rows the member can act on (FR-016).
class _CardAnswer extends StatelessWidget {
  const _CardAnswer({required this.card});

  final ChatCard card;

  @override
  Widget build(BuildContext context) {
    final t = AppLocalizations.of(context);
    final cubit = context.read<ChatCubit>();

    return Card(
      margin: const EdgeInsets.symmetric(vertical: 8),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Padding(
            padding: const EdgeInsetsDirectional.only(
              start: 16,
              end: 16,
              top: 12,
              bottom: 4,
            ),
            child: Text(
              _heading(t, card.kind),
              textAlign: TextAlign.start,
              style: Theme.of(context).textTheme.labelLarge,
            ),
          ),
          for (final item in card.items)
            ListTile(
              // `ListTile` puts `leading` on the reading-start side by itself,
              // so the tick is beside the text in both languages.
              leading: IconButton(
                tooltip: t.chatCardComplete,
                icon: Icon(
                  item.isSettled
                      ? Icons.check_circle
                      : Icons.radio_button_unchecked,
                ),
                onPressed: item.isSettled
                    ? null
                    : () => unawaited(cubit.completeCardItem(item)),
              ),
              title: Text(item.title, textAlign: TextAlign.start),
              subtitle: item.subtitle == null
                  ? null
                  : Text(item.subtitle!, textAlign: TextAlign.start),
              // The moment as the *server* resolved it, formatted and never
              // recomputed. "In two hours" was turned into an instant against
              // the member's own time zone through `shared/time`, so what
              // arrives here is a point on the clock and rendering it cannot
              // shift it — whereas a client that re-derived the wall time from
              // the phrase would be the three-hour bug principle XI exists to
              // stop.
              //
              // `toLocal()` is the convention every screen in this app uses
              // for displaying an instant (`tasks_page`, `reminders_page`,
              // `home_page`), and the split is deliberate: a *moment* is shown
              // in the handset's zone, and a *date boundary* — which day Today
              // means, when an alarm fires — is resolved through `memberZone`
              // from the profile. Only the second one changes answer when the
              // two zones differ, which is why only the second one pays for the
              // lookup.
              trailing: item.at == null
                  ? null
                  : Text(
                      TimeOfDay.fromDateTime(
                        item.at!.toLocal(),
                      ).format(context),
                    ),
            ),
          if (card.items.isEmpty)
            Padding(
              padding: const EdgeInsets.all(16),
              child: Text(t.chatCardEmpty, textAlign: TextAlign.start),
            ),
        ],
      ),
    );
  }

  static String _heading(AppLocalizations t, String kind) => switch (kind) {
    'tasks' => t.taskToday,
    'reminders' => t.remindersTitle,
    'meetings' => t.chatCardMeetings,
    'plan' => t.homeTodayPlan,
    'sessions' => t.chatCardSessions,
    _ => t.chatCardOther,
  };
}

/// "That went somewhere else, and here is where."
class _MovedBanner extends StatelessWidget {
  const _MovedBanner({
    required this.notice,
    required this.onOpen,
    required this.onDismiss,
  });

  final MovedNotice notice;
  final VoidCallback onOpen;
  final VoidCallback onDismiss;

  @override
  Widget build(BuildContext context) {
    final t = AppLocalizations.of(context);

    return MaterialBanner(
      content: Text(
        notice.title.isEmpty
            ? t.chatMovedBodyUntitled
            : t.chatMovedBody(notice.title),
        textAlign: TextAlign.start,
      ),
      leading: const Icon(Icons.call_split),
      actions: [
        TextButton(onPressed: onDismiss, child: Text(t.dismiss)),
        TextButton(onPressed: onOpen, child: Text(t.chatMovedOpen)),
      ],
    );
  }
}

/// The tappable questions for this chat.
class _QuickQuestions extends StatelessWidget {
  const _QuickQuestions({required this.questions, required this.onPick});

  final List<String> questions;
  final void Function(String question) onPick;

  @override
  Widget build(BuildContext context) => SingleChildScrollView(
    scrollDirection: Axis.horizontal,
    padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
    child: Row(
      children: [
        for (final question in questions)
          Padding(
            // Directional, so the gap falls between the chips rather than
            // outside the row's leading chip when the screen is right to left.
            padding: const EdgeInsetsDirectional.only(end: 8),
            child: ActionChip(
              label: Text(question),
              onPressed: () => onPick(question),
            ),
          ),
      ],
    ),
  );
}

/// The box, and the one button that is either send or stop.
class _Composer extends StatelessWidget {
  const _Composer({
    required this.controller,
    required this.awaiting,
    required this.onSend,
    required this.onStop,
  });

  final TextEditingController controller;
  final bool awaiting;
  final VoidCallback onSend;
  final VoidCallback onStop;

  @override
  Widget build(BuildContext context) {
    final t = AppLocalizations.of(context);

    return SafeArea(
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 6),
        child: Row(
          children: [
            Expanded(
              child: TextField(
                controller: controller,
                minLines: 1,
                maxLines: 5,
                // `newline`, not `send`: the member is writing sentences, and a
                // keyboard whose return key sends cuts a paragraph in half.
                textInputAction: TextInputAction.newline,
                keyboardType: TextInputType.multiline,
                textAlign: TextAlign.start,
                decoration: InputDecoration(
                  hintText: t.chatComposeHint,
                  border: const OutlineInputBorder(),
                  isDense: true,
                ),
              ),
            ),
            const SizedBox(width: 8),
            // One button in two states rather than two buttons, because they
            // are never both useful and a stop that appears beside send is a
            // stop that gets pressed by mistake.
            awaiting
                ? IconButton.filled(
                    tooltip: t.chatStop,
                    onPressed: onStop,
                    icon: const Icon(Icons.stop),
                  )
                : IconButton.filled(
                    tooltip: t.chatSend,
                    onPressed: onSend,
                    icon: const Icon(Icons.send),
                  ),
          ],
        ),
      ),
    );
  }
}
