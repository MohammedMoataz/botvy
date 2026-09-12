import { beforeEach, describe, expect, it } from 'vitest';
import type { DomainEvent } from '../../shared/cqrs/domain-event.js';
import {
  MemberContextPort,
  type MemberAlertPreferences,
  type MemberClock,
} from '../../shared/member/member-context.port.js';
import { InMemoryUnitOfWork } from '../../shared/persistence/memory/in-memory-unit-of-work.js';
import { localDate } from '../../shared/time/time.js';
import {
  AiSuggestionsPort,
  KnowledgeTranscriptPort,
  SuggestionDrafterPort,
  type DraftAttempt,
  type DraftSource,
} from './domain/knowledge.ports.js';
import { Link } from './domain/link.aggregate.js';
import { Reading } from './domain/reading.js';
import { SuggestionRuleError } from './domain/suggestion.aggregate.js';
import {
  AcceptSuggestionHandler,
  DismissSuggestionHandler,
  RecordSuggestionOutcomeHandler,
} from './features/accept-suggestion/accept-suggestion.handler.js';
import {
  GenerateSuggestionSaga,
  tagsFor,
} from './features/generate-suggestion/generate-suggestion.saga.js';
import { SuggestionsQueryHandler } from './features/suggestions/suggestions.query.js';
import {
  InMemoryLinkRepository,
  InMemoryReadingRepository,
  InMemorySuggestionRepository,
  InnerLinkStore,
  InnerReadingStore,
  InnerSuggestionStore,
} from './infrastructure/in-memory-knowledge.repositories.js';

/**
 * Suggestions: what the member is shown, and everything that stops one.
 *
 * Most of this file is about the *nots*. FR-009 and story 3 between them ask for
 * one thing to happen and five not to, and every one of the five is a decision
 * somebody could reverse without noticing — so each has a case naming what it
 * protects rather than what it does.
 */

const MEMBER = 'member-1';
const CAIRO = 'Africa/Cairo';
const SESSION = 'session-1';
const LINK_A = '0192f100-0000-7000-8000-000000000a01';
const LINK_B = '0192f100-0000-7000-8000-000000000a02';

class FixedMemberContext extends MemberContextPort {
  async clock(): Promise<MemberClock> {
    return { timezone: CAIRO };
  }
  async alertPreferences(): Promise<MemberAlertPreferences> {
    return { leadTimes: [], quietHours: { from: '22:00', to: '07:00' } };
  }
}

class SwitchablePreference extends AiSuggestionsPort {
  enabled = true;
  asked = 0;
  async enabledFor(): Promise<boolean> {
    this.asked += 1;
    return this.enabled;
  }
}

class ScriptedDrafter extends SuggestionDrafterPort {
  seen: DraftSource[][] = [];
  answer: DraftAttempt = {
    draft: {
      title: 'Upper body',
      focus: 'push',
      exercises: [
        {
          name: 'Bench press',
          notes: null,
          sets: [
            {
              targetReps: 8,
              targetWeightKg: 60,
              targetDurationSec: null,
              targetDistanceM: null,
            },
          ],
        },
      ],
    },
    rationale: 'From the split you saved.',
    plainReply: null,
    model: 'test-model',
    tokens: 40,
  };

  async draft(input: { sources: DraftSource[] }): Promise<DraftAttempt> {
    this.seen.push(input.sources);
    return this.answer;
  }
}

class RecordingTranscript extends KnowledgeTranscriptPort {
  readonly written: string[] = [];
  async append(input: { content: string }): Promise<{ seq: number } | null> {
    this.written.push(input.content);
    return { seq: this.written.length };
  }
}

function harness() {
  const uow = new InMemoryUnitOfWork();
  const links = new InMemoryLinkRepository(new InnerLinkStore(uow));
  const readings = new InMemoryReadingRepository(new InnerReadingStore(uow));
  const suggestions = new InMemorySuggestionRepository(
    new InnerSuggestionStore(uow),
  );
  const preference = new SwitchablePreference();
  const drafter = new ScriptedDrafter();
  const transcript = new RecordingTranscript();

  let next = 0;
  const saga = new GenerateSuggestionSaga(
    uow,
    links,
    readings,
    suggestions,
    preference,
    drafter,
    transcript,
    new FixedMemberContext(),
    () => {
      next += 1;
      return `suggestion-${next}`;
    },
  );

  return {
    uow,
    links,
    readings,
    suggestions,
    preference,
    drafter,
    transcript,
    saga,
    accept: new AcceptSuggestionHandler(uow, suggestions),
    dismiss: new DismissSuggestionHandler(uow, suggestions),
    outcomes: new RecordSuggestionOutcomeHandler(uow, suggestions),
    query: new SuggestionsQueryHandler(suggestions, links),
  };
}

