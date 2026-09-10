import { beforeEach, describe, expect, it } from 'vitest';
import { newId } from '../../shared/cqrs/ids.js';
import { InMemoryUnitOfWork } from '../../shared/persistence/memory/in-memory-unit-of-work.js';
import { localDate } from '../../shared/time/time.js';
import type { CheckinsQueryHandler, CheckinView } from '../rhythm/features/checkins/checkins.query.js';
import type { ProfileQueryHandler } from '../profile/features/profile-query/profile.query.js';
import { LatestCheckinPort } from './domain/chat.ports.js';
import type { QuickQuestion } from './domain/quick-question.repository.js';
import { RhythmLatestCheckin } from './infrastructure/chat.adapters.js';
import { InMemoryQuickQuestionRepository } from './infrastructure/in-memory-quick-question.repository.js';
import {
  InvalidQuickQuestion,
  MAX_QUESTION,
  MEMBER_ORDER_BASE,
  ManageQuickQuestionHandler,
  QuickQuestionNotYours,
} from './features/quick-questions/manage-quick-question.handler.js';
import {
  QuickQuestionsQueryHandler,
  bucketFor,
  sortForMood,
} from './features/quick-questions/quick-questions.query.js';

/**
 * The tappable questions a chat offers — the P4 half.
 *
 * `quick-questions.spec.ts` holds the *adapter* to its promises (the globals
 * plus this member's own, disabled rows excluded, a stable sort). This file is
 * the layer above it: the two pure sort functions, the query handler that
 * reorders by mood and resolves a locale, the add/remove rules, and the mood
 * adapter's own window. Kept separate rather than appended so that a failure
 * names which layer broke — a reordering defect and a leaking adapter read very
 * differently and would otherwise sit in one file called "quick questions".
 *
 * Every date derives from `Date.now()`. The mood window is fourteen *local*
 * days, so a pinned fixture in here starts failing the day the clock reaches
 * it.
 */

const MEMBER = 'member-1';
const OTHER = 'member-2';
const CAIRO = 'Africa/Cairo';

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

class Mood extends LatestCheckinPort {
  value: number | null = null;

  async latestMood(_userId: string): Promise<number | null> {
    return this.value;
  }
}

// ------------------------------------------------------- the two pure functions

describe('which bucket a mood falls in', () => {
  /**
   * Null is not a low mood, and it is not a middling one either.
   *
   * A member who has never answered a check-in, or who answered with a verdict
   * and no mood, has *no* mood. `?? 50` would put every new member into the
   * "ok" bucket by accident and `?? 0` would greet all of them with a lighter
   * day — which reads as the app deciding they are struggling before they have
   * said anything at all.
   */
  it('has no bucket for a member who has not reported a mood', () => {
    expect(bucketFor(null)).toBeNull();
  });

  /** 40 out of 100 is the boundary, and it is `< 40` rather than `<= 40`. */
  it('splits at forty', () => {
    expect(bucketFor(0)).toBe('low');
    expect(bucketFor(39)).toBe('low');
    expect(bucketFor(40)).toBe('ok');
    expect(bucketFor(100)).toBe('ok');
  });
});

describe('ordering the questions for a mood', () => {
  /**
   * FR-010: after a low check-in the coach offers gentler options first.
   *
   * Lifted above `any`, not filtered down to only `low`. A member having a bad
   * day should be *offered* the lighter option, not prevented from asking about
   * their programme — hiding the ordinary questions would be the app deciding
   * what they are allowed to want. So the assertion is on the whole list, in
   * order, rather than on what the first element is.
   */
  it('lifts the matching bucket above any, and sinks the other below', () => {
    const rows = [
      question({ mood: 'any', order: 10, text: enAr('any') }),
      question({ mood: 'ok', order: 20, text: enAr('ok') }),
      question({ mood: 'low', order: 30, text: enAr('low') }),
    ];

    expect(sortForMood(rows, 'low').map(en)).toEqual(['low', 'any', 'ok']);
    expect(sortForMood(rows, 'ok').map(en)).toEqual(['ok', 'any', 'low']);
  });

  /** No mood, no reordering: the Owner's own order is the answer. */
  it('leaves the order alone when there is no mood', () => {
    const rows = [
      question({ mood: 'low', order: 10, text: enAr('low') }),
      question({ mood: 'any', order: 20, text: enAr('any') }),
      question({ mood: 'ok', order: 30, text: enAr('ok') }),
    ];

    expect(sortForMood(rows, null).map(en)).toEqual(['low', 'any', 'ok']);
  });

  /**
   * The Owner's `order` survives *inside* each group.
   *
   * The seed leaves gaps in `order` precisely so a later question can sit
   * between two existing ones, and a mood sort that rebuilt the list instead of
   * sorting it on one key would throw that curation away — the chips would come
   * back in whatever order the collection scan produced, which is stable enough
   * to look deliberate and arbitrary enough to be wrong.
   */
  it('keeps the Owner’s order within a group', () => {
    const rows = [
      question({ mood: 'low', order: 30, text: enAr('low-late') }),
      question({ mood: 'low', order: 10, text: enAr('low-early') }),
      question({ mood: 'any', order: 40, text: enAr('any-late') }),
      question({ mood: 'any', order: 20, text: enAr('any-early') }),
    ];

    expect(sortForMood(rows, 'low').map(en)).toEqual([
      'low-early',
      'low-late',
      'any-early',
      'any-late',
    ]);
  });

  /** And it does not mutate its input — the caller's list is the store's. */
  it('returns a new list rather than sorting in place', () => {
    const rows = [
      question({ mood: 'any', order: 10, text: enAr('any') }),
      question({ mood: 'low', order: 20, text: enAr('low') }),
    ];

    sortForMood(rows, 'low');

    expect(rows.map(en)).toEqual(['any', 'low']);
  });
});

