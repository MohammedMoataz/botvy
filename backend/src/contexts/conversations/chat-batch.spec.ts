import { beforeEach, describe, expect, it } from 'vitest';
import { NudgeService, roomForUser } from '../../ws/nudge.service.js';
import type { TurnEvents, TurnRequest, TurnRunner } from './application/turn-runner.js';
import {
  BatchHandler,
  MAX_BATCH,
  type BatchMessage,
} from './features/batch/batch.handler.js';

/**
 * The offline flush: messages typed without a network, replayed when it comes
 * back.
 *
 * ## The rule this file exists to hold
 *
 * **One reply per conversation, not one per message.** A member who typed four
 * things into the coach chat on a train does not want four answers when they
 * reconnect — they want one, about the four. So the batch groups by
 * conversation and runs *one turn* per group.
 *
 * That is a rule about a *count*, which is exactly the kind nothing else
 * catches. A handler that ran one turn per message would look correct on every
 * screen: the messages are all stored, every one gets an answer, the
 * transcript reads in order. What the member sees is a wall of four replies
 * they have to scroll past to reach the current one, and what the GPU sees is
 * four times the work. `runs.length` is the whole assertion.
 *
 * ## Understood as of when it was typed
 *
 * FR-007, and the surprising half: "remind me in two hours", typed at 14:10 and
 * delivered at 20:00, resolves to 16:10 — which is in the past. That is the
 * correct reading, the executor refuses a past moment and asks, and resolving
 * against 20:00 instead would silently create a 22:00 reminder the member never
 * wanted and would not find out about until it fired.
 *
 * Every instant here is relative to `Date.now()`. A pinned fixture in a file
 * about wall clocks starts failing the day the clock reaches it.
 */

const MEMBER = 'member-1';
const COACH = 'conversation-coach';
const PLANNER = 'conversation-planner';
const FREE = 'conversation-free';

/**
 * The runner, faked, with per-conversation behaviour.
 *
 * Cast rather than subclassed for the same reason as in the gateway spec:
 * `TurnRunner` takes twelve collaborators and this replaces the one method that
 * uses them. What is under test here is the grouping, the ordering and the
 * collection of a turn's events into a REST reply — none of which involves a
 * model, a store or a socket.
 */
class FakeRunner {
  readonly runs: Array<{ request: TurnRequest; now: Date }> = [];
  /** Keyed by conversation id, so a spec can make one turn behave differently. */
  readonly behaviour = new Map<
    string,
    (request: TurnRequest, events: TurnEvents) => void
  >();
  fallback: (request: TurnRequest, events: TurnEvents) => void = (request, events) => {
    events.token({ requestId: request.requestId, text: `answering: ${request.text}` });
    events.done({
      requestId: request.requestId,
      conversationId: request.conversationId,
      seq: 100 + this.runs.length,
      actions: [],
    });
  };

  async run(request: TurnRequest, events: TurnEvents, now = new Date()): Promise<void> {
    this.runs.push({ request, now });
    (this.behaviour.get(request.conversationId) ?? this.fallback)(request, events);
  }

  get port(): TurnRunner {
    return this as unknown as TurnRunner;
  }
}

class RecordingSockets {
  readonly frames: Array<{ room: string; event: string; payload: unknown }> = [];

  to(room: string) {
    return {
      emit: (event: string, payload: unknown) => {
        this.frames.push({ room, event, payload });
      },
    };
  }
}

interface Bench {
  handler: BatchHandler;
  runner: FakeRunner;
  rooms: RecordingSockets;
}

function bench(): Bench {
  const runner = new FakeRunner();
  const rooms = new RecordingSockets();
  const nudges = new NudgeService();
  nudges.attach(rooms);
  return { handler: new BatchHandler(runner.port, nudges), runner, rooms };
}

/** Minutes before now, so nothing in this file is pinned to a date. */
function minutesAgo(minutes: number): Date {
  return new Date(Date.now() - minutes * 60_000);
}

function message(overrides: Partial<BatchMessage> = {}): BatchMessage {
  return {
    clientId: 'client-1',
    conversationId: COACH,
    text: 'How am I doing?',
    composedAt: minutesAgo(30),
    ...overrides,
  };
}

