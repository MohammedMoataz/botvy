# Data Model: Foundation (P0)

**Feature**: `014-foundation` | **Date**: 2026-09-05 | **Parent**: `specs/013-platform-v2-blueprint/data-model.md`

P0 creates only what the spine and the skeletons need. Every later collection is
added by the phase that owns it, through its own context's repository adapter.

## 1. Persistence ports (shared kernel) — the shape every context uses

```ts
// shared/persistence/ports
abstract class AggregateRoot<Id = string> {
  readonly id: Id; readonly userId: string; updatedAt: Date; schemaVersion: number;
  protected raise(event: DomainEvent): void; pullEvents(): DomainEvent[];
}
interface DomainEvent { eventId: string; name: string; context: string; aggregate: { type: string; id: string }; userId: string | null; occurredAt: Date; payload: unknown }

abstract class Repository<T extends AggregateRoot> {
  abstract findById(userId: string, id: string): Promise<T | null>;
  abstract save(aggregate: T): Promise<void>;      // upsert + append pulled events to the outbox (store-specific)
  abstract remove(aggregate: T): Promise<void>;    // hard delete — tombstoning is a domain operation, not remove()
}
abstract class SyncableRepository<T extends AggregateRoot> extends Repository<T> {
  abstract pullSince(userId: string, since: Date | null): Promise<T[]>;
  abstract applyChange(userId: string, change: SyncChange): Promise<ApplyResult>;
}
abstract class UnitOfWork {
  abstract run<R>(work: () => Promise<R>): Promise<R>;   // one transaction; nested run() joins the outer one
  abstract onCommit(callback: () => Promise<void>): void;
}
interface Mapper<T, Doc> { toDomain(doc: Doc): T /* upcasts by schemaVersion */; toPersistence(aggregate: T): Doc }
```

Adapters shipped in P0: `MongoUnitOfWork` + `MongoRepositoryBase`,
`PrismaUnitOfWork` + `PrismaRepositoryBase`, `InMemoryUnitOfWork` +
`InMemoryRepositoryBase`. Binding happens in each context module
(`{ provide: PingRepository, useClass: MongoPingRepository }`).

## 2. PostgreSQL — Identity (Prisma)

Migration history: v1's eleven migrations copied verbatim, then
`20260905120000_v2_identity`:

```sql
ALTER TABLE "users"          ADD COLUMN "google_sub" TEXT UNIQUE, ADD COLUMN "deleted_at" TIMESTAMPTZ;
ALTER TABLE "refresh_tokens" ADD COLUMN "family_id" UUID, ADD COLUMN "replaced_by" TEXT, ADD COLUMN "device_id" UUID;
UPDATE "refresh_tokens" SET "family_id" = gen_random_uuid() WHERE "family_id" IS NULL;   -- one family per existing row
ALTER TABLE "refresh_tokens" ALTER COLUMN "family_id" SET NOT NULL;
CREATE INDEX "refresh_tokens_user_family_idx" ON "refresh_tokens"("user_id", "family_id");
CREATE TYPE "DeviceKind" AS ENUM ('android','ios','chrome_extension','web');
ALTER TABLE "devices"        ADD COLUMN "kind" "DeviceKind" NOT NULL DEFAULT 'android';
CREATE TABLE "service_clients" (
  "id" UUID PRIMARY KEY, "name" TEXT UNIQUE NOT NULL, "token_hash" TEXT NOT NULL,
  "scopes" TEXT[] NOT NULL DEFAULT '{}', "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "last_used_at" TIMESTAMPTZ, "revoked_at" TIMESTAMPTZ);
CREATE TABLE "identity_outbox" (                   -- Identity's events, same transaction as the change
  "id" TEXT PRIMARY KEY, "name" TEXT NOT NULL, "aggregate" JSONB NOT NULL, "user_id" UUID,
  "payload" JSONB NOT NULL, "occurred_at" TIMESTAMPTZ NOT NULL DEFAULT now(), "forwarded_at" TIMESTAMPTZ);
CREATE INDEX "identity_outbox_pending_idx" ON "identity_outbox"("forwarded_at", "occurred_at");
```

Prisma schema declares `User`, `RefreshToken`, `Device`, `ServiceClient` and
`IdentityOutbox` exactly as in the blueprint §1. v1's `reminders`, `messages`, `conversations`,
`coaching_profiles`, `checkins`, `workout_records`, `usage_log`, `settings`,
`reminder_notifications` tables remain in the database, undeclared and untouched
(F-02). Ports in P0: `UserRepository` (findById, findByLogin, save),
`ServiceClientRepository` (findByName, verifyToken(hash), touch),
`IdentityOutboxRepository` (append within the current transaction, listPending,
markForwarded). The admin seed (ported) runs through `UserRepository`.