/**
 * A session three days out, built from `Date.now()`.
 *
 * Three days rather than a written date, and comfortably past the day's lead
 * time so the "too soon" branch is not accidentally the one under test. A
 * fixture pinned to a real date is a time bomb.
 */
function sessionScheduled(
  overrides: Record<string, unknown> = {},
  daysAhead = 3,
): DomainEvent {
  return {
    eventId: 'evt-1',
    name: 'training.SessionScheduled',
    context: 'training',
    aggregate: { type: 'session', id: SESSION },
    userId: MEMBER,
    occurredAt: new Date(),
    payload: {
      sessionId: SESSION,
      plannedAt: new Date(Date.now() + daysAhead * 24 * 60 * 60 * 1000),
      durationMin: 60,
      sport: 'gym',
      title: 'gym',
      focus: 'upper body',
      status: 'planned',
      suggestionId: null,
      ...overrides,
    },
    schemaVersion: 1,
  };
}

async function savedReading(
  h: ReturnType<typeof harness>,
  id: string,
  tags: string[],
): Promise<void> {
  const link = Link.save({
    id,
    userId: MEMBER,
    url: `https://example.com/${id}`,
    normalizedUrl: `https://example.com/${id}`,
    kind: 'article',
    externalId: null,
    parentLinkId: null,
    title: `Piece ${id}`,
    tags,
    addedAt: new Date(),
    createdAt: new Date(),
  });
  link.beginFetch();
  link.beginExtract(`Piece ${id}`);
  link.beginSummarise();
  link.finish(`doc-${id}`);

  await h.uow.run(async () => {
    await h.links.save(link);
    await h.readings.save(
      Reading.record({
        id: `doc-${id}`,
        userId: MEMBER,
        linkId: id,
        sourceUrl: `https://example.com/${id}`,
        title: `Piece ${id}`,
        author: null,
        publishedAt: null,
        text: 'the whole article',
        transcript: null,
        summary: 'Bench, rows, and a lot of them.',
        keyPoints: ['bench heavy'],
        media: [],
        durationSec: null,
        model: 'test-model',
        tokens: 10,
        createdAt: new Date(),
      }),
    );
  });
  h.uow.events.length = 0;
}

// --------------------------------------------------------------------- T730

