/**
 * `usage_log`: the uniqueness that makes the usage loop idempotent, the index
 * the window query reads, and the one index in this system that deletes data.
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
 * ## ⚠ THE TTL INDEX BELOW DELETES ROWS. IT IS THE ONLY ONE THAT DOES.
 *
 * Ninety days after a turn happened, its `usage_log` row is removed by MongoDB
 * itself — no job, no audit entry, nothing in any application log. Every other
 * index in this system only ever makes a read faster or refuses a write. This
 * one silently makes data go away, which is why it is called out here in
 * capitals rather than mentioned in passing.
 *
 * Somebody will one day ask why a number changed: why the admin Usage screen
 * (P10) shows less history than they remember, why a member's ninety-first day
 * of usage cannot be reconstructed, why a total computed last quarter no longer
 * reproduces. **This is the answer.** The retention is the data model's
 * (`specs/013-platform-v2-blueprint/data-model.md`, `usage_log` — "TTL 90 d"),
 * and it is a deliberate bound on a collection that grows with every model call
 * and is never otherwise pruned.
 *
 * Two consequences worth knowing before touching it:
 *
 * - It is keyed on `createdAt`, which this context sets from the event's
 *   `occurredAt` — the moment of the turn, not the moment of the insert. So the
 *   ninety days are counted from when the member actually spoke, and a row that
 *   the relay forwarded late is expired on the turn's own schedule.
 * - Changing the retention means a new migration that drops
 *   `usage_log_ttl_90d` and creates the replacement. MongoDB will not alter
 *   `expireAfterSeconds` on an existing index through `createIndex` — it fails
 *   with an options-conflict rather than quietly re-tuning — which is a
 *   feature: a change to how long we keep member data should be a visible,
 *   named migration, not a diff in a number.
 *
 * ## `eventId` is unique without a partial filter, and that is the decision
 *
 * The partial-index rule bites every optional field in this system, because
 * **MongoDB treats a missing field and an explicit null as one value for
 * uniqueness** where Postgres treats every `NULL` as distinct. `eventId` is not
 * optional: the schema marks it `required`, and the only writer is Operations'
 * handler reading the envelope, which always has one. So a plain unique index is
 * correct here, and this paragraph exists so that "no partial filter" reads as a
 * decision somebody made rather than a rule somebody forgot.
 */

const NINETY_DAYS_IN_SECONDS = 90 * 24 * 60 * 60;

/** @param {import('mongodb').Db} db */
async function up(db) {
  // ------------------------------------------------ the idempotence guarantee
  //
  // The relay delivers at least once. This index is where "one row per model
  // call" is actually enforced: the handler has no read-then-write check,
  // because two relay workers would race straight past one and a
  // double-counted event is indistinguishable from a real second turn once the
  // rows are written. The adapter inserts and treats E11000 as "already
  // counted".
  //
  // The cost of not having it is a member's daily allowance running out early
  // for reasons nobody can reconstruct.
  await db
    .collection('usage_log')
    .createIndex({ eventId: 1 }, { unique: true, name: 'usage_log_event_unique' });

  // ------------------------------------------------------- the window query
  //
  // `UsageTodayQuery` sums `promptTokens + completionTokens` for one member
  // between their own two local midnights, and this is the index that
  // aggregation reads. It runs at step 0 of every chat turn, on the latency path
  // the phase measures against SC-001, so it does not get to scan the
  // collection.
  //
  // `userId` first because every read is scoped to one member; `createdAt`
  // second because the range is the second predicate. Ascending on both: the
  // query is a bounded range, not a sort.
  await db
    .collection('usage_log')
    .createIndex({ userId: 1, createdAt: 1 }, { name: 'usage_log_user_created' });

  // ----------------------------------------------------------- ⚠ THE TTL
  //
  // See the file header. This deletes rows. Ninety days after the turn.
  //
  // A separate index from the compound one above, necessarily: MongoDB expires
  // documents only from a single-field index, so `{ userId, createdAt }` cannot
  // carry `expireAfterSeconds`. Two indexes on `createdAt` is the price of the
  // retention, and it is a small one on a collection nobody updates.
  await db
    .collection('usage_log')
    .createIndex(
      { createdAt: 1 },
      { expireAfterSeconds: NINETY_DAYS_IN_SECONDS, name: 'usage_log_ttl_90d' },
    );
}

/** @param {import('mongodb').Db} db */
async function down() {
  // Forward-only. Constitution IV: a rollback that drops an index nobody is
  // watching is how a collection quietly loses a uniqueness rule — and here the
  // rule being lost is the one that stops a replayed event from spending a
  // member's allowance twice. Correcting an index, or changing the retention, is
  // a new migration.
  throw new Error('migrations are forward-only');
}

module.exports = { up, down };
