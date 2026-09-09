import 'dart:async';

import 'package:flutter/material.dart';

import '../../../app/di.dart';
import '../../../app/l10n/app_localizations.dart';
import '../../../core/api/api_client.dart';
import '../../../core/api/socket_client.dart';

/// Where this installation lives.
///
/// The screen the phase was missing. `TokenStore.readBaseUrl`,
/// `writeBaseUrl`, `ApiClient.origin` and the `BOTVY_BASE_URL` build define
/// were all written in P1, and nothing anywhere let a person set the value —
/// so a real handset ran against `http://10.0.2.2:8080`, the Android
/// emulator's loopback to its host, and a self-hosted platform whose whole
/// premise is your own hostname could not be pointed at one without rebuilding
/// the APK.
///
/// Reachable while signed out, which is the point: the sign-in request is
/// already going to the wrong address, so a settings screen locked behind
/// signing in would be locked behind the thing it exists to fix.
///
/// It tests before it saves. A wrong URL and a wrong password produce the same
/// failure on the sign-in form, and telling those apart by trial is how
/// somebody concludes their account is broken.
class ServerPage extends StatefulWidget {
  const ServerPage({super.key});

  @override
  State<ServerPage> createState() => _ServerPageState();
}

class _ServerPageState extends State<ServerPage> {
  final _form = GlobalKey<FormState>();
  final _url = TextEditingController();

  bool _loading = true;
  bool _testing = false;
  GatewayProbe? _probe;
  bool _saved = false;

  @override
  void initState() {
    super.initState();
    unawaited(_load());
  }

  @override
  void dispose() {
    _url.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    final current = await sl<ApiClient>().tokens.readBaseUrl();
    if (!mounted) return;
    setState(() {
      _url.text = current;
      _loading = false;
    });
  }

  Future<void> _test() async {
    if (!(_form.currentState?.validate() ?? false)) return;

    setState(() {
      _testing = true;
      _probe = null;
      _saved = false;
    });
    final probe = await ApiClient.probeGateway(_url.text);
    if (!mounted) return;
    setState(() {
      _testing = false;
      _probe = probe;
    });
  }

  Future<void> _save() async {
    if (!(_form.currentState?.validate() ?? false)) return;

    final url = ApiClient.normaliseBaseUrl(_url.text);
    final api = sl<ApiClient>();

    await api.tokens.writeBaseUrl(url);

    // The live client too, not only the stored value. Writing storage alone
    // would leave every request in this session still going to the old host,
    // and the member would fix the URL and watch it fail anyway.
    api.origin = url;

    // The socket reads `api.origin` when it opens, so it has to be dropped:
    // a connection already established to the old host would survive the
    // change and keep delivering nothing.
    sl<SocketClient>().disconnect();

    // No sign-out here, deliberately. Tokens are issued by one installation
    // and meaningless at another, so pointing the app at a *different* server
    // does invalidate the session - but the commoner reason to open this
    // screen is a tunnel hostname that changed for the same server, and
    // signing somebody out of a session that still works would be a worse
    // answer than the alternative. The 401 handles the other case: the first
    // refused request fires `ApiClient.onAuthLost`, which is already wired to
    // the cubit and already sends them to sign in.

    if (!mounted) return;
    setState(() => _saved = true);
  }

