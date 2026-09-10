import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuditPort, type AuditEntry } from '../../shared/audit/audit.port.js';
import type { Principal } from '../../shared/auth/principal.js';
import { InMemorySettingsStore } from '../../shared/settings/in-memory-settings.store.js';
import { SettingsService } from '../../shared/settings/settings.service.js';
import { NudgeService, roomForUser } from '../../ws/nudge.service.js';
import type { TurnEvents, TurnRequest, TurnRunner } from './application/turn-runner.js';
import { ChatGateway, type ChatSocket } from './features/send-message/chat.gateway.js';

/**
 * `ChatGateway`: the socket's two messages, and the translation between the
 * runner's vocabulary and the wire's.
 *
 * ## Why the frame shapes are asserted literally
 *
 * Translating domain names into `contracts/ws-chat.md`'s names is the *whole
 * job* of this class — `seq` becomes `userSeq` on `chat.accepted` and
 * `assistantSeq` on `chat.done`, `from`/`to` become
 * `fromConversationId`/`toConversationId`, and an action's `kind` becomes
 * `type`. Every one of those renames is a place where a plausible-looking
 * refactor breaks every client at once and nothing on the server notices: the
 * turn still runs, the answer is still stored, the socket still emits a frame
 * with the right name and the wrong keys, and the phone renders an empty
 * bubble. So the payloads are asserted key by key rather than "a chat.done was
 * emitted".
 *
 * ## The runner is faked, the nudge service is not
 *
 * `TurnRunner` is faked because what is under test here is the transport: which
 * frames leave, on which socket, and what the ack says. `NudgeService` is the
 * real one over a recording broadcaster, because the assertion worth making
 * about a nudge is that it went to the member's *room* — `user:<id>`, so all of
 * their devices hear it — and a fake of the service itself would let the
 * gateway emit to the wrong room with the spec still green.
 */

const MEMBER = 'member-1';
const OTHER = 'member-2';

function member(id: string): Principal {
  return { kind: 'user', id, role: 'user' };
}

const MACHINE: Principal = {
  kind: 'service',
  id: 'n8n',
  name: 'n8n',
  scopes: ['chat:write'],
};

class SilentAudit extends AuditPort {
  async record(_entry: AuditEntry): Promise<void> {}
}

/** A socket that records rather than sends, over the interface the gateway exports. */
function socket(principal?: Principal): ChatSocket & {
  frames: Array<{ event: string; payload: unknown }>;
} {
  const frames: Array<{ event: string; payload: unknown }> = [];
  return {
    id: `socket-${principal?.id ?? 'anonymous'}`,
    data: principal ? { principal } : {},
    emit(event: string, payload?: unknown) {
      frames.push({ event, payload });
      return true;
    },
    frames,
  };
}

/**
 * The runner, faked.
 *
 * Cast rather than subclassed: `TurnRunner`'s constructor takes twelve
 * collaborators and none of them would be exercised, so building a real one
 * here would be twelve stubs of ceremony to reach a method this replaces
 * entirely. `turn-runner.spec.ts` is where the real one is held to its
 * behaviour.
 */
class FakeRunner {
  readonly runs: Array<{ request: TurnRequest; events: TurnEvents }> = [];
  behaviour: (request: TurnRequest, events: TurnEvents) => Promise<void> = async () => {};

  async run(request: TurnRequest, events: TurnEvents): Promise<void> {
    this.runs.push({ request, events });
    await this.behaviour(request, events);
  }

  get port(): TurnRunner {
    return this as unknown as TurnRunner;
  }

  signalOf(userId: string, requestId: string): AbortSignal | undefined {
    return this.runs.find(
      (run) => run.request.userId === userId && run.request.requestId === requestId,
    )?.request.signal;
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
  gateway: ChatGateway;
  runner: FakeRunner;
  rooms: RecordingSockets;
  settings: SettingsService;
}

function bench(): Bench {
  const runner = new FakeRunner();
  const rooms = new RecordingSockets();
  const nudges = new NudgeService();
  nudges.attach(rooms);
  const settings = new SettingsService(new InMemorySettingsStore(), new SilentAudit());
  return {
    gateway: new ChatGateway(runner.port, nudges, settings),
    runner,
    rooms,
    settings,
  };
}

/**
 * The turn is deliberately **not awaited before the ack** — awaiting a model
 * for thirty seconds would hold the Socket.IO ack open and the client would
 * look frozen — so the `finally` that emits the nudge runs a tick or two after
 * `send` resolves. A macrotask is enough and does not depend on how many
 * microtasks the chain happens to contain.
 */
function settle(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}

/** A turn that never finishes, so `chat.cancel` has something live to abort. */
const NEVER = (): Promise<void> => new Promise<void>(() => {});

function body(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    requestId: 'request-1',
    conversationId: 'conversation-1',
    text: 'How am I doing?',
    ...overrides,
  };
}

