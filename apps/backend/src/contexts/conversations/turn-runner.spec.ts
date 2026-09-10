import { beforeEach, describe, expect, it } from 'vitest';
import { AuditPort, type AuditEntry } from '../../shared/audit/audit.port.js';
import { newId } from '../../shared/cqrs/ids.js';
import {
  OllamaClient,
  type ChatMessage,
  type ChatOptions,
  type ChatUsage,
} from '../../shared/llm/ollama.client.js';
import { InMemoryUnitOfWork } from '../../shared/persistence/memory/in-memory-unit-of-work.js';
import { InMemorySettingsStore } from '../../shared/settings/in-memory-settings.store.js';
import { SettingsService } from '../../shared/settings/settings.service.js';
import { localDate, wallClockToUtc } from '../../shared/time/time.js';
import { NudgeService } from '../../ws/nudge.service.js';
import { TurnRunner, type TurnEvents, type TurnRequest } from './application/turn-runner.js';
import {
  AllergenGuardPort,
  CheckinPort,
  IntentExecutorPort,
  IntentExtractorPort,
  MemberFactsPort,
  PromptAssemblerPort,
  UsagePort,
  type AllergenScan,
  type CheckinCapture,
  type ExecutionResult,
  type MemberFacts,
} from './domain/chat.ports.js';
import { Conversation, type ConversationKind } from './domain/conversation.aggregate.js';
import { PLAIN_CHAT, type Intent, type IntentScope } from './domain/intent.js';
import { AppendMessageHandler } from './features/append-message/append-message.handler.js';
import {
  InMemoryConversationRepository,
  InMemoryMessageRepository,
  InMemorySeq,
} from './infrastructure/in-memory-conversations.repositories.js';

/**
 * The spine of the phase: `TurnRunner.run` and the order it takes its steps in.
 *
 * ## Why this file is the one that has to exist
 *
 * v1 had an 802-line `ChatService` with two entry points that each
 * reimplemented the same tail, and they drifted — the offline replay path
 * stopped doing things the live path did and nobody noticed, because both
 * "worked" if you only looked at a screen. The runner exists so there is one
 * ordering; this spec exists so the ordering is *checkable*. Almost every
 * assertion below is about a step that must happen **before** another one, and
 * an ordering defect is invisible from the outside: a quota checked after the
 * message was stored still refuses the turn, and it also fills a member's
 * conversation with messages nobody ever answered.
 *
 * ## Never a real model, never a real store
 *
 * `StubLlm` extends the real `OllamaClient` and overrides `chat`, with a
 * `fetch` that throws if anything reaches it — so a spec that accidentally
 * exercised a code path calling the base class fails loudly rather than
 * hanging on a socket to a machine that is not there. The repositories are the
 * in-memory adapters this context ships, and `AppendMessageHandler` is the
 * real one: the assertions about *what was stored* are worth nothing if the
 * storing is faked.
 *
 * ## Every instant derives from `Date.now()`
 *
 * Never a literal. This phase compares wall clocks — the daily allowance is
 * summed over the member's own local day — so a fixture pinned to a real date
 * starts failing the day the clock reaches it, and one pinned to a past date
 * starts failing when a government changes that year's daylight-saving rule
 * underneath it. Both have happened to this codebase's zones.
 */

const MEMBER = 'member-1';
const OTHER = 'member-2';
const CAIRO = 'Africa/Cairo';
const BERLIN = 'Europe/Berlin';

// ------------------------------------------------------------------ fixtures

/** A wall-clock time on a named local date, as an instant. */
function atWallClock(date: string, hhmm: string, zone: string): Date {
  const instant = wallClockToUtc(`${date}T${hhmm}`, zone);
  if (!instant) throw new Error(`cannot resolve ${date}T${hhmm} in ${zone}`);
  return instant;
}

function nextLocalDate(date: string): string {
  const at = new Date(`${date}T00:00:00Z`);
  at.setUTCDate(at.getUTCDate() + 1);
  return at.toISOString().slice(0, 10);
}

/**
 * The first instant, on or after today, that is 00:30 in `ahead` and still the
 * *previous* calendar day in `behind`.
 *
 * Found by asking the zones rather than by assuming an offset, and that is not
 * pedantry. Egypt's daylight saving runs from the last Friday of April to the
 * last Thursday of October and the EU's from the last Sunday of March to the
 * last Sunday of October, so for roughly four weeks each spring Cairo and
 * Berlin sit on the *same* UTC offset and share a midnight. A fixture that
 * hard-coded "Cairo is an hour ahead" would pass all year and fail every April
 * — which is the shape of failure this codebase has already been bitten by
 * twice, and the reason `rhythm-clock.spec.ts` finds its spring-forward date by
 * scanning instead of naming a Sunday.
 *
 * Throws rather than returning null: two zones that never disagree about the
 * date would mean this fixture is asserting nothing, and a silent skip is how
 * a test stops being a test.
 */
function acrossMidnight(ahead: string, behind: string): Date {
  let date = localDate(new Date(), ahead);
  for (let index = 0; index < 400; index += 1) {
    const at = atWallClock(date, '00:30', ahead);
    if (localDate(at, ahead) !== localDate(at, behind)) return at;
    date = nextLocalDate(date);
  }
  throw new Error(`${ahead} and ${behind} never disagree about the date`);
}

