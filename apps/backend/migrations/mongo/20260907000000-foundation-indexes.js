/**
 * Every index the foundation's collections need.
 *
 * `createIndex` is idempotent for an identical specification, so running this
 * twice changes nothing — which the gate checks, because a migration that is
 * only safe the first time is a migration nobody dares re-run.
 */

/** @param {import('mongodb').Db} db */
async function up(db) {
  // The relay's two queries: find one event by id, and find what is undelivered
  // oldest-first. The unique index on eventId is what makes the forwarder's
  // at-least-once hop from PostgreSQL collapse to a single row.
  await db.collection('outbox').createIndex({ eventId: 1 }, { unique: true, name: 'outbox_event_id' });
  await db
    .collection('outbox')
    .createIndex({ deliveredAt: 1, occurredAt: 1 }, { name: 'outbox_pending' });

  // Delivered events are kept a week for forensics, then expire. A partial
  // filter so an *undelivered* event is never swept away by the TTL — the whole
  // point of the row is that it still has to go somewhere.
  await db.collection('outbox').createIndex(
    { deliveredAt: 1 },
    {
      name: 'outbox_delivered_ttl',
      expireAfterSeconds: 7 * 24 * 60 * 60,
      partialFilterExpression: { deliveredAt: { $type: 'date' } },
    },
  );

  await db.collection('audit_log').createIndex({ at: -1 }, { name: 'audit_recent' });
  await db.collection('audit_log').createIndex({ 'actor.id': 1, at: -1 }, { name: 'audit_by_actor' });

  // Retention for replayed commands is this index, not a timer in code: a
  // replay older than a day is a new request.
  await db
    .collection('idempotency_keys')
    .createIndex({ createdAt: 1 }, { name: 'idempotency_ttl', expireAfterSeconds: 24 * 60 * 60 });

  // The demonstration slice. Unique per member and client id, which is what
  // makes a retried create a no-op rather than a second row.
  await db
    .collection('pings')
    .createIndex({ userId: 1, clientId: 1 }, { unique: true, name: 'pings_user_client' });
}

/** @param {import('mongodb').Db} db */
async function down(db) {
  // Present because migrate-mongo expects it. Constitution IV says migrations
  // only go forward, so this is never run in a deployed environment; a
  // correction is a new migration.
  await db.collection('outbox').dropIndexes();
  await db.collection('audit_log').dropIndexes();
  await db.collection('idempotency_keys').dropIndexes();
  await db.collection('pings').dropIndexes();
}

module.exports = { up, down };
