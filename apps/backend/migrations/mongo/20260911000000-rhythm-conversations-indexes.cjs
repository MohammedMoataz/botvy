/**
 * Every index P3 needs: the rhythm's three collections and the Conversations
 * skeleton's three.
 *
 * Same split as every phase before it — the Mongoose schemas describe shape and
 * never call `index()`, because an index created by `autoIndex` on connect is an
 * index created differently on every deploy, at a moment nobody chose.
 * Constitution IV wants it written down once and applied forwards, and a later
 * correction is a new file rather than an edit to this one.
 *
 * `createIndex` is idempotent for an identical specification, so a second run
 * changes nothing. The phase gate re-runs the bootstrap and asserts exactly
 * that, because a migration that is only safe the first time is a migration
 * nobody dares re-run.
 *
 * ## Three collections here are keyed by a composite `_id`, and that is an index
 *
 * `daily_plans` and `checkins` use `"<userId>:<YYYY-MM-DD>"`; `rhythm_states`
 * and `counters` use the member's id alone. Mongo indexes `_id` for you, so
 * "this member's plan for this date" and "this member's state" are already
 * single-key lookups and need nothing declared. What they *do* need is the
 * range reads — a month of plans, a week of check-ins — which cannot be served
 * from an `_id` prefix, because a string prefix scan over `_id` would work only
 * as long as no member id ever contains a colon. Hence the explicit
 * `{ userId, date }` pairs below.
 *
 * ## The partial-index rule, again, because it bites in a new place here
 *
 * **MongoDB treats a missing field and an explicit null as one value for
 * uniqueness.** Postgres does not — there, every `NULL` is distinct — and that
 * semantic did not port. In this phase it lands on `conversations.kind`: a
 * member has exactly one `coach` and one `planner`, and any number of `free`
 * chats. A plain unique index on `{ userId, kind }` would refuse the member's
 * second free chat. So the index is partial on the two kinds that are
 * singletons, spelled as an `$in`, and the free chats are outside the rule
 * rather than exceptions to it.
 *
 * And on `messages.clientId`: null for everything this phase writes, because
 * P3 only ever appends assistant turns from a job. P4 adds the member's own
 * turn carrying a `clientId` for the retry story, and without
 * `$exists: true` the second server-written message in the system would
 * collide with the first on a field neither of them uses.
 */

/** @param {import('mongodb').Db} db */
async function up(db) {
  // ------------------------------------------------------------- daily_plans
  //
  // The plans screen and the week strip both read "this member's plans between
  // two dates", and `date` is a `YYYY-MM-DD` string whose lexicographic order
  // is its calendar order — which is the reason the field is stored as a string
  // at all rather than as a Date. A Date here would have forced every range
  // read to decide whose midnight it meant.
  await db
    .collection('daily_plans')
    .createIndex({ userId: 1, date: 1 }, { unique: true, name: 'daily_plans_user_date_unique' });

  // The sync pull's cursor: "this member's rows changed after a moment".
  await db
    .collection('daily_plans')
    .createIndex({ userId: 1, updatedAt: 1 }, { name: 'daily_plans_user_updated' });

  // ---------------------------------------------------------------- checkins
  await db
    .collection('checkins')
    .createIndex({ userId: 1, date: 1 }, { unique: true, name: 'checkins_user_date_unique' });

  await db
    .collection('checkins')
    .createIndex({ userId: 1, updatedAt: 1 }, { name: 'checkins_user_updated' });

  // ----------------------------------------------------------- rhythm_states
  //
  // The tick pages this collection by `_id`, which Mongo indexes already. The
  // one index worth declaring is the cursor for the phone's pull; there is one
  // row per member so it is a tiny index, and it exists so the sync adapter
  // reads through the same shape as every other syncable collection rather
  // than being the one exception somebody has to remember.
  await db
    .collection('rhythm_states')
    .createIndex({ userId: 1, updatedAt: 1 }, { name: 'rhythm_states_user_updated' });

  // ----------------------------------------------------------- conversations
  //
  // One `coach` and one `planner` per member; any number of `free` chats. The
  // partial filter is what makes those two facts one index instead of two
  // rules, and it is what makes a replayed `identity.UserRegistered` a no-op
  // at the store level as well as in the handler.
  await db.collection('conversations').createIndex(
    { userId: 1, kind: 1 },
    {
      unique: true,
      partialFilterExpression: { kind: { $in: ['coach', 'planner'] } },
      name: 'conversations_user_kind_pinned_unique',
    },
  );

  // The sync cursor: "this member's rows changed after a moment".
  await db
    .collection('conversations')
    .createIndex({ userId: 1, updatedAt: 1 }, { name: 'conversations_user_updated' });

  // The chat list, and a *second* index rather than a reuse of the one above.
  //
  // This file first claimed the `updatedAt` index served the list as well. It
  // does not: the list is ordered by `lastMessageAt`, which is when the
  // conversation last had something said in it, and `updatedAt` is when the row
  // was last written — a rename moves the second and not the first. Sorting the
  // member's chats by `updatedAt` would put a conversation they renamed above
  // one the coach wrote into an hour ago, and serving a `lastMessageAt` sort
  // from an `updatedAt` index is an in-memory sort over every row the member
  // has. Two fields that mean two things get two indexes.
  //
  // Nothing in P3 reads this — the list is P4's — but the index belongs with
  // the collection that gained the field.
  await db
    .collection('conversations')
    .createIndex(
      { userId: 1, lastMessageAt: -1 },
      { name: 'conversations_user_last_message' },
    );

  // --------------------------------------------------------------- messages
  //
  // The phone's whole cursor: `seq > lastSeq` for one member, which is this
  // index and nothing else. Unique because a duplicate sequence number would
  // make the cursor skip a message permanently — the rows are immutable, so a
  // message the phone stepped over can never be corrected into place.
  await db
    .collection('messages')
    .createIndex({ userId: 1, seq: 1 }, { unique: true, name: 'messages_user_seq_unique' });

  // One conversation's transcript. `seq` again rather than `createdAt`,
  // because two messages written in the same millisecond have an order and
  // only the sequence knows it.
  await db
    .collection('messages')
    .createIndex({ conversationId: 1, seq: 1 }, { name: 'messages_conversation_seq' });

  // The retry story P4 needs, declared now so the rule exists before the first
  // row that relies on it. Partial on `$exists: true`: every message this
  // phase writes has no `clientId`, and without the filter the second one
  // would collide with the first.
  await db.collection('messages').createIndex(
    { userId: 1, clientId: 1 },
    {
      unique: true,
      partialFilterExpression: { clientId: { $exists: true, $type: 'string' } },
      name: 'messages_user_client_unique',
    },
  );

  // ---------------------------------------------------------------- counters
  //
  // Nothing to declare. `_id` is `"<userId>:messages"` and the only operation
  // is a `findOneAndUpdate` with `$inc` on that key, which is the `_id` index
  // Mongo maintains itself. Named here so that the absence is a decision on
  // the record rather than something forgotten.
}

/** @param {import('mongodb').Db} db */
async function down() {
  // Forward-only. Constitution IV: a rollback that drops an index nobody is
  // watching is how a collection quietly loses a uniqueness rule and gains two
  // `coach` conversations for one member. Correcting an index is a new
  // migration.
  throw new Error('migrations are forward-only');
}

module.exports = { up, down };
