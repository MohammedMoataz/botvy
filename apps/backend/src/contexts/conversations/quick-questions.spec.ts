import { beforeEach, describe, expect, it } from 'vitest';
import { newId } from '../../shared/cqrs/ids.js';
import { InMemoryUnitOfWork } from '../../shared/persistence/memory/in-memory-unit-of-work.js';
import type { QuickQuestion } from './domain/quick-question.repository.js';
import { InMemoryQuickQuestionRepository } from './infrastructure/in-memory-quick-question.repository.js';
import { InMemorySeq } from './infrastructure/in-memory-conversations.repositories.js';

const MEMBER = 'member-1';
const OTHER = 'member-2';

function question(overrides: Partial<QuickQuestion> = {}): QuickQuestion {
  const at = new Date();
  return {
    id: newId(),
    scope: 'coach',
    text: { en: 'How am I doing?', ar: 'كيف أدائي؟' },
    mood: 'any',
    order: 100,
    userId: null,
    enabled: true,
    createdAt: at,
    updatedAt: at,
    ...overrides,
  };
}

describe('the questions a chat offers', () => {
  let repository: InMemoryQuickQuestionRepository;

  beforeEach(() => {
    repository = new InMemoryQuickQuestionRepository(new InMemoryUnitOfWork());
  });

  it('offers the seeded globals and the member’s own, and nobody else’s', async () => {
    /*
     * FR-010's second half: "a member's own quick question appears for them
     * only". The leak this guards is quiet — one member's question in another
     * member's list looks like a longer list, and a spec that only asserted
     * "the member's own question is offered" would pass against an adapter
     * that returned every row in the collection.
     */
    await repository.save(question({ text: enAr('global') }));
    await repository.save(
      question({ userId: MEMBER, text: enAr('mine'), order: 50 }),
    );
    await repository.save(question({ userId: OTHER, text: enAr('theirs') }));

    const offered = await repository.forMember(MEMBER, 'coach');

    expect(offered.map((row) => row.text.en)).toEqual(['mine', 'global']);
  });

  it('keeps the two pinned chats’ questions apart', async () => {
    await repository.save(question({ scope: 'coach', text: enAr('coaching') }));
    await repository.save(
      question({ scope: 'planner', text: enAr('planning') }),
    );

    expect(
      (await repository.forMember(MEMBER, 'planner')).map((row) => row.text.en),
    ).toEqual(['planning']);
  });

  it('leaves a retired question out rather than deleting the row', async () => {
    // `enabled: false` is how the Owner retires a seeded question without
    // removing a row that members' screens may still hold a copy of.
    await repository.save(question({ enabled: false }));
    expect(await repository.forMember(MEMBER, 'coach')).toEqual([]);
  });

  it('breaks an order tie by age, so the chips do not move between loads', async () => {
    const older = question({ order: 10, text: enAr('older') });
    const newer = question({
      order: 10,
      text: enAr('newer'),
      createdAt: new Date(older.createdAt.getTime() + 1_000),
    });
    // Saved newest first, so insertion order cannot be what produces the
    // answer.
    await repository.save(newer);
    await repository.save(older);

    expect(
      (await repository.forMember(MEMBER, 'coach')).map((row) => row.text.en),
    ).toEqual(['older', 'newer']);
  });

  it('never finds a seeded global by id, so a member cannot delete one for everybody', async () => {
    const global = question();
    await repository.save(global);

    expect(await repository.findOwn(MEMBER, global.id)).toBeNull();

    // And the removal is scoped too, so a caller that got hold of the row some
    // other way still cannot take it out of everybody's list.
    await repository.remove({ ...global, userId: MEMBER });
    expect(await repository.forMember(MEMBER, 'coach')).toHaveLength(1);
  });

  it('never finds another member’s question by id', async () => {
    const theirs = question({ userId: OTHER });
    await repository.save(theirs);
    expect(await repository.findOwn(MEMBER, theirs.id)).toBeNull();
  });

  it('treats a repeated add of the same id as the same question', async () => {
    // The id is minted by the client, so a retried add is the same row written
    // over itself rather than a duplicate-key error at somebody's screen.
    const mine = question({ userId: MEMBER });
    await repository.save(mine);
    await repository.save({ ...mine, text: enAr('edited') });

    const offered = await repository.forMember(MEMBER, 'coach');
    expect(offered).toHaveLength(1);
    expect(offered[0]!.text.en).toBe('edited');
  });
});

describe('the sequence two devices cannot share', () => {
  it('gives a hundred concurrent appends a hundred distinct increasing numbers', async () => {
    /*
     * SC-007, and the load this task asks for: "100 concurrent
     * `append-message` calls produce 100 distinct increasing sequences".
     *
     * ## What this proves, and what it does not
     *
     * It proves the *contract* the callers depend on: no two calls receive the
     * same number, the numbers rise, and nothing is skipped. That is worth
     * asserting here because every handler spec in this context binds this
     * adapter, so a violation would be invisible in all of them — and because
     * `InMemorySeq.next` is written to have no `await` between its read and its
     * write, which is the only form of atomicity a single-threaded runtime
     * offers. A version with an `await` in the middle would fail this.
     *
     * It does **not** prove the real guarantee. Node runs one turn at a time,
     * so "concurrent" here means a hundred promises interleaved on one thread —
     * there is no second writer, no second process and no network. What
     * actually protects production is `MongoSeq.next`'s single
     * `findOneAndUpdate` with `$inc`, which the *server* serialises, plus the
     * unique index `messages_user_seq_unique` on `{ userId, seq }` behind it as
     * the last word. Those two live in `mongo-seq.adapter.ts` and the P3
     * migration respectively, and neither can be exercised without a real
     * replica set — the verification gate's manual step (two devices sending in
     * the same moment) is what covers them.
     *
     * Why it matters that this is the layer that cannot be repaired: messages
     * are immutable and the phone pulls `seq > lastSeq`, so two messages
     * sharing a number means one of them is invisible on that device for ever.
     * There is no `updatedAt` to move and no tombstone to send that would make
     * it reappear.
     */
    const seq = new InMemorySeq();

    const issued = await Promise.all(
      Array.from({ length: 100 }, () => seq.next(MEMBER)),
    );

    expect(new Set(issued).size).toBe(100);
    // Distinct is not enough on its own: the set could be a hundred numbers
    // with holes in it, and a gap costs nothing while a *repeat* costs a
    // message. Both are asserted, so a future adapter that traded one for the
    // other has to say so here.
    expect([...issued].sort((a, b) => a - b)).toEqual(
      Array.from({ length: 100 }, (_, index) => index + 1),
    );
    expect(await seq.current(MEMBER)).toBe(100);
  });

  it('keeps two members’ counters apart under the same load', async () => {
    const seq = new InMemorySeq();

    const [mine, theirs] = await Promise.all([
      Promise.all(Array.from({ length: 50 }, () => seq.next(MEMBER))),
      Promise.all(Array.from({ length: 50 }, () => seq.next(OTHER))),
    ]);

    expect(new Set(mine).size).toBe(50);
    expect(new Set(theirs).size).toBe(50);
    // Both start at 1: the counter is keyed per member, so one member's traffic
    // never advances another's cursor.
    expect(Math.min(...mine)).toBe(1);
    expect(Math.min(...theirs)).toBe(1);
  });
});

/** The same word in both languages, which is all these fixtures need. */
function enAr(word: string): { en: string; ar: string } {
  return { en: word, ar: word };
}
