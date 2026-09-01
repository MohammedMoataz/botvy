import { Injectable, Logger, type MessageEvent } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Observable } from 'rxjs';
import { PrismaService } from '../prisma/prisma.service.js';
import { LlmService, type ChatMessage } from '../llm/llm.service.js';
import { UsageService } from '../usage/usage.service.js';
import { RemindersService } from '../reminders/reminders.service.js';
import { CoachingService } from '../coaching/coaching.service.js';
import { classifyCheckin } from '../coaching/checkin-classifier.js';
import { loadPrompt } from '../llm/prompts.js';
import { formatInTz, localDate, wallClockToUtc } from '../common/time.js';
import { SettingsService } from '../settings/settings.service.js';
import {
  SearchService,
  type ImageResult,
  type SearchResult,
} from '../search/search.service.js';
import { mediaPath } from '../media/media.signing.js';
import { preferSoonestDay, resolveRelativePhrase } from './relative-time.js';
import { COACHING_CLIENT_ID, ConversationsService } from './conversations.service.js';

// How many turns go into the prompt is a setting (chat.historyLimit): it is
// the main lever on latency for CPU inference, so it gets tuned live.
const INTENT_HISTORY_LIMIT = 4;
const HEARTBEAT_INTERVAL_MS = 15_000;
const UPCOMING_REMINDERS_IN_PROMPT = 5;
/** Snippets take the room the conversation would otherwise have. */
const SEARCH_HISTORY_LIMIT = 8;

const INTENT_SCHEMA = {
  type: 'object',
  properties: {
    intent: {
      type: 'string',
      enum: ['chat', 'set_reminder', 'list_reminders', 'cancel_reminder', 'web_search'],
    },
    title: { type: 'string' },
    remindAt: { type: 'string' },
    // Empty for every intent but web_search; the schema keeps the
    // required-all shape so the grammar stays a fixed set of keys.
    query: { type: 'string' },
    needsClarification: { type: 'boolean' },
    clarifyQuestion: { type: 'string' },
  },
  // Only the intent is required. The schema is a decoding grammar, so every
  // required key is tokens the model must emit before the answer can start —
  // measured at 48 tokens and 3s per turn with all six, 19 tokens and 1.5s
  // with one. The fields it does not need are simply absent.
  required: ['intent'],
  additionalProperties: false,
} as const;

/**
 * Re-asked when the first pass says "reminder" and then leaves out the time.
 * Requiring the fields makes the grammar emit them; scoping that to the
 * reminder path keeps the cost off every ordinary turn.
 */
const REMINDER_SCHEMA = {
  type: 'object',
  properties: {
    title: { type: 'string' },
    remindAt: { type: 'string' },
    needsClarification: { type: 'boolean' },
    clarifyQuestion: { type: 'string' },
  },
  required: ['title', 'remindAt', 'needsClarification', 'clarifyQuestion'],
  additionalProperties: false,
} as const;

interface IntentResult {
  intent: 'chat' | 'set_reminder' | 'list_reminders' | 'cancel_reminder' | 'web_search';
  title?: string;
  /** The user's own wall clock, no zone: "2026-09-02T18:00". */
  remindAt?: string;
  query?: string;
  needsClarification?: boolean;
  clarifyQuestion?: string;
}

/** Numbered for the model to cite as [1], [2]. */
function formatSearchResults(results: SearchResult[]): string {
  return results
    .map((r, i) => `[${i + 1}] ${r.title}\n${r.content}`)
    .join('\n\n');
}

/** The visible source list, in markdown, built from the results themselves. */
function formatSources(results: SearchResult[]): string {
  const lines = results.map((r, i) => `${i + 1}. [${r.title || r.url}](${r.url})`);
  return `\n\n## Sources\n${lines.join('\n')}\n`;
}

/**
 * Image markdown, written by the gateway rather than the model.
 *
 * The model never sees an image URL and never emits one: these come from the
 * image search directly, and every src is a signed /media path so the phone
 * fetches from us instead of handing its address to whatever host a search
 * result names.
 */
