import { Injectable, Logger, type MessageEvent } from '@nestjs/common';
import { Observable } from 'rxjs';
import { PrismaService } from '../prisma/prisma.service.js';
import { LlmService, type ChatMessage } from '../llm/llm.service.js';
import { UsageService } from '../usage/usage.service.js';
import { RemindersService } from '../reminders/reminders.service.js';
import { CoachingService } from '../coaching/coaching.service.js';
import { classifyCheckin } from '../coaching/checkin-classifier.js';
import { loadPrompt } from '../llm/prompts.js';

const HISTORY_LIMIT = 20;
const INTENT_HISTORY_LIMIT = 4;
const HEARTBEAT_INTERVAL_MS = 15_000;

const INTENT_SCHEMA = {
  type: 'object',
  properties: {
    intent: {
      type: 'string',
      enum: ['chat', 'set_reminder', 'list_reminders', 'cancel_reminder'],
    },
    title: { type: 'string' },
    remindAt: { type: 'string' },
    needsClarification: { type: 'boolean' },
    clarifyQuestion: { type: 'string' },
  },
  required: ['intent', 'title', 'remindAt', 'needsClarification', 'clarifyQuestion'],
  additionalProperties: false,
} as const;

interface IntentResult {
  intent: 'chat' | 'set_reminder' | 'list_reminders' | 'cancel_reminder';
  title: string;
  remindAt: string;
  needsClarification: boolean;
  clarifyQuestion: string;
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
  ) {}

  async history(userId: string, limit = 50) {
    const rows = await this.prisma.message.findMany({
      where: { userId },
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
  ): Promise<string | null> {
    if (result.intent === 'list_reminders') {
      const active = await this.reminders.list(userId, 'active');
      if (active.length === 0) return 'You have no active reminders.';
      const lines = active.map(
        (r) => `• ${r.title} — ${r.remindAt.toISOString().replace('T', ' ').slice(0, 16)} UTC`,
      );
      return `Your reminders:\n${lines.join('\n')}`;
    }

    if (result.intent === 'cancel_reminder') {
      const active = await this.reminders.list(userId, 'active');
      if (active.length === 0) return 'You have no active reminders to cancel.';
      const target = result.title
        ? active.find((r) => r.title.toLowerCase().includes(result.title.toLowerCase()))
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
      const remindAt = new Date(result.remindAt);
      if (Number.isNaN(remindAt.getTime())) {
        this.logger.warn(`model produced an unparseable remindAt: ${result.remindAt}`);
        return null; // fall through to a normal chat reply
      }
      const reminder = await this.reminders.create(userId, {
        title: result.title || 'Reminder',
        remindAt,
      });
      const when = remindAt.toISOString().replace('T', ' ').slice(0, 16);
      return `Reminder set: ${reminder.title} — ${when} UTC.`;
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

  streamReply(userId: string, userMessage: string): Observable<MessageEvent> {
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
          if (await this.coaching.isAwaitingCheckin(userId)) {
            const reply = await this.handleCheckinReply(userId, userMessage);
            if (reply) {
              await this.prisma.message.create({
                data: { userId, role: 'user', content: userMessage },
              });
              subscriber.next({ type: 'intent', data: { intent: 'checkin_reply' } });
              subscriber.next({ type: 'token', data: reply });
              await this.prisma.message.create({
                data: { userId, role: 'assistant', content: reply },
              });
              subscriber.next({ type: 'done', data: {} });
              subscriber.complete();
              return;
            }
            // Unclear reply: fall through to a normal conversational turn
            // rather than recording a guess against the user's streak.
          }

          const historyRows = await this.history(userId, HISTORY_LIMIT);

          const timezone = process.env.TZ ?? 'UTC';
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
          const intentPrompt = loadPrompt('intent.md', {
            history: intentHistory || '(none)',
            message: userMessage,
            now: nowDate.toISOString(),
            timezone,
            today: nowDate.toISOString().slice(0, 10),
          });
          const intentResult = await this.llm.extract<IntentResult>({
            messages: [{ role: 'user', content: intentPrompt }],
            schemaName: 'intent',
            schema: INTENT_SCHEMA,
          });
          const intent = intentResult?.intent ?? 'chat';
          subscriber.next({
            type: 'intent',
            data: { intent, fallback: intentResult === null },
          });

          await this.prisma.message.create({
            data: { userId, role: 'user', content: userMessage },
          });

          // Reminder intents are executed deterministically in code and
          // answered with a templated confirmation — no second model call
          // just to phrase "Reminder set", which the predecessor system
          // wasted a call on for every single reminder.
          if (intentResult && intent !== 'chat') {
            const reply = await this.handleReminderIntent(userId, intentResult);
            if (reply) {
              subscriber.next({ type: 'token', data: reply });
              await this.prisma.message.create({
                data: { userId, role: 'assistant', content: reply },
              });
              subscriber.next({ type: 'done', data: {} });
              subscriber.complete();
              return;
            }
          }

          const systemPrompt = loadPrompt('chat.md');
          const chatMessages: ChatMessage[] = [
            { role: 'system', content: systemPrompt },
            ...historyRows.map((m): ChatMessage => ({ role: m.role, content: m.content })),
            { role: 'user', content: userMessage },
          ];

          const { stream, usage } = this.llm.chat(chatMessages);
          let fullReply = '';
          for await (const chunk of stream) {
            fullReply += chunk;
            subscriber.next({ type: 'token', data: chunk });
          }

          await this.prisma.message.create({
            data: { userId, role: 'assistant', content: fullReply },
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
