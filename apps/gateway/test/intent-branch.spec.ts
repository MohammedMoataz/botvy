import { describe, expect, it, vi } from 'vitest';
import { LlmService } from '../src/llm/llm.service.js';

function makeLlm(createImpl: () => unknown) {
  const config = {
    get: vi.fn((key: string) => {
      if (key === 'OLLAMA_BASE_URL') return 'http://localhost:11434/v1';
      if (key === 'OLLAMA_CHAT_MODEL') return 'qwen3:4b';
      if (key === 'LLM_REQUEST_TIMEOUT_MS') return 120_000;
      return undefined;
    }),
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const service = new LlmService(config as any);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (service as any).client = {
    chat: { completions: { create: vi.fn(createImpl) } },
  };
  return service;
}

const args = {
  messages: [{ role: 'user' as const, content: 'hi' }],
  schemaName: 'intent',
  schema: { type: 'object' },
};

describe('LlmService.extract — fallback behavior', () => {
  it('returns the parsed object when the model honors the schema', async () => {
    const llm = makeLlm(() => ({
      choices: [{ message: { content: '{"intent":"chat"}' } }],
    }));
    expect(await llm.extract<{ intent: string }>(args)).toEqual({ intent: 'chat' });
  });

  it('returns null (not throw) when the model emits malformed JSON', async () => {
    const llm = makeLlm(() => ({
      choices: [{ message: { content: 'I think the intent is chat!' } }],
    }));
    expect(await llm.extract(args)).toBeNull();
  });

  it('returns null when the response has no content', async () => {
    const llm = makeLlm(() => ({ choices: [{ message: {} }] }));
    expect(await llm.extract(args)).toBeNull();
  });

  it('returns null when the backend call throws (timeout, connection refused)', async () => {
    const llm = makeLlm(() => {
      throw new Error('Request timed out.');
    });
    expect(await llm.extract(args)).toBeNull();
  });
});
