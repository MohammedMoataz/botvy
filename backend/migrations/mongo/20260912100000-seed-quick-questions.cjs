/**
 * The Owner's quick questions, seeded.
 *
 * A migration rather than a settings key, and the reason is shape: this is a
 * *collection* of rows with an order and two languages each, and the settings
 * registry holds scalars and small objects validated by a zod schema. A
 * registry entry carrying ten bilingual rows would be a JSON blob an operator
 * edits by hand in a text field, with no validation worth the name.
 *
 * Constitution XII is still satisfied: these are not hard-coded *defaults* in
 * code — they are seed **data**, in a store, and P10's admin screen edits them
 * in place. Until that screen exists, retuning the set means a new migration,
 * which `plan.md` accepts explicitly for a set that changes rarely.
 *
 * ## Idempotent by construction
 *
 * Each row's `_id` is a stable slug, and the write is an upsert keyed on it. So
 * a second run of this migration rewrites the same ten rows rather than
 * creating twenty — which the P0 gate checks by running the whole bootstrap
 * twice and asserting nothing changed.
 *
 * `$setOnInsert` on `createdAt` and `enabled`, `$set` on everything else: a
 * re-run corrects the text of a question the Owner never touched, and does
 * **not** re-enable one they retired. `enabled: false` is how a seeded question
 * is taken out of circulation without deleting a row that members' screens may
 * still hold a copy of, and a migration that flipped it back would undo an
 * operator's decision on every deploy.
 *
 * ## `mood` is the curation
 *
 * `low` questions are lifted to the top for a member whose last check-in
 * reported a bad day, `ok` ones for a member who reported a good one, and `any`
 * keeps its place. Which is why the lighter-day questions carry lower `order`
 * values than the rest: within their group the Owner's order still decides, and
 * the gaps between the numbers are there so a later question can sit between
 * two without renumbering the set.
 */

/** @param {import('mongodb').Db} db */
async function up(db) {
  const now = new Date();
  const seed = [
  {
    "_id": "qq-coach-protein",
    "scope": "coach",
    "text": {
      "en": "How much protein should I be eating?",
      "ar": "أكل قد إيه بروتين في اليوم؟"
    },
    "mood": "any",
    "order": 100,
    "userId": null,
    "schemaVersion": 1
  },
  {
    "_id": "qq-coach-after-training",
    "scope": "coach",
    "text": {
      "en": "What should I eat after training?",
      "ar": "أكل إيه بعد التمرين؟"
    },
    "mood": "any",
    "order": 110,
    "userId": null,
    "schemaVersion": 1
  },
  {
    "_id": "qq-coach-how-doing",
    "scope": "coach",
    "text": {
      "en": "How am I doing this week?",
      "ar": "إيه أدائي الأسبوع ده؟"
    },
    "mood": "ok",
    "order": 120,
    "userId": null,
    "schemaVersion": 1
  },
  {
    "_id": "qq-coach-lighter",
    "scope": "coach",
    "text": {
      "en": "Give me a lighter day",
      "ar": "عايز يوم أخف"
    },
    "mood": "low",
    "order": 90,
    "userId": null,
    "schemaVersion": 1
  },
  {
    "_id": "qq-coach-rest",
    "scope": "coach",
    "text": {
      "en": "Should I rest today?",
      "ar": "أرتاح النهاردة؟"
    },
    "mood": "low",
    "order": 95,
    "userId": null,
    "schemaVersion": 1
  },
  {
    "_id": "qq-coach-sleep",
    "scope": "coach",
    "text": {
      "en": "I slept badly — what should I change?",
      "ar": "منمت وحش امبارح، أعمل إيه؟"
    },
    "mood": "low",
    "order": 100,
    "userId": null,
    "schemaVersion": 1
  },
  {
    "_id": "qq-plan-today",
    "scope": "planner",
    "text": {
      "en": "What's on today?",
      "ar": "إيه المطلوب مني النهاردة؟"
    },
    "mood": "any",
    "order": 100,
    "userId": null,
    "schemaVersion": 1
  },
  {
    "_id": "qq-plan-reminders",
    "scope": "planner",
    "text": {
      "en": "Show me my reminders",
      "ar": "وريني التنبيهات"
    },
    "mood": "any",
    "order": 110,
    "userId": null,
    "schemaVersion": 1
  },
  {
    "_id": "qq-plan-overdue",
    "scope": "planner",
    "text": {
      "en": "What have I let slip?",
      "ar": "إيه اللي فاتني؟"
    },
    "mood": "any",
    "order": 120,
    "userId": null,
    "schemaVersion": 1
  },
  {
    "_id": "qq-plan-tomorrow",
    "scope": "planner",
    "text": {
      "en": "What does tomorrow look like?",
      "ar": "بكرة عامل إيه؟"
    },
    "mood": "any",
    "order": 130,
    "userId": null,
    "schemaVersion": 1
  }
];

  for (const row of seed) {
    const { _id, ...fields } = row;
    await db.collection('quick_questions').updateOne(
      { _id },
      {
        $set: { ...fields, updatedAt: now },
        // Not `enabled`: an Owner who retired a question must not have it
        // brought back by the next deploy.
        $setOnInsert: { createdAt: now, enabled: true },
      },
      { upsert: true },
    );
  }

  // The list query reads "the globals plus this member's own, for one scope,
  // in order". `userId` first because it is the equality field and `order`
  // last because it is the sort — the only compound order a single index can
  // serve for that query.
  await db
    .collection('quick_questions')
    .createIndex(
      { userId: 1, scope: 1, enabled: 1, order: 1 },
      { name: 'quick_questions_member_scope_order' },
    );
}

/** @param {import('mongodb').Db} db */
async function down() {
  // Forward-only. Constitution IV: a rollback that deleted the seeded set
  // would take a member's own questions with it if the filter were ever
  // widened by mistake, and correcting a seeded question is a new migration.
  throw new Error('migrations are forward-only');
}

module.exports = { up, down };
