import 'package:botvy/app/l10n/app_localizations.dart';
import 'package:botvy/core/api/api_client.dart';
import 'package:flutter/widgets.dart';
import 'package:flutter_test/flutter_test.dart';

/// Setting the gateway's address.
///
/// The screen this specifies did not exist for the whole of P1, while
/// `readBaseUrl`, `writeBaseUrl`, `ApiClient.origin` and the `BOTVY_BASE_URL`
/// build define all did — so a real handset ran against
/// `http://10.0.2.2:8080`, the Android emulator's loopback to its own host,
/// and a self-hosted platform could not be pointed at the host hosting it
/// without building a new APK.
void main() {
  group('the address a member can type', () {
    test('accepts what a self-hosted install actually looks like', () {
      for (final url in [
        'https://botvy.example.com',
        'http://192.168.1.7:8080',
        'https://botvy.trycloudflare.com',
        'http://10.0.2.2:8080',
        // A trailing slash is normalised away before validating, so it is not
        // a mistake the member has to find and remove themselves.
        'https://botvy.example.com/',
      ]) {
        expect(ApiClient.validateBaseUrl(url), isNull, reason: url);
      }
    });

    /// The commonest thing anybody types, and it needs its own message.
    ///
    /// Dio treats a scheme-less `baseUrl` as a relative path, so every request
    /// goes somewhere meaningless and fails in a way that says nothing about
    /// the cause. "Start with http:// or https://" is a fix the member can
    /// make; "invalid address" is not.
    ///
    /// `Uri.parse` reads `192.168.1.7` as a *scheme*, so a missing one and an
    /// unusable one cannot be told apart - and do not need to be, because the
    /// sentence they produce is the same.
    test('names a missing or unusable scheme, which is one fix', () {
      expect(ApiClient.validateBaseUrl('botvy.example.com'), UrlProblem.scheme);
      expect(ApiClient.validateBaseUrl('192.168.1.7:8080'), UrlProblem.scheme);
    });

    test('refuses a scheme nothing can be fetched over', () {
      expect(ApiClient.validateBaseUrl('ws://botvy.example.com'), UrlProblem.scheme);
      expect(ApiClient.validateBaseUrl('ftp://botvy.example.com'), UrlProblem.scheme);
    });

    /// `/api/v1` and `/ws` are both appended to this, so a path here breaks
    /// REST and the socket in two different ways.
    test('refuses a path, which would be appended to twice', () {
      expect(
        ApiClient.validateBaseUrl('https://botvy.example.com/api/v1'),
        UrlProblem.hasPath,
      );
      expect(
        ApiClient.validateBaseUrl('https://example.com/botvy'),
        UrlProblem.hasPath,
      );
    });

    test('refuses nothing at all', () {
      expect(ApiClient.validateBaseUrl(''), UrlProblem.empty);
      expect(ApiClient.validateBaseUrl('   '), UrlProblem.empty);
    });

    test('refuses something that is not an address', () {
      expect(ApiClient.validateBaseUrl('http://'), UrlProblem.notAUrl);
    });
  });

  group('probing the address', () {
    /// Nothing listening is the ordinary first attempt, and it must be an
    /// answer rather than an exception the screen has to catch.
    test('reports nothing answering rather than throwing', () async {
      // Port 1 on loopback: reserved, and nothing binds it.
      final probe = await ApiClient.probeGateway('http://127.0.0.1:1');

      expect(probe.outcome, ProbeOutcome.unreachable);
      expect(probe.ok, isFalse);
    });

    /// A URL the validator already refused must not be dialled: the point of
    /// testing before saving is to fail fast, not to wait out a timeout on an
    /// address that could never have worked.
    test('does not dial an address it can already see is wrong', () async {
      final probe = await ApiClient.probeGateway('botvy.example.com');

      expect(probe.outcome, ProbeOutcome.unreachable);
    });
  });

  group('what the screen can say', () {
    /// Every message the screen reaches for exists in both languages. A
    /// missing key falls back to English, which on this screen would put an
    /// English sentence in the middle of an Arabic form.
    test('has both languages for every gateway string', () {
      const en = AppLocalizations(Locale('en'));
      const ar = AppLocalizations(Locale('ar'));

      final english = <String>[
        en.serverTitle,
        en.serverSettings,
        en.serverExplain,
        en.testConnection,
        en.serverSaved,
        en.serverUrlRequired,
        en.serverUrlInvalid,
        en.serverUrlNeedsScheme,
        en.serverUrlNoPath,
        en.serverNotBotvy,
        en.serverUnreachable,
      ];
      final arabic = <String>[
        ar.serverTitle,
        ar.serverSettings,
        ar.serverExplain,
        ar.testConnection,
        ar.serverSaved,
        ar.serverUrlRequired,
        ar.serverUrlInvalid,
        ar.serverUrlNeedsScheme,
        ar.serverUrlNoPath,
        ar.serverNotBotvy,
        ar.serverUnreachable,
      ];

      for (var i = 0; i < english.length; i++) {
        expect(arabic[i], isNotEmpty);
        // Not merely present: actually translated. A key copied from the
        // English map is what a fallback looks like from the outside.
        expect(arabic[i], isNot(english[i]), reason: english[i]);
      }
    });

    /// The first parameterised strings in the app. Substitution rather than
    /// concatenation, because the version does not sit in the same place in
    /// both sentences.
    test('puts the version into the sentence, in both languages', () {
      const en = AppLocalizations(Locale('en'));
      const ar = AppLocalizations(Locale('ar'));

      expect(en.serverReachable('2.0.0'), contains('2.0.0'));
      expect(en.serverReachable('2.0.0'), isNot(contains('{version}')));
      expect(ar.serverReachable('2.0.0'), contains('2.0.0'));
      expect(ar.serverReachable('2.0.0'), isNot(contains('{version}')));
      expect(ar.serverDegraded('2.0.0'), contains('2.0.0'));
      expect(ar.serverDegraded('2.0.0'), isNot(contains('{version}')));
    });
  });
}