function formatImages(images: ImageResult[], secret: string | undefined): string {
  const rendered = images
    .map((image) => {
      const src = mediaPath(image.imageUrl, secret);
      return src ? `![${image.title}](${src})` : null;
    })
    .filter((line): line is string => line !== null);

  return rendered.length > 0 ? `\n\n${rendered.join('\n')}\n` : '';
}

/** Whether the user asked to be shown something, rather than told. */
function wantsImages(message: string): boolean {
  return /\b(image|images|picture|pictures|photo|photos|show me|what does .* look like)\b|صورة|صور|شكل/iu.test(
    message,
  );
}

/** One message a phone composed while offline. */
export interface QueuedMessage {
  clientId: string;
  text: string;
  composedAt: Date;
  /** Absent from a client older than named chats; those land in coaching. */
  conversationId?: string;
}

/** The parts of a conversation a turn needs. */
export interface ConversationRef {
  id: string;
  clientId: string | null;
}

export interface BatchAction {
  clientId: string;
  intent: string;
  detail: string;
}

export interface BatchResult {
  processed: number;
  /** clientIds that had already been stored — the caller can clear them too. */
  duplicates: string[];
  /** clientIds stored by this call. The device clears exactly these. */
  accepted: string[];
  actions: BatchAction[];
  reply: string | null;
}

@Injectable()
export class ChatService {
  private readonly logger = new Logger(ChatService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly llm: LlmService,
    private readonly usage: UsageService,
    private readonly reminders: RemindersService,
    private readonly coaching: CoachingService,
    private readonly settings: SettingsService,
    private readonly search: SearchService,
    private readonly conversations: ConversationsService,
    config: ConfigService,
  ) {
    this.mediaSecret = config.get<string>('MEDIA_SIGNING_SECRET');
  }

  /** Absent when image proxying is switched off; images then stay plain links. */
  private readonly mediaSecret?: string;

  /**
   * The tail of one conversation, oldest first.
   *
   * [conversationId] is what keeps chats apart: without it a question asked in
   * a new thread is answered from the tail of an unrelated one, and the intent
   * classifier resolves "cancel that one" against a reminder discussed
   * somewhere else. Omitting it reads across all of the user's threads, which
   * only `GET /chat/history` with no conversation does.
   */
  async history(userId: string, limit = 50, conversationId?: string) {
    const rows = await this.prisma.message.findMany({
      where: { userId, ...(conversationId ? { conversationId } : {}) },
      orderBy: { id: 'desc' },
      take: limit,
    });
    return rows.reverse();
  }

  /**
   * Executes a reminder-shaped intent and returns the confirmation text,
   * or null to fall through to a normal chat reply (which is what happens
   * when the model claimed a reminder intent but produced no usable time).
   */
  private async handleReminderIntent(
    userId: string,
    result: IntentResult,
    timezone: string,
  ): Promise<string | null> {
    if (result.intent === 'list_reminders') {
      const active = await this.reminders.list(userId, 'active');
      if (active.length === 0) return 'You have no active reminders.';
      const lines = active.map((r) => `• ${r.title} — ${formatInTz(r.remindAt, timezone)}`);
      return `Your reminders:\n${lines.join('\n')}`;
    }

    if (result.intent === 'cancel_reminder') {
      const active = await this.reminders.list(userId, 'active');
      if (active.length === 0) return 'You have no active reminders to cancel.';
      const wanted = result.title?.toLowerCase();
      const target = wanted
        ? active.find((r) => r.title.toLowerCase().includes(wanted))
        : undefined;
      if (!target) {
        return `I could not tell which reminder to cancel. You have: ${active
          .map((r) => r.title)
          .join(', ')}.`;
      }
      await this.reminders.cancel(userId, target.id);
      return `Cancelled: ${target.title}`;
    }

    if (result.intent === 'set_reminder') {
      if (result.needsClarification || !result.remindAt) {
        return result.clarifyQuestion || 'When would you like to be reminded?';
      }
      // The model writes the time on the user's own clock; turning that into an
      // instant is arithmetic, and a small model gets it wrong — asked for UTC
      // it returned both the wrong hour and the wrong day.
      const remindAt = wallClockToUtc(result.remindAt, timezone);
      if (!remindAt) {
        this.logger.warn(`model produced an unparseable remindAt: ${result.remindAt}`);
        return null; // fall through to a normal chat reply
      }
      const reminder = await this.reminders.create(userId, {
        title: result.title || 'Reminder',
        remindAt,
      });
      // Echoed in the user's own wall-clock time: a raw UTC timestamp reads
      // as the wrong hour to everyone who is not on UTC.
      return `Reminder set: ${reminder.title} — ${formatInTz(reminder.remindAt, timezone)}.`;
    }

    return null;
  }

