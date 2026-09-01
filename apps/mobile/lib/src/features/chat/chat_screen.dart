import 'package:flutter/material.dart';
import 'package:flutter_markdown_plus/flutter_markdown_plus.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../api/models.dart';
import '../history/history_screen.dart';
import '../reminders/reminders_screen.dart';
import '../settings/settings_screen.dart';
import '../../api/api_client.dart';
import 'chat_controller.dart';
import 'conversation_drawer.dart';
import 'conversations_controller.dart';

class ChatScreen extends ConsumerStatefulWidget {
  const ChatScreen({super.key});

  @override
  ConsumerState<ChatScreen> createState() => _ChatScreenState();
}

class _ChatScreenState extends ConsumerState<ChatScreen> {
  final _composer = TextEditingController();
  final _scroll = ScrollController();

  @override
  void dispose() {
    _composer.dispose();
    _scroll.dispose();
    super.dispose();
  }

  void _send(String conversationId) {
    final text = _composer.text;
    if (text.trim().isEmpty) return;
    _composer.clear();
    ref.read(chatControllerProvider(conversationId).notifier).send(text);
  }

  void _scrollToBottom() {
    if (!_scroll.hasClients) return;
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!_scroll.hasClients) return;
      _scroll.jumpTo(_scroll.position.maxScrollExtent);
    });
  }

  @override
  Widget build(BuildContext context) {
    final conversationId = ref.watch(currentConversationIdProvider);
    if (conversationId == null) {
      // No chat yet — the first sync has not landed on a fresh install. Mint
      // one so the composer works immediately, offline included.
      return _EmptyChatScaffold(onStart: (id) {
        ref.read(activeConversationProvider.notifier).select(id);
      });
    }

    final chat = ref.watch(chatControllerProvider(conversationId));

    // Keep the growing reply in view as tokens land.
    ref.listen(chatControllerProvider(conversationId), (_, __) => _scrollToBottom());

    return Scaffold(
      drawer: const ConversationDrawer(),
      appBar: AppBar(
        title: _Title(conversationId: conversationId),
        actions: [
          IconButton(
            icon: const Icon(Icons.alarm),
            tooltip: 'Reminders',
            onPressed: () => Navigator.of(context).push(
              MaterialPageRoute(builder: (_) => const RemindersScreen()),
            ),
          ),
          IconButton(
            icon: const Icon(Icons.history),
            tooltip: 'History',
            onPressed: () => Navigator.of(context).push(
              MaterialPageRoute(builder: (_) => const HistoryScreen()),
            ),
          ),
          IconButton(
            icon: const Icon(Icons.settings_outlined),
            tooltip: 'Settings',
            onPressed: () => Navigator.of(context).push(
              MaterialPageRoute(builder: (_) => const SettingsScreen()),
            ),
          ),
        ],
      ),
      body: Column(
        children: [
          if (chat.error != null)
            MaterialBanner(
              content: Text(chat.error!),
              actions: [
                TextButton(
                  onPressed:
                      ref.read(chatControllerProvider(conversationId).notifier).clearError,
                  child: const Text('Dismiss'),
                ),
              ],
            ),
          Expanded(child: _body(chat, conversationId)),
          const Divider(height: 1),
          _composerBar(chat.streaming, conversationId),
        ],
      ),
    );
  }

  Widget _body(ChatState chat, String conversationId) {
    if (chat.loading) {
      return const Center(child: CircularProgressIndicator());
    }
    if (chat.messages.isEmpty) {
      return const Center(
        child: Padding(
          padding: EdgeInsets.all(32),
          child: Text('Say something to get started.',
              textAlign: TextAlign.center),
        ),
      );
    }
    return RefreshIndicator(
      onRefresh: ref.read(chatControllerProvider(conversationId).notifier).loadHistory,
      // One selection region across the whole conversation. Markdown renders
      // as a tree of widgets, so per-bubble selection would only ever let the
      // user grab one paragraph at a time.
      child: SelectionArea(
        child: ListView.builder(
          controller: _scroll,
          padding: const EdgeInsets.symmetric(vertical: 12, horizontal: 8),
          itemCount: chat.messages.length,
          itemBuilder: (context, i) => ChatBubble(message: chat.messages[i]),
        ),
      ),
    );
  }

  Widget _composerBar(bool streaming, String conversationId) {
    return SafeArea(
      top: false,
      child: Padding(
        padding: const EdgeInsets.fromLTRB(12, 8, 8, 8),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.end,
          children: [
            Expanded(
              child: TextField(
                controller: _composer,
                minLines: 1,
                maxLines: 5,
                textInputAction: TextInputAction.send,
                onSubmitted: (_) => _send(conversationId),
                enabled: !streaming,
                decoration: InputDecoration(
                  hintText: streaming ? 'Waiting for the reply...' : 'Message',
                  border: const OutlineInputBorder(),
                  isDense: true,
                ),
              ),
            ),
            const SizedBox(width: 8),
            IconButton.filled(
              onPressed: streaming ? null : () => _send(conversationId),
              icon: const Icon(Icons.arrow_upward),
              tooltip: 'Send',
            ),
          ],
        ),
      ),
    );
  }
}

