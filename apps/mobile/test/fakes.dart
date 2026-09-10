import 'package:botvy/core/api/api_client.dart';
import 'package:botvy/core/db/database.dart';
import 'package:botvy/core/notifications/local_notifications.dart';
import 'package:botvy/core/sync/sync_engine.dart';

/// The collaborators a Cubit spec needs and does not want.
///
/// Here rather than repeated in each spec because three files wanted the same
/// two, which is the point at which duplicating stops being cheaper than
/// sharing. Both are deliberately *silent* rather than recording: what the
/// Cubit specs are about is the local database, and a spec that also asserted
/// on the network would be two tests wearing one name. The engine's own
/// behaviour has `test/sync_test.dart`.

/// Never reaches a server. Offline is the normal state of this application, so
/// throwing here exercises the same path a plane does.
class OfflineApi extends ApiClient {
  OfflineApi()
    : super(
        TokenStore(InMemorySecretStore()),
        baseUrl: 'http://example.invalid',
      );

  @override
  Future<Map<String, dynamic>> sync({
    required String installId,
    required List<String> entities,
    String? since,
    Map<String, dynamic> push = const {},
  }) async => throw ApiException('offline', isOffline: true);

  @override
  Future<List<String>> labelPalette() async =>
      throw ApiException('offline', isOffline: true);
}

/// Counts passes and touches no platform channel.
class SilentScheduler extends NotificationScheduler {
  int passes = 0;

  @override
  Future<int> rescheduleAll(AppDatabase db, {DateTime? now}) async {
    passes++;
    return 0;
  }
}

/// A sync engine that can be kicked without anything happening.
SyncEngine offlineEngine(AppDatabase db) =>
    SyncEngine(OfflineApi(), db, SilentScheduler());
