/**
 * Indexes for the Profile context's two collections.
 *
 * Both are keyed by `userId` and hold exactly one document per member, so the
 * index that matters is the unique one on that field. It is not merely a
 * lookup: `bootstrap-on-registered` reacts to an at-least-once event, and while
 * the handler checks for an existing row before writing, two deliveries
 * arriving *concurrently* would both find nothing and both insert. The unique
 * index is what makes the second one fail instead of leaving a member with two
 * profiles and no way to tell which one their reminders read.
 *
 * `_id` already holds `userId` — the mapper writes it there — so these are
 * technically redundant with the primary key. They are declared anyway,
 * because the redundancy is an artefact of that mapping decision rather than
 * something a later phase should be relying on: a slice that changes `_id` to
 * an ObjectId would silently lose the guarantee, and this index is what would
 * then still be enforcing it.
 *
 * `createIndex` is idempotent for an identical specification, so running this
 * twice changes nothing — which the gate checks, because a migration that is
 * only safe the first time is a migration nobody dares re-run.
 */

/** @param {import('mongodb').Db} db */
async function up(db) {
  await db
    .collection('profiles')
    .createIndex({ userId: 1 }, { unique: true, name: 'profiles_user' });

  await db
    .collection('user_preferences')
    .createIndex({ userId: 1 }, { unique: true, name: 'user_preferences_user' });

  // The purge handler's own lookup, and the only query either collection
  // serves that is not "this member's row": P11 sweeps for documents whose
  // member is long gone.
  await db
    .collection('profiles')
    .createIndex({ updatedAt: -1 }, { name: 'profiles_recent' });
}

/** @param {import('mongodb').Db} db */
async function down(db) {
  // Present because migrate-mongo expects it. Constitution IV says migrations
  // only go forward, so this is never run in a deployed environment; a
  // correction is a new migration.
  await db.collection('profiles').dropIndexes();
  await db.collection('user_preferences').dropIndexes();
}

module.exports = { up, down };
