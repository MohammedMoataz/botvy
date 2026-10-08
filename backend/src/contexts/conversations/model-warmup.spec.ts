import { afterEach, describe, expect, it } from 'vitest';
import { AuditPort, type AuditEntry } from '../../shared/audit/audit.port.js';
import { OllamaClient } from '../../shared/llm/ollama.client.js';
import { InMemorySettingsStore } from '../../shared/settings/in-memory-settings.store.js';
import { SettingsService } from '../../shared/settings/settings.service.js';
import { IntentExtractor } from './application/intent-extractor.js';
import { ModelWarmup } from './application/model-warmup.js';

class SilentAudit extends AuditPort {
  async record(_entry: AuditEntry): Promise<void> {}
}

/** An Ollama that answers `/api/ps` with `loaded` and records every chat body. */
function ollama(loaded: string[]) {
  const warmed: Array<Record<string, unknown>> = [];
  const fetchImpl = (async (url: string, init?: RequestInit) => {
    if (url.endsWith('/api/ps')) {
      return {
        ok: true,
        status: 200,
        json: async () => ({ models: loaded.map((name) => ({ name })) }),
      } as unknown as Response;
    }
    warmed.push(JSON.parse(String(init?.body)));
    return { ok: true, status: 200, body: null } as unknown as Response;
  }) as unknown as typeof fetch;
  return { warmed, client: new OllamaClient('http://ollama:11434', fetchImpl) };
}

function warmup(client: OllamaClient, enabled = true): ModelWarmup {
  const settings = new SettingsService(
    new InMemorySettingsStore(),
    new SilentAudit(),
  );
  return new ModelWarmup(
    client,
    new IntentExtractor(client, settings),
    settings,
    enabled,
  );
}

describe('ModelWarmup (031)', () => {
  let running: ModelWarmup | undefined;
  afterEach(() => running?.onApplicationShutdown());

  it('has the extraction model read intent.md when Ollama has nothing loaded', async () => {
    const { warmed, client } = ollama([]);

    await warmup(client).tick();

    expect(warmed).toHaveLength(1);
    const content = (warmed[0]!.messages as Array<{ content: string }>)[0]!
      .content;
    // The real template, so the cached prefix is the one real turns share.
    expect(content.length).toBeGreaterThan(5_000);
    expect(content).not.toMatch(/\{\{\w+\}\}/);
    expect(warmed[0]!.options).toEqual({ num_ctx: 8192, num_predict: 1 });
  });

  it('does nothing while the model is loaded', async () => {
    const { warmed, client } = ollama(['qwen2.5:3b-instruct']);

    await warmup(client).tick();

    expect(warmed).toEqual([]);
  });

  it('never throws when Ollama is not up yet', async () => {
    const client = new OllamaClient('http://ollama:11434', (async () => {
      throw new Error('ECONNREFUSED');
    }) as unknown as typeof fetch);

    await expect(warmup(client).tick()).resolves.toBeUndefined();
  });

  it('starts nothing in a process that answers no chat', async () => {
    const { warmed, client } = ollama([]);

    running = warmup(client, false);
    running.onApplicationBootstrap();
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(warmed).toEqual([]);
  });
});
