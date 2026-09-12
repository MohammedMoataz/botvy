/**
 * Every index P2 needs, declared here and nowhere else.
 *
 * The Mongoose schemas for `tasks`, `labels`, `reminders` and `alerts` describe
 * shape only and never call `index()`. That split is deliberate and it is
 * constitution IV: an index created by `autoIndex` on connect is an index
 * created differently on every deploy, at a moment nobody chose, against
 * whatever the code happened to say that day. Written down here it goes forward
 * once, in a known order, and a later correction is a new file rather than an
 * edit to this one.
 *
 * It runs before the schemas are ever used, which is what T204's uniqueness
 * spec depends on: the test asserts that a duplicate label name is refused, and
 * without the partial index having been created first there is nothing to
 * refuse it.
 *
 * `createIndex` is idempotent for an identical specification, so a second run
 * changes nothing — which the P0 gate checks, because a migration that is only
 * safe the first time is a migration nobody dares re-run.
 *
 * ## The partial-index rule, which is the whole reason this file has prose
 *
 * **MongoDB treats a missing field and an explicit null as the same value for
 * uniqueness.** Postgres does not: there, `NULL` is distinct from every other
 * `NULL`, so a unique constraint over a nullable column permits any number of
 * rows that leave it empty. That semantic did not port, and every uniqueness
 * rule in this phase is over a field that is legitimately absent sometimes:
 *
 *   - `labels.nameLower` is absent on a tombstoned label, because a deleted
 *     label must not block the member from creating a new one with the name
 *     they just freed up.
 *   - `alerts.source.occurrenceAt` is null for everything that is not a
 *     recurring source — a one-off reminder has no occurrence.
 *
 * Without `partialFilterExpression: { <field>: { $exists: true } }`, the second
 * document that omits the field collides with the first and the member sees a
 * duplicate-key error for a rule that was never meant to apply to them.
 */

/** @param {import('mongodb').Db} db */
async function up(db) {
  // ------------------------------------------------------------------ labels
  //
  // `nameLower` is a stored, lower-cased copy of the name, written by the
  // mapper. It exists purely so this index can be case-insensitive: Mongo has
  // no expression indexes, so "no two labels called Work" has to be enforced
  // over a field that already holds the comparison form.
  //
  // Partial on `$exists: true` and the aggregate unsets it on delete, so the
  // rule reads "no two *live* labels share a name" without the index needing to
  // know what `deletedAt` means.
  await db.collection('labels').createIndex(
    { userId: 1, nameLower: 1 },
    {
      unique: true,
      partialFilterExpression: { nameLower: { $exists: true } },
      name: 'labels_user_name_unique',
    },
  );

  // The sync pull's cursor. Every syncable collection is read as "this member's
  // rows changed after a moment", and that is this index in both directions.
  await db.collection('labels').createIndex({ userId: 1, updatedAt: 1 }, { name: 'labels_user_updated' });

  // ------------------------------------------------------------------- tasks
  await db.collection('tasks').createIndex({ userId: 1, dueAt: 1 }, { name: 'tasks_user_due' });

  // Today, Upcoming and Overdue are all "this member's open tasks in a date
  // window", so the compound order is userId → status → dueAt: equality fields
  // first, the range field last, which is the only order a single index can
  // serve all three with.
  await db
    .collection('tasks')
    .createIndex({ userId: 1, status: 1, dueAt: 1 }, { name: 'tasks_user_status_due' });

  await db.collection('tasks').createIndex({ userId: 1, labelId: 1 }, { name: 'tasks_user_label' });

  await db.collection('tasks').createIndex({ userId: 1, updatedAt: 1 }, { name: 'tasks_user_updated' });

  // The Deleted view, and the tombstone purge the sweep dispatches. Partial, so
  // the index holds only tombstones: it is read by two rare paths and would
  // otherwise carry a null entry for every live task a member has.
  await db.collection('tasks').createIndex(
    { userId: 1, deletedAt: 1 },
    { partialFilterExpression: { deletedAt: { $type: 'date' } }, name: 'tasks_user_deleted' },
  );

  // --------------------------------------------------------------- reminders
  await db
    .collection('reminders')
    .createIndex({ userId: 1, remindAt: 1 }, { name: 'reminders_user_remind' });

  await db
    .collection('reminders')
    .createIndex({ userId: 1, updatedAt: 1 }, { name: 'reminders_user_updated' });

  await db.collection('reminders').createIndex(
    { userId: 1, deletedAt: 1 },
    { partialFilterExpression: { deletedAt: { $type: 'date' } }, name: 'reminders_user_deleted' },
  );

  // ------------------------------------------------------------------ alerts
  //
  // The uniqueness that makes the planning saga idempotent. It reconciles a
  // desired set on every source event, and the events arrive at least once, so
  // the same `TaskScheduled` delivered twice must not plan two alerts for one
  // moment. The key is the source plus the lead-time label: one alert per
  // (member, source, occurrence, label).
  //
  // `source.occurrenceAt` is null for a one-off source, so this is partial on
  // its existence for the reason in the header — otherwise the second one-off
  // reminder a member ever creates collides with the first.
  await db.collection('alerts').createIndex(
    { userId: 1, 'source.kind': 1, 'source.id': 1, 'source.occurrenceAt': 1, label: 1 },
    {
      unique: true,
      partialFilterExpression: { 'source.occurrenceAt': { $exists: true } },
      name: 'alerts_source_label_unique',
    },
  );

  // The sweep's own query: due and not yet sent. Partial on `sentAt: null`
  // keeps the index the size of the backlog rather than the size of history —
  // it is scanned every five minutes for ever, while a sent alert is of
  // interest to nobody.
  await db.collection('alerts').createIndex(
    { notifyAt: 1 },
    { partialFilterExpression: { sentAt: null }, name: 'alerts_pending_notify' },
  );

  // The re-plan paths. A time-zone change, a preferences change, a ban and a
  // device coming or going all mean "find this member's future alerts", and
  // that is a lookup by member and moment with no notion of `sentAt`.
  await db.collection('alerts').createIndex({ userId: 1, notifyAt: 1 }, { name: 'alerts_user_notify' });

  // `pendingAlerts` hands the phone the next seven days so it can schedule its
  // own alarms, and the purge on `identity.UserDeleted` deletes by source.
  await db
    .collection('alerts')
    .createIndex({ userId: 1, 'source.kind': 1, 'source.id': 1 }, { name: 'alerts_user_source' });
}

/** @param {import('mongodb').Db} db */
async function down(db) {
  // Present because migrate-mongo expects it. Constitution IV says migrations
  // only go forward, so this is never run in a deployed environment; a
  // correction is a new migration.
  await db.collection('labels').dropIndexes();
  await db.collection('tasks').dropIndexes();
  await db.collection('reminders').dropIndexes();
  await db.collection('alerts').dropIndexes();
}

module.exports = { up, down };
