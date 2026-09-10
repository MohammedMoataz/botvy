import 'package:flutter/material.dart';
import 'package:flutter/services.dart' show Clipboard, ClipboardData;
import 'package:flutter_markdown_plus/flutter_markdown_plus.dart';

import '../../../app/l10n/app_localizations.dart';

/// An assistant message, rendered as Markdown.
///
/// **Only ever an assistant message.** The member's own text is drawn with a
/// plain [Text] by the caller, and that asymmetry is the point rather than an
/// inconsistency: rendering what somebody typed as markup turns a pasted URL
/// into a tap target, an underscore in a filename into italics, and a pasted
/// article's own links into things that look like Botvy offering them. FR-014's
/// rule about quoted text not being *executed* has a display half, and this is
/// it.
///
/// Links are restricted to `http` and `https` in [_onTapLink]. Everything else
/// — `javascript:`, `file:`, `intent:`, `mailto:`, a custom scheme a pasted
/// document brought with it — is refused and said so. The check is on the
/// parsed scheme rather than on a prefix match, because `hTTp:` and
/// ` javascript:` both defeat a `startsWith`.
class AssistantMarkdown extends StatelessWidget {
  const AssistantMarkdown(this.content, {super.key});

  final String content;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return MarkdownBody(
      data: content,
      // So the member can quote a line back, or copy a figure out of a table.
      selectable: true,
      styleSheet: MarkdownStyleSheet.fromTheme(theme).copyWith(
        p: theme.textTheme.bodyMedium,
        // Left at the theme's own alignment rather than forced to
        // `TextAlign.left`: an Arabic answer inside a `Directionality.rtl`
        // subtree has to start on the right, and a hard-coded alignment here is
        // the single most common way an RTL layout ends up looking translated
        // rather than localised (FR-019).
        a: theme.textTheme.bodyMedium?.copyWith(
          color: theme.colorScheme.primary,
          decoration: TextDecoration.underline,
        ),
        code: theme.textTheme.bodySmall?.copyWith(
          fontFamily: 'monospace',
          backgroundColor: theme.colorScheme.surfaceContainerHighest,
        ),
      ),
      onTapLink: (text, href, title) => _onTapLink(context, href),
    );
  }

  void _onTapLink(BuildContext context, String? href) {
    final t = AppLocalizations.of(context);
    final messenger = ScaffoldMessenger.of(context);

    final uri = href == null ? null : Uri.tryParse(href.trim());
    final scheme = uri?.scheme.toLowerCase();
    if (uri == null || (scheme != 'http' && scheme != 'https')) {
      // Said out loud rather than ignored. A tap that does nothing reads as a
      // broken app; a tap that says the link was refused reads as the app
      // protecting them, which is what it is doing.
      messenger.showSnackBar(SnackBar(content: Text(t.chatLinkRefused)));
      return;
    }

    // ponytail: copied rather than opened. Opening a URL needs `url_launcher`
    // plus an Android `<queries>` manifest entry for the http/https intents,
    // which is two pieces of platform configuration for a feature nothing in
    // this phase asked for — the coach answers about the member's own body and
    // day, and links are rare. The scheme guard above is the part that had to
    // exist, and it is where the upgrade plugs in: swap this one line for
    // `launchUrl(uri, mode: LaunchMode.externalApplication)`.
    Clipboard.setData(ClipboardData(text: uri.toString()));
    messenger.showSnackBar(SnackBar(content: Text(t.chatLinkCopied)));
  }
}
