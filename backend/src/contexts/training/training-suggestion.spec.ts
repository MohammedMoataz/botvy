import { beforeEach, describe, expect, it } from 'vitest';
import type { DomainEvent } from '../../shared/cqrs/domain-event.js';
import { InMemoryUnitOfWork } from '../../shared/persistence/memory/in-memory-unit-of-work.js';
import { Session } from './domain/session.aggregate.js';
import { ApplySuggestionHandler } from './features/apply-suggestion/apply-suggestion.handler.js';
import { InMemorySessionRepository } from './infrastructure/in-memory-training.repositories.js';

/**
 * Training's side of a suggestion the member accepted (P7).
 *
 * The direction is the point of this file: Knowledge says what happened,
 * **Training** fills the session. A Knowledge handler dispatching a Training
 * command would be the same constitution IX violation wearing a bus, and one
 * opening `sessions` would be the plain version of it. Nothing in either
 * context imports the other; they meet in the relay's dispatch table.
 */

const MEMBER = 'member-1';
const SESSION_ID = '0192f100-0000-7000-8000-000000000c91';
const SUGGESTION = 'suggestion-1';

function harness() {
  const uow = new InMemoryUnitOfWork();
  const sessions = new InMemorySessionRepository(uow);
  let next = 0;
  return {
    uow,
    sessions,
    handler: new ApplySuggestionHandler(uow, sessions, () => {
      next += 1;
      return `exercise-${next}`;
    }),
  };
}

function planned(): Session {
  return Session.plan({
    id: SESSION_ID,
    userId: MEMBER,
    // Two days out, built from `Date.now()`: a fixture pinned to a real date is
    // a time bomb.
    plannedAt: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000),
    durationMin: 60,
    sport: 'gym',
    title: 'gym',
    focus: null,
    programId: null,
    weekIndex: null,
    slotId: 'slot-monday',
    suggestionId: null,
    exercises: [],
    notes: null,
    createdAt: new Date(),
  });
}

function accepted(overrides: Record<string, unknown> = {}): DomainEvent {
  return {
    eventId: 'evt-1',
    name: 'knowledge.SuggestionAccepted',
    context: 'knowledge',
    aggregate: { type: 'suggestion', id: SUGGESTION },
    userId: MEMBER,
    occurredAt: new Date(),
    payload: {
      suggestionId: SUGGESTION,
      sessionId: SESSION_ID,
      forDate: '2026-01-01',
      sport: 'gym',
      draft: {
        title: 'Upper body',
        focus: 'push',
        exercises: [
          {
            name: 'Bench press',
            notes: 'pause at the chest',
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
      sourceLinkIds: ['link-1'],
      ...overrides,
    },
    schemaVersion: 1,
  };
}

describe('a suggestion the member accepted', () => {
  let h: ReturnType<typeof harness>;

  beforeEach(async () => {
    h = harness();
    await h.uow.run(() => h.sessions.save(planned()));
    h.uow.events.length = 0;
  });

  it('fills the session and records where the content came from', async () => {
    await h.handler.handle(accepted());

    const session = (await h.sessions.findById(MEMBER, SESSION_ID))!;
    expect(session.title).toBe('Upper body');
    expect(session.focus).toBe('push');
    expect(session.suggestionId).toBe(SUGGESTION);
    expect(session.exercises).toHaveLength(1);
    expect(session.exercises[0]!.name).toBe('Bench press');

    // Fresh ids, minted here: a member editing this session afterwards must not
    // rewrite the suggestion they accepted.
    expect(session.exercises[0]!.id).toBe('exercise-1');

    const set = session.exercises[0]!.sets[0]!;
    expect(set.targetReps).toBe(8);
    // A suggestion is about a session that has not happened, so nothing is
    // logged and nothing is ticked.
    expect(set.actualReps).toBeNull();
    expect(set.done).toBe(false);
  });

  it('announces, because the title is the alert’s label', async () => {
    await h.handler.handle(accepted());

    const rescheduled = h.uow.events.find(
      (event) => event.name === 'training.SessionRescheduled',
    )!;
    expect(rescheduled).toBeDefined();
    // The payload carries the suggestion, which is the field
    // `contracts/events.md` promised in P0 and nothing wrote until now — and
    // what stops Knowledge suggesting over its own answer.
    expect(rescheduled.payload).toMatchObject({
      sessionId: SESSION_ID,
      title: 'Upper body',
      suggestionId: SUGGESTION,
    });
  });

  it('clears the program, so the nightly pass leaves it alone', async () => {
    // A session that came from a suggestion belongs to no program and no week.
    // Leaving them set would have the materialiser decide later that this
    // session is filled wrongly and rewrite it.
    const session = (await h.sessions.findById(MEMBER, SESSION_ID))!;
    session.fillFromProgram(
      {
        title: 'Week 1',
        focus: 'legs',
        programId: 'program-1',
        weekIndex: 0,
        exercises: [],
      },
    );
    await h.uow.run(() => h.sessions.save(session));

    await h.handler.handle(accepted());
    const after = (await h.sessions.findById(MEMBER, SESSION_ID))!;
    expect(after.programId).toBeNull();
    expect(after.weekIndex).toBeNull();
  });

  it('writes nothing on a redelivered event', async () => {
    await h.handler.handle(accepted());
    const first = (await h.sessions.findById(MEMBER, SESSION_ID))!;
    const stamp = first.updatedAt.getTime();
    const ids = first.exercises.map((exercise) => exercise.id);
    h.uow.events.length = 0;

    // The relay is at-least-once. Without the guard a repeat would mint fresh
    // exercise ids and push a delta at every device for a change that was not
    // one.
    await h.handler.handle(accepted());
    const again = (await h.sessions.findById(MEMBER, SESSION_ID))!;
    expect(again.updatedAt.getTime()).toBe(stamp);
    expect(again.exercises.map((exercise) => exercise.id)).toEqual(ids);
    expect(h.uow.events).toEqual([]);
  });

  it('leaves a session that has gone alone rather than inventing one', async () => {
    const session = (await h.sessions.findById(MEMBER, SESSION_ID))!;
    await h.uow.run(async () => {
      session.tombstone();
      await h.sessions.save(session);
    });
    h.uow.events.length = 0;

    // Creating a replacement would mean inventing an hour of the day the member
    // never chose, and principle XI is the rule that hours belong to them.
    await h.handler.handle(accepted());
    expect(h.uow.events).toEqual([]);
  });

  it('ignores an event with no draft or no session', async () => {
    await h.handler.handle(accepted({ draft: undefined }));
    await h.handler.handle(accepted({ sessionId: null }));
    expect(h.uow.events).toEqual([]);
    expect((await h.sessions.findById(MEMBER, SESSION_ID))!.title).toBe('gym');
  });
});
