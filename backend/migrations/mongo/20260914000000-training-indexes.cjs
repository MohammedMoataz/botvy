/**
 * `sessions`, `programs` and `workouts`: the reads each collection has, and no
 * uniqueness anywhere.
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
 * ## `athlete_profiles` gets nothing, and that is the decision
 *
 * It is absent from `up` on purpose rather than by oversight. The collection is
 * keyed by the member — `_id` *is* the `userId` (data-model §2.6), one document
 * each — so the primary key is the only access path it has: `find(userId)` is a
 * `findOne` on `_id`, the save is an upsert on `_id`, and the purge is a
 * `deleteOne` on `_id`. There is no second question anybody asks of it.
 *
 * The one read that is not by id is `memberIdsWithSlots`, the materialiser's
 * input: a `distinct('_id')` filtered on `slots.0` existing. An index on
 * `slots` would be a multikey index over an array of subdocuments, maintained
 * on every save of every member's timetable, to speed up a job that runs once a
 * night over a collection with one row per member. The `_id` index already
 * supplies the `distinct`; the filter is the part that scans, and scanning one
 * small document per member nightly is cheaper than the writes an index would
 * cost. If the collection ever grows a read that is not "this member's row",
 * that is when it earns an index, in that phase's own migration.
 *
 * ## Nothing here is unique
 *
 * Every other phase's migration carries at least one uniqueness rule, so its
 * absence should read as deliberate. There is nothing in a training log that
 * may appear only once. Two sessions at the same minute is a member who has
 * double-booked themselves and can see it; two programs called "Push/Pull" is
 * ordinary, because one may be last winter's; two workouts with the same name
 * for different sports is the obvious way to keep a gym circuit and a pool set
 * side by side. The only identity a row has is its `_id`, which the client
 * mints and the primary key already enforces — which is also what makes a
 * retried offline create a no-op rather than a duplicate.
 *
 * So the rule that bites every optional field in this system — **MongoDB
 * treats a missing field and an explicit null as one value for uniqueness**,
 * where Postgres treats every `NULL` as distinct, so any uniqueness over an
 * optional field needs a partial index with `$exists: true` — has nothing to
 * bite here. This paragraph exists so "no unique index" reads as something
 * somebody decided rather than something somebody forgot.
 *
 * Two fields would have looked like candidates and are not. `sessions.slotId`
 * plus its day is the derived key the materialiser computes, and it is already
 * unique *as the `_id`* — that is the whole point of deriving it, and a second
 * index enforcing the same thing would refuse a member's hand-made session
 * whose `slotId` is null against another one just like it. And
 * `programs.appliedStartDate` with `status: 'active'` looks like "at most one
 * active program", which is a rule the aggregate states and `activeFor`
 * *deliberately does not enforce*: a store that has drifted into two should
 * still fill a week from the newest apply rather than refuse to fill any.
 */

