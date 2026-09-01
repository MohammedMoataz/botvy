import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'api/api_client.dart';
import 'db/database.dart';
import 'notifications/local_notifications.dart';
import 'push.dart';
import 'sync/sync_service.dart';

/// The device's offline store. One instance for the process — SQLite is a
/// single file and a second connection would only invite lock contention.
final databaseProvider = Provider<AppDatabase>((ref) {
  final db = AppDatabase();
  ref.onDispose(db.close);
  return db;
});

final notificationSchedulerProvider = Provider<NotificationScheduler>(
  (ref) => NotificationScheduler(ref.watch(databaseProvider)),
);

final syncServiceProvider = Provider<SyncService>((ref) {
  final sync = SyncService(
    ref.watch(apiClientProvider),
    ref.watch(databaseProvider),
    ref.watch(notificationSchedulerProvider),
  );
  ref.onDispose(sync.dispose);
  return sync;
});

final pushServiceProvider = Provider<PushService>(
  (ref) => PushService(
    ref.watch(apiClientProvider),
    ref.watch(databaseProvider),
    ref.watch(notificationSchedulerProvider),
  ),
);
