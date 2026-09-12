/**
 * `links`, `knowledge_docs` and `suggestions`: the reads each collection has,
 * and the one uniqueness rule in this context.
 *
 * Same split as every phase before it — the Mongoose schema describes shape and
 * never calls `index()`, because an index created by `autoIndex` on connect is
 * an index created differently on every deploy, at a moment nobody chose.
 * Constitution IV wants it written down once and applied forwards, and a later
 * correction is a new file rather than an edit to this one.
 *
 * `createIndex` is idempotent for an identical specification, so a second run
 * changes nothing. The phase gate re-runs the bootstrap and asserts exactly
 * that.
 *
 * ## The partial unique index, and why the filter is the whole of it
 *
 * `{ userId, normalizedUrl }` unique **where `deletedAt` is null** is what makes
 * FR-005 true: the same article arriving from a newsletter and from a friend's
 * message is two URLs and one reading, and `normaliseLink` collapses them
 * before this index ever sees them.
 *
 * The filter is doing two jobs and both matter.
 *
 * It excludes tombstones, so a member who removed an article and saves it again
 * gets a fresh read rather than a duplicate-key error about a row they deleted.
 * That is a product decision — FR-005 is about saving the same link twice, not
 * about ever having saved it — and without the filter the store would enforce
 * the opposite.
 *
 * And it is a **partial** index rather than a plain unique one because MongoDB
 * treats a missing field and an explicit null as the same value for uniqueness,
 * where Postgres treats every NULL as distinct. Without `deletedAt: null` in the
 * filter, every tombstone a member ever created would compete with every other
 * for the same slot. This system has been bitten by that rule before — P3's
 * `conversations.kind` — and it is written down in CLAUDE.md for that reason.
 *
 * ## Nothing else here is unique
 *
 * A member may have any number of suggestions about one session (they dismiss
 * one and the next phase's pass makes another), and any number of documents for
 * one link (re-reading writes a new one rather than editing the old, so a
 * suggestion's evidence cannot be rewritten under it). Both of those are
 * deliberate and neither should be enforced away.
 */

/** @param {import('mongodb').Db} db */
async function up(db) {
  // -------------------------------------------------------------- `links`

  // FR-005. See the note above for why the filter carries two arguments at once.
  await db.collection('links').createIndex(
    { userId: 1, normalizedUrl: 1 },
    {
      name: 'links_user_url_unique',
      unique: true,
      partialFilterExpression: { deletedAt: null },
    },
  );

  // The member's list: `{ userId, deletedAt: null }` sorted by `addedAt`
  // descending, with `_id` as the cursor's tie-break. Ascending in the index,
  // because a descending sort walks an ascending index in reverse and one index
  // serves both directions.
  await db
    .collection('links')
    .createIndex({ userId: 1, addedAt: 1 }, { name: 'links_user_added' });

  // The `/sync` pull: `updatedAt > cursor` for one member, sorted by
  // `updatedAt`, on every sync from every device. Tombstones are in it like any
  // other row — on a delta a tombstone is the only way a deletion reaches the
  // phone.
  await db
    .collection('links')
    .createIndex({ userId: 1, updatedAt: 1 }, { name: 'links_user_updated' });

  /*
   * The queue, and the one index here whose leading field is **not** `userId`.
   *
   * `nextQueued`, `stalledSince`, `oldestQueuedAt` and the Owner's
   * `ingestionQueue` all read across members, because the pipeline is an
   * installation-wide queue with an Owner-set concurrency — a per-member drain
   * would let one enthusiast's fifty links hold everybody else's behind them.
   * So the status leads and `updatedAt` ranges and sorts after it, which is the
   * equality-then-range order that lets the scan be one contiguous run.
   *
   * It runs on the worker's tick, every few minutes, for ever. That is what
   * earns it: an unindexed `{ status: 'queued' }` is a collection scan of every
   * link every member has ever saved, several times an hour.
   */
  await db
    .collection('links')
    .createIndex({ status: 1, updatedAt: 1 }, { name: 'links_status_updated' });

  // The suggestion saga's source selection: finished links whose tags overlap a
  // session's sport, newest read first. Multikey on `tags`, which is what an
  // `$in` over an array field needs.
  await db
    .collection('links')
    .createIndex(
      { userId: 1, status: 1, tags: 1 },
      { name: 'links_user_status_tags' },
    );

  // A playlist's children, for the detail view and the delete cascade.
  // Partial, because `parentLinkId` is null on every link a member saved
  // directly — which is nearly all of them — and an index over a field that is
  // usually null is an index mostly full of nothing.
  await db.collection('links').createIndex(
    { userId: 1, parentLinkId: 1 },
    {
      name: 'links_user_parent',
      partialFilterExpression: { parentLinkId: { $type: 'string' } },
    },
  );

  // ----------------------------------------------------- `knowledge_docs`

  // The detail view and the suggestion prompt both ask "the document(s) for
  // these links, newest first". `createdAt` descending is served by the
  // ascending index read backwards.
  await db
    .collection('knowledge_docs')
    .createIndex(
      { userId: 1, linkId: 1, createdAt: 1 },
      { name: 'docs_user_link_created' },
    );

  // The purge paths — `removeAllFor` on a deleted account, and the tombstone
  // sweep's `removeForLinks`. Both filter on `userId` alone or with a linkId,
  // which the index above already serves from its prefix; this one exists for
  // the unscoped delete the sweep issues per member.
  await db
    .collection('knowledge_docs')
    .createIndex({ userId: 1 }, { name: 'docs_user' });

  // -------------------------------------------------------- `suggestions`

  // The inbox: one member's, filtered by status, newest first.
  await db
    .collection('suggestions')
    .createIndex(
      { userId: 1, status: 1, createdAt: 1 },
      { name: 'suggestions_user_status_created' },
    );

  // "Has this session already been proposed about" (FR-010), and "which
  // suggestion produced this session" (T734). Two different fields, two
  // indexes, because one is the session it was *generated for* and the other
  // the session it *went into* — collapsing them would lose whichever question
  // was asked second.
  await db
    .collection('suggestions')
    .createIndex(
      { userId: 1, sessionId: 1 },
      {
        name: 'suggestions_user_session',
        partialFilterExpression: { sessionId: { $type: 'string' } },
      },
    );
  await db.collection('suggestions').createIndex(
    { userId: 1, acceptedSessionId: 1 },
    {
      name: 'suggestions_user_accepted_session',
      partialFilterExpression: { acceptedSessionId: { $type: 'string' } },
    },
  );
}

/**
 * Refuses.
 *
 * Constitution IV is forward-only, and this file creates a **uniqueness rule**.
 * Dropping `links_user_url_unique` would let duplicate readings of the same URL
 * accumulate silently, and a later re-run of `up` would then fail with a
 * duplicate-key error against rows nobody could point at — so the rollback that
 * looks safest is the one that makes recovery hardest.
 *
 * The training migration's `down` drops its indexes by name, and that is right
 * there: it created none that enforce anything, and dropping an index only ever
 * makes a read slower. The distinction is the rule, not the file.
 *
 * A correction to any of these is a new migration.
 */
async function down() {
  throw new Error(
    'forward-only (constitution IV): correct an index with a new migration. ' +
      'This one creates the uniqueness that makes FR-005 true, and dropping it ' +
      'admits duplicates that a later re-run could not undo.',
  );
}

module.exports = { up, down };
