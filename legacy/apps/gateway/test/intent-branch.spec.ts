import { afterEach, describe, expect, it, vi } from 'vitest';
import { LlmService } from '../src/llm/llm.service.js';

function makeConfig(thinking = false) {
  return {
    get: vi.fn((key: string) => {
      if (key === 'OLLAMA_BASE_URL') return 'http://localhost:11434/v1';
      if (key === 'OLLAMA_CHAT_MODEL') return 'qwen3:1.7b';
      if (key === 'LLM_REQUEST_TIMEOUT_MS') return 120_000;
      if (key === 'OLLAMA_THINKING') return thinking;
      if (key === 'OLLAMA_NUM_CTX') return 8192;
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
function makeLlm(fetchImpl: () => unknown, thinking = false) {
  vi.stubGlobal('fetch', vi.fn(fetchImpl));
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return new LlmService(makeConfig(thinking) as any);
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

  it('caps the response length and pins the context window', async () => {
    const llm = makeLlm(ok('{"intent":"chat"}'));
    await llm.extract(args);

    const body = JSON.parse(
      (vi.mocked(fetch).mock.calls[0][1] as { body: string }).body,
    ) as { think?: boolean; stream: boolean; options: { num_predict: number; num_ctx: number } };

    expect(body.stream).toBe(false);
    expect(body.options.num_predict).toBeGreaterThan(0);
    // Left to the host's default, a window bigger than VRAM spills onto the
    // CPU; asking for a different size here than chat() uses reloads the model
    // on every turn, so both calls send the same one.
    expect(body.options.num_ctx).toBe(8192);
  });

  it('omits `think` unless the model is a reasoning one', async () => {
    // Ollama rejects the field outright for a model without the capability,
    // which would take every extraction down rather than degrade it.
    const llm = makeLlm(ok('{"intent":"chat"}'));
    await llm.extract(args);

    const body = JSON.parse(
      (vi.mocked(fetch).mock.calls[0][1] as { body: string }).body,
    ) as Record<string, unknown>;
    expect('think' in body).toBe(false);
  });

  it('suppresses thinking when the model is a reasoning one', async () => {
    // Without think:false a single qwen3 extraction took 528s instead of 5s.
    const llm = makeLlm(ok('{"intent":"chat"}'), true);
    await llm.extract(args);

    const body = JSON.parse(
      (vi.mocked(fetch).mock.calls[0][1] as { body: string }).body,
    ) as { think: boolean };
    expect(body.think).toBe(false);
  });

  it('targets the native API root, not the /v1 OpenAI shim', async () => {
    const llm = makeLlm(ok('{"intent":"chat"}'));
    await llm.extract(args);
    expect(vi.mocked(fetch).mock.calls[0][0]).toBe('http://localhost:11434/api/chat');
  });
});