describe('flushing an offline batch', () => {
  let harness: Bench;

  beforeEach(() => {
    harness = bench();
  });

  /**
   * Three conversations, three replies, three turns — not one turn per message.
   *
   * The two `coach` messages are the point: they are answered *together*. A
   * handler that ran the turn per message would produce four replies here and
   * every other assertion in the file would still hold.
   */
  it('answers each conversation once, however many messages it holds', async () => {
    const result = await harness.handler.handle(MEMBER, [
      message({ clientId: 'a', conversationId: COACH, text: 'how did I do today' }),
      message({ clientId: 'b', conversationId: PLANNER, text: 'remind me to call Dad' }),
      message({ clientId: 'c', conversationId: COACH, text: 'and yesterday' }),
      message({ clientId: 'd', conversationId: FREE, text: 'what is the tallest building' }),
    ]);

    expect(harness.runner.runs).toHaveLength(3);
    expect(result.replies.map((reply) => reply.conversationId)).toEqual([
      COACH,
      PLANNER,
      FREE,
    ]);
    // Each reply is the answer to the chat it belongs to, and the coach reply
    // consumed both of that chat's client ids.
    expect(result.replies[0]?.clientIds).toEqual(['a', 'c']);
    expect(result.replies[1]?.clientIds).toEqual(['b']);
    expect(result.accepted.sort()).toEqual(['a', 'b', 'c', 'd']);
  });

  /**
   * Oldest first, and understood as of the **first** thing they said.
   *
   * The messages arrive in whatever order the phone's flush loop produced —
   * which is not necessarily the order they were typed — so the sort is real
   * work rather than a formality. Two things depend on it: the joined text
   * reads as they wrote it (a model handed "and yesterday / how did I do today"
   * answers a different question), and `composedAt` is the earliest of the
   * group, which is what FR-007 fixes as the moment the turn is understood as
   * of.
   */
  it('joins a conversation’s messages oldest first and dates the turn from the first', async () => {
    const first = minutesAgo(90);
    const second = minutesAgo(45);

    await harness.handler.handle(MEMBER, [
      message({ clientId: 'later', text: 'and yesterday', composedAt: second }),
      message({ clientId: 'earlier', text: 'how did I do today', composedAt: first }),
    ]);

    const [run] = harness.runner.runs;
    expect(run?.request.text).toBe('how did I do today\nand yesterday');
    expect(run?.request.composedAt).toEqual(first);
    // And the turn is attributed to the earliest message's client id, so a
    // replayed flush is idempotent against the same row.
    expect(run?.request.clientId).toBe('earlier');
  });

  /**
   * More than `MAX_BATCH` is capped rather than refused.
   *
   * `contracts/rest-commands.md` fixes the ceiling and a client sending more is
   * broken — but a member whose broken client sends 200 messages should get the
   * first twenty answered, not a rejected flush and a phone that retries the
   * same 200 for ever. The cap is also what stops one request occupying the one
   * GPU for an hour.
   */
  it('caps the flush at MAX_BATCH', async () => {
    const messages = Array.from({ length: MAX_BATCH + 5 }, (_, index) =>
      message({
        clientId: `client-${index}`,
        conversationId: `conversation-${index}`,
        composedAt: minutesAgo(MAX_BATCH + 5 - index),
      }),
    );

    const result = await harness.handler.handle(MEMBER, messages);

    expect(harness.runner.runs).toHaveLength(MAX_BATCH);
    expect(result.replies).toHaveLength(MAX_BATCH);
    expect(result.accepted).toHaveLength(MAX_BATCH);
  });

  /**
   * A turn that errored is **not** in `accepted`.
   *
   * `accepted` is what the phone clears from its outbox, so a client id listed
   * there for a message that was never stored is a message the member loses
   * silently — it disappears from the phone and never appears in the
   * transcript. `forbidden` and `quota` are exactly the two turns that store
   * nothing, and both are ordinary rather than exceptional: a stale
   * conversation id in an offline outbox is what a member gets for deleting a
   * chat on their laptop.
   */
  it('leaves an errored conversation’s messages out of accepted', async () => {
    harness.runner.behaviour.set(PLANNER, (request, events) => {
      events.error({
        requestId: request.requestId,
        code: 'forbidden',
        message: 'That conversation is not yours.',
      });
    });

    const result = await harness.handler.handle(MEMBER, [
      message({ clientId: 'kept', conversationId: COACH }),
      message({ clientId: 'refused', conversationId: PLANNER }),
    ]);

    expect(result.accepted).toEqual(['kept']);
    expect(result.replies[1]?.error).toEqual({
      code: 'forbidden',
      message: 'That conversation is not yours.',
    });
    // The reply still comes back, so the client can show *why* rather than
    // retrying a message that will be refused for ever.
    expect(result.replies).toHaveLength(2);
  });

  /**
   * A turn moved off-topic during the flush names the **new** conversation.
   *
   * The reply is the only thing telling the phone where the answer went, and
   * the phone was offline when the chat was created — so it has no row for it
   * and no other way to find out until its next full sync. A reply that named
   * the conversation the member typed into would put the answer somewhere the
   * client cannot render it, which looks like a message that vanished.
   */
  it('names the conversation an off-topic turn was moved into', async () => {
    harness.runner.behaviour.set(COACH, (request, events) => {
      events.moved({
        requestId: request.requestId,
        from: COACH,
        to: 'conversation-new',
        title: 'what is the tallest building',
      });
      events.token({ requestId: request.requestId, text: 'The Burj Khalifa.' });
      events.done({
        requestId: request.requestId,
        conversationId: 'conversation-new',
        seq: 12,
        actions: [],
      });
    });

    const result = await harness.handler.handle(MEMBER, [
      message({ clientId: 'a', text: 'what is the tallest building in the world' }),
    ]);

    expect(result.replies[0]?.conversationId).toBe('conversation-new');
    expect(result.replies[0]?.reply).toBe('The Burj Khalifa.');
    expect(result.replies[0]?.assistantSeq).toBe(12);
  });

  /**
   * The collector accumulates tokens rather than dropping them, and that is
   * what makes a templated confirmation come back at all.
   *
   * `ws-chat.md` requires an action's confirmation to arrive as `chat.token` +
   * `chat.done` so clients render one path — which means the *only* place the
   * text exists is the token stream. A collector that ignored tokens and read
   * some `reply` field off `done` would return an empty string for every action
   * the planner carried out, and the member's phone would show a blank answer
   * to "remind me to call Dad".
   */
  it('collects a templated confirmation’s tokens into the reply', async () => {
    harness.runner.behaviour.set(PLANNER, (request, events) => {
      events.card({
        requestId: request.requestId,
        kind: 'reminders',
        items: [{ id: 'reminder-1', title: 'call Dad', at: null }],
      });
      events.token({ requestId: request.requestId, text: 'Reminder set for 5:00 pm: call Dad.' });
      events.done({
        requestId: request.requestId,
        conversationId: PLANNER,
        seq: 9,
        actions: [{ kind: 'reminder.created', id: 'reminder-1' }],
      });
    });

    const result = await harness.handler.handle(MEMBER, [
      message({ clientId: 'a', conversationId: PLANNER, text: 'remind me to call Dad at 5' }),
    ]);

    expect(result.replies[0]?.reply).toBe('Reminder set for 5:00 pm: call Dad.');
    expect(result.replies[0]?.card).toEqual({
      kind: 'reminders',
      items: [{ id: 'reminder-1', title: 'call Dad', at: null }],
    });
  });
});