describe('proposing a session', () => {
  let h: ReturnType<typeof harness>;

  beforeEach(async () => {
    h = harness();
    await savedReading(h, LINK_A, ['gym']);
  });

  it('drafts one from the member’s own sources and cites them', async () => {
    const outcome = await h.saga.onSessionScheduled(sessionScheduled());
    expect(outcome).toEqual({ generated: true, reason: 'created' });

    const [stored] = await h.suggestions.listFor(MEMBER, 'pending');
    expect(stored!.sport).toBe('gym');
    expect(stored!.sessionId).toBe(SESSION);
    expect(stored!.draft.exercises).toHaveLength(1);
    // The citation is the saga's list, never the model's: a model that invented
    // an id would otherwise cite somebody else's reading, or nothing.
    expect(stored!.sourceLinkIds).toEqual([LINK_A]);
    // The member's own local date, not the server's.
    expect(stored!.forDate).toBe(
      localDate(new Date(Date.now() + 3 * 24 * 60 * 60 * 1000), CAIRO),
    );

    const ready = h.uow.events.find(
      (event) => event.name === 'knowledge.SuggestionReady',
    );
    expect(ready?.payload).toMatchObject({ sport: 'gym', sessionId: SESSION });
  });

  it('runs nothing at all for a member who turned suggestions off', async () => {
    h.preference.enabled = false;

    const outcome = await h.saga.onSessionScheduled(sessionScheduled());
    expect(outcome).toEqual({ generated: false, reason: 'disabled' });

    /*
     * SC-003's second half, asserted as work rather than as output.
     *
     * "Zero suggestions **and no background work runs for them**" — so the
     * claim under test is that the link store was never touched, not merely
     * that nothing was written. A version that gathered five readings, asked
     * the model and then discarded the answer would pass an output-only check
     * and fail this one, which is the whole point.
     */
    expect(h.drafter.seen).toEqual([]);
    expect(await h.suggestions.listFor(MEMBER)).toEqual([]);
    expect(h.uow.events).toEqual([]);
  });

  it('leaves a session the member has no time to change alone', async () => {
    // FR-009: at least a day away. A card about this evening's session is an
    // interruption rather than a help — they have already packed their bag.
    const outcome = await h.saga.onSessionScheduled(
      sessionScheduled({}, 0),
    );
    expect(outcome.reason).toBe('too_soon');
    // Cheaper than the preference read, and checked first for that reason.
    expect(h.preference.asked).toBe(0);
  });

  it('invents nothing when the member has saved nothing relevant', async () => {
    // Story 3 scenario 3, and the claim the whole feature makes to the member:
    // this came from what *you* saved.
    const outcome = await h.saga.onSessionScheduled(
      sessionScheduled({ sport: 'swimming', focus: null }),
    );
    expect(outcome.reason).toBe('no_sources');
    expect(h.drafter.seen).toEqual([]);
  });

  it('does not propose twice about one session, even after a dismissal', async () => {
    await h.saga.onSessionScheduled(sessionScheduled());
    const [first] = await h.suggestions.listFor(MEMBER, 'pending');
    await h.dismiss.handle(MEMBER, first!.id);

    // FR-010: a dismissed suggestion must not return for the same session —
    // which is the whole reason a dismissal is a row rather than a delete.
    const again = await h.saga.onSessionScheduled(sessionScheduled());
    expect(again.reason).toBe('already_proposed');
    expect(await h.suggestions.listFor(MEMBER)).toHaveLength(1);
  });

  it('does not suggest over a session that is itself a suggestion', async () => {
    const outcome = await h.saga.onSessionScheduled(
      sessionScheduled({ suggestionId: 'suggestion-1' }),
    );
    expect(outcome.reason).toBe('from_suggestion');
  });

  it('ignores a session that is no longer planned', async () => {
    const outcome = await h.saga.onSessionScheduled(
      sessionScheduled({ status: 'cancelled' }),
    );
    expect(outcome.reason).toBe('not_a_session');
  });

  it('stores nothing when the draft will not decode, and says so in the chat', async () => {
    // The constitution's plain-reply exit. A half-parsed draft must never
    // become exercises the member can accept, and the only honest home for a
    // plain reply about their training material is the coach chat.
    h.drafter.answer = {
      draft: null,
      rationale: '',
      plainReply: 'Your split suggests three pressing movements this week.',
      model: 'test-model',
      tokens: 10,
    };

    const outcome = await h.saga.onSessionScheduled(sessionScheduled());
    expect(outcome.reason).toBe('no_draft');
    expect(await h.suggestions.listFor(MEMBER)).toEqual([]);
    expect(h.transcript.written).toHaveLength(1);
    expect(h.transcript.written[0]).toContain('three pressing movements');
    // The message names its sources, like every other thing this context says.
    expect(h.transcript.written[0]).toContain('Piece');
  });

  it('says nothing when the model decoded and had nothing to suggest', async () => {
    h.drafter.answer = {
      draft: null,
      rationale: '',
      plainReply: null,
      model: 'test-model',
      tokens: 5,
    };

    await h.saga.onSessionScheduled(sessionScheduled());
    // Nothing happened that the member needs to know about.
    expect(h.transcript.written).toEqual([]);
  });

  it('skips a source whose document has gone', async () => {
    // A link marked `done` whose reading was purged: the model would otherwise
    // be handed a citation with nothing to cite.
    await savedReading(h, LINK_B, ['gym']);
    await h.uow.run(() => h.readings.removeForLinks(MEMBER, [LINK_B]));

    await h.saga.onSessionScheduled(sessionScheduled());
    const [stored] = await h.suggestions.listFor(MEMBER, 'pending');
    expect(stored!.sourceLinkIds).toEqual([LINK_A]);
  });
});

describe('which sources match', () => {
  it('takes the sport and the substantial words of the focus', () => {
    expect(tagsFor('Gym', 'upper body')).toEqual(['gym', 'upper', 'body']);
  });

  it('drops the short words, which are prepositions rather than subjects', () => {
    expect(tagsFor('gym', 'day of the legs')).toEqual(['gym', 'legs']);
  });

  it('has nothing but the sport when there is no focus', () => {
    expect(tagsFor('swimming', null)).toEqual(['swimming']);
  });
});

// --------------------------------------------------------------- T731, T734

