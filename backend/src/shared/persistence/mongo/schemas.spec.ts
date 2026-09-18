import { describe, expect, it } from 'vitest';
import type { Schema } from 'mongoose';
import * as schemas from './schemas.js';

/**
 * The check that would have caught the same defect twice.
 *
 * `MongoRepositoryBase.save` filters on `updatedAt` for its optimistic check
 * and writes it back on every save. Mongoose runs `strict: true`, so an upsert
 * naming a path the schema does not declare is **rejected outright** —
 * `Path "updatedAt" is not in schema, strict mode is 'true', and upsert is
 * 'true'`. Not a warning, not a dropped field: the whole write fails.
 *
 * It has shipped twice.
 *
 *   - **P2, `AlertSchema`.** No alert was ever created. The entire notification
 *     pipeline was dead for a phase while 38 unit tests passed, and it took four
 *     undelivered outbox rows carrying that message to find it.
 *   - **P3, `MessageSchema`.** Every rhythm touch saved its plan, raised its
 *     event and planned its alert, and failed to write the sentence into the
 *     member's coach chat — which is the one thing FR-005 asks for. 740 unit
 *     tests passed. The tick's per-member `catch` turned it into a log line.
 *
 * Both were invisible to the unit suite for the same reason, and it is not a
 * gap in the tests' coverage: **the in-memory adapter has no schema to be
 * strict about.** Every handler spec binds the in-memory adapter, on purpose,
 * so a handler can be tested without a database — and that trade means no
 * handler spec can ever see this class of failure. Only a schema-shaped
 * assertion or a real Mongo can.
 *
 * So this asserts the *contract between the base class and the schemas*
 * directly, with no store and no handler involved. It runs in milliseconds and
 * fails the moment somebody adds a collection and forgets the column.
 */

/**
 * Collections that are not written through `MongoRepositoryBase`, with the
 * reason each one is exempt.
 *
 * An allowlist rather than an inferred rule, because the inference would have
 * to be "which schemas does some repository use", and a new repository would
 * silently opt its collection out of the check by not existing yet. Adding a
 * name here should feel like a decision — it is a statement that this
 * collection's writes go through something else.
 */
const NOT_THROUGH_THE_BASE: Record<string, string> = {
  outbox: 'appended to directly, inside the same session as the aggregate save',
  relay_state: 'the relay writes its own resume token with a bare updateOne',
  settings:
    'SettingsService owns its store adapter and writes updatedAt itself',
  ops_heartbeats: 'HeartbeatService stamps rows; there is no aggregate',
  audit_log: 'append-only, written by the audit adapter',
  idempotency_keys: 'written by the interceptor, and expire on a TTL index',
  counters:
    'one findOneAndUpdate with $inc; no aggregate and no optimistic check',
  /*
   * Append-only, one row per model call, inserted by Operations' handler from
   * `conversations.MessageSent`. There is no aggregate and nothing ever
   * modifies a row, so there is no lost update to guard against — `eventId` is
   * unique instead, which is what makes a redelivered event write nothing.
   *
   * This entry was added in the same change as the collection, because the
   * check above named it the moment it appeared. That is the check working:
   * every new collection has to make this decision explicitly rather than
   * discover it against a real Mongo two phases later, which is how both
   * `AlertSchema` and `MessageSchema` shipped broken.
   */
  usage_log:
    'append-only inserts by Operations; unique on eventId, never modified',
};

interface SchemaLike {
  paths: Record<string, unknown>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  options: { collection?: string } & Record<string, any>;
}

function collectionsOf(): Array<{
  name: string;
  collection: string;
  schema: SchemaLike;
}> {
  const found: Array<{ name: string; collection: string; schema: SchemaLike }> =
    [];
  for (const [name, value] of Object.entries(schemas)) {
    if (!name.endsWith('Schema')) continue;
    const schema = value as unknown as SchemaLike;
    const collection = schema?.options?.collection;
    if (typeof collection !== 'string') continue;
    found.push({ name, collection, schema });
  }
  return found;
}

