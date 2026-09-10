import { Injectable, Logger } from '@nestjs/common';
import {
  ConnectedSocket,
  MessageBody,
  SubscribeMessage,
  WebSocketGateway,
} from '@nestjs/websockets';
import { Public } from '../../../../shared/auth/decorators.js';
import type { Principal } from '../../../../shared/auth/principal.js';
import { SettingsService } from '../../../../shared/settings/settings.service.js';
import { NudgeService } from '../../../../ws/nudge.service.js';
import {
  TurnRunner,
  type TurnEvents,
  type TurnRequest,
} from '../../application/turn-runner.js';

/** Only the parts of a socket this gateway touches, so a spec can fake one. */
export interface ChatSocket {
  id: string;
  data: { principal?: Principal };
  emit(event: string, payload?: unknown): unknown;
}

interface SendBody {
  requestId?: unknown;
  conversationId?: unknown;
  clientId?: unknown;
  text?: unknown;
  composedAt?: unknown;
}

/**
 * The live chat turn.
 *
 * ## A second gateway on the same path, and why that is right
 *
 * `ws/socket.gateway.ts` owns the connection: it installs the handshake
 * authentication, joins the member's room, arms the token-expiry timers and
 * attaches the broadcaster. This class owns two *messages*. Nest registers both
 * classes' handlers on the one Socket.IO server that `path: '/ws'` creates, so
 * `socket.data.principal` is already set by the middleware the other gateway
 * installed by the time anything here runs.
 *
 * The alternative was putting `chat.send` on that gateway, and it does not
 * work: `WsModule` would then have to import `ConversationsModule`, which
 * already imports `WsModule` for the broadcaster. A circular module graph
 * resolved with `forwardRef` is a worse thing to leave behind than a second
 * gateway class, and it would put a context's business logic in the transport
 * layer besides.
 *
 * This class deliberately implements no lifecycle hook. `afterInit` belongs to
 * the gateway that attaches the broadcaster, and two classes racing to attach
 * it would be a coin flip over which server the nudges reach.
 *
 * ## Every frame is emitted to the socket that asked, not the room
 *
 * A member with a phone and a laptop asking two different questions must get
 * two answers, each on the socket that asked — SC-007. Tokens go to
 * `client.emit`, and only the *unsolicited* traffic (`chat.message`,
 * `sync.nudge`) goes to the room. That is also why a disconnect mid-turn ends
 * with a room-wide nudge rather than a room-wide replay: the answer is stored,
 * and whichever device is picked up next pulls it.
 */
@Injectable()
@WebSocketGateway({ path: '/ws', cors: { origin: false, credentials: true } })
export class ChatGateway {
  private readonly logger = new Logger(ChatGateway.name);

  /**
   * Live turns, so `chat.cancel` has something to abort.
   *
   * Keyed by `<userId>:<requestId>` and **not** by `requestId` alone. A
   * request id is minted by a client, so two members can present the same one
   * — by accident or on purpose — and a map keyed on it alone would let one
   * member cancel another's answer. The key is also the ownership check, which
   * is why `cancel` needs no separate one.
   */
  private readonly live = new Map<string, AbortController>();

  /**
   * When each member last sent, for the per-minute limit.
   *
   * In memory, which is honest rather than ideal: it is per-process, so a
   * second backend replica would give a member two allowances. That is
   * acceptable today because the deployment is one container — `plan.md`'s
   * Target Platform — and the *token* allowance, which is the one that costs
   * real money and real GPU time, is counted in Mongo and is shared. This
   * limit exists to stop a runaway client, not to meter usage.
   */
  private readonly recent = new Map<string, number[]>();

  constructor(
    private readonly turns: TurnRunner,
    private readonly nudges: NudgeService,
    private readonly settings: SettingsService,
  ) {}