/** @param {import('mongodb').Db} db */
async function up(db) {
  // ------------------------------------------------ `sessions`: the week, the
  // next practice, the sync cursor and the sweep.
  //
  // `{ userId, plannedAt }` is the calendar. `between` is a range on
  // `plannedAt` for one member — the week view, the agenda and the rhythm's
  // draft all read through it — and `recentByStatus` reads the same pair
  // backwards for the coach's streak. `userId` leads because every read is
  // scoped to one member; a descending sort walks an ascending index in
  // reverse, so one index serves both directions.
  await db
    .collection('sessions')
    .createIndex({ userId: 1, plannedAt: 1 }, { name: 'sessions_user_planned' });

  // `{ userId, status, plannedAt }` is the four reads that filter on a status
  // before they range: `plannedAfter` (the next practice card), `futurePlanned`
  // (the zone-change recompute) and `orphanedPlanned` (the reconcile) are all
  // `status: 'planned'` plus `plannedAt > now`.
  //
  // The order is equality, equality, range — `userId` and `status` are both
  // exact matches and `plannedAt` is the range, which is the only order that
  // lets the range be a scan of one contiguous run rather than a filter over
  // the whole of the member's `planned` sessions. Getting those two the other
  // way round is the classic compound-index mistake and it is invisible until
  // a member has a year of history.
  await db
    .collection('sessions')
    .createIndex(
      { userId: 1, status: 1, plannedAt: 1 },
      { name: 'sessions_user_status_planned' },
    );

  // `{ userId, updatedAt }` is the `/sync` pull: `updatedAt > cursor` for one
  // member, sorted by `updatedAt`, on every sync from every device — the most
  // frequent read the collection has. Ascending on both, because the sort *is*
  // the cursor's own order, so the index supplies it rather than the server
  // sorting the result.
  //
  // Tombstones are in this index like any other row, deliberately: on a delta a
  // tombstone is the only way a deletion reaches the phone.
  await db
    .collection('sessions')
    .createIndex({ userId: 1, updatedAt: 1 }, { name: 'sessions_user_updated' });

  // `{ userId, deletedAt }` is the live-row reads and the nightly tombstone
  // sweep. Every read above opens with `{ userId, deletedAt: null }`, and
  // `purgeTombstonesBefore` scoped to one member reads the same pair.
  //
  // The unscoped nightly purge — `deletedAt` between null and a horizon, no
  // `userId` — cannot use it, and does not need to: it runs once a night
  // against whatever it finds, and an index whose leading field it does not
  // constrain would earn a collection scan its own index. Adding
  // `{ deletedAt: 1 }` for it would be an index maintained on every logged set
  // to make one nightly job faster.
  //
  // `sessions` is the one collection here that gets this fourth index, because
  // it is the one whose live reads are hot: a member opens the week view every
  // time they look at the app, and the library screens are opened rarely.
  await db
    .collection('sessions')
    .createIndex({ userId: 1, deletedAt: 1 }, { name: 'sessions_user_deleted' });

  // -------------------------------------- `programs`: the library and the one
  // the materialiser fills from.
  //
  // `{ userId, status }` serves both. `listFor` is `{ userId, deletedAt: null }`
  // plus `status: 'active'` unless the member asked for their archive, and
  // `activeFor` is `status: 'active'` with a non-null `appliedStartDate` — the
  // read the materialiser makes for every member on every pass, which is what
  // makes it worth an index on a collection a member has few rows in.
  //
  // `appliedStartDate` is not in the index. It is the *sort*, not a range, and
  // the rows left after `{ userId, status: 'active' }` are at most a handful:
  // sorting those in memory is free, and a third key would be maintained on
  // every program edit for it.
  await db
    .collection('programs')
    .createIndex({ userId: 1, status: 1 }, { name: 'programs_user_status' });

  // The `/sync` pull, and `listFor`'s newest-first order. Same shape and same
  // reasoning as `sessions_user_updated` above.
  await db
    .collection('programs')
    .createIndex({ userId: 1, updatedAt: 1 }, { name: 'programs_user_updated' });

  // ------------------------------------------- `workouts`: the member's own
  // library, whole or narrowed to one sport.
  //
  // `{ userId, sport }` is `listFor(userId, sport)` — the picker a member opens
  // while logging a gym session, who does not want their swimming sets in it.
  // With no sport given the same index still answers the `userId` half from its
  // prefix.
  await db
    .collection('workouts')
    .createIndex({ userId: 1, sport: 1 }, { name: 'workouts_user_sport' });

  // The `/sync` pull, and `listFor`'s newest-first order.
  await db
    .collection('workouts')
    .createIndex({ userId: 1, updatedAt: 1 }, { name: 'workouts_user_updated' });
}

/**
 * Drops the eight indexes this file created, by name, and nothing else.
 *
 * Constitution IV means this never runs in a deployed environment — a
 * correction is a new migration — so it is here because migrate-mongo expects
 * it. It drops by name rather than calling `dropIndexes()` because these three
 * collections will acquire indexes from later phases (P7 reads
 * `sessions.suggestionId`), and a rollback that took those with it would leave
 * the week view reading a collection scan with nothing to say why.
 *
 * The forward-only *throw* some earlier migrations use is not right here: that
 * refusal exists because a dropped uniqueness rule is silent data corruption,
 * and there is no uniqueness in this file to lose. Dropping an index only ever
 * makes a read slower.
 *
 * @param {import('mongodb').Db} db
 */
async function down(db) {
  const created = {
    sessions: [
      'sessions_user_planned',
      'sessions_user_status_planned',
      'sessions_user_updated',
      'sessions_user_deleted',
    ],
    programs: ['programs_user_status', 'programs_user_updated'],
    workouts: ['workouts_user_sport', 'workouts_user_updated'],
  };

  for (const [collection, names] of Object.entries(created)) {
    for (const name of names) {
      // Tolerated, because `up` is idempotent and so a partially applied run is
      // a state this has to cope with: index 27 is "index not found".
      await db
        .collection(collection)
        .dropIndex(name)
        .catch(() => undefined);
    }
  }
}

module.exports = { up, down };
