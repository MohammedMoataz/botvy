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

/**
 * Ceiling on an extraction response. Every schema this is used with returns
 * well under 200 tokens; anything longer means the model is rambling rather
 * than answering, and failing fast is better than holding the request open.
 */
const EXTRACT_MAX_TOKENS = 512;

@Injectable()
export class LlmService {
  private readonly client: OpenAI;
  private readonly model: string;
  /** Ollama's own API root — OLLAMA_BASE_URL points at its /v1 OpenAI shim. */
  private readonly nativeBaseUrl: string;
  private readonly timeoutMs: number;
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
    this.timeoutMs = Number(config.get('LLM_REQUEST_TIMEOUT_MS') ?? 120_000);
    this.nativeBaseUrl = (config.get<string>('OLLAMA_BASE_URL') ?? '').replace(/\/v1\/?$/, '');
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
      // Ollama's NATIVE endpoint, not the OpenAI shim this class uses for
      // chat(). Two reasons, both measured:
      //
      //  - `think: false` only exists here. Left on, qwen3 emits an unbounded
      //    reasoning phase before the JSON: one extraction measured 528s with
      //    thinking on versus 5.18s with it off, same model, same hardware.
      //    The shim offers no equivalent, and a `/no_think` prompt prefix did
      //    not reliably suppress it under json_schema.
      //  - `num_predict` caps the response, so a model that starts rambling
      //    fails fast into the caller's chat fallback instead of burning the
      //    whole request timeout.
      const response = await fetch(`${this.nativeBaseUrl}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: this.model,
          messages: params.messages,
          format: params.schema,
          think: false,
          stream: false,
          options: { temperature: 0, num_predict: EXTRACT_MAX_TOKENS },
        }),
        signal: AbortSignal.timeout(this.timeoutMs),
      });

      if (!response.ok) {
        this.logger.warn(
          `extract() got HTTP ${response.status} from Ollama, caller should fall back to chat`,
        );
        return null;
      }

      const body = (await response.json()) as { message?: { content?: string } };
      const content = body.message?.content;
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
