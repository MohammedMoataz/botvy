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

  // The unfiltered page, which is what the screen opens on: newest first, by the
  // same key the cursor uses. `{ at: -1 }` from the foundation cannot serve it.
  await db.collection('audit_log').createIndex({ _id: -1 }, { name: 'audit_recent_id' });
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
  await db.collection('audit_log').dropIndex('audit_recent_id');
}

module.exports = { up, down };
