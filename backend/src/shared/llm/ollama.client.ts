import { Injectable, Logger } from '@nestjs/common';

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface ChatOptions {
  model: string;
  numCtx: number;
  /** Abort mid-stream when the member presses Stop. */
  signal?: AbortSignal;
  /** How long a single chunk may take before the stream is treated as dead. */
  idleTimeoutMs?: number;
  /** Ceiling on the answer, sent as `num_predict`; absent means the model's own. */
  maxTokens?: number;
}

/** A chunk is not a token count; the client reports what the server told it. */
export interface ChatUsage {
  model: string;
  promptTokens: number;
  completionTokens: number;
  ms: number;
}

export const DEFAULT_IDLE_TIMEOUT_MS = 30_000;

/**
 * The one place the platform talks to a model, and it is always a local one.
 *
 * Three rules from the constitution show up directly here. Model names and
 * context size are settings rather than constants, so the Owner can move to a
 * larger model without a deploy. Every call uses the same `numCtx`, because
 * Ollama keys a loaded model by its context size and two sizes make it reload
 * on every turn — measured at thirty-nine seconds to first token. And
 * structured extraction is grammar-constrained and falls back to a plain reply
 * rather than pretending a malformed answer parsed.
 */
@Injectable()
export class OllamaClient {
  private readonly logger = new Logger(OllamaClient.name);

  constructor(
    private readonly baseUrl: string,
    private readonly fetchImpl: typeof fetch = fetch,
    /**
     * `llm.keepAlive`, read per call so a change in settings takes effect
     * without a restart. Absent, the request leaves it to the host's
     * `OLLAMA_KEEP_ALIVE`, and a host without that variable unloads the model
     * after five idle minutes and makes the next turn pay to load it (031).
     */
    private readonly keepAlive?: () => Promise<number>,
  ) {}

  /** `keep_alive` for a request body, or nothing when no source was bound. */
  private async keepAliveField(): Promise<{ keep_alive?: number }> {
    return this.keepAlive ? { keep_alive: await this.keepAlive() } : {};
  }

  /** Is this model loaded right now? `/api/ps` lists what is in memory. */
  async isLoaded(model: string, timeoutMs = 2_000): Promise<boolean> {
    try {
      const response = await this.fetchImpl(`${this.baseUrl}/api/ps`, {
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (!response.ok) return false;
      const body = (await response.json()) as {
        models?: Array<{ name?: string; model?: string }>;
      };
      return (body.models ?? []).some(
        (loaded) => loaded.name === model || loaded.model === model,
      );
    } catch {
      return false;
    }
  }

  /**
   * Loads a model and has it read `messages`, writing a single token.
   *
   * What it reads stays in Ollama's prompt cache, so the first real request
   * that starts the same way skips reading it. The extraction prompt is 3,700
   * tokens and took 31 s to read cold on the Owner's GPU (031). Throws when
   * Ollama refuses; the caller decides whether that matters.
   */
  async warm(
    model: string,
    messages: ChatMessage[],
    numCtx: number,
  ): Promise<void> {
    const response = await this.fetchImpl(`${this.baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        model,
        messages,
        stream: false,
        ...(await this.keepAliveField()),
        options: { num_ctx: numCtx, num_predict: 1 },
      }),
    });
    if (!response.ok) {
      throw new Error(`Ollama refused the warm-up: HTTP ${response.status}`);
    }
    await response.body?.cancel();
  }

  /** Is the model server there? Used by health, with a short timeout. */
  async isReachable(timeoutMs = 2_000): Promise<boolean> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await this.fetchImpl(`${this.baseUrl}/api/tags`, {
        signal: controller.signal,
      });
      return response.ok;
    } catch {
      return false;
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * Streams an answer. Yields text as it arrives so the member sees the reply
   * being written rather than waiting for all of it.
   */
  async *chat(
    messages: ChatMessage[],
    options: ChatOptions,
  ): AsyncGenerator<string, ChatUsage | null, void> {
    const started = Date.now();
    const response = await this.fetchImpl(`${this.baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        model: options.model,
        messages,
        stream: true,
        ...(await this.keepAliveField()),
        options: {
          num_ctx: options.numCtx,
          ...(options.maxTokens ? { num_predict: options.maxTokens } : {}),
        },
      }),
      ...(options.signal ? { signal: options.signal } : {}),
    });

    if (!response.ok || !response.body) {
      throw new Error(
        `Ollama refused the chat request: HTTP ${response.status}`,
      );
    }

    let usage: ChatUsage | null = null;
    for await (const line of readLines(
      response.body,
      options.idleTimeoutMs ?? DEFAULT_IDLE_TIMEOUT_MS,
    )) {
      const frame = parseFrame(line);
      if (!frame) continue;
      if (
        typeof frame.message?.content === 'string' &&
        frame.message.content.length > 0
      ) {
        yield frame.message.content;
      }
      /*
       * The counts exist **only here**, in the terminating frame (E-013).
       *
       * An aborted stream — the member pressed Stop, or the allergen guard
       * returned early — never reaches it, so a turn that generated four
       * hundred tokens is metered as zero. That is a property of the interface
       * and not a mistake in this loop: there is no documented way to
       * interrogate a cut stream, and the workarounds are all worse than the
       * gap (a character-count estimate is wrong by a factor that varies with
       * the language, which would over-meter an Arabic-writing member).
       *
       * **What would close it**: a `usage` object on an aborted response, or
       * per-chunk `prompt_eval_count` / `eval_count` on the frames before the
       * last. If a future Ollama exposes either, read it into `usage` as each
       * frame arrives rather than only on `done`, and delete the `usage: null`
       * note at `TurnRunner.converse`'s abort path. Re-check at every Ollama
       * bump; the version is pinned in `plan.md`'s dependency table.
       */
      if (frame.done) {
        usage = {
          model: options.model,
          promptTokens: Number(frame.prompt_eval_count ?? 0),
          completionTokens: Number(frame.eval_count ?? 0),
          ms: Date.now() - started,
        };
      }
    }
    return usage;
  }