/** The instant that member's own local day begins, containing `now`. */
function localMidnight(now: Date, zone: string): Date {
  return atWallClock(localDate(now, zone), '00:00', zone);
}

function intent(overrides: Partial<Intent> = {}): Intent {
  return { ...PLAIN_CHAT, ...overrides };
}

// --------------------------------------------------------------------- stubs

class SilentAudit extends AuditPort {
  async record(_entry: AuditEntry): Promise<void> {}
}

/**
 * The model, replaced at the class rather than at `fetch`.
 *
 * `chat-application.spec.ts` stubs `fetch` instead, because there it is the
 * client's own parsing that is under test. Here nothing about the HTTP shape
 * matters and everything about *whether the model was called at all* does —
 * FR-006's "an action never reaches the model" is an assertion on
 * `calls.length`, and a stubbed `fetch` would answer it only indirectly.
 *
 * The `fetch` handed to the base constructor throws, so a path that slipped
 * past this override fails immediately instead of opening a socket to a
 * machine that is not there and timing out thirty seconds later.
 */
class StubLlm extends OllamaClient {
  readonly calls: Array<{ messages: ChatMessage[]; options: ChatOptions }> = [];
  chunks: string[] = ['You are ', 'doing well.'];
  usage: ChatUsage | null = {
    model: 'stub',
    promptTokens: 100,
    completionTokens: 20,
    ms: 12,
  };
  failWith: Error | null = null;
  /** Called after each chunk is handed over, so a spec can abort mid-stream. */
  onChunk: ((index: number) => void) | null = null;

  constructor() {
    super('http://model.invalid', (() => {
      throw new Error('a spec must never reach a real model');
    }) as unknown as typeof fetch);
  }

  override async *chat(
    messages: ChatMessage[],
    options: ChatOptions,
  ): AsyncGenerator<string, ChatUsage | null, void> {
    this.calls.push({ messages, options });
    if (this.failWith) throw this.failWith;
    for (const [index, chunk] of this.chunks.entries()) {
      yield chunk;
      this.onChunk?.(index);
      // The consumer has already taken the chunk before this line runs again,
      // which is exactly how a real abort lands: what arrived is kept.
      if (options.signal?.aborted) throw new Error('The operation was aborted.');
    }
    return this.usage;
  }
}

class Facts extends MemberFactsPort {
  readonly rows = new Map<string, MemberFacts>();

  set(userId: string, overrides: Partial<MemberFacts> = {}): void {
    this.rows.set(userId, {
      timezone: CAIRO,
      locale: 'en',
      summary: 'They are 32, 178 cm and want to lose 5 kg.',
      allergies: [],
      ...overrides,
    });
  }

  async forMember(userId: string): Promise<MemberFacts> {
    const row = this.rows.get(userId);
    if (!row) throw new Error(`no facts staged for ${userId}`);
    return row;
  }
}

/**
 * Operations' token ledger, as a list of spends at instants.
 *
 * A stub that simply returned a number would make the window assertions
 * vacuous — "did the member go over" would be true whatever pair of instants
 * the runner asked about, and the whole of FR-013 is *which* pair it asks
 * about. So the spend has a moment, the stub sums the ones inside the window
 * it was handed, and a runner that summed a UTC day instead of the member's
 * own would give a different answer here.
 */
class Usage extends UsagePort {
  readonly asked: Array<{ userId: string; from: Date; to: Date }> = [];
  private readonly ledger: Array<{ userId: string; at: Date; tokens: number }> = [];

  spend(userId: string, at: Date, tokens: number): void {
    this.ledger.push({ userId, at, tokens });
  }

  async tokensBetween(userId: string, from: Date, to: Date): Promise<number> {
    this.asked.push({ userId, from, to });
    return this.ledger
      .filter(
        (row) => row.userId === userId && row.at >= from && row.at < to,
      )
      .reduce((total, row) => total + row.tokens, 0);
  }
}

class Checkins extends CheckinPort {
  readonly calls: Array<{ userId: string; conversationKind: string; text: string }> = [];
  result: CheckinCapture = { captured: false, reason: 'not_awaiting' };

  async capture(input: {
    userId: string;
    conversationKind: string;
    text: string;
    at: Date;
  }): Promise<CheckinCapture> {
    this.calls.push(input);
    return this.result;
  }
}

class Extractor extends IntentExtractorPort {
  readonly calls: Array<{ text: string; now: Date; timezone: string }> = [];
  next: Intent = PLAIN_CHAT;

  async extract(input: {
    text: string;
    now: Date;
    timezone: string;
  }): Promise<Intent> {
    this.calls.push(input);
    return this.next;
  }
}

class Executor extends IntentExecutorPort {
  readonly calls: Array<{ userId: string; intent: Intent; text: string; now: Date }> = [];
  result: ExecutionResult = {
    reply: 'Added “call Dad” for 5pm today.',
    actions: [],
    asking: false,
  };

  async execute(input: {
    userId: string;
    intent: Intent;
    text: string;
    now: Date;
    facts: MemberFacts;
  }): Promise<ExecutionResult> {
    this.calls.push(input);
    return this.result;
  }
}

class Prompts extends PromptAssemblerPort {
  readonly calls: Array<{ kind: string; text: string; conversationId: string }> = [];

