import 'package:drift/drift.dart';
import 'package:drift_flutter/drift_flutter.dart';
import 'package:uuid/uuid.dart';

part 'database.g.dart';

/// The columns every synced table carries, so that the sync rules are stated
/// once instead of re-derived per entity. First used by P2's tables.
///
/// [updatedAt] and [baseUpdatedAt] are deliberately two different things:
/// [updatedAt] is when *this device* last edited the row, [baseUpdatedAt] is
/// the server's own value for the version this device last pulled. The API
/// accepts a push outright while the base still matches; sending the local
/// edit time instead would never match, so every offline edit would fall
/// through to a clock comparison, which a slow handset loses.
mixin SyncColumns on Table {
  /// Client-minted UUIDv7 for anything the phone can create offline, so a
  /// retried create is a no-op rather than a duplicate.
  TextColumn get id => text()();

  DateTimeColumn get updatedAt => dateTime()();

  /// Null until a pull fills it in: the row has never been reconciled against
  /// a server timestamp.
  DateTimeColumn get baseUpdatedAt => dateTime().nullable()();

  /// What this device did that the server has not been told about, or null for
  /// a clean row. See [notPendingOp] before writing a filter over it.
  TextColumn get pendingOp => text().nullable()();

  IntColumn get pushAttempts => integer().withDefault(const Constant(0))();

  /// A delete keeps the row and never touches its status: the status is the
  /// only record of whether the thing was completed, cancelled or never dealt
  /// with, and the Deleted view exists to show exactly that.
  DateTimeColumn get deletedAt => dateTime().nullable()();
}

/// The pending operations the sync loop understands.
abstract final class PendingOps {
  static const String create = 'create';
  static const String update = 'update';
  static const String delete = 'delete';
  static const String restore = 'restore';
  static const String purge = 'purge';
}

/// "This row's pending operation is not [op]" — including every row that has
/// no pending operation at all.
///
/// `pendingOp.equals(op).not()` alone is SQL `NOT (pending_op = 'x')`, which is
/// NULL for a clean row, and NULL is falsy: the filter silently hides nearly
/// every row in the table. Bitten twice in v1; it lives here so a third slice
/// cannot get it wrong.
Expression<bool> notPendingOp(Expression<String> pendingOp, String op) =>
    pendingOp.isNull() | pendingOp.equals(op).not();

class KeyValues extends Table {
  TextColumn get key => text()();
  TextColumn get value => text()();

  @override
  Set<Column<Object>> get primaryKey => {key};
}

/// Thrown when the ladder is asked for a step it has no branch for.
///
/// drift's own default `onUpgrade` throws too, which is the right behaviour and
/// the reason a forgotten branch bricks every existing install rather than
/// failing loudly in CI. This one names the step so the CI failure says what is
/// missing.
class MigrationLadderError extends Error {
  MigrationLadderError(this.from, this.to);

  final int from;
  final int to;

  @override
  String toString() =>
      'MigrationLadderError: no migration from schema $from to $to. '
      'A drift schema change needs a schemaVersion bump AND a matching branch '
      'in AppDatabase.migration, in the same change.';
}

@DriftDatabase(tables: [KeyValues])
class AppDatabase extends _$AppDatabase {
  AppDatabase() : super(driftDatabase(name: 'botvy_v2'));

  /// Test constructor: whatever executor the test opened, no platform plugins.
  AppDatabase.forTesting(super.executor);

  @override
  int get schemaVersion => 1;

  @override
  MigrationStrategy get migration => MigrationStrategy(
    onCreate: (m) async {
      // drift maps a stored user_version of 0 to "brand new database", so
      // a file that already holds tables but was never stamped lands here
      // rather than in onUpgrade. `createAll` would then fail with
      // sqlite's "table already exists" — a driver error nobody can act
      // on. Name it instead.
      final existing = await customSelect(
        "SELECT name FROM sqlite_master WHERE type = 'table' "
        "AND name NOT LIKE 'sqlite_%'",
      ).get();
      if (existing.isNotEmpty) {
        throw MigrationLadderError(0, schemaVersion);
      }
      await m.createAll();
    },
    onUpgrade: (m, from, to) async {
      // One version so far, so there is nothing to step through yet. Every
      // later bump adds its own `if (from < N)` branch HERE and raises
      // schemaVersion in the same change; test/migration_ladder_test.dart
      // gains one case per bump.
      throw MigrationLadderError(from, to);
    },
  );

  Future<String?> getValue(String key) async {
    final row = await (select(
      keyValues,
    )..where((r) => r.key.equals(key))).getSingleOrNull();
    return row?.value;
  }

  Future<void> setValue(String key, String value) => into(
    keyValues,
  ).insertOnConflictUpdate(KeyValuesCompanion.insert(key: key, value: value));
}

/// Keys used by the shared plumbing. Feature slices declare their own.
abstract final class DbKeys {
  static const String installId = 'installId';
  static const String fcmToken = 'fcmToken';
}

/// This install's id, minted once and kept forever.
///
/// It is what tells the server this handset already holds the upcoming alarms,
/// so the server-side sweep can skip it. Losing it means being notified twice.
Future<String> stableInstallId(AppDatabase db) async {
  final existing = await db.getValue(DbKeys.installId);
  if (existing != null && existing.isNotEmpty) return existing;
  final fresh = const Uuid().v7();
  await db.setValue(DbKeys.installId, fresh);
  return fresh;
}