  /**
   * Grammar-constrained extraction. Returns null when the model produces
   * something the schema does not accept — the caller then says so plainly
   * rather than acting on a guess. A small model asked for free text will
   * monologue; asked for a schema it either fits or it does not.
   */
  async extract<T>(
    messages: ChatMessage[],
    schema: unknown,
    options: ChatOptions,
  ): Promise<T | null> {
    try {
      const response = await this.fetchImpl(`${this.baseUrl}/api/chat`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          model: options.model,
          messages,
          stream: false,
          format: schema,
          ...(await this.keepAliveField()),
          // Extraction is not a place for creativity.
          options: {
            num_ctx: options.numCtx,
            temperature: 0,
            ...(options.maxTokens ? { num_predict: options.maxTokens } : {}),
          },
        }),
        ...(options.signal ? { signal: options.signal } : {}),
      });

      if (!response.ok) return null;
      const body = (await response.json()) as {
        message?: { content?: string };
      };
      const content = body.message?.content;
      if (!content) return null;
      return JSON.parse(content) as T;
    } catch (error) {
      this.logger.warn(
        `extraction produced nothing usable: ${(error as Error).message}`,
      );
      return null;
    }
  }
}

interface OllamaFrame {
  message?: { content?: string };
  done?: boolean;
  prompt_eval_count?: number;
  eval_count?: number;
}

export function parseFrame(line: string): OllamaFrame | null {
  const trimmed = line.trim();
  if (trimmed.length === 0) return null;
  try {
    return JSON.parse(trimmed) as OllamaFrame;
  } catch {
    // A half-written frame is not an error; the next read completes it.
    return null;
  }
}

/**
 * Splits a byte stream into lines, giving up if nothing arrives for a while.
 *
 * The idle timeout is per chunk rather than for the whole answer: a long reply
 * is normal and must not be cut off, but a stream that has stopped producing
 * anything is dead and holding the member's connection open.
 */
export async function* readLines(
  body: ReadableStream<Uint8Array>,
  idleTimeoutMs: number,
): AsyncGenerator<string, void, void> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffered = '';

  try {
    for (;;) {
      const chunk = await withIdleTimeout(reader.read(), idleTimeoutMs);
      if (chunk.done) break;

      buffered += decoder.decode(chunk.value, { stream: true });
      const lines = buffered.split('\n');
      buffered = lines.pop() ?? '';
      for (const line of lines) yield line;
    }
    if (buffered.trim().length > 0) yield buffered;
  } finally {
    reader.releaseLock();
  }
}

async function withIdleTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(
          () => reject(new Error(`model produced nothing for ${ms}ms`)),
          ms,
        );
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