describe('the schemas and the repository base agree', () => {
  const all = collectionsOf();

  it('finds every declared collection, so the check cannot silently cover none', () => {
    // A guard on the reflection above. If `collectionsOf` ever stopped matching
    // — a rename of the `*Schema` convention, say — every assertion below would
    // pass over an empty list and this file would be decoration.
    expect(all.length).toBeGreaterThanOrEqual(18);
    expect(all.map((entry) => entry.collection)).toContain('messages');
    expect(all.map((entry) => entry.collection)).toContain('alerts');
  });

  it('every collection written through the base declares updatedAt', () => {
    const missing = all
      .filter((entry) => !(entry.collection in NOT_THROUGH_THE_BASE))
      .filter((entry) => !('updatedAt' in entry.schema.paths))
      .map((entry) => `${entry.name} (${entry.collection})`);

    expect(missing).toEqual([]);
  });

  it('every collection written through the base declares version', () => {
    /*
     * The same assertion for E-006's optimistic counter, and for the same
     * reason: `MongoRepositoryBase.save` names `version` in its `$set` on
     * **every** write, so a schema that does not declare it makes Mongoose
     * reject the whole upsert under `strict: true` — `Path "version" is not in
     * schema`. Not a dropped field: the collection simply stops accepting
     * writes, and no handler spec can see it because the in-memory adapter has
     * no schema to be strict about.
     *
     * That is precisely how `AlertSchema` killed the notification pipeline in
     * P2 and `MessageSchema` killed the rhythm's chat writes in P3, both with
     * a green unit suite. Adding a column the base writes without adding it
     * here is the same change that shipped twice.
     */
    const missing = all
      .filter((entry) => !(entry.collection in NOT_THROUGH_THE_BASE))
      .filter((entry) => !('version' in entry.schema.paths))
      .map((entry) => `${entry.name} (${entry.collection})`);

    expect(missing).toEqual([]);
  });

  it('the heartbeat schema declares every field a stamp writes', () => {
    /*
     * The exemption above says `ops_heartbeats` does not go through the base,
     * and that is true — but it does not make the collection safe. The stamp is
     * an `updateOne` with `upsert: true`, and Mongoose's strict mode drops a
     * path the schema does not declare from the `$set` without a word: the
     * write succeeds, the column is simply never there, and `/health` goes on
     * reading the field it thinks it wrote.
     *
     * `everyMinutes` is the one that made this worth asserting. It is how a job
     * says it runs once a night (E-018), and a silently-dropped cadence puts
     * every nightly job back on the fifteen-minute window — which is the defect
     * that enhancement exists to remove, restored by a missing line in a schema.
     */
    const heartbeat = all.find(
      (entry) => entry.collection === 'ops_heartbeats',
    );
    expect(heartbeat).toBeDefined();
    for (const field of [
      'lastRunAt',
      'lastOkAt',
      'lastDurationMs',
      'lastError',
      'everyMinutes',
    ]) {
      expect(Object.keys(heartbeat?.schema.paths ?? {})).toContain(field);
    }
  });

  it('every exemption names a collection that exists', () => {
    // Otherwise an exemption outlives the collection it was written for and
    // quietly excuses a future one that happens to reuse the name.
    const known = new Set(all.map((entry) => entry.collection));
    const stale = Object.keys(NOT_THROUGH_THE_BASE).filter(
      (collection) => !known.has(collection),
    );
    expect(stale).toEqual([]);
  });

  it('every collection carries userId, or is explicitly not a member’s', () => {
    /*
     * The same shape of check for the other field the base assumes.
     *
     * `findById`, `remove` and every purge filter on `{ _id, userId }`, so a
     * member-owned collection without the column would return null for rows
     * that exist — a member's data would appear to vanish rather than fail
     * loudly, which is the worse of the two.
     */
    const platform = new Set([
      'relay_state',
      'settings',
      'ops_heartbeats',
      'counters',
      // `outbox`, `audit_log` and `idempotency_keys` carry a nullable userId:
      // an event can be raised by the system with no member behind it.
      'outbox',
      'audit_log',
      'idempotency_keys',
      /*
       * `athlete_profiles` is a member's, and carries no `userId` column,
       * because **`_id` *is* the `userId`** (data-model §2.6): one document per
       * member, written on `identity.UserRegistered`. A `userId` field beside
       * it would be the same string twice, and two copies of one value is how
       * they come to disagree.
       *
       * The cost is named rather than hidden: it is the one Training
       * collection whose adapter cannot use `MongoRepositoryBase`, whose
       * filter is `{ _id, userId }` and would match nothing here. See
       * `MongoAthleteProfileRepository`, which keeps the base's optimistic
       * `updatedAt` filter and drops only the ownership half — safely, since
       * the id it filters on is the ownership.
       *
       * `profiles` and `user_preferences` are keyed the same way and do carry
       * the column, which is why they are not in this list; they went through
       * the base for it. This collection trades that for one source of truth
       * about who owns the row.
       */
      'athlete_profiles',
    ]);

    const missing = all
      .filter((entry) => !platform.has(entry.collection))
      .filter((entry) => !('userId' in entry.schema.paths))
      .map((entry) => `${entry.name} (${entry.collection})`);

    expect(missing).toEqual([]);
  });

  it('no schema builds its own indexes on connect', () => {
    /*
     * Constitution IV: `migrate-mongo` owns indexes, and the schemas describe
     * shape only. An index created by `autoIndex` is an index created
     * differently on every deploy, at a moment nobody chose, against whatever
     * the code said that day.
     *
     * `MongoPersistenceModule` sets `autoIndex: false` globally, so this is the
     * second line of defence: a schema that called `.index()` or declared
     * `unique: true` on a path would still register an index with Mongoose,
     * and a future connection built without that option would create it.
     */
    const declaring = all
      .filter((entry) => {
        const withIndexes = entry.schema as unknown as {
          indexes?: () => unknown[];
        };
        return (withIndexes.indexes?.() ?? []).length > 0;
      })
      .map((entry) => entry.name);

    expect(declaring).toEqual([]);
  });
});

/** Narrowing helper kept out of the assertions for readability. */
export type { Schema };