describe('the nudge after a flush', () => {
  let harness: Bench;

  beforeEach(() => {
    harness = bench();
  });

  /**
   * One nudge for the whole batch, not one per conversation.
   *
   * Three replies arriving is *one* event from the member's point of view, and
   * the nudge is a "there is something to pull" rather than a description of
   * what changed — so three of them would make three devices each run three
   * identical syncs. The flush usually comes over REST from the device that was
   * offline; the nudge exists for their *other* devices, which know nothing
   * about it and would otherwise only see the messages on their next poll.
   */
  it('sends exactly one nudge for a flush spanning three conversations', async () => {
    await harness.handler.handle(MEMBER, [
      message({ clientId: 'a', conversationId: COACH }),
      message({ clientId: 'b', conversationId: PLANNER }),
      message({ clientId: 'c', conversationId: FREE }),
    ]);

    expect(harness.rooms.frames).toEqual([
      {
        room: roomForUser(MEMBER),
        event: 'sync.nudge',
        payload: { entities: ['messages'], reason: 'remote_edit' },
      },
    ]);
  });

  /**
   * And none at all when nothing was accepted. A nudge for a flush that stored
   * nothing tells every device to pull and find exactly what it already had —
   * which on a metered connection is a member paying for the platform's
   * confusion.
   */
  it('sends no nudge when every turn was refused', async () => {
    harness.runner.fallback = (request, events) => {
      events.error({ requestId: request.requestId, code: 'quota', message: 'over allowance' });
    };

    const result = await harness.handler.handle(MEMBER, [
      message({ clientId: 'a', conversationId: COACH }),
      message({ clientId: 'b', conversationId: PLANNER }),
    ]);

    expect(result.accepted).toEqual([]);
    expect(harness.rooms.frames).toEqual([]);
  });

  it('sends no nudge for an empty flush, and runs no turn', async () => {
    const result = await harness.handler.handle(MEMBER, []);

    expect(result).toEqual({ accepted: [], replies: [] });
    expect(harness.runner.runs).toEqual([]);
    expect(harness.rooms.frames).toEqual([]);
  });
});
