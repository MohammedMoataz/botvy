import { Module } from '@nestjs/common';
import { ConfigModule as NestConfigModule } from '@nestjs/config';
import { z } from 'zod';

const envSchema = z.object({
  DATABASE_URL: z.string().min(1),
  JWT_ACCESS_SECRET: z.string().min(16),
  JWT_REFRESH_SECRET: z.string().min(16),
  JWT_ACCESS_TTL: z.string().default('15m'),
  JWT_REFRESH_TTL: z.string().default('30d'),
  OLLAMA_BASE_URL: z.string().url(),
  OLLAMA_CHAT_MODEL: z.string().min(1),
  // Reasoning models (qwen3) need `think` sent explicitly so Ollama splits the
  // monologue out of the reply. Models without the capability reject the field
  // outright, so it is opt-in and off by default.
  OLLAMA_THINKING: z
    .enum(['true', 'false'])
    .default('false')
    .transform((v) => v === 'true'),
  // Pinned rather than left to whatever the Ollama host defaults to: a context
  // larger than VRAM spills the model onto the CPU, which measured as half the
  // tokens per second and a minute to first token.
  //
  // ONE value for every call. Ollama keys a loaded model by its context size,
  // so asking for 4k on the intent call and 8k on the chat call unloads and
  // reloads the model on every single turn — measured at 39s to first token,
  // almost all of it reload.
  OLLAMA_NUM_CTX: z.coerce.number().int().positive().default(8192),
  LLM_REQUEST_TIMEOUT_MS: z.coerce.number().int().positive().default(120_000),
  CORS_ORIGINS: z.string().optional(),
  INTERNAL_SERVICE_TOKEN: z.string().min(16),
  N8N_URL: z.string().url().default('http://n8n:5678'),
  SEARXNG_URL: z.string().url().default('http://searxng:8080'),
  // Signs the /media proxy URLs. Without it the proxy refuses to sign or serve,
  // and images degrade to plain links.
  MEDIA_SIGNING_SECRET: z.string().min(16).optional(),
  N8N_API_KEY: z.string().optional(),
  FIREBASE_CREDENTIALS_FILE: z.string().optional(),
  // An env var is always a string, so z.boolean() would reject "true" and
  // z.coerce.boolean() would read "false" as true. Default is permissive.
  ALLOW_REGISTRATION: z
    .enum(['true', 'false'])
    .default('true')
    .transform((v) => v === 'true'),
  CHAT_RATE_LIMIT_PER_MIN: z.coerce.number().int().positive().default(20),
  CHAT_DAILY_QUOTA_TOKENS: z.coerce.number().int().positive().default(50000),
  PORT: z.coerce.number().int().positive().default(8080),
});

export type AppEnv = z.infer<typeof envSchema>;

@Module({
  imports: [
    NestConfigModule.forRoot({
      isGlobal: true,
      validate: (config) => envSchema.parse(config),
    }),
  ],
})
export class ConfigModule {}
