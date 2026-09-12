/**
 * One backup, one heartbeat (P11, T1101/T1104).
 *
 * P0 shipped two nightly scripts, one per store, each stamping its own row —
 * `backup.mongo` and `backup.postgres`. P11 replaces them with a single run
 * that also copies the media volume and reports once, as `backup`, so that
 * "was last night's backup taken" is one question with one answer rather than
 * three that can disagree.
 *
 * The old rows have to go, and this is the only place that can remove them.
 * Nothing stamps them any more, so `lastOkAt` stops advancing — and a heartbeat
 * that stops advancing is, correctly, reported stale. Left in place they would
 * make `/health` answer `degraded` for ever on an installation where the backup
 * is working perfectly, which is exactly the always-red signal the nightly
 * window was introduced to avoid: what an operator learns from a permanent red
 * is to stop reading it.
 *
 * Deleting rather than renaming. A rename would carry `backup.mongo`'s last
 * success forward as though it were the new run's, and the new run has never
 * succeeded until it has — including the media copy, which the old one never
 * took. Better to have the first night after an upgrade read "never run", which
 * is true, than to inherit a reassurance about a backup that was narrower.
 */
async function up(db) {
  await db
    .collection('ops_heartbeats')
    .deleteMany({ _id: { $in: ['backup.mongo', 'backup.postgres'] } });
}

/**
 * Refused.
 *
 * There is nothing to put back. The rows held the *outcomes* of runs that no
 * longer happen, and inventing them would be inventing a claim that a backup
 * succeeded. An installation rolling back to the two-script version writes its
 * own rows on its next night, which is the honest recovery: the heartbeat is
 * evidence, and evidence is not something a migration may manufacture.
 */
async function down() {
  throw new Error(
    'Forward only: the old backup heartbeats recorded runs that no longer happen, ' +
      'and re-creating them would claim a backup that was never taken. Roll the ' +
      'scripts back and the next night writes its own rows.',
  );
}

module.exports = { up, down };