// ------------------------------------------------------------------ the query

describe('the questions a chat offers, as the screen reads them', () => {
  let repository: InMemoryQuickQuestionRepository;
  let mood: Mood;
  let handler: QuickQuestionsQueryHandler;

  beforeEach(() => {
    repository = new InMemoryQuickQuestionRepository(new InMemoryUnitOfWork());
    mood = new Mood();
    handler = new QuickQuestionsQueryHandler(repository, mood);
  });

  /**
   * The globals plus the member's own, and nobody else's.
   *
   * The leak this guards is quiet: one member's question in another member's
   * list looks like a longer list. `isMine` is asserted alongside it because it
   * is what the client uses to decide whether to offer a remove — a global
   * marked as the member's own would offer them a delete that always fails.
   */
  it('returns the globals and the member’s own, and nobody else’s', async () => {
    await repository.save(question({ text: enAr('global') }));
    await repository.save(question({ userId: MEMBER, order: 50, text: enAr('mine') }));
    await repository.save(question({ userId: OTHER, order: 10, text: enAr('theirs') }));

    const offered = await handler.handle(MEMBER, 'coach');

    expect(offered.map((row) => row.text)).toEqual(['mine', 'global']);
    expect(offered.map((row) => row.isMine)).toEqual([true, false]);
  });

  /**
   * A low check-in reorders what the screen offers, and the reorder is what
   * FR-010 asks for rather than a filter.
   */
  it('brings a lighter-day question to the top after a low check-in', async () => {
    await repository.save(question({ mood: 'any', order: 10, text: enAr('my programme') }));
    await repository.save(question({ mood: 'low', order: 20, text: enAr('something easier') }));
    mood.value = 20;

    const offered = await handler.handle(MEMBER, 'coach');

    expect(offered.map((row) => row.text)).toEqual(['something easier', 'my programme']);
  });

  it('leaves the order alone for a member who has reported nothing', async () => {
    await repository.save(question({ mood: 'any', order: 10, text: enAr('my programme') }));
    await repository.save(question({ mood: 'low', order: 20, text: enAr('something easier') }));
    mood.value = null;

    const offered = await handler.handle(MEMBER, 'coach');

    expect(offered.map((row) => row.text)).toEqual(['my programme', 'something easier']);
  });

  /**
   * FR-019: an Arabic screen reads Arabic.
   *
   * Both languages are stored on every row precisely because the seeded set is
   * shown to everybody, and a chip that fell back to English on an Arabic
   * screen is exactly the defect `enhancements/E-012` describes for the coach's
   * own sentences. The locale match is on the prefix, so `ar-EG` counts.
   */
  it('returns Arabic for an Arabic locale', async () => {
    await repository.save(
      question({ text: { en: 'How am I doing?', ar: 'كيف أدائي؟' } }),
    );

    expect((await handler.handle(MEMBER, 'coach', 'ar'))[0]?.text).toBe('كيف أدائي؟');
    expect((await handler.handle(MEMBER, 'coach', 'ar-EG'))[0]?.text).toBe('كيف أدائي؟');
    expect((await handler.handle(MEMBER, 'coach', 'en'))[0]?.text).toBe('How am I doing?');
  });
});

// -------------------------------------------------------- adding and removing