  @override
  Widget build(BuildContext context) {
    final t = AppLocalizations.of(context);

    return Scaffold(
      appBar: AppBar(title: Text(t.serverTitle)),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : SafeArea(
              child: SingleChildScrollView(
                padding: const EdgeInsets.all(24),
                child: Center(
                  child: ConstrainedBox(
                    constraints: const BoxConstraints(maxWidth: 480),
                    child: Form(
                      key: _form,
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.stretch,
                        children: [
                          Text(t.serverExplain, style: Theme.of(context).textTheme.bodyMedium),
                          const SizedBox(height: 20),

                          TextFormField(
                            controller: _url,
                            decoration: InputDecoration(
                              labelText: t.serverUrl,
                              hintText: 'https://botvy.example.com',
                              prefixIcon: const Icon(Icons.dns_outlined),
                            ),
                            keyboardType: TextInputType.url,
                            autocorrect: false,
                            // A hostname is not prose. Left to the keyboard's
                            // defaults, the first character arrives
                            // capitalised and the URL is wrong in a way that
                            // is hard to see.
                            textCapitalization: TextCapitalization.none,
                            // Always left-to-right, even in Arabic: a URL is
                            // not text in the member's language, and rendered
                            // right-to-left it reads as a different address
                            // than the one it is.
                            textDirection: TextDirection.ltr,
                            validator: (value) => _describeProblem(
                              t,
                              ApiClient.validateBaseUrl(value ?? ''),
                            ),
                            onChanged: (_) {
                              // A tested-and-then-edited URL is not a tested
                              // URL, and leaving the tick up would be a lie.
                              if (_probe != null || _saved) {
                                setState(() {
                                  _probe = null;
                                  _saved = false;
                                });
                              }
                            },
                            onFieldSubmitted: (_) => unawaited(_test()),
                          ),

                          const SizedBox(height: 20),
                          OutlinedButton.icon(
                            onPressed: _testing ? null : () => unawaited(_test()),
                            icon: _testing
                                ? const SizedBox(
                                    height: 18,
                                    width: 18,
                                    child: CircularProgressIndicator(strokeWidth: 2),
                                  )
                                : const Icon(Icons.wifi_tethering),
                            label: Text(t.testConnection),
                          ),

                          if (_probe != null) ...[
                            const SizedBox(height: 12),
                            _ProbeResult(probe: _probe!),
                          ],

                          const SizedBox(height: 12),
                          FilledButton(
                            // Savable without a successful test. A member
                            // setting this up before the tunnel is running has
                            // a legitimate reason, and refusing would strand
                            // them; the test is advice, not a gate.
                            onPressed: _testing ? null : () => unawaited(_save()),
                            child: Text(t.save),
                          ),

                          if (_saved) ...[
                            const SizedBox(height: 12),
                            Row(
                              mainAxisAlignment: MainAxisAlignment.center,
                              children: [
                                Icon(
                                  Icons.check_circle_outline,
                                  size: 18,
                                  color: Theme.of(context).colorScheme.primary,
                                ),
                                const SizedBox(width: 8),
                                Flexible(child: Text(t.serverSaved)),
                              ],
                            ),
                          ],
                        ],
                      ),
                    ),
                  ),
                ),
              ),
            ),
    );
  }

  /// The problem, in the member's language. The client reports which problem;
  /// only the screen knows what language to say it in.
  String? _describeProblem(AppLocalizations t, UrlProblem? problem) =>
      switch (problem) {
        null => null,
        UrlProblem.empty => t.serverUrlRequired,
        UrlProblem.notAUrl => t.serverUrlInvalid,
        UrlProblem.scheme => t.serverUrlNeedsScheme,
        UrlProblem.hasPath => t.serverUrlNoPath,
      };
}

class _ProbeResult extends StatelessWidget {
  const _ProbeResult({required this.probe});

  final GatewayProbe probe;

  @override
  Widget build(BuildContext context) {
    final t = AppLocalizations.of(context);
    final scheme = Theme.of(context).colorScheme;

    final (IconData icon, Color colour, String message) = switch (probe.outcome) {
      ProbeOutcome.reachable when probe.degraded => (
        Icons.warning_amber_outlined,
        scheme.tertiary,
        t.serverDegraded(probe.version ?? '?'),
      ),
      ProbeOutcome.reachable => (
        Icons.check_circle_outline,
        scheme.primary,
        t.serverReachable(probe.version ?? '?'),
      ),
      ProbeOutcome.notBotvy => (
        Icons.help_outline,
        scheme.error,
        t.serverNotBotvy,
      ),
      ProbeOutcome.unreachable => (
        Icons.cloud_off_outlined,
        scheme.error,
        t.serverUnreachable,
      ),
    };

    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: colour.withValues(alpha: 0.08),
        borderRadius: BorderRadius.circular(8),
      ),
      child: Row(
        children: [
          Icon(icon, size: 20, color: colour),
          const SizedBox(width: 12),
          Expanded(child: Text(message)),
        ],
      ),
    );
  }
}
