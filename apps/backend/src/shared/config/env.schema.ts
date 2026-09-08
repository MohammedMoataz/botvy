import { z } from 'zod';

/**
 * The environment contract (data-model §7). Secrets and connection details are
 * environment variables and nothing else; anything an operator might retune is
 * a settings key, and anything a member might want different is a preference.
 *
 * This is validated once at boot and a bad value kills the process, named. A
 * process that starts with half its configuration missing fails later, in a
 * place that does not mention the variable that caused it.
 */
const roles = ['backend', 'worker'] as const;

export const envSchema = z.object({
  BOTVY_ROLE: z.enum(roles).default('backend'),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(8080),
  WORKER_PORT: z.coerce.number().int().positive().default(8081),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),

  // Stores
  DATABASE_URL: z.string().min(1, 'PostgreSQL connection string (Identity)'),
  MONGO_URL: z.string().min(1, 'MongoDB connection string (every other context)'),

  // Credentials
  JWT_ACCESS_SECRET: z.string().min(16),
  JWT_REFRESH_SECRET: z.string().min(16),
  JWT_ACCESS_TTL: z.string().default('15m'),
  JWT_REFRESH_TTL: z.string().default('30d'),
  INTERNAL_SERVICE_TOKEN: z.string().min(16),
  AUTOMATION_WEBHOOK_SECRET: z.string().min(16),
  MEDIA_SIGNING_SECRET: z.string().min(16),

  // Neighbours
  N8N_URL: z.string().url().default('http://n8n:5678'),
  N8N_API_KEY: z.string().optional(),
  OLLAMA_BASE_URL: z.string().url().default('http://host.docker.internal:11434'),
  FIREBASE_CREDENTIALS_FILE: z.string().optional(),

  // Local paths and edges
  MEDIA_DIR: z.string().default('/data/media'),
  CORS_ORIGINS: z.string().optional(),

  // Seeded administrator (the account the Owner first signs in with).
  //
  // A login, not necessarily an email address. The documented default is the
  // literal `admin`, which v1 seeded and which every setup instruction repeats
  // — demanding an email here refuses the very value the rest of the project
  // tells people to use, and the process then will not start at all.
  ADMIN_EMAIL: z.string().min(1),
  ADMIN_PASSWORD: z.string().min(1),

  // Generation mode: write the contract artefacts and exit, rather than serve.
  BOTVY_GEN: z.string().optional(),
});

export type Env = z.infer<typeof envSchema>;

export class EnvValidationError extends Error {}

/**
 * Validates and returns the environment. Every failing key is named, because a
 * message that says only "invalid environment" sends the reader to read the
 * schema rather than fix the variable.
 */
export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const parsed = envSchema.safeParse(source);
  if (parsed.success) return parsed.data;

  const problems = parsed.error.issues
    .map((issue) => {
      const key = issue.path.join('.') || '(root)';
      return `  ${key}: ${issue.message}`;
    })
    .join('\n');

  throw new EnvValidationError(
    `Environment is not valid, so the process will not start:\n${problems}\n` +
      'Every one of these is set in .env — see infra/.env.example for the contract.',
  );
}

export function corsOrigins(env: Env): string[] {
  if (!env.CORS_ORIGINS) return [];
  return env.CORS_ORIGINS.split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
}
