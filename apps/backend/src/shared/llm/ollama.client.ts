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
  ) {}

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
        options: { num_ctx: options.numCtx },
      }),
      ...(options.signal ? { signal: options.signal } : {}),
    });

    if (!response.ok || !response.body) {
      throw new Error(`Ollama refused the chat request: HTTP ${response.status}`);
    }

    let usage: ChatUsage | null = null;
    for await (const line of readLines(response.body, options.idleTimeoutMs ?? DEFAULT_IDLE_TIMEOUT_MS)) {
      const frame = parseFrame(line);
      if (!frame) continue;
      if (typeof frame.message?.content === 'string' && frame.message.content.length > 0) {
        yield frame.message.content;
      }
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
          // Extraction is not a place for creativity.
          options: { num_ctx: options.numCtx, temperature: 0 },
        }),
        ...(options.signal ? { signal: options.signal } : {}),
      });

      if (!response.ok) return null;
      const body = (await response.json()) as { message?: { content?: string } };
      const content = body.message?.content;
      if (!content) return null;
      return JSON.parse(content) as T;
    } catch (error) {
      this.logger.warn(`extraction produced nothing usable: ${(error as Error).message}`);
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
        timer = setTimeout(() => reject(new Error(`model produced nothing for ${ms}ms`)), ms);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