  /**
   * Records an answer to the nightly check-in and returns what to say back,
   * or null when the reply is too ambiguous to record — in which case the
   * caller treats it as ordinary conversation rather than guessing.
   */
  private async handleCheckinReply(userId: string, reply: string): Promise<string | null> {
    const verdict = classifyCheckin(reply);
    if (verdict === 'unclear') return null;

    const adhered = verdict === 'adhered';
    await this.coaching.recordCheckin(userId, adhered, reply);
    const context = await this.coaching.context(userId);

    if (adhered) {
      return context.streak > 1
        ? `Logged — that's ${context.streak} days in a row. Keep it going.`
        : 'Logged. Nice work today.';
    }
    // Recorded truthfully, but the response is encouraging rather than
    // punitive: a coach that scolds gets ignored.
    return 'Logged — one off day changes nothing long term. Tomorrow is a fresh start.';
  }

  /**
   * Classifies one message. Shared by the live stream and the offline batch;
   * `now` is the moment the user typed it, which for a queued message is not
   * the moment it arrives — "in two hours" must mean two hours from typing.
   */
  private async extractIntent(
    message: string,
    history: string,
    timezone: string,
    now: Date,
  ): Promise<IntentResult | null> {
    const intentPrompt = loadPrompt('intent.md', {
      history: history || '(none)',
      message,
      // The user's own clock, not UTC: the model writes wall-clock times, and
      // giving it a UTC reference is what made it do arithmetic it gets wrong.
      now: formatInTz(now, timezone),
      timezone,
      today: localDate(now, timezone),
    });
    const result = await this.llm.extract<IntentResult>({
      messages: [{ role: 'user', content: intentPrompt }],
      schemaName: 'intent',
      schema: INTENT_SCHEMA,
    });

    if (result?.intent !== 'set_reminder') return result;

    // "in two hours" is arithmetic, not language: the model left it out
    // entirely often enough that it is worth doing here, where it cannot be
    // wrong.
    const relative = resolveRelativePhrase(message, now, timezone);
    if (relative) {
      return { ...result, remindAt: relative, needsClarification: false };
    }

    // A reminder with no time is not a reminder. Rather than asking the user
    // for something they already said, ask the model again with a grammar that
    // cannot skip the field.
    let filled = result;
    if (!filled.remindAt) {
      const details = await this.llm.extract<Omit<IntentResult, 'intent'>>({
        messages: [{ role: 'user', content: intentPrompt }],
        schemaName: 'reminder',
        schema: REMINDER_SCHEMA,
      });
      if (details) filled = { ...filled, ...details };
    }

    if (filled.remindAt) {
      filled = {
        ...filled,
        remindAt: preferSoonestDay(filled.remindAt, message, now, timezone),
      };
    }
    return filled;
  }

  /** The few reminders worth knowing about, so "what's next?" needs no tool call. */
  private async upcomingRemindersLine(userId: string, timezone: string): Promise<string> {
    const active = await this.reminders.list(userId, 'active');
    const upcoming = active.slice(0, UPCOMING_REMINDERS_IN_PROMPT);
    if (upcoming.length === 0) return '(none)';
    return upcoming.map((r) => `- ${r.title} — ${formatInTz(r.remindAt, timezone)}`).join('\n');
  }

  /**
   * Coaching state, but only for users who opted in — building it is several
   * queries, and it means nothing to everyone else.
   */
  private async coachingLine(userId: string): Promise<string> {
    const profile = await this.coaching.getProfile(userId);
    if (!profile?.optedIn) return '(not enrolled in coaching)';

    const context = await this.coaching.context(userId);
    const day = context.isRestDay ? 'a rest day' : 'a training day';
    return `Enrolled. Today is ${day}. Current streak: ${context.streak} day(s); ${Math.round(
      context.completionRatio * 100,
    )}% of recent check-ins completed.`;
  }

