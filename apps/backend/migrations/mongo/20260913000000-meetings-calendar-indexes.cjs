/**
 * `meetings` and `calendar_events`: the three reads each collection has, and no
 * uniqueness.
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
 * ## Nothing here is unique, and that is a decision
 *
 * Every other phase's migration carries at least one uniqueness rule, so its
 * absence should read as deliberate. There is nothing in a diary that may
 * appear only once: two meetings at the same minute is a clash the member can
 * see and resolve, not a write the database should refuse — and a member's two
 * birthdays-of-friends on one date is ordinary. The only identity a row has is
 * its `_id`, which the client mints and the primary key already enforces; that
 * is also what makes a retried offline create a no-op rather than a duplicate.
 *
 * So the partial-index rule that bites every optional field in this system —
 * **MongoDB treats a missing field and an explicit null as one value for
 * uniqueness**, where Postgres treats every `NULL` as distinct — has nothing to
 * bite here. This paragraph exists so "no unique index" reads as something
 * somebody decided rather than something somebody forgot.
 *
 * ## Why `{ userId, startAt }` when a series is not found by `startAt`
 *
 * Because `forWindow` is an `$or` of two different questions, and this index
 * serves one of them plus every sort in the context.
 *
 * A repeating row cannot be found by its start: "every Monday since March" has
 * a `startAt` months behind any window a member is looking at, and its
 * occurrences are computed rather than stored (FR-006), so no index can reach
 * them. That half of the `$or` — `{ recurrence: { $ne: null } }` — is answered
 * from `{ userId, deletedAt }` below and finished in process by the expander.
 *
 * The other half is a genuine range over one-off rows, and this is the index
 * it reads: `userId` first because every read is scoped to one member,
 * `startAt` second because the range is the second predicate. It then also
 * serves `listFor`, which sorts the member's diary by start — so a member with
 * a long history does not sort their whole collection in memory to draw one
 * screen.
 */

/** @param {import('mongodb').Db} db */
async function up(db) {
  for (const collection of ['meetings', 'calendar_events']) {
    // ------------------------------------------- the range half of `forWindow`
    //
    // And `listFor`'s sort. See the file header for why a series does not use
    // it and why that is not a reason to shape it differently.
    await db
      .collection(collection)
      .createIndex({ userId: 1, startAt: 1 }, { name: `${collection}_user_start` });

    // ------------------------------------------------------------ `/sync` pull
    //
    // `pullSince` is `updatedAt > cursor` for one member, sorted by
    // `updatedAt`, and it runs on every sync from every device — so it is the
    // most frequent read either collection has. Ascending on both: the sort is
    // the cursor's own order, so the index supplies it rather than the server
    // sorting the result.
    //
    // Tombstones are in this index like any other row, deliberately: on a
    // delta a tombstone is the only way a deletion reaches the phone.
    await db
      .collection(collection)
      .createIndex(
        { userId: 1, updatedAt: 1 },
        { name: `${collection}_user_updated` },
      );

    // ------------------------- live-row reads, and the nightly tombstone sweep
    //
    // Three callers, one shape. `forWindow` and `listFor` both open with
    // `{ userId, deletedAt: null }`; `memberIdsWithMeetings` is a `distinct`
    // over `userId` filtered on `deletedAt: null`, which this index answers
    // without touching a document; and `purgeTombstonesBefore` scoped to one
    // member reads the same pair.
    //
    // The unscoped nightly purge — `deletedAt` between null and a horizon, no
    // `userId` — cannot use it, and does not need to: it runs once a night
    // against whatever it finds, and an index whose leading field it does not
    // constrain would earn a collection scan its own index. Adding
    // `{ deletedAt: 1 }` for it would be an index maintained on every write to
    // make one nightly job faster.
    await db
      .collection(collection)
      .createIndex(
        { userId: 1, deletedAt: 1 },
        { name: `${collection}_user_deleted` },
      );
  }
}

/**
 * Drops the six indexes this file created, by name, and nothing else.
 *
 * Constitution IV means this never runs in a deployed environment — a
 * correction is a new migration — so it is here because migrate-mongo expects
 * it. It drops by name rather than calling `dropIndexes()` because these two
 * collections will acquire indexes from later phases, and a rollback that took
 * those with it would leave the calendar reading a collection scan with
 * nothing to say why.
 *
 * The forward-only *throw* the last three migrations use is not right here:
 * that refusal exists because a dropped uniqueness rule is silent data
 * corruption, and there is no uniqueness in this file to lose. Dropping an
 * index only ever makes a read slower.
 *
 * @param {import('mongodb').Db} db
 */
async function down(db) {
  for (const collection of ['meetings', 'calendar_events']) {
    for (const suffix of ['user_start', 'user_updated', 'user_deleted']) {
      // Tolerated, because `up` is idempotent and so a partially applied run
      // is a state this has to cope with: index 27 is "index not found".
      await db
        .collection(collection)
        .dropIndex(`${collection}_${suffix}`)
        .catch(() => undefined);
    }
  }
}

module.exports = { up, down };
