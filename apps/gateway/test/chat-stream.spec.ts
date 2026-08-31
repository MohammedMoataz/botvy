import { afterEach, describe, expect, it, vi } from 'vitest';
import { LlmService } from '../src/llm/llm.service.js';

/**
 * Ollama answers /api/chat with NDJSON, and the network splits it wherever it
 * likes. These tests feed the parser deliberately awkward splits — mid-object,
 * mid-word, and a final object with no trailing newline — because every one of
 * those has a plausible failure mode: a dropped reply, a crash, or lost token
 * counts.
 */
function streamOf(pieces: string[]): Response {
  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const piece of pieces) controller.enqueue(encoder.encode(piece));
      controller.close();
    },
  });
  return new Response(body, { status: 200 });
}

function makeService(response: Response) {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response));
  const config = {
    get: vi.fn((key: string) =>
      key === 'OLLAMA_BASE_URL'
        ? 'http://ollama.test:11434/v1'
        : key === 'OLLAMA_CHAT_MODEL'
          ? 'qwen3:4b'
          : undefined,
    ),
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return new LlmService(config as any);
}

async function collect(stream: AsyncIterable<string>): Promise<string> {
  let out = '';
  for await (const chunk of stream) out += chunk;
  return out;
}

const line = (obj: Record<string, unknown>) => `${JSON.stringify(obj)}\n`;

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('LlmService.chat NDJSON stream', () => {
  it('yields content only, dropping the reasoning Ollama reports separately', async () => {
    const service = makeService(
      streamOf([
        line({ message: { thinking: 'The user wants the capital of Egypt.' } }),
        line({ message: { thinking: ' I know this one.' } }),
        line({ message: { content: 'Cairo' } }),
        line({ message: { content: ' is the capital.' } }),
        line({ message: { content: '' }, done: true, prompt_eval_count: 31, eval_count: 7 }),
      ]),
    );

    const { stream, usage } = service.chat([{ role: 'user', content: 'capital of Egypt?' }]);
    expect(await collect(stream)).toBe('Cairo is the capital.');
    expect(await usage).toEqual({ promptTokens: 31, completionTokens: 7 });
  });

  it('reassembles objects split across network chunks', async () => {
    const whole = [
      line({ message: { content: 'Hel' } }),
      line({ message: { content: 'lo' } }),
      line({ done: true, prompt_eval_count: 4, eval_count: 2 }),
    ].join('');
    // Split mid-JSON-object, which is where a naive per-chunk JSON.parse dies.
    const cut = whole.indexOf('lo') - 3;
    const service = makeService(streamOf([whole.slice(0, cut), whole.slice(cut)]));

    const { stream, usage } = service.chat([{ role: 'user', content: 'hi' }]);
    expect(await collect(stream)).toBe('Hello');
    expect(await usage).toEqual({ promptTokens: 4, completionTokens: 2 });
  });

  it('still reads the final object when the stream ends without a newline', async () => {
    const service = makeService(
      streamOf([
        line({ message: { content: 'done' } }),
        JSON.stringify({ done: true, prompt_eval_count: 9, eval_count: 3 }),
      ]),
    );

    const { stream, usage } = service.chat([{ role: 'user', content: 'hi' }]);
    await collect(stream);
    expect(await usage).toEqual({ promptTokens: 9, completionTokens: 3 });
  });

  it('estimates usage when Ollama never reports token counts', async () => {
    const service = makeService(streamOf([line({ message: { content: 'abcd' } })]));

    const { stream, usage } = service.chat([{ role: 'user', content: 'hi' }]);
    await collect(stream);
    expect(await usage).toEqual({ promptTokens: 1, completionTokens: 1 });
  });

  it('settles the usage promise even when the request fails', async () => {
    const service = makeService(new Response('nope', { status: 500 }));

    const { stream, usage } = service.chat([{ role: 'user', content: 'hi' }]);
    await expect(collect(stream)).rejects.toThrow(/500/);
    // The point is that this resolves at all: a hung promise here would hang
    // every caller that awaits token counts after a failed stream.
    await expect(usage).resolves.toMatchObject({ completionTokens: 0 });
  });
});
