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
  /** Only sent when true: a non-reasoning model rejects the field entirely. */
  private readonly thinking: boolean;
  /** Shared by both calls — see OLLAMA_NUM_CTX; two sizes means two loads. */
  private readonly numCtx: number;
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
    this.thinking = config.get<boolean>('OLLAMA_THINKING') ?? false;
    this.numCtx = Number(config.get('OLLAMA_NUM_CTX') ?? 8192);
  }

  /** The model every call here runs against — usage rows record it. */
  get modelName(): string {
    return this.model;
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
      // Ollama's NATIVE endpoint, not the OpenAI shim. Two reasons, both
      // measured:
      //
      //  - `format` takes the JSON schema as a decoding grammar, which is
      //    what actually stops qwen3 from reasoning here: every token it may
      //    emit belongs to the JSON, so there is no room for a monologue.
      //    That, not the `think` flag, is why an extraction that measured
      //    528s now takes seconds. The flag is kept off for intent, but this
      //    model's Ollama template opens a `<think>` block regardless of it —
      //    see chat(), where the reasoning has to be handled rather than
      //    wished away.
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
          // Omitted entirely for a non-reasoning model: Ollama rejects the
          // field rather than ignoring it. The grammar is what suppresses a
          // monologue here anyway — every token it may emit is part of the
          // JSON — so this only matters for models that have the capability.
          ...(this.thinking ? { think: false } : {}),
          stream: false,
          options: {
            temperature: 0,
            num_predict: EXTRACT_MAX_TOKENS,
            num_ctx: this.numCtx,
          },
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
    const nativeBaseUrl = this.nativeBaseUrl;
    const timeoutMs = this.timeoutMs;
    const thinking = this.thinking;
    const numCtx = this.numCtx;

    async function* generate(): AsyncIterable<string> {
      let completionChars = 0;
      let reportedUsage: UsageTotals | null = null;

      // The timeout is per-chunk, not per-request: `AbortSignal.timeout` would
      // cut a healthy but slow reply off mid-sentence, and on CPU-only
      // inference a long answer plus qwen3's reasoning phase can run for
      // minutes. What actually means "Ollama died" is silence, so the clock
      // restarts on every chunk that arrives.
      const abort = new AbortController();
      let idle = setTimeout(() => abort.abort(), timeoutMs);
      const touch = () => {
        clearTimeout(idle);
        idle = setTimeout(() => abort.abort(), timeoutMs);
      };

      try {
        // Native /api/chat rather than the /v1 shim, for `think` and
        // `num_ctx`. The shim folds a reasoning model's monologue into the
        // reply, so the user reads it before the answer.
        //
        // On a reasoning model the flag is `true`, not `false`: qwen3's Ollama
        // template opens a `<think>` block for the final turn unconditionally,
        // with no guard on the flag, so the reasoning happens either way and
        // the flag only decides who parses it. With it off, the raw monologue
        // and a stray `</think>` arrive as `message.content`; with it on,
        // Ollama splits them into `message.thinking`, dropped below. A
        // `/no_think` marker does not suppress it either — measured, in both
        // the system prompt and at the end of the user message.
        const response = await fetch(`${nativeBaseUrl}/api/chat`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model,
            messages,
            // Only for a model that reasons. See OLLAMA_THINKING: sending the
            // field to a model without the capability is an error, and the
            // `message.thinking` handling below simply finds nothing.
            ...(thinking ? { think: true } : {}),
            stream: true,
            options: { temperature: 0.4, num_ctx: numCtx },
          }),
          signal: abort.signal,
        });

        if (!response.ok || !response.body) {
          throw new Error(`Ollama returned ${response.status} for the chat stream`);
        }

        // Ollama streams NDJSON — one complete JSON object per line — not SSE.
        // Chunks split anywhere, so hold a buffer and only parse whole lines.
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        const handleLine = (line: string): string | null => {
          let chunk: {
            message?: { content?: string };
            done?: boolean;
            prompt_eval_count?: number;
            eval_count?: number;
          };
          try {
            chunk = JSON.parse(line);
          } catch {
            return null; // a malformed line is not worth killing the stream over
          }
          if (chunk.done && chunk.eval_count !== undefined) {
            reportedUsage = {
              promptTokens: chunk.prompt_eval_count ?? 0,
              completionTokens: chunk.eval_count,
            };
          }
          return chunk.message?.content || null;
        };

        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          touch();
          buffer += decoder.decode(value, { stream: true });

          let newline: number;
          while ((newline = buffer.indexOf('\n')) !== -1) {
            const line = buffer.slice(0, newline).trim();
            buffer = buffer.slice(newline + 1);
            if (!line) continue;
            const delta = handleLine(line);
            if (delta) {
              completionChars += delta.length;
              yield delta;
            }
          }
        }

        // Ollama terminates every line with a newline, but a stream that ends
        // without one would otherwise drop its last object — which is the one
        // carrying the token counts.
        const tail = buffer.trim();
        if (tail) {
          const delta = handleLine(tail);
          if (delta) {
            completionChars += delta.length;
            yield delta;
          }
        }
      } finally {
        clearTimeout(idle);
        // If the phone hung up, the consumer stops pulling from this generator
        // and we land here mid-stream; aborting tells Ollama to stop, instead
        // of leaving it generating tokens for a reply nobody will read. A
        // no-op once the stream has finished normally.
        abort.abort();
        // Resolved even when the stream threw or the consumer walked away, so
        // that anything awaiting usage cannot hang on a promise nobody settles.
        resolveUsage(
          reportedUsage ?? {
            promptTokens: Math.ceil(messages.map((m) => m.content).join(' ').length / 4),
            completionTokens: Math.ceil(completionChars / 4),
          },
        );
      }
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
