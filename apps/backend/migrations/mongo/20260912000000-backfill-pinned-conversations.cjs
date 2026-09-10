const { v7: uuidv7 } = require('uuid');

/**
 * The two pinned chats for every member who registered before P3 existed —
 * **the seeded administrator among them.**
 *
 * FR-001: *every* member has a Coach and a Planner conversation, "including
 * members who joined before Botvy could answer". `bootstrap-on-registered`
 * covers everybody from P3 onwards by reacting to `identity.UserRegistered`,
 * and events are not replayed — the outbox row for a member who registered in
 * P0, P1 or P2 was delivered long before there was a Conversations context to
 * deliver it to. So those members have no chats at all, and the rhythm's
 * evening touch has nowhere to write: `AppendMessageHandler` logs and returns
 * null, which looks exactly like success from every direction (the plan is
 * saved, the alert is planned, the counters go up, and the sentence is
 * nowhere).
 *
 * The seeded administrator is the member this matters most for, because it is
 * the account every operator signs in as and the one every manual check of the
 * feature will be made from.
 *
 * ## How the members are enumerated, and what that misses
 *
 * migrate-mongo holds a Mongo handle and nothing else. **The user rows are in
 * PostgreSQL** — Identity's store — and there is no join to make: two stores,
 * no joins. Three options were open:
 *
 * 1. **`profiles`.** One row per member, `userId` carrying the Postgres uuid as
 *    a string, written by Profile's own `bootstrap-on-registered` from the same
 *    `identity.UserRegistered` event. This is what is used.
 * 2. **A second connection to PostgreSQL from the migration.** Rejected: it
 *    would put a `pg` dependency and a second connection string into the Mongo
 *    migration runner, and a migration that can read Identity's tables is a
 *    migration that can be pointed at the wrong database and write there.
 * 3. **An internal endpoint** (`/internal/...`, service principal). Rejected
 *    for the same shape of reason plus a worse one: the migration runs during
 *    `bootstrap.mjs`, *before* the API is necessarily serving, so it would
 *    depend on the very process it is preparing the database for.
 *
 * **What `profiles` misses**, stated plainly because a backfill that quietly
 * skips somebody is worse than one that never ran:
 *
 * - A member whose Profile bootstrap never ran either. Profile's bootstrap has
 *   existed since P1, so this is only P0-era accounts and any member whose
 *   `identity.UserRegistered` delivery failed permanently. Those accounts have
 *   no profile row, no preferences and no rhythm state, so they are broken in
 *   several visible ways already and a missing chat is not how anybody will
 *   find out.
 * - A member registered between this migration running and the deploy
 *   finishing. Covered by the live bootstrap, which is the whole point of it.
 *
 * Neither gap is closed by re-running this file — it is idempotent, and running
 * it again after the profiles catch up would finish the job for anybody who
 * gained a profile in the meantime.
 *
 * ## Why the document is written here rather than by calling the handler
 *
 * There is exactly one creator of a pinned conversation in the running system —
 * `ConversationsBootstrapHandler` — and this file cannot call it. A
 * `migrate-mongo` script is CommonJS, loaded by the migration runner, with no
 * Nest container, no `UnitOfWork`, no repository and no Mongoose model; the
 * backend package is `"type": "module"`, so it cannot even `require` the
 * compiled handler. Standing up a Nest application context inside a migration
 * to reach one handler would mean the migration booting the app it is
 * preparing the database for.
 *
 * So the *shape* is replicated, and the drift that replication invites is
 * closed by a test rather than by a comment: `backfill-pinned.spec.ts` runs
 * this file's `up` against a fake `Db` and asserts the inserted document is
 * key-for-key and value-for-value what `conversationMapper.toPersistence(
 * Conversation.create(...))` produces. A field added to the aggregate or the
 * mapper without a matching line here fails that test. That is the only reason
 * it is safe to have two writers of this document, and it is why the constants
 * below are spelled out rather than left to Mongo's schema defaults — a
 * default is not something a test can compare against a mapper.
 *
 * ## No outbox rows
 *
 * `Conversation.create` raises `conversations.ConversationCreated`, and this
 * file writes no matching outbox row. Nothing in the platform consumes that
 * event — it is published for the automation surface — and a backfill across
 * every historical member would hand n8n a burst of "this member just created
 * a chat" webhooks for chats created years apart. The event says something
 * untrue about a backfill; the rows are what FR-001 asks for.
 */