describe('a member’s own quick question', () => {
  let repository: InMemoryQuickQuestionRepository;
  let handler: ManageQuickQuestionHandler;

  beforeEach(() => {
    const uow = new InMemoryUnitOfWork();
    repository = new InMemoryQuickQuestionRepository(uow);
    handler = new ManageQuickQuestionHandler(uow, repository);
  });

  /**
   * The id has to be a UUID, and refusing a non-UUID is not fussiness.
   *
   * The id is client-minted so that a retried add writes the same row over
   * itself rather than creating a second chip — that is the whole idempotency
   * story. A client that sent `"1"` or a slug would get a row whose id collides
   * with another client's on the next member, and the "retry is a no-op"
   * property would quietly become "overwrite somebody else's".
   */
  it('refuses an id that is not a UUID', async () => {
    await expect(
      handler.add({ userId: MEMBER, id: 'question-1', scope: 'coach', text: 'How is my sleep?' }),
    ).rejects.toBeInstanceOf(InvalidQuickQuestion);
    expect(repository.rows.size).toBe(0);
  });

  it('refuses an empty question, and one that is only whitespace', async () => {
    await expect(
      handler.add({ userId: MEMBER, id: newId(), scope: 'coach', text: '' }),
    ).rejects.toBeInstanceOf(InvalidQuickQuestion);
    await expect(
      handler.add({ userId: MEMBER, id: newId(), scope: 'coach', text: '   \n ' }),
    ).rejects.toBeInstanceOf(InvalidQuickQuestion);
    expect(repository.rows.size).toBe(0);
  });

  /** A chip, not a paragraph. The boundary is `> MAX_QUESTION`, so exactly the limit fits. */
  it('refuses a question longer than a chip holds, and accepts one exactly that long', async () => {
    await expect(
      handler.add({
        userId: MEMBER,
        id: newId(),
        scope: 'coach',
        text: 'x'.repeat(MAX_QUESTION + 1),
      }),
    ).rejects.toBeInstanceOf(InvalidQuickQuestion);

    const stored = await handler.add({
      userId: MEMBER,
      id: newId(),
      scope: 'coach',
      text: 'x'.repeat(MAX_QUESTION),
    });
    expect(stored.text.en).toHaveLength(MAX_QUESTION);
  });

  /**
   * The member's own text goes in **both** language slots, and `mood` is forced
   * to `any`.
   *
   * Both halves are about a row nobody else will ever read. Copying the text
   * rather than leaving the other half blank keeps every reader of the row
   * simple — the list query picks a language and gets a sentence, where a
   * nullable half would need a fallback that can produce an empty chip.
   *
   * And `mood` is curation the Owner does over the seeded set: letting a member
   * tag their own question `low` would let them push it above the Owner's
   * gentler options on exactly the day those exist for. There is no `mood` on
   * the input at all, which is the strongest form of that rule — but a later
   * change that spread the input into the row would reintroduce it, and this is
   * the assertion that would catch it.
   */
  it('stores the member’s text in both languages, owned by them, at any mood', async () => {
    const id = newId();
    const stored = await handler.add({
      userId: MEMBER,
      id,
      scope: 'planner',
      text: '  What is left today?  ',
    });

    expect(stored).toMatchObject({
      id,
      scope: 'planner',
      // Trimmed, and the same sentence in both slots.
      text: { en: 'What is left today?', ar: 'What is left today?' },
      mood: 'any',
      order: MEMBER_ORDER_BASE,
      userId: MEMBER,
      enabled: true,
    });
    expect(await repository.findOwn(MEMBER, id)).toMatchObject({ userId: MEMBER });
  });

  /** A retried add is the same row written over itself, not a second chip. */
  it('treats a retried add as a no-op', async () => {
    const id = newId();
    const input = { userId: MEMBER, id, scope: 'coach' as const, text: 'How is my sleep?' };

    await handler.add(input);
    await handler.add(input);

    expect(repository.rows.size).toBe(1);
  });

  /**
   * A member cannot remove a seeded global, cannot remove another member's, and
   * **cannot tell the two apart**.
   *
   * The identical error is deliberate. A distinct "that one is the Owner's"
   * would tell a member which ids exist globally, and there is nothing they
   * could do with the answer. Asserting the messages are *equal* is the only way
   * to pin that: two different messages would both still be errors, both still
   * refuse the delete, and both still pass a test that only checked the type.
   */
  it('refuses to remove a seeded global or another member’s, indistinguishably', async () => {
    const global = question({ id: newId() });
    const theirs = question({ id: newId(), userId: OTHER });
    await repository.save(global);
    await repository.save(theirs);

    const onGlobal = await handler.remove(MEMBER, global.id).catch((error: Error) => error);
    const onTheirs = await handler.remove(MEMBER, theirs.id).catch((error: Error) => error);

    expect(onGlobal).toBeInstanceOf(QuickQuestionNotYours);
    expect(onTheirs).toBeInstanceOf(QuickQuestionNotYours);
    // The same shape of answer for both, with only the id the member already
    // knows in it.
    expect((onGlobal as Error).message.replace(global.id, '<id>')).toBe(
      (onTheirs as Error).message.replace(theirs.id, '<id>'),
    );
    // And both rows are still there.
    expect(repository.rows.size).toBe(2);
  });

  it('removes the member’s own', async () => {
    const id = newId();
    await handler.add({ userId: MEMBER, id, scope: 'coach', text: 'How is my sleep?' });

    await handler.remove(MEMBER, id);

    expect(await repository.findOwn(MEMBER, id)).toBeNull();
  });
});

