/**
 * Drops the `pings` collection, which the demonstration slice owned.
 *
 * ## Why this is a new file rather than an edit to the migration that made it
 *
 * Constitution IV: migrations only go forward. `20260907000000-foundation-indexes.cjs`
 * created the collection's index and it stays exactly as it is, because it is
 * the record of what P0 did — a machine that ran it a month ago must not be
 * able to reach a different history by having that file rewritten under it. A
 * correction is a new migration, and so is a retirement.
 *
 * ## Why the demo existed, and why it can go now
 *
 * P0 needed to prove the spine end to end before there was any real domain to
 * prove it with: a command over REST, an aggregate saved, an event through the
 * transactional outbox, the change-stream relay picking it up, a webhook
 * reaching n8n. `ping` was the smallest thing that exercised all five, and
 * `014-foundation` F-13 is the requirement it satisfied.
 *
 * P2 has `planning.TaskScheduled` doing the same journey for a member who
 * actually wants the outcome, so the demonstration is now a second
 * implementation of a path that has a real one. Keeping it would mean a
 * collection nobody reads, a route nobody calls, and — the part that actually
 * costs something — a default automation subscription pointing at a webhook
 * whose only purpose is to receive events from a feature that does not exist.
 *
 * ## `drop` rather than `deleteMany`
 *
 * The collection goes, indexes and all. There is no data here worth keeping:
 * every row was written by a test or by somebody checking the plumbing.
 */

/** @param {import('mongodb').Db} db */
async function up(db) {
  // `listCollections` first, because `drop` on a collection that is not there
  // throws — and this migration has to be safe to re-run, which the P0 gate
  // checks by running the whole bootstrap twice and asserting nothing changed.
  const existing = await db.listCollections({ name: 'pings' }).toArray();
  if (existing.length === 0) return;

  await db.collection('pings').drop();
}

/** @param {import('mongodb').Db} db */
async function down() {
  // Nothing. Recreating an empty collection would be a lie about what was
  // here, and constitution IV means this is never run in a deployed
  // environment anyway — a correction is a new migration.
}

module.exports = { up, down };