  async build(input: {
    userId: string;
    kind: string;
    text: string;
    conversationId: string;
    floorSeq: number;
    now: Date;
    facts: MemberFacts;
  }): Promise<Array<{ role: 'system' | 'user' | 'assistant'; content: string }>> {
    this.calls.push(input);
    return [
      { role: 'system', content: 'You are Botvy.' },
      { role: 'user', content: input.text },
    ];
  }
}

/**
 * The guard, firing on a chosen chunk.
 *
 * `fireOnChunk` is one-based and counts `push` calls rather than matching text,
 * because what this spec is checking is the *runner's* reaction to a guard that
 * fires — the matching itself is `allergen-guard.spec`'s job. Firing on the
 * second chunk is the case that matters: the first chunk has already been
 * emitted as a token and accumulated into `parts`, so a runner that stored what
 * it had would store a partial the phone then pulls forever.
 */
class Allergens extends AllergenGuardPort {
  fireOnChunk = 0;
  named = 'peanut';
  readonly scans: string[][] = [];

  forMember(_allergies: string[]): AllergenScan {
    let count = 0;
    const seen: string[] = [];
    this.scans.push(seen);
    return {
      push: (chunk: string): string | null => {
        count += 1;
        seen.push(chunk);
        return count === this.fireOnChunk ? this.named : null;
      },
    };
  }
}

// ------------------------------------------------------------------ recorder

interface Frame {
  event: string;
  payload: Record<string, unknown>;
}

/**
 * Every frame the turn emitted, in order.
 *
 * In order, and that is most of the point: `chat.moved` must arrive **before**
 * any `chat.token` (FR-008 — a reply that had started streaming into a pinned
 * chat is a trace), so the assertion is about indices in one list rather than
 * about two separate counters.
 */
function recorder(): {
  frames: Frame[];
  events: TurnEvents;
  of(event: string): Record<string, unknown>[];
  first(event: string): number;
  text(): string;
} {
  const frames: Frame[] = [];
  const push = (event: string) => (payload: Record<string, unknown>) => {
    frames.push({ event, payload });
  };
  return {
    frames,
    events: {
      accepted: push('accepted'),
      intent: push('intent'),
      moved: push('moved'),
      token: push('token'),
      card: push('card'),
      done: push('done'),
      error: push('error'),
    } as unknown as TurnEvents,
    of(event) {
      return frames.filter((frame) => frame.event === event).map((frame) => frame.payload);
    },
    first(event) {
      return frames.findIndex((frame) => frame.event === event);
    },
    text() {
      return frames
        .filter((frame) => frame.event === 'token')
        .map((frame) => frame.payload.text as string)
        .join('');
    },
  };
}

// --------------------------------------------------------------------- bench

interface Bench {
  uow: InMemoryUnitOfWork;
  conversations: InMemoryConversationRepository;
  messages: InMemoryMessageRepository;
  settings: SettingsService;
  facts: Facts;
  usage: Usage;
  checkins: Checkins;
  extractor: Extractor;
  executor: Executor;
  prompts: Prompts;
  allergens: Allergens;
  llm: StubLlm;
  runner: TurnRunner;
}

function bench(): Bench {
  const uow = new InMemoryUnitOfWork();
  const conversations = new InMemoryConversationRepository(uow);
  const messages = new InMemoryMessageRepository(uow);
  const seq = new InMemorySeq();
  // Unattached: nothing here asserts on a socket frame, and the service is a
  // silent no-op with no server, which is the worker's ordinary case too.
  const nudges = new NudgeService();
  const append = new AppendMessageHandler(uow, conversations, messages, seq, nudges, () =>
    messages.nextId(),
  );
  // The real service over an in-memory store, so every value this spec does not
  // set is the registry's own default. A stub `get` returning numbers would be a
  // spec asserting against hard-coded defaults, which the constitution calls a
  // bug in its own right.
  const settings = new SettingsService(new InMemorySettingsStore(), new SilentAudit());

  const facts = new Facts();
  facts.set(MEMBER);
  const usage = new Usage();
  const checkins = new Checkins();
  const extractor = new Extractor();
  const executor = new Executor();
  const prompts = new Prompts();
  const allergens = new Allergens();
  const llm = new StubLlm();

  return {
    uow,
    conversations,
    messages,
    settings,
    facts,
    usage,
    checkins,
    extractor,
    executor,
    prompts,
    allergens,
    llm,
    runner: new TurnRunner(
      uow,
      conversations,
      append,
      facts,
      usage,
      checkins,
      extractor,
      executor,
      prompts,
      allergens,
      llm,
      settings,
    ),
  };
}

async function seed(
  it: Bench,
  kind: ConversationKind,
  userId = MEMBER,
  at = new Date(),
): Promise<Conversation> {
  const conversation = Conversation.create({
    id: newId(),
    userId,
    kind,
    title: kind,
    at,
  });
  await it.uow.run(() => it.conversations.save(conversation));
  return conversation;
}

function request(overrides: Partial<TurnRequest> = {}): TurnRequest {
  return {
    userId: MEMBER,
    requestId: 'request-1',
    conversationId: 'conversation-1',
    text: 'How am I doing?',
    ...overrides,
  };
}

/** The rows the store actually holds, which is what most of this file asserts. */
function stored(it: Bench, role: 'user' | 'assistant') {
  return [...it.messages.rows.values()]
    .filter((row) => row.role === role)
    .sort((a, b) => a.seq - b.seq);
}

