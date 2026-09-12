import { beforeEach, describe, expect, it } from 'vitest';
import {
  EVENT_SCHEMA_VERSION,
  type DomainEvent,
} from '../../shared/cqrs/domain-event.js';
import { newId } from '../../shared/cqrs/ids.js';
import { OperationsPurgeOnDeletedHandler } from './features/purge-on-deleted/purge-on-deleted.handler.js';
import { RecordUsageHandler } from './features/record-usage/record-usage.handler.js';
import { UsageTodayQueryHandler } from './features/usage-today/usage-today.query.js';
import { InMemoryUsageRepository } from './infrastructure/in-memory-usage.repository.js';

const MEMBER = 'member-1';
const OTHER = 'member-2';

const DAY_MS = 24 * 60 * 60 * 1000;

/*
 * Relative to the run's own clock, never a pinned date.
 *
 * A fixture dated in the future starts failing the day the clock reaches it,
 * and one dated in the past starts failing the day the retention would have
 * removed it. This suite is also about day boundaries, which is the shape of
 * fixture most likely to be written as a literal — so `NOON` is a real instant
 * somewhere inside an arbitrary day, and both midnights are derived from it.
 */
const NOON = new Date(Date.now());
const DAY_START = new Date(NOON.getTime() - 6 * 60 * 60 * 1000);
const DAY_END = new Date(DAY_START.getTime() + DAY_MS);
const PREVIOUS_DAY_START = new Date(DAY_START.getTime() - DAY_MS);

interface Bench {
  usage: InMemoryUsageRepository;
  record: RecordUsageHandler;
  query: UsageTodayQueryHandler;
  purge: OperationsPurgeOnDeletedHandler;
}

function bench(): Bench {
  const usage = new InMemoryUsageRepository();
  return {
    usage,
    record: new RecordUsageHandler(usage),
    query: new UsageTodayQueryHandler(usage),
    purge: new OperationsPurgeOnDeletedHandler(usage),
  };
}

/**
 * A `conversations.MessageSent` as the relay hands it over.
 *
 * Built here rather than imported from Conversations: nothing in this context
 * may import that one, and the agreement between the two halves of the loop is
 * the event catalogue, not a shared TypeScript type. Which makes this literal
 * the test of that agreement as well — if the payload's shape changes on the
 * other side and this fixture does not, the loop breaks and this suite is where
 * it shows.
 */
function messageSent(input: {
  userId?: string | null;
  at?: Date;
  eventId?: string;
  usage?: {
    model: string;
    promptTokens: number;
    completionTokens: number;
    ms: number;
  } | null;
}): DomainEvent {
  return {
    eventId: input.eventId ?? newId(),
    name: 'conversations.MessageSent',
    context: 'conversations',
    aggregate: { type: 'message', id: newId() },
    userId: input.userId === undefined ? MEMBER : input.userId,
    occurredAt: input.at ?? NOON,
    payload: {
      conversationId: 'conversation-1',
      seq: 1,
      role: 'assistant',
      usage:
        input.usage === undefined
          ? {
              model: 'qwen2.5:3b',
              promptTokens: 300,
              completionTokens: 120,
              ms: 900,
            }
          : input.usage,
    },
    schemaVersion: EVENT_SCHEMA_VERSION,
  };
}

