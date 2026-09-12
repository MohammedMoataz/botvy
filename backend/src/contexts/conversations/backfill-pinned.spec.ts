import { createRequire } from 'node:module';
import { beforeEach, describe, expect, it } from 'vitest';
import { newId } from '../../shared/cqrs/ids.js';
import { Conversation } from './domain/conversation.aggregate.js';
import { conversationMapper } from './infrastructure/mongo-conversations.repositories.js';

/**
 * The one-off backfill: the two pinned chats for every member who registered
 * before P3's bootstrap existed, the seeded administrator among them.
 *
 * ## Why the migration is `require`d from a spec
 *
 * It is a `migrate-mongo` script — CommonJS, `module.exports`, no Nest
 * container — and the backend package is `"type": "module"`, so `import` will
 * not take it. `createRequire` is the one bridge, and reaching across it is
 * worth it because the alternative is a migration nobody runs until it runs on
 * real data.
 *
 * ## What is actually being asserted
 *
 * Two things, and the first matters more than the idempotence:
 *
 * 1. **That the migration and the aggregate agree about the document.** There
 *    is one creator of a pinned conversation in the running system
 *    (`ConversationsBootstrapHandler`) and the migration cannot call it, so the
 *    shape is replicated — which is a drift risk with a long fuse: a field
 *    added to `Conversation` and its mapper would leave the backfilled rows
 *    missing it, and nothing would notice until a member who joined in P1 hit a
 *    code path the field feeds. So the migration's row is compared against
 *    `conversationMapper.toPersistence(Conversation.create(...))`, key for key
 *    and value for value.
 * 2. **That it is safe to re-run.** `bootstrap.mjs` runs the migrations and the
 *    phase gate runs it twice, asserting nothing changed the second time. A
 *    migration that is only correct once is a migration nobody dares re-run,
 *    and this one has to be re-runnable for the gap it cannot close — a member
 *    whose profile row appears later gains their chats on the next run.
 */
const migration = createRequire(import.meta.url)(
  '../../../migrations/mongo/20260912000000-backfill-pinned-conversations.cjs',
) as {
  up(db: FakeDb): Promise<void>;
  down(): Promise<void>;
  PINNED: ReadonlyArray<{ kind: string; title: string }>;
  pinnedConversationDoc(input: {
    id: string;
    userId: string;
    kind: string;
    title: string;
    at: Date;
  }): Record<string, unknown>;
};

interface Row {
  [key: string]: unknown;
}

/**
 * Just enough of a Mongo `Db` for this migration: `distinct`, a `find` over the
 * one filter it uses, and `insertMany`.
 *
 * A fake rather than a real database, because what is being tested is the
 * migration's *decisions* — who is missing what, and what it writes for them —
 * and those are answerable without a replica set. What a fake cannot check is
 * the partial unique index refusing a duplicate, which is why the insert path
 * tolerates a duplicate-key error rather than relying on the read alone.
 */
class FakeDb {
  readonly data = new Map<string, Row[]>();

  collection(name: string) {
    const rows = this.data.get(name) ?? [];
    this.data.set(name, rows);
    return {
      async distinct(field: string): Promise<unknown[]> {
        return [...new Set(rows.map((row) => row[field]))];
      },
      find(filter: { kind?: { $in: string[] } }) {
        return {
          async toArray(): Promise<Row[]> {
            const kinds = filter.kind?.$in;
            return rows.filter(
              (row) => !kinds || kinds.includes(row.kind as string),
            );
          },
        };
      },
      async insertMany(docs: Row[]): Promise<void> {
        rows.push(...docs);
      },
    };
  }

  rows(name: string): Row[] {
    return this.data.get(name) ?? [];
  }

  seedProfile(userId: string): void {
    this.collection('profiles');
    this.rows('profiles').push({ _id: newId(), userId });
  }

  seedConversation(userId: string, kind: string): void {
    this.collection('conversations');
    this.rows('conversations').push({ _id: newId(), userId, kind });
  }
}

const ADMIN = 'admin-user-id';
const MEMBER = 'member-1';