describe('chat.send: what it refuses', () => {
  let harness: Bench;

  beforeEach(() => {
    harness = bench();
  });

  /**
   * The handshake already authenticated this socket, so this check is the belt
   * rather than the braces — and it is worth having exactly because of that.
   * An unauthenticated socket reaching this line would be a bug in the
   * middleware in `ws/socket.gateway.ts`, and the cost of being wrong is a
   * stranger writing into somebody's chat. `runs` staying empty is the half
   * that matters: refusing after starting the turn would be the same defect
   * with a nicer ack.
   */
  it('refuses a socket with no principal and runs no turn', async () => {
    const client = socket();

    await expect(harness.gateway.send(body(), client)).resolves.toEqual({
      ok: false,
      error: 'unauthorized',
    });
    expect(harness.runner.runs).toEqual([]);
  });

  /**
   * A service token is refused on `/ws` at the handshake, and refused again
   * here. A machine principal has no `userId` to own a conversation, so the
   * alternative is a turn attributed to `n8n` writing into nobody's chat.
   */
  it('refuses a service principal', async () => {
    const client = socket(MACHINE);

    await expect(harness.gateway.send(body(), client)).resolves.toEqual({
      ok: false,
      error: 'unauthorized',
    });
    expect(harness.runner.runs).toEqual([]);
  });

  it.each([
    ['no requestId', { requestId: undefined }],
    ['no conversationId', { conversationId: undefined }],
    ['no text', { text: undefined }],
    ['an empty text', { text: '' }],
    /*
     * Whitespace is the case a `!text` check alone lets through: `'   '` is a
     * non-empty string, so it passes the presence test, reaches the runner,
     * gets stored as a member message and is handed to a model that answers a
     * sentence about nothing. The member sees a blank bubble in their own
     * transcript that they cannot delete, because messages are immutable.
     */
    ['whitespace only', { text: '   \n\t ' }],
    ['a requestId that is not a string', { requestId: 42 }],
  ])('refuses %s', async (_name, overrides) => {
    const client = socket(member(MEMBER));

    await expect(harness.gateway.send(body(overrides), client)).resolves.toEqual({
      ok: false,
      error: 'bad_request',
    });
    expect(harness.runner.runs).toEqual([]);
  });
});

