/**
 * `link_previews` (032): a cache of meeting link and address previews.
 *
 * One index, a TTL on `expiresAt`. Each row's expiry is computed at write time
 * from `meetings.previewTtlDays` or `meetings.previewFailureTtlDays`, so the
 * index expires at the stored moment (`expireAfterSeconds: 0`) and the two
 * settings stay retunable without rebuilding it. The cache also filters on
 * `expiresAt`, because the TTL monitor runs once a minute and a row may
 * outlive its moment by that much.
 *
 * The collection is created explicitly so a fresh install has it before the
 * first preview, like the other phases' migrations.
 */
async function up(db) {
  const existing = await db
    .listCollections({ name: 'link_previews' }, { nameOnly: true })
    .toArray();
  if (existing.length === 0) await db.createCollection('link_previews');

  await db
    .collection('link_previews')
    .createIndex(
      { expiresAt: 1 },
      { name: 'link_previews_ttl', expireAfterSeconds: 0 },
    );
}

/** Drops the index; the rows are a cache and may stay or go. */
async function down(db) {
  await db.collection('link_previews').dropIndex('link_previews_ttl');
}

module.exports = { up, down };
