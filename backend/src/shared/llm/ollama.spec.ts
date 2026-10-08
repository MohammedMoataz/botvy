import { describe, expect, it } from 'vitest';
import { OllamaClient, parseFrame, readLines } from './ollama.client.js';

function streamOf(chunks: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
      controller.close();
    },
  });
}

function jsonResponse(body: unknown, ok = true, status = 200): Response {
  return {
    ok,
    status,
    json: async () => body,
  } as unknown as Response;
}

const options = { model: 'qwen2.5:3b-instruct', numCtx: 8192 };

describe('frame parsing', () => {
  it('reads a frame', () => {
    expect(parseFrame('{"message":{"content":"hi"}}')).toMatchObject({
      message: { content: 'hi' },
    });
  });

  /** A half-written frame is not an error — the next read completes it. */
  it('returns null for a partial frame rather than throwing', () => {
    expect(parseFrame('{"message":{"cont')).toBeNull();
    expect(parseFrame('   ')).toBeNull();
  });
});

describe('line reading', () => {
  it('joins a frame split across two chunks', async () => {
    const lines: string[] = [];
    for await (const line of readLines(streamOf(['{"a":', '1}\n']), 1_000))
      lines.push(line);

    expect(lines).toEqual(['{"a":1}']);
  });

  it('yields a trailing line with no newline after it', async () => {
    const lines: string[] = [];
    for await (const line of readLines(streamOf(['{"a":1}']), 1_000))
      lines.push(line);

    expect(lines).toEqual(['{"a":1}']);
  });

  /**
   * Per chunk, not per answer: a long reply is normal and must not be cut off,
   * but a stream producing nothing is dead and holding a connection open.
   */
  it('gives up when the stream goes quiet', async () => {
    const silent = new ReadableStream<Uint8Array>({ start() {} });

    await expect(
      (async () => {
        for await (const _line of readLines(silent, 20)) {
          // nothing arrives
        }
      })(),
    ).rejects.toThrow(/produced nothing/);
  });
});

describe('chat', () => {
  it('yields content as it arrives and reports usage at the end', async () => {
    const client = new OllamaClient(
      'http://ollama:11434',
      async () =>
        ({
          ok: true,
          status: 200,
          body: streamOf([
            '{"message":{"content":"Hel"}}\n',
            '{"message":{"content":"lo"}}\n',
            '{"done":true,"prompt_eval_count":12,"eval_count":5}\n',
          ]),
        }) as unknown as Response,
    );

    const pieces: string[] = [];
    const stream = client.chat([{ role: 'user', content: 'hi' }], options);
    let result = await stream.next();
    while (!result.done) {
      pieces.push(result.value);
      result = await stream.next();
    }

    expect(pieces.join('')).toBe('Hello');
    expect(result.value).toMatchObject({
      promptTokens: 12,
      completionTokens: 5,
    });
  });

  it('sends one context size, the configured one', async () => {
    let sent: Record<string, unknown> = {};
    const client = new OllamaClient(
      'http://ollama:11434',
      async (_url, init) => {
        sent = JSON.parse(String((init as RequestInit).body));
        return {
          ok: true,
          status: 200,
          body: streamOf(['{"done":true}\n']),
        } as unknown as Response;
      },
    );

    const stream = client.chat([{ role: 'user', content: 'hi' }], options);
    while (!(await stream.next()).done) {
      // drain
    }

    expect(sent.options).toEqual({ num_ctx: 8192 });
    expect(sent).not.toHaveProperty('keep_alive');
    expect(sent.model).toBe('qwen2.5:3b-instruct');
  });

  it('throws when the model server refuses the request', async () => {
    const client = new OllamaClient(
      'http://ollama:11434',
      async () =>
        ({ ok: false, status: 503, body: null }) as unknown as Response,
    );

    const stream = client.chat([{ role: 'user', content: 'hi' }], options);
    await expect(stream.next()).rejects.toThrow(/HTTP 503/);
  });
});