/** Exactly what `bootstrap-on-registered.handler.ts` names them. */
const PINNED = [
  { kind: 'coach', title: 'Coach' },
  { kind: 'planner', title: 'Planner' },
];

/**
 * One conversation document, in the shape `conversationMapper.toPersistence`
 * produces for `Conversation.create({ ... })`.
 *
 * Exported so the spec can compare it against the mapper's own output instead
 * of trusting that the two agree.
 */
function pinnedConversationDoc({ id, userId, kind, title, at }) {
  return {
    _id: id,
    userId,
    kind,
    title,
    // `PINNED_KINDS.includes(kind)` in the aggregate. Both kinds here are in
    // it, so it is a constant — and it is written as a constant rather than
    // recomputed from a copy of that list, because a second copy of the list of
    // protected kinds is the thing worth avoiding.
    pinned: true,
    archived: false,
    clearedUpToSeq: 0,
    lastMessageAt: null,
    createdAt: at,
    updatedAt: at,
    deletedAt: null,
    schemaVersion: 1,
  };
}

/** @param {import('mongodb').Db} db */
async function up(db) {
  const now = new Date();

  /*
   * Distinct member ids from `profiles`, which is one row per member.
   *
   * `distinct` rather than a cursor over the documents: the profiles carry
   * metrics arrays and food lists, and this needs one string from each.
   */
  const userIds = await db.collection('profiles').distinct('userId');

  /*
   * Which pinned chats already exist, in one query rather than one per member.
   *
   * A `findOne` per member per kind would be two round trips per member, which
   * for a backfill is the difference between seconds and minutes on a host
   * that is mid-deploy. `deletedAt` is not filtered: the two pinned kinds
   * cannot be deleted (`Conversation.isProtected`), so a tombstoned row of
   * either kind should not exist — and if one somehow does, the partial unique
   * index on `{ userId, kind }` would refuse a second, so treating it as
   * present is the only reading that does not fail the whole migration.
   */
  const existing = await db
    .collection('conversations')
    .find(
      { kind: { $in: ['coach', 'planner'] } },
      { projection: { userId: 1, kind: 1 } },
    )
    .toArray();

  const have = new Set(existing.map((row) => `${row.userId}:${row.kind}`));

  const docs = [];
  for (const userId of userIds) {
    if (typeof userId !== 'string' || userId.length === 0) continue;
    for (const { kind, title } of PINNED) {
      // Per kind, not per pair. A member who has a coach chat and no planner
      // gains the planner — which is the state a crash between the bootstrap
      // handler's two writes leaves, and a check on the pair being *absent*
      // would take its "already there" exit and never finish the job.
      if (have.has(`${userId}:${kind}`)) continue;
      docs.push(
        pinnedConversationDoc({
          // A uuidv7, matching the live creator. The phone syncs conversations
          // and can create one offline, so a conversation id is a uuid
          // everywhere or the two creation paths disagree about what one is.
          id: uuidv7(),
          userId,
          kind,
          title,
          // `now`, not the account's registration date. The row is created now,
          // and `createdAt` is what breaks the tie in a chat list ordered by
          // `lastMessageAt` — backdating it years would sort a backfilled chat
          // below whatever the member has said since, which is the opposite of
          // what a pinned chat wants.
          at: now,
        }),
      );
    }
  }

  if (docs.length === 0) return;

  // `ordered: false` so one refusal does not abandon the rest, and a
  // duplicate-key error is swallowed rather than raised.
  //
  // The only plausible refusal is the partial unique index on
  // `{ userId, kind }`, from the live bootstrap handling a registration in the
  // same second this runs — a row somebody else created correctly, which is
  // exactly the outcome wanted. Every *other* code is rethrown: a failed
  // migration has to fail, or the changelog records a backfill that did not
  // happen and nothing will ever run it again.
  try {
    await db.collection('conversations').insertMany(docs, { ordered: false });
  } catch (error) {
    const duplicatesOnly =
      error &&
      (error.code === 11000 ||
        (Array.isArray(error.writeErrors) &&
          error.writeErrors.length > 0 &&
          error.writeErrors.every((one) => (one.code ?? one.err?.code) === 11000)));
    if (!duplicatesOnly) throw error;
  }
}

/** @param {import('mongodb').Db} db */
async function down() {
  // Forward-only. Constitution IV — and here the rollback would be worse than
  // usual: it could not distinguish a chat this file created from one the
  // bootstrap created, so it would delete pinned conversations that members
  // have since been talking to.
  throw new Error('migrations are forward-only');
}

module.exports = { up, down, pinnedConversationDoc, PINNED };