describe('chat.send: the per-minute limit', () => {
  let harness: Bench;

  beforeEach(() => {
    harness = bench();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('lets the allowance through and refuses the next one', async () => {
    await harness.settings.setSystem('chat.ratePerMin', 3);
    const client = socket(member(MEMBER));

    for (let index = 0; index < 3; index += 1) {
      await expect(
        harness.gateway.send(body({ requestId: `request-${index}` }), client),
      ).resolves.toEqual({ ok: true });
    }

    await expect(
      harness.gateway.send(body({ requestId: 'request-3' }), client),
    ).resolves.toEqual({ ok: false, error: 'rate_limited' });

    // The refusal reaches the member as a frame as well as an ack, because the
    // ack is not something a chat screen renders.
    expect(client.frames.at(-1)).toEqual({
      event: 'chat.error',
      payload: { requestId: 'request-3', code: 'rate_limited', message: expect.any(String) },
    });
    expect(harness.runner.runs).toHaveLength(3);
  });

  /**
   * The window slides; it is not a fixed bucket.
   *
   * A fixed minute bucket — `Math.floor(now / 60_000)` as the key — lets a
   * member send twice the limit across a boundary: the whole allowance in the
   * last second of one minute and the whole allowance again in the first second
   * of the next. For a limit whose entire purpose is protecting one GPU from a
   * runaway client, that is the case that matters and it is the only case a
   * bucket gets wrong.
   *
   * So the assertion is the pair. At 59.999 s after the first message the
   * member is still refused — a bucket would very likely have rolled over by
   * then, because the bucket boundary has nothing to do with when *they*
   * started. At 60.001 s the oldest message has aged out and they are let
   * through again, which is what makes it a limit rather than a lockout.
   */
  it('refuses just inside the minute and allows just outside it', async () => {
    await harness.settings.setSystem('chat.ratePerMin', 3);
    const client = socket(member(MEMBER));
    const start = Date.now();
    const clock = vi.spyOn(Date, 'now').mockReturnValue(start);

    for (let index = 0; index < 3; index += 1) {
      await harness.gateway.send(body({ requestId: `request-${index}` }), client);
    }

    clock.mockReturnValue(start + 59_999);
    await expect(
      harness.gateway.send(body({ requestId: 'inside' }), client),
    ).resolves.toEqual({ ok: false, error: 'rate_limited' });

    clock.mockReturnValue(start + 60_001);
    await expect(
      harness.gateway.send(body({ requestId: 'outside' }), client),
    ).resolves.toEqual({ ok: true });

    expect(harness.runner.runs.map((run) => run.request.requestId)).toEqual([
      'request-0',
      'request-1',
      'request-2',
      'outside',
    ]);
  });

  /** One member's flood is not another's. The window is keyed by member. */
  it('keeps two members’ allowances apart', async () => {
    await harness.settings.setSystem('chat.ratePerMin', 1);
    const mine = socket(member(MEMBER));
    const theirs = socket(member(OTHER));

    await harness.gateway.send(body(), mine);
    await expect(harness.gateway.send(body({ requestId: 'r2' }), mine)).resolves.toEqual({
      ok: false,
      error: 'rate_limited',
    });
    await expect(harness.gateway.send(body(), theirs)).resolves.toEqual({ ok: true });
  });
});

describe('chat.cancel', () => {
  let harness: Bench;

  beforeEach(() => {
    harness = bench();
    harness.runner.behaviour = NEVER;
  });

  /**
   * The live map is keyed by `<userId>:<requestId>` and **not** by the request
   * id alone.
   *
   * A request id is minted by a client, so two members can present the same one
   * — by accident, since a client is free to use a counter, or on purpose. A
   * map keyed on the id alone would let anybody stop anybody else's answer
   * mid-sentence by guessing `request-1`, and the victim would see a truncated
   * reply with no explanation. The compound key is also the ownership check,
   * which is why `cancel` needs no separate one — and why this spec asserts on
   * the *signal* rather than on the ack: a gateway that returned `{ok:false}`
   * and aborted anyway would pass a weaker test.
   */
  it('does not let one member cancel another member’s request of the same id', async () => {
    const theirs = socket(member(OTHER));
    await harness.gateway.send(body({ requestId: 'shared' }), theirs);

    const mine = socket(member(MEMBER));
    expect(harness.gateway.cancel({ requestId: 'shared' }, mine)).toEqual({ ok: false });

    expect(harness.runner.signalOf(OTHER, 'shared')?.aborted).toBe(false);
  });

  it('aborts the member’s own live turn', async () => {
    const client = socket(member(MEMBER));
    await harness.gateway.send(body({ requestId: 'mine' }), client);

    expect(harness.gateway.cancel({ requestId: 'mine' }, client)).toEqual({ ok: true });
    expect(harness.runner.signalOf(MEMBER, 'mine')?.aborted).toBe(true);
  });

  it('answers a requestId it has never seen with ok false', () => {
    const client = socket(member(MEMBER));

    expect(harness.gateway.cancel({ requestId: 'nothing' }, client)).toEqual({ ok: false });
  });

  it('answers an unauthenticated cancel with ok false', () => {
    expect(harness.gateway.cancel({ requestId: 'anything' }, socket())).toEqual({ ok: false });
  });

  /**
   * A finished turn is not cancellable, because the map entry is removed in the
   * `finally`. Worth pinning: a gateway that leaked entries would hold an
   * `AbortController` per turn for the life of the process, and `chat.cancel`
   * on an old id would abort nothing while reporting success.
   */
  it('forgets a turn once it has finished', async () => {
    harness.runner.behaviour = async () => {};
    const client = socket(member(MEMBER));
    await harness.gateway.send(body({ requestId: 'done' }), client);
    await settle();

    expect(harness.gateway.cancel({ requestId: 'done' }, client)).toEqual({ ok: false });
  });
});

describe('the frames on the wire', () => {
  let harness: Bench;

  beforeEach(() => {
    harness = bench();
  });

  /**
   * Every rename in one place, asserted literally against
   * `contracts/ws-chat.md`.
   *
   * `chat.accepted` carries `userSeq` and `chat.done` carries `assistantSeq` —
   * both are the runner's `seq`, and a gateway that passed `seq` straight
   * through would emit a frame the phone parses into `undefined` and renders as
   * a bubble with no content. `chat.done`'s `actions` carry `type`, not the
   * domain's `kind`, for the same reason: a client branching on
   * `action.type === 'task.created'` sees nothing at all.
   *
   * The frames go to the socket that asked and not to the room (SC-007): a
   * member with a phone and a laptop asking two different questions must get
   * two answers, each where it was asked. Only `chat.message` and `sync.nudge`
   * are room traffic.
   */
  it('translates every frame into the contract’s own names', async () => {
    harness.runner.behaviour = async (request, events) => {
      events.accepted({
        requestId: request.requestId,
        conversationId: 'conversation-1',
        seq: 41,
      });
      events.intent({ requestId: request.requestId, name: 'set_task', scope: 'planning' });
      events.moved({
        requestId: request.requestId,
        from: 'conversation-1',
        to: 'conversation-2',
        title: 'the tallest building in the',
      });
      events.token({ requestId: request.requestId, text: 'Added ' });
      events.card({
        requestId: request.requestId,
        kind: 'tasks',
        items: [{ id: 'task-1', title: 'buy milk', at: null }],
      });
      events.done({
        requestId: request.requestId,
        conversationId: 'conversation-2',
        seq: 42,
        usage: { model: 'qwen', promptTokens: 100, completionTokens: 20, ms: 900 },
        actions: [{ kind: 'task.created', id: 'task-1' }],
      });
    };
    const client = socket(member(MEMBER));

    await harness.gateway.send(body(), client);
    await settle();

    expect(client.frames).toEqual([
      {
        event: 'chat.accepted',
        payload: { requestId: 'request-1', conversationId: 'conversation-1', userSeq: 41 },
      },
      {
        event: 'chat.intent',
        payload: { requestId: 'request-1', intent: 'set_task', scope: 'planning' },
      },
      {
        event: 'chat.moved',
        payload: {
          requestId: 'request-1',
          fromConversationId: 'conversation-1',
          toConversationId: 'conversation-2',
          title: 'the tallest building in the',
        },
      },
      { event: 'chat.token', payload: { requestId: 'request-1', text: 'Added ' } },
      {
        event: 'chat.card',
        payload: {
          requestId: 'request-1',
          kind: 'tasks',
          items: [{ id: 'task-1', title: 'buy milk', at: null }],
        },
      },
      {
        event: 'chat.done',
        payload: {
          requestId: 'request-1',
          assistantSeq: 42,
          usage: { model: 'qwen', promptTokens: 100, completionTokens: 20, ms: 900 },
          actions: [{ type: 'task.created', id: 'task-1' }],
        },
      },
    ]);
  });

  /**
   * `usage` and an action's `id` are omitted rather than sent as null. A client
   * branching on `'usage' in frame` is the ordinary way to write this, and a
   * `usage: null` would make every turn look metered.
   */
  it('omits usage and a missing action id rather than sending null', async () => {
    harness.runner.behaviour = async (request, events) => {
      events.done({
        requestId: request.requestId,
        conversationId: 'conversation-1',
        seq: 7,
        actions: [{ kind: 'meeting.declined' }],
      });
    };
    const client = socket(member(MEMBER));

    await harness.gateway.send(body(), client);
    await settle();

    expect(client.frames[0]).toEqual({
      event: 'chat.done',
      payload: {
        requestId: 'request-1',
        assistantSeq: 7,
        actions: [{ type: 'meeting.declined' }],
      },
    });
  });

  it('passes an error through with its code intact', async () => {
    harness.runner.behaviour = async (request, events) => {
      events.error({
        requestId: request.requestId,
        code: 'forbidden',
        message: 'That conversation is not yours.',
      });
    };
    const client = socket(member(MEMBER));

    await harness.gateway.send(body(), client);
    await settle();

    expect(client.frames).toEqual([
      {
        event: 'chat.error',
        payload: {
          requestId: 'request-1',
          code: 'forbidden',
          message: 'That conversation is not yours.',
        },
      },
    ]);
  });

  /** A client sends `composedAt` as an ISO string; anything unparseable is simply absent. */
  it('reads composedAt from an ISO string and drops one it cannot parse', async () => {
    const client = socket(member(MEMBER));
    const typedAt = new Date(Date.now() - 3 * 60 * 60_000);

    await harness.gateway.send(
      body({ requestId: 'r1', composedAt: typedAt.toISOString(), clientId: 'client-1' }),
      client,
    );
    await harness.gateway.send(body({ requestId: 'r2', composedAt: 'yesterday' }), client);

    expect(harness.runner.runs[0]?.request.composedAt).toEqual(typedAt);
    expect(harness.runner.runs[0]?.request.clientId).toBe('client-1');
    expect(harness.runner.runs[1]?.request.composedAt).toBeUndefined();
  });
});

describe('the nudge after a turn', () => {
  let harness: Bench;

  beforeEach(() => {
    harness = bench();
  });

  /**
   * FR-021: a device that disconnects mid-answer must not stop the answer — it
   * is finished, stored, and the member's other devices are told there is
   * something to pull.
   *
   * The nudge goes out **whatever happened**, which is the part worth pinning.
   * Sending it only on a successful turn would be the obvious reading and it is
   * wrong twice over: a turn that ended in `model_unavailable` still stored the
   * member's own message, and a turn that ended in an allergen apology stored
   * an answer. Either way there is a row the other devices do not have. A
   * member with two devices open wants the second one to catch up too, and the
   * nudge is idempotent by design, so sending it unconditionally costs nothing.
   *
   * To the **room**, not to the socket: the socket that asked already has every
   * frame, and the whole point is the devices that were not part of the turn.
   */
  it('nudges the member’s room after a turn that succeeded', async () => {
    const client = socket(member(MEMBER));

    await harness.gateway.send(body(), client);
    await settle();

    expect(harness.rooms.frames).toEqual([
      {
        room: roomForUser(MEMBER),
        event: 'sync.nudge',
        payload: { entities: ['messages'], reason: 'server_job' },
      },
    ]);
  });

  it('nudges the member’s room after a turn that errored', async () => {
    harness.runner.behaviour = async (request, events) => {
      events.error({
        requestId: request.requestId,
        code: 'model_unavailable',
        message: 'The model is not answering right now.',
      });
    };
    const client = socket(member(MEMBER));

    await harness.gateway.send(body(), client);
    await settle();

    expect(harness.rooms.frames.map((frame) => frame.event)).toEqual(['sync.nudge']);
  });

  /**
   * Even a turn that threw past its own error handling. `TurnRunner` reports
   * through `events.error`, so anything reaching the gateway's `catch` escaped
   * it — and a rejected floating promise is an unhandled rejection that takes
   * the process down in Node 24. The nudge still goes out, because whatever
   * else happened the member's message was appended before the throw.
   */
  it('nudges, and does not crash, when a turn throws past its own handler', async () => {
    harness.runner.behaviour = async () => {
      throw new Error('the runner itself broke');
    };
    const client = socket(member(MEMBER));

    await expect(harness.gateway.send(body(), client)).resolves.toEqual({ ok: true });
    await settle();

    expect(harness.rooms.frames.map((frame) => frame.event)).toEqual(['sync.nudge']);
  });

  /** A refused turn never ran, so there is nothing to pull and no nudge. */
  it('does not nudge for a turn that was never started', async () => {
    await harness.settings.setSystem('chat.ratePerMin', 1);
    const client = socket(member(MEMBER));
    await harness.gateway.send(body({ requestId: 'r1' }), client);
    await settle();
    harness.rooms.frames.length = 0;

    await harness.gateway.send(body({ requestId: 'r2' }), client);
    await settle();

    expect(harness.rooms.frames).toEqual([]);
  });
});