// --------------------------------------------------------------------- specs

describe('a turn: whose conversation it is', () => {
  let harness: Bench;

  beforeEach(() => {
    harness = bench();
  });

  /**
   * FR-020, and the code is `forbidden` for **both** cases on purpose.
   *
   * "Not found" versus "forbidden" is precisely the bit that tells a member
   * whether somebody else's conversation exists, so the two have to be
   * indistinguishable. `protected` — which the contract listed before this
   * phase — would be worse still: it says the thing exists and is merely
   * defended.
   *
   * The other half of the assertion is that **nothing is stored**. A runner
   * that refused after appending would leave a stranger's sentence in a
   * conversation the repository read never returned, which is a write nobody
   * can see and nobody can delete.
   */
  it('answers forbidden, never not_found, for a conversation that is not theirs', async () => {
    const theirs = await seed(harness, 'free', OTHER);
    const events = recorder();

    await harness.runner.run(request({ conversationId: theirs.id }), events.events);

    expect(events.of('error')).toEqual([
      { requestId: 'request-1', code: 'forbidden', message: expect.any(String) },
    ]);
    expect(harness.messages.rows.size).toBe(0);
  });

  it('answers a conversation id that exists nowhere the same way', async () => {
    const events = recorder();

    await harness.runner.run(request({ conversationId: newId() }), events.events);

    expect(events.of('error').map((payload) => payload.code)).toEqual(['forbidden']);
    expect(harness.messages.rows.size).toBe(0);
  });

  /**
   * A conversation the member deleted is gone as far as a turn is concerned,
   * and it answers with the same code. The `deletedAt` guard is a separate
   * branch from the ownership scope — it covers a client holding an id from
   * before the delete, which `findById`'s owner filter cannot.
   */
  it('answers a deleted conversation the same way', async () => {
    const conversation = await seed(harness, 'free');
    conversation.deletedAt = new Date();
    await harness.uow.run(() => harness.conversations.save(conversation));
    const events = recorder();

    await harness.runner.run(request({ conversationId: conversation.id }), events.events);

    expect(events.of('error').map((payload) => payload.code)).toEqual(['forbidden']);
    expect(harness.messages.rows.size).toBe(0);
  });
});

describe('a turn: the daily allowance', () => {
  let harness: Bench;

  beforeEach(() => {
    harness = bench();
  });

  /**
   * The allowance is checked **before** the member's message is stored.
   *
   * This is the ordering assertion that cannot be made from a screen. A quota
   * checked after the append still refuses the turn and still shows the member
   * an error, so a runner with the two steps swapped looks identical from the
   * outside — and quietly fills the conversation with messages that were never
   * answered, one per attempt, for the rest of the day. `messages.rows.size`
   * is the whole of the difference.
   *
   * The reset is named **in the member's own zone**, because a member told
   * "resets at 00:00 UTC" has been handed a subtraction to do. Principle XI
   * applied to a sentence rather than to a timestamp.
   */
  it('refuses a member over the allowance without storing their message', async () => {
    const conversation = await seed(harness, 'coach');
    await harness.settings.setSystem('chat.dailyQuotaTokens', 1_000);
    harness.usage.spend(MEMBER, new Date(), 1_000);
    const events = recorder();

    await harness.runner.run(request({ conversationId: conversation.id }), events.events);

    const [error] = events.of('error');
    expect(error?.code).toBe('quota');
    expect(String(error?.message)).toContain(CAIRO);
    expect(harness.messages.rows.size).toBe(0);
    // And nothing downstream ran either: the extractor is a model call, and a
    // member over their allowance must not spend a second one being refused.
    expect(harness.extractor.calls).toEqual([]);
    expect(harness.llm.calls).toEqual([]);
  });

  /**
   * One token under is answered, which is the boundary `used < quota` fixes.
   * A `<=` here would refuse the member on the turn that exactly reached the
   * limit — off by one turn a day, every day, and nobody would ever report it
   * as anything but "chat feels stingy".
   */
  it('answers a member one token under the allowance', async () => {
    const conversation = await seed(harness, 'coach');
    await harness.settings.setSystem('chat.dailyQuotaTokens', 1_000);
    harness.usage.spend(MEMBER, new Date(), 999);
    const events = recorder();

    await harness.runner.run(request({ conversationId: conversation.id }), events.events);

    expect(events.of('error')).toEqual([]);
    expect(events.of('done')).toHaveLength(1);
    expect(stored(harness, 'assistant')).toHaveLength(1);
  });

  /**
   * The window is the member's own local day — FR-013 and principle XI — and
   * two members in two zones cross their own midnights and not each other's.
   *
   * v1 summed per UTC day, which meant an Egyptian member's allowance reset at
   * two in the morning: they would run out mid-evening and find themselves
   * still locked out at midnight, which reads as the limit being broken rather
   * than as a time zone.
   *
   * The fixture is built by asking the zones for an instant where they disagree
   * about the date, not by assuming Cairo is an hour ahead of Berlin — see
   * `acrossMidnight`, which explains the four weeks each spring when they are
   * not.
   */
  it('counts each member’s own local day, not the server’s', async () => {
    const now = acrossMidnight(CAIRO, BERLIN);
    const cairoDayStart = localMidnight(now, CAIRO);
    const berlinDayStart = localMidnight(now, BERLIN);
    // The premise of the fixture, asserted rather than assumed.
    expect(berlinDayStart.getTime()).toBeLessThan(cairoDayStart.getTime());

    // A minute before the Cairo member's midnight: yesterday for them, still
    // today for the Berlin member, who is an hour or more behind.
    const spentAt = new Date(cairoDayStart.getTime() - 60_000);

    harness.facts.set(MEMBER, { timezone: CAIRO });
    harness.facts.set(OTHER, { timezone: BERLIN });
    await harness.settings.setSystem('chat.dailyQuotaTokens', 1_000);
    harness.usage.spend(MEMBER, spentAt, 1_000);
    harness.usage.spend(OTHER, spentAt, 1_000);

    const cairoChat = await seed(harness, 'coach', MEMBER, spentAt);
    const berlinChat = await seed(harness, 'coach', OTHER, spentAt);

    const cairo = recorder();
    await harness.runner.run(
      request({ userId: MEMBER, conversationId: cairoChat.id }),
      cairo.events,
      now,
    );
    const berlin = recorder();
    await harness.runner.run(
      request({ userId: OTHER, requestId: 'request-2', conversationId: berlinChat.id }),
      berlin.events,
      now,
    );

    // Cairo has crossed their midnight: yesterday's spend is not today's.
    expect(cairo.of('error')).toEqual([]);
    // Berlin has not: the same instant is still inside their day.
    expect(berlin.of('error').map((payload) => payload.code)).toEqual(['quota']);

    // And the windows the runner asked about are each member's own local day —
    // asserted directly, because a runner that summed the right totals from
    // the wrong window would coincidentally agree on some dates and not others.
    expect(harness.usage.asked[0]).toEqual({
      userId: MEMBER,
      from: cairoDayStart,
      to: atWallClock(nextLocalDate(localDate(now, CAIRO)), '00:00', CAIRO),
    });
    expect(harness.usage.asked[1]).toEqual({
      userId: OTHER,
      from: berlinDayStart,
      to: atWallClock(nextLocalDate(localDate(now, BERLIN)), '00:00', BERLIN),
    });
  });
});