describe('the backfilled pinned chats', () => {
  let db: FakeDb;
  beforeEach(() => {
    db = new FakeDb();
  });

  it('writes exactly the document the aggregate’s mapper produces', async () => {
    /*
     * The drift guard. Both sides are built from the same inputs, and the only
     * fields excluded from the comparison are the ones that are *meant* to
     * differ: none. The id and the moment are pinned so that even `createdAt`
     * and `updatedAt` have to match.
     */
    const at = new Date();
    const id = newId();

    for (const { kind, title } of migration.PINNED) {
      const fromMigration = migration.pinnedConversationDoc({
        id,
        userId: MEMBER,
        kind,
        title,
        at,
      });
      const fromAggregate = conversationMapper.toPersistence(
        Conversation.create({
          id,
          userId: MEMBER,
          kind: kind as 'coach' | 'planner',
          title,
          at,
        }),
      );

      expect(fromMigration).toEqual(fromAggregate);
      // And spelled out, because `toEqual` would pass on two identically wrong
      // documents: these are the values FR-001 and the aggregate both promise.
      expect(fromMigration.pinned).toBe(true);
      expect(fromMigration.archived).toBe(false);
      expect(fromMigration.clearedUpToSeq).toBe(0);
      expect(fromMigration.deletedAt).toBeNull();
      expect(fromMigration.lastMessageAt).toBeNull();
    }
  });

  it('names them the way the live bootstrap does', async () => {
    // `bootstrap-on-registered.handler.ts`'s own literals. A member who joined
    // in P1 must not end up with a chat called something else — the phone
    // renders a pinned chat by `kind`, but the title is what an operator sees
    // in the database and what an un-migrated client falls back to.
    expect(migration.PINNED).toEqual([
      { kind: 'coach', title: 'Coach' },
      { kind: 'planner', title: 'Planner' },
    ]);
  });

  it('gives every member with a profile both chats, the administrator included', async () => {
    db.seedProfile(ADMIN);
    db.seedProfile(MEMBER);

    await migration.up(db);

    const rows = db.rows('conversations');
    expect(rows).toHaveLength(4);
    for (const userId of [ADMIN, MEMBER]) {
      expect(
        rows
          .filter((row) => row.userId === userId)
          .map((row) => row.kind)
          .sort(),
      ).toEqual(['coach', 'planner']);
    }
    // Distinct ids, minted per row. A shared id would collide on `_id` and
    // leave the second member with one chat.
    expect(new Set(rows.map((row) => row._id)).size).toBe(4);
  });

  it('gives a member with only one of the pair the other one', async () => {
    /*
     * Per kind, not per pair. This is the state a crash between the bootstrap
     * handler's two writes leaves, and a check on the pair being *absent*
     * would take its "already there" exit and never finish the job — the bug
     * Profile's bootstrap comment names.
     */
    db.seedProfile(MEMBER);
    db.seedConversation(MEMBER, 'coach');

    await migration.up(db);

    expect(
      db
        .rows('conversations')
        .map((row) => row.kind)
        .sort(),
    ).toEqual(['coach', 'planner']);
  });

  it('changes nothing on a second run', async () => {
    db.seedProfile(ADMIN);
    db.seedProfile(MEMBER);

    await migration.up(db);
    const after = JSON.stringify(db.rows('conversations'));
    await migration.up(db);

    expect(JSON.stringify(db.rows('conversations'))).toBe(after);
  });

  it('leaves a member who already has both alone', async () => {
    db.seedProfile(MEMBER);
    db.seedConversation(MEMBER, 'coach');
    db.seedConversation(MEMBER, 'planner');

    await migration.up(db);

    expect(db.rows('conversations')).toHaveLength(2);
  });

  it('writes nothing at all when there are no profiles', async () => {
    // A fresh install: every member arrives after the live bootstrap exists,
    // so the backfill has nothing to do and must not create a stray row for a
    // member id it invented.
    await migration.up(db);
    expect(db.rows('conversations')).toHaveLength(0);
  });

  it('skips a profile row with no usable member id', async () => {
    // Defensive, and cheap: a `userId` that is empty or not a string would
    // otherwise become a conversation belonging to nobody, which no scoped read
    // could ever return and no purge would ever remove.
    db.collection('profiles');
    db.rows('profiles').push({ userId: '' }, { userId: 42 });

    await migration.up(db);

    expect(db.rows('conversations')).toHaveLength(0);
  });

  it('refuses to roll back, because a rollback would delete live chats', async () => {
    // Constitution IV, and here worse than usual: `down` could not tell a chat
    // this file created from one the bootstrap created, so it would delete
    // pinned conversations members have since been talking to.
    await expect(migration.down()).rejects.toThrow('forward-only');
  });
});
