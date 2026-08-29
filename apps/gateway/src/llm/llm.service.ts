import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface UsageTotals {
  promptTokens: number;
  completionTokens: number;
}

export interface StreamedChatResult {
  stream: AsyncIterable<string>;
  /** Resolves once the stream is fully consumed. */
  usage: Promise<UsageTotals>;
}

@Injectable()
export class LlmService {
  private readonly client: OpenAI;
  private readonly model: string;
  private readonly logger = new Logger(LlmService.name);

  constructor(config: ConfigService) {
    this.client = new OpenAI({
      baseURL: config.get<string>('OLLAMA_BASE_URL'),
      apiKey: 'ollama',
      // Without an explicit timeout the SDK waits indefinitely; a wrong or
      // unreachable base URL would otherwise hang /health forever instead
      // of reporting the backend as down. The default is generous because
      // CPU-only inference (the current fallback while the GPU/CUDA driver
      // issue is open) runs at only a few tokens/second — a short timeout
      // silently degrades every structured-extraction call into the plain
      // chat fallback path.
      timeout: Number(config.get('LLM_REQUEST_TIMEOUT_MS') ?? 120_000),
      maxRetries: 1,
    });
    this.model = config.get<string>('OLLAMA_CHAT_MODEL')!;
  }

  /**
   * Runs a temperature-0, JSON-schema-constrained extraction call.
   * Returns null (never throws) if the model's output doesn't parse or
   * doesn't satisfy the schema shape expected by the caller — callers must
   * fall back to plain chat on null, per the constitution's Edge Cases.
   */
  async extract<T>(params: {
    messages: ChatMessage[];
    schemaName: string;
    schema: Record<string, unknown>;
  }): Promise<T | null> {
    try {
      const completion = await this.client.chat.completions.create({
        model: this.model,
        temperature: 0,
        messages: params.messages,
        response_format: {
          type: 'json_schema',
          json_schema: { name: params.schemaName, strict: true, schema: params.schema },
        },
      });
      const content = completion.choices[0]?.message?.content;
      if (!content) return null;
      return JSON.parse(content) as T;
    } catch (err) {
      this.logger.warn(`extract() failed, caller should fall back to chat: ${String(err)}`);
      return null;
    }
  }

  /**
   * Streams a conversational reply. The returned `usage` promise resolves
   * once the stream ends; if Ollama doesn't report usage on the final
   * chunk, token counts are estimated from character length (~4 chars/token)
   * as a documented approximation — good enough for quota bookkeeping,
   * not for billing-grade accuracy.
   */
  chat(messages: ChatMessage[]): StreamedChatResult {
    let resolveUsage!: (usage: UsageTotals) => void;
    const usage = new Promise<UsageTotals>((resolve) => {
      resolveUsage = resolve;
    });

    const model = this.model;
    const client = this.client;

    async function* generate(): AsyncIterable<string> {
      let completionChars = 0;
      let reportedUsage: UsageTotals | null = null;

      const streamResponse = await client.chat.completions.create({
        model,
        temperature: 0.4,
        messages,
        stream: true,
        stream_options: { include_usage: true },
      });

      for await (const chunk of streamResponse) {
        const delta = chunk.choices[0]?.delta?.content;
        if (delta) {
          completionChars += delta.length;
          yield delta;
        }
        if (chunk.usage) {
          reportedUsage = {
            promptTokens: chunk.usage.prompt_tokens,
            completionTokens: chunk.usage.completion_tokens,
          };
        }
      }

      resolveUsage(
        reportedUsage ?? {
          promptTokens: Math.ceil(messages.map((m) => m.content).join(' ').length / 4),
          completionTokens: Math.ceil(completionChars / 4),
        },
      );
    }

    return { stream: generate(), usage };
  }

  async ping(): Promise<boolean> {
    try {
      await this.client.models.list();
      return true;
    } catch {
      return false;
    }
  }
}