describe('extraction', () => {
  it('parses a schema-shaped answer', async () => {
    const client = new OllamaClient('http://ollama:11434', async () =>
      jsonResponse({
        message: { content: '{"title":"Call Dad","at":"2026-09-07T18:00"}' },
      }),
    );

    const extracted = await client.extract<{ title: string }>([], {}, options);

    expect(extracted).toEqual({ title: 'Call Dad', at: '2026-09-07T18:00' });
  });

  /**
   * The rule the constitution names: a malformed answer becomes null, and the
   * caller says so plainly rather than acting on a guess.
   */
  it('returns null when the model answers something the schema does not accept', async () => {
    const client = new OllamaClient('http://ollama:11434', async () =>
      jsonResponse({ message: { content: 'Sure! Here is your reminder:' } }),
    );

    expect(await client.extract([], {}, options)).toBeNull();
  });

  it('returns null when the model server is unreachable', async () => {
    const client = new OllamaClient('http://ollama:11434', async () => {
      throw new Error('ECONNREFUSED');
    });

    expect(await client.extract([], {}, options)).toBeNull();
  });

  it('asks for the schema and no creativity', async () => {
    let sent: Record<string, unknown> = {};
    const client = new OllamaClient(
      'http://ollama:11434',
      async (_url, init) => {
        sent = JSON.parse(String((init as RequestInit).body));
        return jsonResponse({ message: { content: '{}' } });
      },
    );

    await client.extract([], { type: 'object' }, options);

    expect(sent.format).toEqual({ type: 'object' });
    expect(sent.options).toMatchObject({ temperature: 0, num_ctx: 8192 });
  });
});

describe('reachability', () => {
  it('is true when the model server answers', async () => {
    const client = new OllamaClient('http://ollama:11434', async () =>
      jsonResponse({}, true),
    );
    expect(await client.isReachable()).toBe(true);
  });

  it('is false rather than throwing when it does not', async () => {
    const client = new OllamaClient('http://ollama:11434', async () => {
      throw new Error('ECONNREFUSED');
    });
    expect(await client.isReachable(20)).toBe(false);
  });
});

/** A fetch that records every URL and request body it is handed. */
function capturing(response: () => Response) {
  const bodies: Array<Record<string, unknown>> = [];
  const urls: string[] = [];
  const fetchImpl = (async (url: string, init?: RequestInit) => {
    urls.push(url);
    if (init?.body) bodies.push(JSON.parse(String(init.body)));
    return response();
  }) as unknown as typeof fetch;
  return { bodies, urls, fetchImpl };
}

describe('keeping the model warm (031)', () => {
  it('sends keep_alive from settings on chat and extraction, and the answer ceiling on chat', async () => {
    const { bodies, fetchImpl } = capturing(
      () =>
        ({
          ok: true,
          status: 200,
          body: streamOf(['{"done":true}\n']),
          json: async () => ({ message: { content: '{}' } }),
        }) as unknown as Response,
    );
    const client = new OllamaClient(
      'http://ollama:11434',
      fetchImpl,
      async () => 600,
    );

    const stream = client.chat([{ role: 'user', content: 'hi' }], {
      ...options,
      maxTokens: 512,
    });
    while (!(await stream.next()).done) {
      // drain
    }
    await client.extract([], { type: 'object' }, options);

    expect(bodies[0]).toMatchObject({
      keep_alive: 600,
      options: { num_ctx: 8192, num_predict: 512 },
    });
    expect(bodies[1]).toMatchObject({ keep_alive: 600 });
    expect(bodies[1]!.options).not.toHaveProperty('num_predict');
  });

  it('leaves keep_alive to the host when no source is bound', async () => {
    const { bodies, fetchImpl } = capturing(() =>
      jsonResponse({ message: { content: '{}' } }),
    );
    await new OllamaClient('http://ollama:11434', fetchImpl).extract(
      [],
      {},
      options,
    );
    expect(bodies[0]).not.toHaveProperty('keep_alive');
  });

  it('reads what is loaded from /api/ps', async () => {
    const { urls, fetchImpl } = capturing(() =>
      jsonResponse({ models: [{ name: 'qwen2.5:3b-instruct' }] }),
    );
    const client = new OllamaClient('http://ollama:11434', fetchImpl);

    expect(await client.isLoaded('qwen2.5:3b-instruct')).toBe(true);
    expect(await client.isLoaded('qwen3:4b')).toBe(false);
    expect(urls[0]).toBe('http://ollama:11434/api/ps');
  });

  it('warms with the given messages, one token, the one context size', async () => {
    const { bodies, fetchImpl } = capturing(
      () => ({ ok: true, status: 200, body: null }) as unknown as Response,
    );
    const client = new OllamaClient(
      'http://ollama:11434',
      fetchImpl,
      async () => -1,
    );

    await client.warm(
      'qwen2.5:3b-instruct',
      [{ role: 'user', content: 'x' }],
      8192,
    );

    expect(bodies[0]).toEqual({
      model: 'qwen2.5:3b-instruct',
      messages: [{ role: 'user', content: 'x' }],
      stream: false,
      keep_alive: -1,
      options: { num_ctx: 8192, num_predict: 1 },
    });
  });
});
