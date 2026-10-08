import {
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from '@nestjs/common';
import { OllamaClient } from '../../../shared/llm/ollama.client.js';
import { SettingsService } from '../../../shared/settings/settings.service.js';
import { IntentExtractor } from './intent-extractor.js';

/** How often the API asks Ollama whether the models are still loaded. */
export const WARMUP_EVERY_MS = 60_000;

/**
 * Keeps the chat's models loaded, so the first turn after a restart is not
 * the slowest one (031).
 *
 * After a reboot nothing had loaded the model, and the first member to write
 * paid the 10 s load plus 31 s for Ollama to read the 3,700-token extraction
 * prompt. This does that work at boot, and again whenever `/api/ps` says
 * Ollama has dropped the model (because Ollama restarted, or a host without
 * `OLLAMA_KEEP_ALIVE` unloaded it while idle). A loaded model costs one local
 * HTTP call a minute.
 *
 * ponytail: "loaded" is taken to mean "the extraction prompt is cached". If
 * something else loads the model first (a saved link being summarised), the
 * first turn still reads `intent.md` once, which takes about 31 s. Warming on
 * every tick would close that gap, at the cost of half a second of GPU time a
 * minute competing with real turns.
 */
@Injectable()
export class ModelWarmup
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  private readonly logger = new Logger(ModelWarmup.name);
  private timer: NodeJS.Timeout | undefined;
  private running = false;

  constructor(
    private readonly llm: OllamaClient,
    private readonly extractor: IntentExtractor,
    private readonly settings: SettingsService,
    /** False in the worker and in contract generation, which answer no chat. */
    private readonly enabled: boolean,
  ) {}

  onApplicationBootstrap(): void {
    if (!this.enabled) return;
    void this.tick();
    this.timer = setInterval(() => void this.tick(), WARMUP_EVERY_MS);
    this.timer.unref();
  }

  onApplicationShutdown(): void {
    if (this.timer) clearInterval(this.timer);
  }

  /** One pass; never throws, and never overlaps a pass still running. */
  async tick(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      const [extractModel, chatModel, numCtx] = await Promise.all([
        this.settings.get('llm.extractModel'),
        this.settings.get('llm.chatModel'),
        this.settings.get('llm.numCtx'),
      ]);

      if (!(await this.llm.isLoaded(extractModel))) {
        await this.extractor.warm();
        this.logger.log(
          `loaded ${extractModel} and read the extraction prompt`,
        );
      }
      // The same model by default, in which case the line above loaded it.
      if (chatModel !== extractModel && !(await this.llm.isLoaded(chatModel))) {
        await this.llm.warm(
          chatModel,
          [{ role: 'user', content: 'hi' }],
          numCtx,
        );
        this.logger.log(`loaded ${chatModel}`);
      }
    } catch (error) {
      // Ollama not up yet is the normal case at boot; the next tick retries.
      this.logger.debug(`warm-up skipped: ${(error as Error).message}`);
    } finally {
      this.running = false;
    }
  }
}
