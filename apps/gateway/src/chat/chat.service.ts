import { Injectable, Logger, type MessageEvent } from '@nestjs/common';
import { Observable } from 'rxjs';
import { PrismaService } from '../prisma/prisma.service.js';
import { LlmService, type ChatMessage } from '../llm/llm.service.js';
import { UsageService } from '../usage/usage.service.js';
import { loadPrompt } from '../llm/prompts.js';

const HISTORY_LIMIT = 20;
const HEARTBEAT_INTERVAL_MS = 15_000;

const INTENT_SCHEMA = {
  type: 'object',
  properties: {
    intent: { type: 'string', enum: ['chat', 'structured_action'] },
  },
  required: ['intent'],
  additionalProperties: false,
} as const;

interface IntentResult {
  intent: 'chat' | 'structured_action';
}

@Injectable()
export class ChatService {
  private readonly logger = new Logger(ChatService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly llm: LlmService,
    private readonly usage: UsageService,
  ) {}

  async history(userId: string, limit = 50) {
    const rows = await this.prisma.message.findMany({
      where: { userId },
      orderBy: { id: 'desc' },
      take: limit,
    });
    return rows.reverse();
  }

  streamReply(userId: string, userMessage: string): Observable<MessageEvent> {
    return new Observable<MessageEvent>((subscriber) => {
      const heartbeat = setInterval(() => {
        subscriber.next({ type: 'heartbeat', data: {} });
      }, HEARTBEAT_INTERVAL_MS);

      const run = async () => {
        try {
          const historyRows = await this.history(userId, HISTORY_LIMIT);
          const historyText = historyRows.map((m) => `${m.role}: ${m.content}`).join('\n');

          const intentPrompt = loadPrompt('intent.md', {
            history: historyText || '(none)',
            message: userMessage,
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
            model: 'qwen3:4b',
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