/// The chat's name, or the first thing said in it.
///
/// Derived rather than stored: a title written server-side would bump the row's
/// `updatedAt`, and a rename a second later would be judged against a stale
/// base and lose to the clock.
class _Title extends ConsumerWidget {
  const _Title({required this.conversationId});

  final String conversationId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final chats = ref.watch(conversationsControllerProvider).items;
    final match = chats.where((c) => c.id == conversationId);
    final chat = match.isEmpty ? null : match.first;
    if (chat != null && (chat.title.trim().isNotEmpty || chat.isCoaching)) {
      return Text(conversationLabel(chat, null), overflow: TextOverflow.ellipsis);
    }

    final messages = ref.watch(chatControllerProvider(conversationId)).messages;
    final fromUser = messages.where((m) => m.isUser);
    return Text(
      conversationLabel(chat, fromUser.isEmpty ? null : fromUser.first.content),
      overflow: TextOverflow.ellipsis,
    );
  }
}

/// A fresh install before the first sync: no chat exists yet, so one is minted
/// on the spot rather than making the user wait for a connection.
class _EmptyChatScaffold extends ConsumerStatefulWidget {
  const _EmptyChatScaffold({required this.onStart});

  final void Function(String id) onStart;

  @override
  ConsumerState<_EmptyChatScaffold> createState() => _EmptyChatScaffoldState();
}

class _EmptyChatScaffoldState extends ConsumerState<_EmptyChatScaffold> {
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      widget.onStart(ref.read(conversationsControllerProvider.notifier).startNew());
    });
  }

  @override
  Widget build(BuildContext context) => const Scaffold(
        body: Center(child: CircularProgressIndicator()),
      );
}

class ChatBubble extends StatelessWidget {
  const ChatBubble({super.key, required this.message});

  final ChatMessage message;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final isUser = message.isUser;
    // An assistant bubble that has no text yet: the reply is on its way.
    final waiting = message.streaming && message.content.isEmpty;

    return Align(
      alignment: isUser ? Alignment.centerRight : Alignment.centerLeft,
      child: Container(
        margin: const EdgeInsets.symmetric(vertical: 4, horizontal: 4),
        padding: const EdgeInsets.symmetric(vertical: 10, horizontal: 14),
        constraints: BoxConstraints(
          maxWidth: MediaQuery.of(context).size.width * 0.78,
        ),
        decoration: BoxDecoration(
          color: isUser ? scheme.primaryContainer : scheme.surfaceContainerHighest,
          borderRadius: BorderRadius.circular(16),
        ),
        child: waiting
            ? const SizedBox(
                height: 16,
                width: 16,
                child: CircularProgressIndicator(strokeWidth: 2),
              )
            : Column(
                crossAxisAlignment: CrossAxisAlignment.end,
                mainAxisSize: MainAxisSize.min,
                children: [
                  // Only the assistant writes markdown. A user who types an
                  // asterisk meant an asterisk.
                  if (isUser)
                    Text(
                      message.content,
                      style: TextStyle(color: scheme.onPrimaryContainer),
                    )
                  else
                    AssistantMarkdown(content: message.content),
                  // Sent while offline: it is safely stored and goes out on its
                  // own, so the user is told rather than asked to retype it.
                  if (message.isQueued)
                    Padding(
                      padding: const EdgeInsets.only(top: 4),
                      child: Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Icon(Icons.schedule, size: 12, color: scheme.outline),
                          const SizedBox(width: 4),
                          Text(
                            'Waiting for connection',
                            style: TextStyle(fontSize: 11, color: scheme.outline),
                          ),
                        ],
                      ),
                    ),
                ],
              ),
      ),
    );
  }
}

