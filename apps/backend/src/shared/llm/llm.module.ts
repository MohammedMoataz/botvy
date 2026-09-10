import { Module } from '@nestjs/common';
import { ENV } from '../config/config.module.js';
import type { Env } from '../config/env.schema.js';
import { OllamaClient } from './ollama.client.js';

/**
 * The model client, in one module.
 *
 * It was provided by `HealthModule` until P4, which was a reasonable place for
 * it when the only caller was the `/health` probe asking whether Ollama was
 * reachable. It stopped being reasonable the moment the chat needed it:
 * `ConversationsModule` importing `HealthModule` would have pointed the
 * dependency exactly backwards — health checks the platform, the platform does
 * not depend on the health check — and `HealthModule` also declares a
 * controller, so importing it from a context would have dragged an HTTP route
 * along with a client.
 *
 * So the client has its own module and both callers import it. `HealthModule`
 * keeps the probe; this keeps the connection.
 *
 * ## The base URL comes from the environment, and the rest from settings
 *
 * Constitution XII, split exactly as it asks: **where** the model server is
 * is a connection detail (`OLLAMA_BASE_URL`), and **which model** and **what
 * context size** are things an operator retunes (`llm.chatModel`,
 * `llm.extractModel`, `llm.numCtx`). So the client is constructed once with a
 * URL and handed a model per call — which is also why it takes no model in its
 * constructor: a client bound to one model at boot would need a restart to
 * change it.
 */
@Module({
  providers: [
    {
      provide: OllamaClient,
      inject: [ENV],
      useFactory: (env: Env) => new OllamaClient(env.OLLAMA_BASE_URL),
    },
  ],
  exports: [OllamaClient],
})
export class LlmModule {}