describe('a turn: the evening check-in', () => {
  let harness: Bench;

  beforeEach(() => {
    harness = bench();
  });

  /**
   * The check-in short-circuits **before** extraction.
   *
   * "Yes, did everything" is an answer to a question, not an instruction, and
   * running it through the extractor first would sometimes make it one — a
   * model handed "no, skipped the run" can and does produce `set_task`. So the
   * assertion is that the extractor was never asked and the model was never
   * called: a runner with these two steps in the other order would still
   * record the check-in on most turns and would occasionally create a task out
   * of somebody saying they had a bad day.
   */
  it('records the check-in and stops, without asking the extractor', async () => {
    const conversation = await seed(harness, 'coach');
    harness.checkins.result = { captured: true, streak: 3 };
    const events = recorder();

    await harness.runner.run(request({ conversationId: conversation.id }), events.events);

    expect(harness.extractor.calls).toEqual([]);
    expect(harness.llm.calls).toEqual([]);
    expect(events.text()).toContain('3 days in a row');
    expect(stored(harness, 'assistant')[0]?.content).toContain('3 days in a row');
  });

  /**
   * A refusal falls through to an ordinary turn and the question stays open.
   *
   * `unclear` is the reason that matters: guessing a verdict costs the member
   * their streak, and asking again costs a sentence. A runner that treated any
   * non-capture as "no" would zero a streak on a member who happened to ask
   * something else in the coach chat at ten in the evening.
   */
  it('carries on as an ordinary turn when the reply was not an answer', async () => {
    const conversation = await seed(harness, 'coach');
    harness.checkins.result = { captured: false, reason: 'unclear' };
    const events = recorder();

    await harness.runner.run(request({ conversationId: conversation.id }), events.events);

    expect(harness.checkins.calls).toHaveLength(1);
    expect(harness.extractor.calls).toHaveLength(1);
    expect(harness.llm.calls).toHaveLength(1);
    expect(events.of('done')).toHaveLength(1);
  });

  /**
   * A free chat is never even offered to the check-in.
   *
   * `awaitingCheckin` is one flag per member, and the classifier matches whole
   * words including `rest` and `not` — so without the conversation condition an
   * ordinary sentence in an unrelated chat records a missed day and zeroes the
   * streak. The guard is on the pinned kinds here and the *conversation* guard
   * is Rhythm's; asserting the port was not called at all is what makes this
   * side of the pair checkable.
   */
  it('does not offer a free chat’s message to the check-in at all', async () => {
    const conversation = await seed(harness, 'free');
    harness.checkins.result = { captured: true, streak: 9 };
    const events = recorder();

    await harness.runner.run(request({ conversationId: conversation.id }), events.events);

    expect(harness.checkins.calls).toEqual([]);
    expect(events.text()).not.toContain('9 days');
  });
});