// ------------------------------------------------------------ the mood adapter

/**
 * `RhythmLatestCheckin`: the mood the list query reads, and the window it reads
 * it over.
 *
 * The two collaborators are cast stubs rather than real handlers, and that is
 * the right shape here: what is under test is the adapter's *own* arithmetic —
 * which local dates it asks for and which of the rows it gets back it picks —
 * and building a real `CheckinsQueryHandler` over a real repository would put a
 * second component's date filtering between the assertion and the thing being
 * asserted. The stub records the range it was handed and filters by it, so the
 * window is checked directly.
 */
describe('the mood the questions are ordered by', () => {
  function adapter(rows: CheckinView[], timezone = CAIRO) {
    const asked: Array<{ from: string; to: string }> = [];
    const checkins = {
      handle: async (_userId: string, from: string, to: string): Promise<CheckinView[]> => {
        asked.push({ from, to });
        return rows.filter((row) => row.date >= from && row.date <= to);
      },
    } as unknown as CheckinsQueryHandler;
    const profiles = {
      profile: async () => ({ timezone }),
    } as unknown as ProfileQueryHandler;
    return { port: new RhythmLatestCheckin(checkins, profiles), asked };
  }

  /** A local date, offset from today in the member's own zone. */
  function daysAgo(days: number): string {
    return localDate(new Date(Date.now() - days * 86_400_000), CAIRO);
  }

  /**
   * Fourteen days, and a mood from twenty days ago does not count.
   *
   * The window is what stops a stale mood steering the chips for ever. A member
   * who had one bad day three weeks ago and has not answered since is not
   * having a bad day now, and offering them the gentle questions indefinitely
   * would read as the app having decided something about them.
   */
  it('does not read a mood from outside the fourteen-day window', async () => {
    const { port, asked } = adapter([checkin({ date: daysAgo(20), mood: 15 })]);

    expect(await port.latestMood(MEMBER)).toBeNull();
    expect(asked[0]).toEqual({ from: daysAgo(14), to: daysAgo(0) });
  });

  it('reads a mood from inside the window', async () => {
    const { port } = adapter([checkin({ date: daysAgo(13), mood: 15 })]);

    expect(await port.latestMood(MEMBER)).toBe(15);
  });

  /**
   * A verdict-only row is not a mood.
   *
   * The two halves of a check-in arrive by different routes — a one-word reply
   * in the coach chat carries a verdict and no mood, the card on the phone can
   * carry a mood and no verdict — so a row with `adhered` set and `mood` null is
   * the ordinary case. An adapter that read `row.mood ?? 0` off it would greet a
   * member who answered "yes, did everything" with the lighter-day questions,
   * which is the opposite of what they said.
   */
  it('does not count a row that carries a verdict and no mood', async () => {
    const { port } = adapter([checkin({ date: daysAgo(1), adhered: true })]);

    expect(await port.latestMood(MEMBER)).toBeNull();
  });

  /**
   * The newest row *with* a mood wins, even when a newer row has none.
   *
   * Not simply the newest row: a member who answered "yes" in the chat today
   * and moved the mood slider yesterday **has** a mood, and it is yesterday's.
   * Taking the newest row and reading its null would throw away the only mood
   * they ever gave, and the chips would silently revert to the plain order the
   * moment they typed a one-word reply.
   */
  it('picks the newest row that actually carries a mood', async () => {
    const { port } = adapter([
      checkin({ date: daysAgo(3), mood: 90 }),
      checkin({ date: daysAgo(2), mood: 30 }),
      checkin({ date: daysAgo(0), adhered: true }),
    ]);

    expect(await port.latestMood(MEMBER)).toBe(30);
  });

  /** Nothing recorded at all is no mood, not a middling one. */
  it('has no mood for a member who has never answered', async () => {
    const { port } = adapter([]);

    expect(await port.latestMood(MEMBER)).toBeNull();
  });
});

// ------------------------------------------------------------------- helpers

function checkin(overrides: Partial<CheckinView> & { date: string }): CheckinView {
  return { mood: null, adhered: null, note: null, ...overrides };
}

function enAr(text: string): { en: string; ar: string } {
  return { en: text, ar: `${text} (ar)` };
}

function en(row: QuickQuestion): string {
  return row.text.en;
}