  /**
   * `chat.send`.
   *
   * `@Public()` because the handshake already authenticated this socket — the
   * middleware in `ws/socket.gateway.ts` refuses a connection without a valid
   * JWT and refuses a service principal outright, so a message arriving here
   * is from an authenticated member by construction. The check below is the
   * belt: an unauthenticated socket reaching this line would be a bug in the
   * middleware, and the cost of being wrong is a stranger writing into
   * somebody's chat.
   */
  @SubscribeMessage('chat.send')
  @Public()
  async send(
    @MessageBody() body: SendBody,
    @ConnectedSocket() client: ChatSocket,
  ): Promise<{ ok: boolean; error?: string }> {
    const principal = client.data.principal;
    if (!principal || principal.kind !== 'user') {
      return { ok: false, error: 'unauthorized' };
    }

    const requestId = asString(body?.requestId);
    const conversationId = asString(body?.conversationId);
    const text = asString(body?.text);

    if (!requestId || !conversationId || !text || text.trim().length === 0) {
      return { ok: false, error: 'bad_request' };
    }

    const events = this.eventsFor(client);

    const limited = await this.overRate(principal.id);
    if (limited) {
      events.error({
        requestId,
        code: 'rate_limited',
        message: limited,
      });
      return { ok: false, error: 'rate_limited' };
    }

    /*
     * The controller is held so `chat.cancel` can abort, and the turn is
     * **not awaited before the ack**.
     *
     * The ack tells the client the message was accepted; the answer arrives as
     * frames. Awaiting the whole turn here would hold the Socket.IO ack open
     * for as long as the model takes — thirty seconds is ordinary — and a
     * client waiting on an ack that long looks frozen, which is the thing
     * `chat.heartbeat` exists to prevent on the other side.
     */
    const controller = new AbortController();
    const key = liveKey(principal.id, requestId);
    this.live.set(key, controller);

    const request: TurnRequest = {
      userId: principal.id,
      requestId,
      conversationId,
      text,
      signal: controller.signal,
      ...(asString(body?.clientId) ? { clientId: asString(body.clientId)! } : {}),
      ...(asDate(body?.composedAt) ? { composedAt: asDate(body.composedAt)! } : {}),
    };

    void this.turns
      .run(request, events)
      .catch((error: Error) => {
        // `TurnRunner` already reports through `events.error`; anything
        // reaching here escaped it, and a rejected floating promise would be
        // an unhandled rejection that takes the process down in Node 24.
        this.logger.error(`turn ${requestId} escaped its own handler: ${error.message}`);
      })
      .finally(() => {
        this.live.delete(key);
        /*
         * The nudge goes out whatever happened, and to the room.
         *
         * FR-021: a socket that dropped mid-answer gets nothing more, but the
         * answer was still finished and stored — so the member's *other*
         * devices are told there is something to pull. Sending it
         * unconditionally rather than only on disconnect is deliberate: a
         * member with two devices open wants the second one to catch up too,
         * and the nudge is idempotent by design.
         */
        this.nudges.emit(principal.id, 'sync.nudge', {
          entities: ['messages'],
          reason: 'server_job',
        });
      });

    return { ok: true };
  }

  /**
   * `chat.cancel` — the member pressed Stop.
   *
   * Aborting the signal is all this does: `TurnRunner` catches the abort,
   * keeps what arrived and stores it with `intent: { cancelled: true }`. That
   * split matters — the gateway knows about sockets and the runner knows what
   * a partial answer is, and a gateway that stored the partial itself would be
   * a second place that decides what a turn's tail looks like.
   *
   * A `requestId` the member does not own cancels nothing, because the map is
   * keyed by both.
   */
  @SubscribeMessage('chat.cancel')
  @Public()
  cancel(
    @MessageBody() body: { requestId?: unknown },
    @ConnectedSocket() client: ChatSocket,
  ): { ok: boolean } {
    const principal = client.data.principal;
    const requestId = asString(body?.requestId);
    if (!principal || principal.kind !== 'user' || !requestId) {
      return { ok: false };
    }

    const controller = this.live.get(liveKey(principal.id, requestId));
    if (!controller) return { ok: false };
    controller.abort();
    return { ok: true };
  }