describe('a turn: moving an off-topic message', () => {
  let harness: Bench;

  beforeEach(() => {
    harness = bench();
  });

  /**
   * The rule is exactly `pinned && scope === 'other'`, and all four cases are
   * here because the two halves fail in opposite directions.
   *
   * Dropping the `pinned` half moves turns out of free chats, which shatters an
   * ordinary conversation into one chat per message. Dropping the `scope`
   * half — or widening it to "anything that is not coaching" — bounces every
   * reminder typed in Coach into a new chat, splitting one conversation in two
   * and hiding the confirmation the member was waiting for.
   */
  it('moves an off-topic turn out of a pinned chat, titled from the member’s words, before a token', async () => {
    const coach = await seed(harness, 'coach');
    harness.extractor.next = intent({ scope: 'other' as IntentScope });
    const events = recorder();

    await harness.runner.run(
      request({
        conversationId: coach.id,
        text: 'what is the tallest building in the world these days',
      }),
      events.events,
    );

    const [moved] = events.of('moved');
    // The member's own first six words, trimmed — their words rather than a
    // model-written summary, so the row cannot name a subject they never
    // mentioned and they recognise it in a list.
    expect(moved?.title).toBe('what is the tallest building in');
    expect(moved?.from).toBe(coach.id);

    // Before any token. FR-008: a reply that had already started streaming
    // into the coach chat is exactly the trace the move exists to prevent, and
    // this is an ordering an eyeball on a screen cannot check.
    expect(events.first('moved')).toBeLessThan(events.first('token'));

    // A new free conversation exists, and it is the one the answer went into.
    const created = harness.conversations.rows.get(String(moved?.to));
    expect(created?.kind).toBe('free');
    expect(created?.pinned).toBe(false);
    expect(created?.title).toBe('what is the tallest building in');
    expect(stored(harness, 'assistant')[0]?.conversationId).toBe(created?.id);

    // And nothing is left in the coach chat beyond the member's own message.
    const leftBehind = [...harness.messages.rows.values()].filter(
      (row) => row.conversationId === coach.id,
    );
    expect(leftBehind.map((row) => row.role)).toEqual(['user']);
  });

  /**
   * A `planning` intent typed in Coach is carried out in Coach. Both pinned
   * chats are Botvy talking about the member's own day, so bouncing "remind me
   * to call Dad" into Planner would split one conversation in half — worse
   * than a slightly mixed transcript.
   */
  it('leaves a planning intent where it was typed in the coach chat', async () => {
    const coach = await seed(harness, 'coach');
    harness.extractor.next = intent({ scope: 'planning' as IntentScope });
    const events = recorder();

    await harness.runner.run(request({ conversationId: coach.id }), events.events);

    expect(events.of('moved')).toEqual([]);
    expect(stored(harness, 'assistant')[0]?.conversationId).toBe(coach.id);
  });

  /** And the mirror case, which a rule written as `kind === 'coach'` would miss. */
  it('leaves a coaching intent where it was typed in the planner chat', async () => {
    const planner = await seed(harness, 'planner');
    harness.extractor.next = intent({ scope: 'coaching' as IntentScope });
    const events = recorder();

    await harness.runner.run(request({ conversationId: planner.id }), events.events);

    expect(events.of('moved')).toEqual([]);
    expect(stored(harness, 'assistant')[0]?.conversationId).toBe(planner.id);
  });

  /**
   * An off-topic message in a free chat stays put. A free chat has no topic to
   * be off, and a runner that keyed only on the scope would give a member a new
   * conversation for every other sentence.
   */
  it('does not move anything out of a free chat', async () => {
    const free = await seed(harness, 'free');
    harness.extractor.next = intent({ scope: 'other' as IntentScope });
    const events = recorder();

    await harness.runner.run(request({ conversationId: free.id }), events.events);

    expect(events.of('moved')).toEqual([]);
    expect(harness.conversations.rows.size).toBe(1);
    expect(stored(harness, 'assistant')[0]?.conversationId).toBe(free.id);
  });
});

describe('a turn: an action', () => {
  let harness: Bench;

  beforeEach(() => {
    harness = bench();
  });

  /**
   * An action never reaches the model.
   *
   * The intent is executed, the confirmation is templated from what was
   * *stored*, and the turn ends. This is the safety property of the whole
   * phase stated as an assertion on `llm.calls`: a model asked to confirm what
   * it just did will confirm something plausible instead — a title it tidied, a
   * time it rounded — and the member reads a sentence about a task that does
   * not exist.
   */
  it('executes and confirms without calling the model', async () => {
    const planner = await seed(harness, 'planner');
    harness.extractor.next = intent({ name: 'set_reminder', scope: 'planning' });
    harness.executor.result = {
      reply: 'Reminder set for 5:00 pm today: call Dad.',
      card: { kind: 'reminders', items: [{ id: 'reminder-1', title: 'call Dad', at: null }] },
      actions: [{ kind: 'reminder.created', id: 'reminder-1' }],
      asking: false,
    };
    const events = recorder();

    await harness.runner.run(request({ conversationId: planner.id }), events.events);

    expect(harness.llm.calls).toEqual([]);
    expect(harness.executor.calls).toHaveLength(1);
    expect(events.of('card')).toEqual([
      {
        requestId: 'request-1',
        kind: 'reminders',
        items: [{ id: 'reminder-1', title: 'call Dad', at: null }],
      },
    ]);
    expect(events.of('done')[0]?.actions).toEqual([
      { kind: 'reminder.created', id: 'reminder-1' },
    ]);
  });

  /** No card, no `chat.card` frame — a client should not have to render an empty list. */
  it('emits no card when the result carries none', async () => {
    const planner = await seed(harness, 'planner');
    harness.extractor.next = intent({ name: 'set_task', scope: 'planning' });
    const events = recorder();

    await harness.runner.run(request({ conversationId: planner.id }), events.events);

    expect(events.of('card')).toEqual([]);
  });
});