describe('the usage loop', () => {
  let b: Bench;

  beforeEach(() => {
    b = bench();
  });

  describe('recording a turn', () => {
    it('writes one row per assistant turn', async () => {
      await expect(b.record.handle(messageSent({}))).resolves.toBe('recorded');
      await expect(b.record.handle(messageSent({}))).resolves.toBe('recorded');

      expect(b.usage.rows).toHaveLength(2);
      expect(b.usage.rows[0]).toMatchObject({
        userId: MEMBER,
        kind: 'chat',
        model: 'qwen2.5:3b',
        promptTokens: 300,
        completionTokens: 120,
      });
    });

    it('stamps the row with the turn, not with now', async () => {
      // The relay may be hours behind. `createdAt` decides which local day the
      // tokens count against, so it has to be the turn's own moment — a
      // catch-up after an outage would otherwise bill yesterday to today and
      // the member would wake to an allowance already spent.
      const yesterday = new Date(PREVIOUS_DAY_START.getTime() + 60_000);
      await b.record.handle(messageSent({ at: yesterday }));

      expect(b.usage.rows[0]!.createdAt).toEqual(yesterday);
    });

    it('counts a replayed event once', async () => {
      // The relay delivers at least once. Two turns and a redelivery of the
      // first make two rows, not three: a double-counted event is
      // indistinguishable from a real turn once written, so the member's
      // allowance would run out early for reasons nobody could reconstruct.
      const first = messageSent({});
      const second = messageSent({});

      await b.record.handle(first);
      await b.record.handle(second);
      await expect(b.record.handle(first)).resolves.toBe('already-recorded');

      expect(b.usage.rows).toHaveLength(2);
    });

    it('writes nothing for the member own turn', async () => {
      // `usage` is null on the member's message, which costs nothing to
      // produce. A row of zeroes would make the collection's row count
      // meaningless for every later reader.
      await expect(b.record.handle(messageSent({ usage: null }))).resolves.toBe(
        'no-usage',
      );

      expect(b.usage.rows).toHaveLength(0);
    });

    it('records nothing when the event names no member', async () => {
      // No allowance to charge it to. Logged rather than thrown: the member
      // already has their answer, and failing the relay would replay the whole
      // event for ever.
      await expect(
        b.record.handle(messageSent({ userId: null })),
      ).resolves.toBe('no-usage');

      expect(b.usage.rows).toHaveLength(0);
    });
  });

  describe('the daily total', () => {
    beforeEach(async () => {
      await b.record.handle(messageSent({}));
      await b.record.handle(messageSent({}));
    });

    it('sums prompt and completion tokens over the window', async () => {
      // Both halves counted: an allowance that ignored the prompt would let a
      // member spend the model's whole context on every turn for free.
      await expect(
        b.query.tokensBetween(MEMBER, DAY_START, DAY_END),
      ).resolves.toBe(2 * (300 + 120));
    });

    it('returns zero for the day before', async () => {
      // The window is what defines "today", and yesterday's window must not
      // see today's rows — otherwise the quota never resets.
      await expect(
        b.query.tokensBetween(MEMBER, PREVIOUS_DAY_START, DAY_START),
      ).resolves.toBe(0);
    });

    it('excludes a turn stamped exactly on the closing midnight', async () => {
      // Half-open `[from, to)`. `to` is tomorrow's midnight, so a turn made at
      // that instant belongs to tomorrow; counting it in both days would charge
      // one turn twice.
      await b.record.handle(messageSent({ at: DAY_END }));

      await expect(
        b.query.tokensBetween(MEMBER, DAY_START, DAY_END),
      ).resolves.toBe(2 * (300 + 120));
      await expect(
        b.query.tokensBetween(
          MEMBER,
          DAY_END,
          new Date(DAY_END.getTime() + DAY_MS),
        ),
      ).resolves.toBe(300 + 120);
    });

    it('counts only the member asked about', async () => {
      await expect(
        b.query.tokensBetween(OTHER, DAY_START, DAY_END),
      ).resolves.toBe(0);
    });

    it('refuses an inverted window rather than reporting nothing spent', async () => {
      // Zero is the one wrong answer this query must never give quietly: it
      // reads as "spent nothing", so every turn is let through and the limit
      // silently does not exist.
      await expect(
        b.query.tokensBetween(MEMBER, DAY_END, DAY_START),
      ).rejects.toThrow(/from < to/);
    });
  });

  describe('a deleted member', () => {
    it('loses every usage row, and nobody else does', async () => {
      await b.record.handle(messageSent({}));
      await b.record.handle(messageSent({ userId: OTHER }));

      const event: DomainEvent = {
        eventId: newId(),
        name: 'identity.UserDeleted',
        context: 'identity',
        aggregate: { type: 'user', id: MEMBER },
        userId: MEMBER,
        occurredAt: NOON,
        payload: {},
        schemaVersion: EVENT_SCHEMA_VERSION,
      };

      await expect(b.purge.handle(event)).resolves.toBe('purged');
      expect(b.usage.rows.map((row) => row.userId)).toEqual([OTHER]);

      // Idempotent: the relay delivers at least once, and the second delivery
      // reports nothing rather than failing the whole event and replaying the
      // other five purge handlers with it.
      await expect(b.purge.handle(event)).resolves.toBe('nothing-to-do');
    });
  });
});
