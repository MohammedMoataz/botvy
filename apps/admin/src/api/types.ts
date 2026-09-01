// Hand-mirrored from apps/gateway/openapi.json (components.schemas).
// Kept hand-written rather than generated: the schema has 5 tiny DTOs and its
// response bodies are untyped, so openapi-typescript would add a build step and
// a devDependency for ~20 lines. Re-check this file when openapi.json changes.

/** #/components/schemas/RegisterDto */
export interface RegisterDto {
  email: string;
  /** minLength 8 */
  password: string;
  displayName?: string;
}

/** #/components/schemas/LoginDto */
export interface LoginDto {
  email: string;
  password: string;
}

/** #/components/schemas/TokenPairDto — returned by /auth/login and /auth/refresh */
export interface TokenPairDto {
  accessToken: string;
  refreshToken: string;
}

/** #/components/schemas/RefreshDto */
export interface RefreshDto {
  refreshToken: string;
}

/** #/components/schemas/SendMessageDto (mobile app owns chat; here for completeness) */
export interface SendMessageDto {
  message: string;
}

/**
 * GET /health. openapi.json declares no response schema for this path, so this
 * mirrors the actual controller return in
 * apps/gateway/src/health/health.controller.ts instead.
 */
export interface HealthResponse {
  status: 'ok' | 'degraded';
  database: boolean;
  ollama: boolean;
  /** False when FIREBASE_CREDENTIALS_FILE is unset: no push is delivered. */
  push: boolean;
  lastSweepAt: string | null;
  /** True when no reminder sweep has landed recently — the n8n path is broken. */
  sweepStale: boolean;
  lastCoachingTickAt: string | null;
  coachingTickStale: boolean;
}