/**
 * A templated answer emits its text as a token.
 *
 * This was a real defect, and it is worth spelling out because it is the kind
 * that passes every unit test written the obvious way. `contracts/ws-chat.md`
 * says "templated confirmations (intents executed in code) still arrive as
 * `chat.token` + `chat.done` so clients render one path". Without the emit in
 * `reply`, every branch that does not call the model — the check-in
 * acknowledgement, every planner confirmation, every question about a missing
 * field, the allergen apology — reached the client as a bare `chat.done` with
 * no text in it. The row was stored correctly, so a later pull showed the
 * answer; live, the member watched their message send and nothing come back.
 *
 * It is also what makes the batch endpoint work at all: its collector
 * accumulates tokens, so a confirmation that emitted none comes back as an
 * empty reply.
 */
describe('a turn: a templated answer still arrives as text', () => {
  let harness: Bench;

  beforeEach(() => {
    harness = bench();
  });

  it('emits the confirmation of an executed action as a token', async () => {
    const planner = await seed(harness, 'planner');
    harness.extractor.next = intent({ name: 'set_task', scope: 'planning' });
    harness.executor.result = { reply: 'Added “buy milk” for today.', actions: [], asking: false };
    const events = recorder();

    await harness.runner.run(request({ conversationId: planner.id }), events.events);

    expect(events.text()).toBe('Added “buy milk” for today.');
    expect(events.first('token')).toBeLessThan(events.first('done'));
  });

  it('emits the check-in acknowledgement as a token', async () => {
    const coach = await seed(harness, 'coach');
    harness.checkins.result = { captured: true, streak: 1 };
    const events = recorder();

    await harness.runner.run(request({ conversationId: coach.id }), events.events);

    // Singular, too: "1 days in a row" is the kind of thing a member notices.
    expect(events.text()).toBe('Logged. That is 1 day in a row.');
  });

  it('emits the allergen apology as tokens', async () => {
    const coach = await seed(harness, 'coach');
    harness.facts.set(MEMBER, { allergies: ['peanut'] });
    harness.allergens.fireOnChunk = 1;
    const events = recorder();

    await harness.runner.run(request({ conversationId: coach.id }), events.events);

    expect(events.text()).toContain('could not answer that safely');
  });
});

describe('a turn: the allergen guard', () => {
  let harness: Bench;

  beforeEach(() => {
    harness = bench();
  });

  /**
   * FR-018: the answer is stopped, discarded and replaced with a short apology.
   *
   * All three halves are asserted, and "discarded" is the one that is easy to
   * get wrong. The guard fires on the chunk that first *completes* the
   * allergen's name — a model emits "pea" then "nut", so a per-chunk check
   * would never see the word — which means by the time it fires there is
   * already a partial in hand. Storing that partial would put the answer the
   * member must not read into a row the phone then pulls and keeps for ever,
   * because messages are immutable and there is no tombstone. The stored row
   * has to be the apology and nothing else.
   *
   * `intent.allergenBlocked` is how an operator finds these later. The member
   * just reads the apology — no error frame, because nothing went wrong from
   * their side and a client should render one path.
   */
  it('stops the stream, discards the partial and stores the apology', async () => {
    const coach = await seed(harness, 'coach');
    harness.facts.set(MEMBER, { allergies: ['peanut'] });
    harness.llm.chunks = ['Try a spoon of ', 'peanut butter with it.', ' Also...'];
    harness.allergens.fireOnChunk = 2;
    const events = recorder();

    await harness.runner.run(request({ conversationId: coach.id }), events.events);

    // The stream stopped: the third chunk was never scanned, so it was never
    // pulled from the generator either.
    expect(harness.allergens.scans[0]).toEqual(['Try a spoon of ', 'peanut butter with it.']);

    // The stored assistant message is the apology, not the partial. This is the
    // assertion the defect would fail: `answer` still held "Try a spoon of ".
    const assistant = stored(harness, 'assistant');
    expect(assistant).toHaveLength(1);
    expect(assistant[0]?.content).toContain('could not answer that safely');
    expect(assistant[0]?.content).not.toContain('Try a spoon of');
    expect(assistant[0]?.intent).toMatchObject({ allergenBlocked: true });

    // The apology arrives as tokens, and no error frame beside it.
    expect(events.text()).toContain('could not answer that safely');
    expect(events.of('error')).toEqual([]);
    expect(events.of('done')).toHaveLength(1);
  });
});