  // ---------------------------------------------------------------- internals

  /**
   * Translates the runner's events into the frames `contracts/ws-chat.md`
   * fixes.
   *
   * The translation lives here rather than in the runner on purpose: the
   * runner speaks in domain terms (`seq`, `from`, `to`, `kind`) and the wire
   * has its own names (`userSeq`, `fromConversationId`, `type`). Putting the
   * wire's vocabulary in the runner would mean the batch endpoint, which does
   * not use these names at all, inherited them.
   */
  private eventsFor(client: ChatSocket): TurnEvents {
    return {
      accepted: ({ requestId, conversationId, seq }) =>
        void client.emit('chat.accepted', {
          requestId,
          conversationId,
          userSeq: seq,
        }),
      intent: ({ requestId, name, scope }) =>
        void client.emit('chat.intent', { requestId, intent: name, scope }),
      moved: ({ requestId, from, to, title }) =>
        void client.emit('chat.moved', {
          requestId,
          fromConversationId: from,
          toConversationId: to,
          title,
        }),
      token: ({ requestId, text }) =>
        void client.emit('chat.token', { requestId, text }),
      card: ({ requestId, kind, items }) =>
        void client.emit('chat.card', { requestId, kind, items }),
      done: ({ requestId, seq, usage, actions }) =>
        void client.emit('chat.done', {
          requestId,
          assistantSeq: seq,
          ...(usage ? { usage } : {}),
          // `type` on the wire, `kind` in the domain. One rename, at the edge.
          actions: actions.map((action) => ({
            type: action.kind,
            ...(action.id ? { id: action.id } : {}),
          })),
        }),
      error: ({ requestId, code, message }) =>
        void client.emit('chat.error', { requestId, code, message }),
    };
  }

  /**
   * The per-minute limit, as a sliding window rather than a fixed bucket.
   *
   * A fixed minute bucket lets a member send twice the limit across a boundary
   * — the last second of one minute and the first of the next — which for a
   * limit whose whole purpose is protecting one GPU is the case that matters.
   *
   * Returns the message to send, or null when there is room.
   */
  private async overRate(userId: string): Promise<string | null> {
    /*
     * No "off" switch here, deliberately, and the dead branch that pretended
     * there was one has gone.
     *
     * `chat.ratePerMin` is `min(1).max(120)` in the registry, so `<= 0` was
     * unreachable — a comment describing a capability no operator had. And
     * unlike the token allowance, this one should *not* be disablable: it
     * exists to stop a runaway client hammering one GPU, which is a failure an
     * operator cannot opt out of on behalf of the machine.
     */
    const perMin = await this.settings.get('chat.ratePerMin');

    const now = Date.now();
    const window = (this.recent.get(userId) ?? []).filter(
      (at) => now - at < 60_000,
    );

    if (window.length >= perMin) {
      this.recent.set(userId, window);
      return `That is more than ${perMin} message${perMin === 1 ? '' : 's'} a minute. Give it a moment.`;
    }

    window.push(now);
    this.recent.set(userId, window);

    // The map would otherwise grow one entry per member who ever chatted, for
    // the life of the process. Cheap to bound here, where a member is already
    // being looked up.
    if (this.recent.size > 5_000) this.prune(now);
    return null;
  }

  private prune(now: number): void {
    for (const [userId, times] of this.recent) {
      const live = times.filter((at) => now - at < 60_000);
      if (live.length === 0) this.recent.delete(userId);
      else this.recent.set(userId, live);
    }
  }
}

function liveKey(userId: string, requestId: string): string {
  return `${userId}:${requestId}`;
}

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

/** A client sends an ISO string; anything unparseable is simply absent. */
function asDate(value: unknown): Date | null {
  if (typeof value !== 'string') return null;
  const at = new Date(value);
  return Number.isNaN(at.getTime()) ? null : at;
}