  /**
   * Delivers the messages a phone composed while offline.
   *
   * Each one is classified against the time it was *typed*, so a reminder
   * asked for offline lands where the user meant it (already-past pings still
   * produce the at-the-moment row, which the next sweep delivers — late beats
   * lost). The conversation itself gets a single reply covering the whole
   * batch rather than one per message: the user is reading it all at once, and
   * on CPU inference N replies would be N times the wait.
   *
   * Re-sending a batch is safe: messages already stored under their clientId
   * are skipped, so a flush interrupted halfway can simply be retried.
   */
  async batchReply(userId: string, queued: QueuedMessage[]): Promise<BatchResult> {
    const known = await this.prisma.message.findMany({
      // Scoped to this user: a client id belongs to one account, and another
      // account's row must never be mistaken for a duplicate of theirs. Not
      // scoped to a conversation — a clientId is unique per user, so a message
      // that landed in another thread is still correctly a duplicate.
      where: { userId, clientId: { in: queued.map((m) => m.clientId) } },
      select: { clientId: true },
    });
    const duplicates = new Set(known.map((m) => m.clientId as string));
    const fresh = queued
      .filter((m) => !duplicates.has(m.clientId))
      .sort((a, b) => a.composedAt.getTime() - b.composedAt.getTime());

    if (fresh.length === 0) {
      return { processed: 0, duplicates: [...duplicates], actions: [], accepted: [], reply: null };
    }

    // One reply per conversation, not one per batch. A flush spanning three
    // chats used to get a single answer, which necessarily landed in the wrong
    // thread for two of them — exactly the failure named chats exist to stop.
    const groups = new Map<string | undefined, QueuedMessage[]>();
    for (const message of fresh) {
      const key = message.conversationId;
      const group = groups.get(key);
      if (group) group.push(message);
      else groups.set(key, [message]);
    }

    const timezone = await this.coaching.userTimezone(userId);
    const historyLimit = await this.settings.get('chat.historyLimit');
    const actions: BatchAction[] = [];
    const accepted: string[] = [];
    const replies: string[] = [];

    for (const [conversationKey, messages] of groups) {
      const conversation = await this.conversations.resolve(userId, conversationKey);
      const reply = await this.replyToGroup(userId, conversation.id, messages, {
        timezone,
        historyLimit,
        actions,
      });
      for (const message of messages) accepted.push(message.clientId);
      if (reply) replies.push(reply);
    }

    return {
      processed: fresh.length,
      duplicates: [...duplicates],
      actions,
      // Which clientIds actually landed. The device used to mark its whole
      // outbox synced on any success, discarding rows the server never saw.
      accepted,
      reply: replies.length > 0 ? replies.join('\n\n') : null,
    };
  }