describe('a turn: a cancel and a broken model', () => {
  let harness: Bench;

  beforeEach(() => {
    harness = bench();
  });

  /**
   * A cancel keeps what arrived.
   *
   * The member pressed Stop on an answer they were reading, so the half they
   * read has to stay in the transcript — anything else means the chat loses a
   * message they saw. `intent.cancelled` is what tells a client the answer is
   * short on purpose rather than truncated by a failure, which is the
   * difference between "you stopped this" and "this is broken".
   *
   * A disconnect is deliberately *not* this: only `chat.cancel` raises the
   * signal, and a socket that drops mid-answer leaves the turn running (FR-021).
   */
  it('stores the partial with cancelled on it when the member presses Stop', async () => {
    const coach = await seed(harness, 'coach');
    const controller = new AbortController();
    harness.llm.chunks = ['You are ', 'doing well, and ', 'here is why.'];
    harness.llm.onChunk = (index) => {
      if (index === 1) controller.abort();
    };
    const events = recorder();

    await harness.runner.run(
      request({ conversationId: coach.id, signal: controller.signal }),
      events.events,
    );

    const assistant = stored(harness, 'assistant');
    expect(assistant[0]?.content).toBe('You are doing well, and ');
    expect(assistant[0]?.intent).toMatchObject({ cancelled: true });
    // Not an error: the member asked for this.
    expect(events.of('error')).toEqual([]);
    expect(events.of('done')).toHaveLength(1);
  });

  /**
   * A model failure that is not an abort is `model_unavailable`, and no
   * assistant row is written.
   *
   * FR-012: the member is told plainly and their message is kept. The member's
   * own message stays — they typed it and it is theirs — but there must be no
   * assistant row, because an empty or half-written answer in an immutable
   * transcript is one no later pull can correct.
   *
   * Distinguishing this from a cancel is the whole of the branch: both arrive
   * as a thrown error out of the same generator, and the only thing that tells
   * them apart is whether the signal was raised.
   */
  it('answers model_unavailable and stores no answer when the model breaks', async () => {
    const coach = await seed(harness, 'coach');
    harness.llm.failWith = new Error('connect ECONNREFUSED 127.0.0.1:11434');
    const events = recorder();

    await harness.runner.run(request({ conversationId: coach.id }), events.events);

    expect(events.of('error').map((payload) => payload.code)).toEqual(['model_unavailable']);
    expect(stored(harness, 'assistant')).toEqual([]);
    // Their own message is kept, which is what the error message promises.
    expect(stored(harness, 'user')).toHaveLength(1);
    expect(events.of('done')).toEqual([]);
  });

  /** An empty answer is a broken model too, not an empty message in the chat. */
  it('answers model_unavailable when the model returns nothing at all', async () => {
    const coach = await seed(harness, 'coach');
    harness.llm.chunks = [];
    const events = recorder();

    await harness.runner.run(request({ conversationId: coach.id }), events.events);

    expect(events.of('error').map((payload) => payload.code)).toEqual(['model_unavailable']);
    expect(stored(harness, 'assistant')).toEqual([]);
  });
});

describe('a turn: when it is understood as of', () => {
  let harness: Bench;

  beforeEach(() => {
    harness = bench();
  });

  /**
   * FR-007: a message composed offline is understood as of **when it was
   * typed**, not when it arrived.
   *
   * "Remind me in two hours" typed at 14:10 and delivered at 20:00 means
   * 16:10, which is in the past — and that is the *correct* reading of what the
   * member asked for. The executor then refuses a past moment and says so,
   * where resolving it against 20:00 would silently invent a 22:00 reminder
   * they never wanted and they would not find out until it fired.
   *
   * So the assertion is on the `now` the extractor and the executor were
   * handed. It is easy to get this wrong in a way that is invisible for months:
   * every online turn has `composedAt` absent, so the two values coincide and
   * only the offline flush ever tells the difference.
   */
  it('hands the extractor composedAt rather than the moment of arrival', async () => {
    const coach = await seed(harness, 'coach');
    const arrivedAt = new Date();
    const typedAt = new Date(arrivedAt.getTime() - 6 * 60 * 60_000);
    const events = recorder();

    await harness.runner.run(
      request({ conversationId: coach.id, composedAt: typedAt }),
      events.events,
      arrivedAt,
    );

    expect(harness.extractor.calls[0]?.now).toEqual(typedAt);
    expect(harness.extractor.calls[0]?.timezone).toBe(CAIRO);
  });

  it('hands the executor composedAt too', async () => {
    const planner = await seed(harness, 'planner');
    harness.extractor.next = intent({ name: 'set_reminder', scope: 'planning' });
    const arrivedAt = new Date();
    const typedAt = new Date(arrivedAt.getTime() - 6 * 60 * 60_000);
    const events = recorder();

    await harness.runner.run(
      request({ conversationId: planner.id, composedAt: typedAt }),
      events.events,
      arrivedAt,
    );

    expect(harness.executor.calls[0]?.now).toEqual(typedAt);
  });

  /**
   * And the row keeps both: `composedAt` is when they typed it, `createdAt` is
   * when it landed. A transcript that ordered by arrival would shuffle a
   * morning's worth of offline messages into the evening they were flushed.
   */
  it('stores the member’s message with the moment they typed it', async () => {
    const coach = await seed(harness, 'coach');
    const arrivedAt = new Date();
    const typedAt = new Date(arrivedAt.getTime() - 6 * 60 * 60_000);
    const events = recorder();

    await harness.runner.run(
      request({ conversationId: coach.id, composedAt: typedAt }),
      events.events,
      arrivedAt,
    );

    expect(stored(harness, 'user')[0]?.composedAt).toEqual(typedAt);
    expect(stored(harness, 'user')[0]?.createdAt).toEqual(arrivedAt);
  });

  /** With nothing composed offline, the two coincide — the ordinary live turn. */
  it('falls back to the moment of arrival for a live turn', async () => {
    const coach = await seed(harness, 'coach');
    const now = new Date();
    const events = recorder();

    await harness.runner.run(request({ conversationId: coach.id }), events.events, now);

    expect(harness.extractor.calls[0]?.now).toEqual(now);
  });
});
