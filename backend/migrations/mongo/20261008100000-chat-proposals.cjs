/**
 * The chat's proposals (032): a change offered and not yet answered.
 *
 * Two reads, two indexes. A typed "yes" asks for the newest open proposal in
 * the conversation the member is typing in; a tap names the proposal by id,
 * which `_id` already serves. And a TTL a week past `expiresAt`, so an answered
 * or abandoned proposal does not sit in the store for ever — a week rather than
 * at once, so a member asking "what did you just change?" still has the record
 * behind the transcript for a while.
 *
 * `createIndex` is idempotent for an identical specification, so a second run
 * changes nothing.
 */
async function up(db) {
  const proposals = db.collection('chat_proposals');
  await proposals.createIndex(
    { userId: 1, conversationId: 1, status: 1, createdAt: -1 },
    { name: 'chat_proposals_open_in_conversation' },
  );
  await proposals.createIndex(
    { expiresAt: 1 },
    { name: 'chat_proposals_ttl', expireAfterSeconds: 7 * 24 * 60 * 60 },
  );
  await proposals.createIndex({ userId: 1 }, { name: 'chat_proposals_user' });
}

/** Forward only, as every migration here. */
async function down() {
  throw new Error(
    'Forward only: drop the chat_proposals indexes by hand if you must; the collection holds nothing that outlives a week.',
  );
}

module.exports = { up, down };