describe('accepting and dismissing', () => {
  let h: ReturnType<typeof harness>;
  let suggestionId: string;

  beforeEach(async () => {
    h = harness();
    await savedReading(h, LINK_A, ['gym']);
    await h.saga.onSessionScheduled(sessionScheduled());
    suggestionId = (await h.suggestions.listFor(MEMBER, 'pending'))[0]!.id;
    h.uow.events.length = 0;
  });

  it('announces the whole draft, because Training cannot read it', async () => {
    const result = await h.accept.handle(MEMBER, suggestionId);
    // Defaults to the session it was suggested for, which is the case that
    // actually happens.
    expect(result.sessionId).toBe(SESSION);

    const accepted = h.uow.events.find(
      (event) => event.name === 'knowledge.SuggestionAccepted',
    )!;
    const payload = accepted.payload as {
      sessionId: string;
      draft: { exercises: unknown[] };
      sourceLinkIds: string[];
    };
    expect(payload.sessionId).toBe(SESSION);
    // The widening this phase makes to `contracts/events.md`, and the reason
    // for it: its own consumer column says Training fills a session, and there
    // is no session content in `{ suggestionId, sessionId }`.
    expect(payload.draft.exercises).toHaveLength(1);
    expect(payload.sourceLinkIds).toEqual([LINK_A]);

    // And this context dispatched no Training command and touched no session.
    expect(new Set(h.uow.events.map((event) => event.context))).toEqual(
      new Set(['knowledge']),
    );
  });

  it('accepts into a session the member chose instead', async () => {
    const result = await h.accept.handle(MEMBER, suggestionId, 'session-other');
    expect(result.sessionId).toBe('session-other');
  });

  it('refuses a second acceptance', async () => {
    await h.accept.handle(MEMBER, suggestionId);
    await expect(h.accept.handle(MEMBER, suggestionId)).rejects.toThrow(
      SuggestionRuleError,
    );
    await expect(h.dismiss.handle(MEMBER, suggestionId)).rejects.toMatchObject({
      code: 'not_pending',
    });
  });

  it('records what became of the session it produced', async () => {
    await h.accept.handle(MEMBER, suggestionId);

    await h.outcomes.handle({
      eventId: 'evt-2',
      name: 'training.SessionSkipped',
      context: 'training',
      aggregate: { type: 'session', id: SESSION },
      userId: MEMBER,
      occurredAt: new Date(),
      payload: { sessionId: SESSION, at: new Date() },
      schemaVersion: 1,
    });

    const [stored] = await h.suggestions.listFor(MEMBER, 'accepted');
    // The only evidence this product has that a suggestion was a bad one.
    expect(stored!.outcome).toBe('skipped');
  });

  it('is silent about a session no suggestion produced', async () => {
    // The normal case: almost no session in the installation came from one, so
    // a miss must not be a warning.
    await expect(
      h.outcomes.handle({
        eventId: 'evt-3',
        name: 'training.SessionCompleted',
        context: 'training',
        aggregate: { type: 'session', id: 'session-elsewhere' },
        userId: MEMBER,
        occurredAt: new Date(),
        payload: { sessionId: 'session-elsewhere', at: new Date() },
        schemaVersion: 1,
      }),
    ).resolves.toBeUndefined();
  });

  it('writes nothing on a redelivered outcome', async () => {
    await h.accept.handle(MEMBER, suggestionId);
    const event: DomainEvent = {
      eventId: 'evt-4',
      name: 'training.SessionCompleted',
      context: 'training',
      aggregate: { type: 'session', id: SESSION },
      userId: MEMBER,
      occurredAt: new Date(),
      payload: { sessionId: SESSION, at: new Date() },
      schemaVersion: 1,
    };
    await h.outcomes.handle(event);
    const after = (await h.suggestions.listFor(MEMBER, 'accepted'))[0]!;
    const stamp = after.updatedAt.getTime();

    // The relay is at-least-once, so a repeat must not bump `updatedAt` and
    // push a pointless delta at every device.
    await h.outcomes.handle(event);
    expect(
      (await h.suggestions.listFor(MEMBER, 'accepted'))[0]!.updatedAt.getTime(),
    ).toBe(stamp);
  });

  it('shows the member what it was drawn from', async () => {
    const [view] = await h.query.list(MEMBER, 'pending');
    expect(view!.sources).toEqual([
      { id: LINK_A, url: `https://example.com/${LINK_A}`, title: `Piece ${LINK_A}` },
    ]);
    expect(view!.rationale).toBe('From the split you saved.');
  });

  it('drops a cited source the member has since deleted', async () => {
    const link = (await h.links.findById(MEMBER, LINK_A))!;
    await h.uow.run(async () => {
      link.tombstone();
      await h.links.save(link);
    });

    const [view] = await h.query.list(MEMBER, 'pending');
    expect(view!.sources).toEqual([]);
    // The rationale still names it, which is the honest outcome: the
    // suggestion *was* made from that reading.
    expect(view!.rationale).toBe('From the split you saved.');
  });
});