  /** One conversation's worth of a flush: store, classify, then answer once. */
  private async replyToGroup(
    userId: string,
    conversationId: string,
    messages: QueuedMessage[],
    ctx: { timezone: string; historyLimit: number; actions: BatchAction[] },
  ): Promise<string | null> {
    const { timezone } = ctx;
    const historyRows = await this.history(userId, ctx.historyLimit, conversationId);
    const intentHistory = historyRows
      .slice(-INTENT_HISTORY_LIMIT)
      .map((m) => `${m.role}: ${m.content}`)
      .join('\n');

    for (const message of messages) {
      await this.prisma.message.create({
        data: {
          userId,
          conversationId,
          role: 'user',
          content: message.text,
          clientId: message.clientId,
          composedAt: message.composedAt,
        },
      });

      const intentResult = await this.extractIntent(
        message.text,
        intentHistory,
        timezone,
        message.composedAt,
      );
      if (!intentResult || intentResult.intent === 'chat') continue;

      const detail = await this.handleReminderIntent(userId, intentResult, timezone);
      if (detail) {
        ctx.actions.push({ clientId: message.clientId, intent: intentResult.intent, detail });
      }
    }

    const transcript = messages
      .map((m) => `[sent ${formatInTz(m.composedAt, timezone)}] ${m.text}`)
      .join('\n');
    const handled = ctx.actions.filter((a) => messages.some((m) => m.clientId === a.clientId));
    const done =
      handled.length > 0
        ? `\n\nAlready handled for the user, do not repeat the work — just acknowledge briefly:\n${handled
            .map((a) => `- ${a.detail}`)
            .join('\n')}`
        : '';

    const systemPrompt = loadPrompt('chat.md', {
      today: localDate(new Date(), timezone),
      now: formatInTz(new Date(), timezone),
      timezone,
      reminders: await this.upcomingRemindersLine(userId, timezone),
      coaching: await this.coachingLine(userId),
    });
    const chatMessages: ChatMessage[] = [
      { role: 'system', content: systemPrompt },
      ...historyRows.map((m): ChatMessage => ({ role: m.role, content: m.content })),
      {
        role: 'user',
        content:
          `These messages were written while offline and are arriving together now. ` +
          `Reply once, to all of them:\n${transcript}${done}`,
      },
    ];

    const { stream, usage } = this.llm.chat(chatMessages);
    let reply = '';
    for await (const chunk of stream) reply += chunk;

    await this.prisma.message.create({
      data: { userId, conversationId, role: 'assistant', content: reply },
    });

    const tokenUsage = await usage;
    await this.usage.record({
      userId,
      kind: 'chat',
      model: this.llm.modelName,
      promptTokens: tokenUsage.promptTokens,
      completionTokens: tokenUsage.completionTokens,
    });

    return reply;
  }