## 3. MongoDB — shared infrastructure + Operations (Mongoose)

| Collection | Owner | Shape | Indexes |
|---|---|---|---|
| `settings` | Operations | `{ _id: key, value, updatedAt, updatedBy }` | `_id` |
| `ops_heartbeats` | Operations | `{ _id: job, lastRunAt, lastOkAt, lastDurationMs, lastError }` | `_id` |
| `outbox` | shared | `{ _id: ObjectId, eventId, name, context, aggregate: { type, id }, userId, payload, occurredAt, deliveredAt, attempts, lastError, nextAttemptAt }` | `{ eventId: 1 }` unique · `{ deliveredAt: 1, occurredAt: 1 }` · TTL `{ deliveredAt: 1 }` 7 d (partial: deliveredAt exists) |
| `relay_state` | shared | `{ _id: 'outbox', resumeToken, updatedAt }` | `_id` |
| `pings` | Operations (demo) | `{ _id: uuidv7, userId, clientId, at, schemaVersion }` | `{ userId: 1, clientId: 1 }` unique |

`migrate-mongo` script `0001-foundation-indexes.js` creates the indexes above and is
idempotent. `settings` documents are created lazily on first `set`; reads fall
back to registry defaults.

## 4. Phone (drift) — `botvy_v2.sqlite`, `schemaVersion = 1`

```dart
mixin SyncColumns on Table {              // defined in P0, first used by P2's tables
  TextColumn get id => text()();
  DateTimeColumn get updatedAt => dateTime()();
  DateTimeColumn get baseUpdatedAt => dateTime().nullable()();
  TextColumn get pendingOp => text().nullable()();
  IntColumn get pushAttempts => integer().withDefault(const Constant(0))();
  DateTimeColumn get deletedAt => dateTime().nullable()();
}
class KeyValues extends Table { TextColumn get key => text()(); TextColumn get value => text()(); Set<Column> get primaryKey => {key}; }
```

`MigrationStrategy` has `onCreate: createAll` and an `onUpgrade` ladder with no
branches yet; `test/migration_ladder_test.dart` asserts that opening a v1-shaped
file is refused clearly (different file name) and that a future `from < 2` branch
pattern compiles against a hand-built v1 file — the harness later phases extend.

## 5. Extension (Dexie) — `botvy` database v1

`meta` table `{ key, value }` (cursor, install id). Tokens live in
`chrome.storage.local` under `botvy.auth`.

## 6. Events introduced in P0

Identity's events (none in P0 beyond the seed) travel PostgreSQL `identity_outbox` →
forwarder → Mongo `outbox`; Operations' events start in the Mongo outbox directly.

| Event | Producer | Payload | Consumers |
|---|---|---|---|
| `operations.Pinged` | ping handler (backend) | `{ pingId, clientId, at }` | worker `PingedHandler` → `ops_heartbeats.ping`; webhook `botvy/pinged` |
| `operations.SettingChanged` | settings service | `{ key }` | both roles → settings cache invalidation |

## 7. Environment contract (validated by `shared/config/env.schema.ts`)

`BOTVY_ROLE` (backend|worker) · `PORT` (8080) · `WORKER_PORT` (8081) ·
`DATABASE_URL` · `MONGO_URL` · `JWT_ACCESS_SECRET` · `JWT_REFRESH_SECRET` ·
`JWT_ACCESS_TTL` (15m) · `JWT_REFRESH_TTL` (30d) · `INTERNAL_SERVICE_TOKEN`
(bootstrap value for the `n8n` service client) · `AUTOMATION_WEBHOOK_SECRET` ·
`N8N_URL` · `N8N_API_KEY?` · `OLLAMA_BASE_URL` · `FIREBASE_CREDENTIALS_FILE?` ·
`MEDIA_SIGNING_SECRET` · `MEDIA_DIR` (/data/media) · `CORS_ORIGINS?` ·
`ADMIN_EMAIL` · `ADMIN_PASSWORD` · `ALLOW_REGISTRATION` · `LOG_LEVEL`. Compose adds
`POSTGRES_*`, `N8N_*`, `EDGE_PORT`, `CADDY_SITE`, `TUNNEL_TOKEN?`, `BOTVY_TAG`.
