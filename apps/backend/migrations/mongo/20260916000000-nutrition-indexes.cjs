/**
 * `meals` and `meal_suggestions`: the reads each has, and one uniqueness rule
 * that costs nothing because the key already holds it.
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
 * ## `meal_suggestions` gets one index and its `_id`
 *
 * `_id` is `"<userId>:<date>"`, so "what did this member eat on this day" is a
 * primary-key lookup and the collection's whole read pattern is that one
 * question. The second index — `{ userId, date }` — exists for the purge and
 * for any future range over a member's days, and it is deliberately *not* made
 * unique: the key already makes one row per member per day impossible to
 * violate, so a unique index here would be a second enforcement of a rule the
 * primary key cannot let through, and a rule enforced twice is a rule that can
 * be relaxed in one place without anybody noticing the other.
 *
 * ## Nothing about a meal is unique
 *
 * Two meals called "chicken salad" is ordinary — one may be the member's
 * fifteen-minute version and the other their mother's — and nothing in this
 * product joins on a meal's name. The only identity a row has is its `_id`,
 * which the client mints and the primary key already enforces, which is what
 * makes a retried offline create a no-op rather than a duplicate.
 *
 * So the rule that bites every optional field in this system — **MongoDB treats
 * missing and null as one value in a unique index** — does not arise here,
 * because there is no uniqueness over an optional field to declare. It is
 * written down all the same, because its absence is the kind of thing a reader
 * checks for.
 */
async function up(db) {
  // ---------------------------------------------------------------- `meals`
  //
  // `{ userId, deletedAt, name }` is the library read, and the field order is
  // the whole point. `listFor` filters on the member and on live rows and then
  // **sorts by name** — equality, equality, sort — which is the only order that
  // lets the index supply the ordering rather than the server sorting the
  // result. The sort is not cosmetic: the rotator's promise is that the same
  // member on the same date gets the same meals (FR-009), and it takes the
  // order it is given, so an unstable one would move a member's lunch whenever
  // an unrelated row was written.
  await db
    .collection('meals')
    .createIndex(
      { userId: 1, deletedAt: 1, name: 1 },
      { name: 'meals_user_live_name' },
    );

  // `{ userId, updatedAt }` is the `/sync` pull: `updatedAt > cursor` for one
  // member, sorted by `updatedAt`, on every sync from every device. Ascending
  // on both, because the sort *is* the cursor's own order.
  //
  // Tombstones are in this index like any other row, deliberately: on a delta a
  // tombstone is the only way a deletion reaches the phone.
  await db
    .collection('meals')
    .createIndex({ userId: 1, updatedAt: 1 }, { name: 'meals_user_updated' });

  // `{ deletedAt }` is the nightly tombstone sweep, which is the one read in
  // this collection that crosses members: "every row deleted before the
  // horizon", with no member in the filter. Without it the sweep is a full
  // collection scan every night for a count that is zero on almost every run.
  await db
    .collection('meals')
    .createIndex(
      { deletedAt: 1 },
      {
        name: 'meals_tombstones',
        partialFilterExpression: { deletedAt: { $type: 'date' } },
      },
    );

  // ----------------------------------------------------- `meal_suggestions`
  //
  // The member's days in order. `forDate` goes through `_id`, so this is for
  // the purge and for a range over a member's history; `date` is a
  // `YYYY-MM-DD` string, which sorts chronologically as text, which is why it
  // is stored that way rather than as a `Date` — the member's day is the
  // member's day whatever the server thinks the hour is (constitution XI).
  await db
    .collection('meal_suggestions')
    .createIndex(
      { userId: 1, date: 1 },
      { name: 'meal_suggestions_user_date' },
    );
}

/**
 * Drops what it made.
 *
 * The opposite call from Knowledge's migration, and for the stated reason:
 * **this file creates no uniqueness rule.** Dropping an index that enforces
 * nothing only ever makes a read slower, and it cannot admit rows that a later
 * re-run of `up` would then choke on. Training's migration made the same call
 * on the same grounds. The distinction is the rule, not the file.
 */
async function down(db) {
  await db.collection('meals').dropIndex('meals_user_live_name');
  await db.collection('meals').dropIndex('meals_user_updated');
  await db.collection('meals').dropIndex('meals_tombstones');
  await db
    .collection('meal_suggestions')
    .dropIndex('meal_suggestions_user_date');
}

module.exports = { up, down };
