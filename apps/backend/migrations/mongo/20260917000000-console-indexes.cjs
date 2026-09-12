/**
 * The two reads the Owner's console adds (P10), and nothing else.
 *
 * `audit_log` already has `{ at: -1 }` and `{ 'actor.id': 1, at: -1 }` from the
 * foundation phase. What it did not have is the pair the console's *filters*
 * use, and the distinction is worth stating because an index nobody queries is
 * a write cost with no reader:
 *
 * - **`{ action: 1, _id: -1 }`** — "show me every ban", which is the filter an
 *   investigation starts with.
 * - **`{ 'target.type': 1, _id: -1 }`** — "show me everything done to a
 *   setting", which is how a configuration change is traced afterwards.
 *
 * Both end in `_id` rather than in `at`, and that is the whole reason this file
 * exists rather than reusing the foundation's. The page is **ordered and
 * cursored by `_id`**: two acts in one millisecond are ordinary here — banning
 * a member writes the ban and ends their sessions — so a timestamp cursor would
 * either repeat one of them or skip it, and an audit page that quietly omits an
 * act is the one failure this collection cannot have. An index sorted by `at`
 * cannot serve a scan ordered by `_id`, so the filter would sort in memory over
 * the whole matching set.
 *
 * ## The unfiltered page needs no index, and could not have one
 *
 * This file originally added a third index, `{ _id: -1 }`, for the page the
 * screen opens on. **MongoDB refuses it**: the only index whose key pattern is
 * exactly `_id` is the automatic `{ _id: 1 }`, and anything else answers
 * "The field 'key' for an _id index must be {_id: 1}". So the migration failed
 * on its first line of real use and every migration after it was blocked behind
 * it — which nothing noticed, because the installation it was written on already
 * had its schema and the container serving it was older than the migration. A
 * fresh install was the first thing to run it, and it found it immediately.
 *
 * It is not replaced, because it was never needed. A descending scan of `_id`
 * walks the automatic index backwards; direction only matters for a *compound*
 * key, where the fields must be ordered consistently with the sort. The two
 * indexes above are compound and keep their `_id: -1` for exactly that reason —
 * the restriction is on an index whose whole key is `_id`, not on `_id` as the
 * last field of a longer one.
 *
 * `usage_log` gets nothing new. Its aggregation matches on `createdAt` and
 * groups in the database, and `{ userId: 1, createdAt: 1 }` — declared with the
 * TTL in P4's migration — already covers both the whole-installation range scan
 * and the per-member one.
 */
async function up(db) {
  await db
    .collection('audit_log')
    .createIndex({ action: 1, _id: -1 }, { name: 'audit_by_action' });

  await db
    .collection('audit_log')
    .createIndex({ 'target.type': 1, _id: -1 }, { name: 'audit_by_target_type' });

  // No third index for the unfiltered page: the automatic `_id_` serves a
  // descending scan by being walked backwards, and MongoDB refuses any other
  // index whose key is exactly `_id`. See the note above.
}

/**
 * Drops what it made.
 *
 * Nothing here enforces a rule — these are read paths — so dropping them only
 * ever makes a page slower, and cannot admit rows that a later re-run of `up`
 * would choke on. Same call, on the same grounds, as the training and nutrition
 * migrations; Knowledge's refuses because it creates uniqueness.
 */
async function down(db) {
  await db.collection('audit_log').dropIndex('audit_by_action');
  await db.collection('audit_log').dropIndex('audit_by_target_type');
}

module.exports = { up, down };
