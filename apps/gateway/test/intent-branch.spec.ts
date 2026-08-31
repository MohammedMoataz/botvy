import { afterEach, describe, expect, it, vi } from 'vitest';
import { LlmService } from '../src/llm/llm.service.js';

function makeConfig() {
  return {
    get: vi.fn((key: string) => {
      if (key === 'OLLAMA_BASE_URL') return 'http://localhost:11434/v1';
      if (key === 'OLLAMA_CHAT_MODEL') return 'qwen3:1.7b';
      if (key === 'LLM_REQUEST_TIMEOUT_MS') return 120_000;
      return undefined;
    }),
  };
}

/**
 * extract() calls Ollama's native /api/chat with fetch, not the OpenAI shim
 * the class uses for chat() — that endpoint is the only one exposing
 * `think: false`, without which qwen3 emits an unbounded reasoning phase
 * (measured: 528s versus 5s for the same extraction). So these stub fetch.
 */
function makeLlm(fetchImpl: () => unknown) {
  vi.stubGlobal('fetch', vi.fn(fetchImpl));
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return new LlmService(makeConfig() as any);
}

const ok = (content: string) => () => ({
  ok: true,
  status: 200,
  json: async () => ({ message: { content } }),
});

const args = {
  messages: [{ role: 'user' as const, content: 'hi' }],
  schemaName: 'intent',
  schema: { type: 'object' },
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('LlmService.extract — fallback behavior', () => {
  it('returns the parsed object when the model honors the schema', async () => {
    const llm = makeLlm(ok('{"intent":"chat"}'));
    expect(await llm.extract<{ intent: string }>(args)).toEqual({ intent: 'chat' });
  });

  it('returns null (not throw) when the model emits malformed JSON', async () => {
    const llm = makeLlm(ok('I think the intent is chat!'));
    expect(await llm.extract(args)).toBeNull();
  });

  it('returns null when the response has no content', async () => {
    const llm = makeLlm(() => ({ ok: true, status: 200, json: async () => ({ message: {} }) }));
    expect(await llm.extract(args)).toBeNull();
  });

  it('returns null when the backend call throws (timeout, connection refused)', async () => {
    const llm = makeLlm(() => {
      throw new Error('Request timed out.');
    });
    expect(await llm.extract(args)).toBeNull();
  });

  it('returns null on a non-2xx response rather than parsing the error body', async () => {
    const llm = makeLlm(() => ({
      ok: false,
      status: 500,
      json: async () => ({ error: 'llama-server process has terminated' }),
    }));
    expect(await llm.extract(args)).toBeNull();
  });

  it('suppresses thinking and caps the response length', async () => {
    const llm = makeLlm(ok('{"intent":"chat"}'));
    await llm.extract(args);

    const body = JSON.parse(
      (vi.mocked(fetch).mock.calls[0][1] as { body: string }).body,
    ) as { think: boolean; stream: boolean; options: { num_predict: number } };

    // Without think:false a single extraction took 528s instead of 5s.
    expect(body.think).toBe(false);
    expect(body.stream).toBe(false);
    expect(body.options.num_predict).toBeGreaterThan(0);
  });

  it('targets the native API root, not the /v1 OpenAI shim', async () => {
    const llm = makeLlm(ok('{"intent":"chat"}'));
    await llm.extract(args);
    expect(vi.mocked(fetch).mock.calls[0][0]).toBe('http://localhost:11434/api/chat');
  });
});