/// An assistant reply, rendered as markdown.
///
/// The model already answers in markdown — headings, bullets, bold, links —
/// and rendering it as plain text put the asterisks and hashes on screen. A
/// partially-arrived reply mid-stream just renders as the plain text it
/// currently is, and corrects itself on the next token.
class AssistantMarkdown extends StatelessWidget {
  const AssistantMarkdown({super.key, required this.content});

  final String content;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final scheme = theme.colorScheme;
    final body = theme.textTheme.bodyMedium?.copyWith(color: scheme.onSurface);

    return MarkdownBody(
      data: content,
      imageBuilder: (uri, title, alt) => _RemoteImage(uri: uri, alt: alt ?? title ?? ''),
      // Off: MarkdownBody's own selection works block by block, so a drag
      // cannot cross a paragraph. The list is wrapped in a SelectionArea,
      // which selects the whole conversation instead.
      selectable: false,
      onTapLink: (text, href, title) => _open(href),
      styleSheet: MarkdownStyleSheet.fromTheme(theme).copyWith(
        p: body,
        listBullet: body,
        a: body?.copyWith(
          color: scheme.primary,
          decoration: TextDecoration.underline,
        ),
        code: theme.textTheme.bodySmall?.copyWith(
          fontFamily: 'monospace',
          backgroundColor: scheme.surfaceContainerHighest,
        ),
        codeblockDecoration: BoxDecoration(
          color: scheme.surfaceContainerHighest,
          borderRadius: BorderRadius.circular(8),
        ),
        blockquoteDecoration: BoxDecoration(
          color: scheme.surfaceContainerHighest,
          border: Border(left: BorderSide(color: scheme.primary, width: 3)),
        ),
      ),
    );
  }

  Future<void> _open(String? href) async {
    if (href == null) return;
    final uri = Uri.tryParse(href);
    // Only ever hand the OS a web address: a markdown link is model output,
    // and other schemes can reach things the browser cannot.
    if (uri == null || (uri.scheme != 'http' && uri.scheme != 'https')) return;
    await launchUrl(uri, mode: LaunchMode.externalApplication);
  }
}

/// An image in a reply.
///
/// The src is a relative `/media?...` path, resolved here against whatever
/// gateway the app is currently pointed at — an absolute URL would rot the
/// moment the user switches between the emulator, the LAN and a tunnel.
/// A broken one becomes a tappable link, which is more useful than a grey box.
class _RemoteImage extends ConsumerWidget {
  const _RemoteImage({required this.uri, required this.alt});

  final Uri uri;
  final String alt;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final scheme = Theme.of(context).colorScheme;
    final resolved = Uri.parse(ref.watch(apiClientProvider).baseUrl).resolveUri(uri);

    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 6),
      child: ClipRRect(
        borderRadius: BorderRadius.circular(10),
        child: Image.network(
          resolved.toString(),
          fit: BoxFit.cover,
          loadingBuilder: (context, child, progress) => progress == null
              ? child
              : const Padding(
                  padding: EdgeInsets.all(12),
                  child: Center(child: CircularProgressIndicator(strokeWidth: 2)),
                ),
          errorBuilder: (context, error, stack) => InkWell(
            onTap: () => launchUrl(uri, mode: LaunchMode.externalApplication),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                Icon(Icons.broken_image_outlined, size: 16, color: scheme.outline),
                const SizedBox(width: 6),
                Flexible(
                  child: Text(
                    alt.isEmpty ? 'Image' : alt,
                    style: TextStyle(
                      color: scheme.primary,
                      decoration: TextDecoration.underline,
                    ),
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
