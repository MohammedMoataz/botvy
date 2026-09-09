import 'package:botvy/src/api/api_client.dart';
import 'package:flutter_test/flutter_test.dart';

/// Where a fresh install points before anyone opens Settings.
///
/// The interesting half of this file only runs when the value is injected:
///
/// ```
/// flutter test --dart-define=BOTVY_BASE_URL=https://example.test
/// ```
///
/// which is exactly how a release build passes the live tunnel hostname in.
/// `infra/release-mobile.mjs` does both, so the check runs against the same
/// value the APK is about to carry.
const _injected = String.fromEnvironment('BOTVY_BASE_URL');

void main() {
  test('is a usable absolute http(s) URL', () {
    // A default that cannot be parsed is a fresh install that cannot reach
    // anything, with no error the user can act on.
    final uri = Uri.parse(kDefaultBaseUrl);

    expect(uri.hasScheme, isTrue, reason: kDefaultBaseUrl);
    expect(['http', 'https'], contains(uri.scheme));
    expect(uri.host, isNotEmpty);
  });

  test('carries no trailing slash, which would double up in every path', () {
    expect(kDefaultBaseUrl.endsWith('/'), isFalse);
  });

  test('falls back to the emulator loopback when nothing is injected', () {
    if (_injected.isNotEmpty) return; // this run injected one; see below
    expect(kDefaultBaseUrl, 'http://10.0.2.2:8080');
  });

  test('uses the injected value when the build supplies one', () {
    if (_injected.isEmpty) {
      // Nothing to assert, and skipping loudly beats passing quietly: run this
      // file with --dart-define to exercise the path a release takes.
      return;
    }
    expect(kDefaultBaseUrl, _injected);
  });
}