  streamReply(
    userId: string,
    conversation: ConversationRef,
    userMessage: string,
  ): Observable<MessageEvent> {
    const conversationId = conversation.id;
    return new Observable<MessageEvent>((subscriber) => {
      const heartbeat = setInterval(() => {
        subscriber.next({ type: 'heartbeat', data: {} });
      }, HEARTBEAT_INTERVAL_MS);

      const run = async () => {
        try {
          // A pending nightly check-in takes precedence over intent
          // classification: while one is open, this message is an answer to
          // it, not a new request. The window is bounded so a message the
          // next morning is not filed as last night's answer.
          //
          // Only in the coaching thread, though. The classifier matches whole
          // words including "rest", "not" and "did", so without this condition
          // "does this need rest time?" typed in a recipe chat at 22:00 would
          // zero the user's streak and answer with "Logged — one off day
          // changes nothing long term." An answer typed in the wrong chat is
          // now simply not recorded, and the window stays open for the real one.
          if (
            conversation.clientId === COACHING_CLIENT_ID &&
            (await this.coaching.isAwaitingCheckin(userId))
          ) {
            const reply = await this.handleCheckinReply(userId, userMessage);
            if (reply) {
              await this.prisma.message.create({
                data: { userId, conversationId, role: 'user', content: userMessage },
              });
              subscriber.next({ type: 'intent', data: { intent: 'checkin_reply' } });
              subscriber.next({ type: 'token', data: reply });
              await this.prisma.message.create({
                data: { userId, conversationId, role: 'assistant', content: reply },
              });
              subscriber.next({ type: 'done', data: {} });
              subscriber.complete();
              return;
            }
            // Unclear reply: fall through to a normal conversational turn
            // rather than recording a guess against the user's streak.
          }

          const historyRows = await this.history(
            userId,
            await this.settings.get('chat.historyLimit'),
            conversationId,
          );

          // The user's own zone, never the server's: "8pm" means 8pm where
          // they are. Reading process.env.TZ here shifted every extracted
          // reminder by the user's UTC offset.
          const timezone = await this.coaching.userTimezone(userId);
          const nowDate = new Date();
          // Intent classification only needs enough context to resolve a
          // pronoun or a follow-up ("cancel that one") — not the full chat
          // window. Every extra turn is prompt tokens the model must
          // process before emitting the first JSON character, which
          // dominates latency on CPU-only inference.
          const intentHistory = historyRows
            .slice(-INTENT_HISTORY_LIMIT)
            .map((m) => `${m.role}: ${m.content}`)
            .join('\n');
          const intentResult = await this.extractIntent(
            userMessage,
            intentHistory,
            timezone,
            nowDate,
          );
          const intent = intentResult?.intent ?? 'chat';
          subscriber.next({
            type: 'intent',
            data: { intent, fallback: intentResult === null },
          });

          await this.prisma.message.create({
            data: { userId, conversationId, role: 'user', content: userMessage },
          });

          // A question that needs the live web. Classification happens before
          // any web text exists, so a snippet cannot talk the classifier into
          // an action — by the time results are in, the only thing left to do
          // is answer.
          let searchResults: SearchResult[] = [];
          let searchImages: ImageResult[] = [];
          if (intentResult && intent === 'web_search') {
            const query = intentResult.query || userMessage;
            // Images only when the user asked to see something; a price or a
            // score does not need a picture, and the extra call is a second
            // round trip on every search otherwise.
            const [results, images] = await Promise.all([
              this.search.search(query),
              wantsImages(userMessage) ? this.search.searchImages(query) : Promise.resolve([]),
            ]);
            searchResults = results;
            searchImages = images;
          }

          // Reminder intents are executed deterministically in code and
          // answered with a templated confirmation — no second model call
          // just to phrase "Reminder set", which the predecessor system
          // wasted a call on for every single reminder.
          if (intentResult && intent !== 'chat' && intent !== 'web_search') {
            const reply = await this.handleReminderIntent(userId, intentResult, timezone);
            if (reply) {
              subscriber.next({ type: 'token', data: reply });
              await this.prisma.message.create({
                data: { userId, conversationId, role: 'assistant', content: reply },
              });
              subscriber.next({ type: 'done', data: {} });
              subscriber.complete();
              return;
            }
          }

          // With results in hand the prompt changes shape: the snippets are
          // the material to answer from, and they displace most of the
          // conversation rather than being added to it. An empty search falls
          // through to an ordinary reply, so a search outage is invisible.
          const searching = searchResults.length > 0;
          const systemPrompt = searching
            ? loadPrompt('search.md', {
                today: localDate(nowDate, timezone),
                timezone,
                question: userMessage,
                results: formatSearchResults(searchResults),
              })
            : loadPrompt('chat.md', {
                today: localDate(nowDate, timezone),
                now: formatInTz(nowDate, timezone),
                timezone,
                reminders: await this.upcomingRemindersLine(userId, timezone),
                coaching: await this.coachingLine(userId),
              });
          const history = searching
            ? historyRows.slice(-SEARCH_HISTORY_LIMIT)
            : historyRows;
          const chatMessages: ChatMessage[] = [
            { role: 'system', content: systemPrompt },
            ...history.map((m): ChatMessage => ({ role: m.role, content: m.content })),
            { role: 'user', content: userMessage },
          ];

          const { stream, usage } = this.llm.chat(chatMessages);
          let fullReply = '';
          for await (const chunk of stream) {
            fullReply += chunk;
            subscriber.next({ type: 'token', data: chunk });
          }

          // The source list is built here from the actual results, never
          // copied from the model's output: a small model mangles long URLs,
          // and echoing an attacker-supplied one back as a tappable link is
          // the whole injection payoff.
          if (searching) {
            const tail =
              formatImages(searchImages, this.mediaSecret) + formatSources(searchResults);
            fullReply += tail;
            subscriber.next({ type: 'token', data: tail });
          }

          await this.prisma.message.create({
            data: { userId, conversationId, role: 'assistant', content: fullReply },
          });

          const tokenUsage = await usage;
          await this.usage.record({
            userId,
            kind: 'chat',
            model: this.llm.modelName,
            promptTokens: tokenUsage.promptTokens,
            completionTokens: tokenUsage.completionTokens,
          });

          subscriber.next({ type: 'done', data: {} });
          subscriber.complete();
        } catch (err) {
          this.logger.error(`chat stream failed: ${String(err)}`);
          subscriber.next({ type: 'error', data: { message: 'The assistant is unavailable right now.' } });
          subscriber.complete();
        }
      };

      run();

      return () => clearInterval(heartbeat);
    });
  }
}
