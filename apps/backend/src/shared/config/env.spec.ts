import { describe, expect, it } from 'vitest';
import { EnvValidationError, corsOrigins, loadEnv } from './env.schema.js';

const complete = {
  DATABASE_URL: 'postgresql://botvy:secret@postgres:5432/botvy',
  MONGO_URL: 'mongodb://mongo:27017/botvy?replicaSet=rs0',
  JWT_ACCESS_SECRET: 'access-secret-long-enough',
  JWT_REFRESH_SECRET: 'refresh-secret-long-enough',
  INTERNAL_SERVICE_TOKEN: 'internal-token-long-enough',
  AUTOMATION_WEBHOOK_SECRET: 'webhook-secret-long-enough',
  MEDIA_SIGNING_SECRET: 'media-secret-long-enough',
  ADMIN_EMAIL: 'admin',
  ADMIN_PASSWORD: 'admin',
} satisfies NodeJS.ProcessEnv;

describe('environment contract', () => {
  it('accepts a complete environment and fills the documented defaults', () => {
    const env = loadEnv({ ...complete });

    expect(env.BOTVY_ROLE).toBe('backend');
    expect(env.PORT).toBe(8080);
    expect(env.WORKER_PORT).toBe(8081);
    expect(env.JWT_ACCESS_TTL).toBe('15m');
    expect(env.MEDIA_DIR).toBe('/data/media');
  });

  /**
   * The failure this test exists for: a process that starts without its Mongo
   * URL fails later, somewhere that does not mention the variable.
   */
  it('refuses to start without MONGO_URL, and names it', () => {
    const { MONGO_URL: _omitted, ...withoutMongo } = complete;

    expect(() => loadEnv(withoutMongo)).toThrow(EnvValidationError);
    expect(() => loadEnv(withoutMongo)).toThrow(/MONGO_URL/);
  });

  it('names every missing key at once rather than one per restart', () => {
    let message = '';
    try {
      loadEnv({ DATABASE_URL: complete.DATABASE_URL });
    } catch (error) {
      message = (error as Error).message;
    }

    expect(message).toContain('MONGO_URL');
    expect(message).toContain('JWT_ACCESS_SECRET');
    expect(message).toContain('ADMIN_EMAIL');
  });

  it('rejects an unknown role rather than defaulting to one', () => {
    expect(() => loadEnv({ ...complete, BOTVY_ROLE: 'scheduler' })).toThrow(/BOTVY_ROLE/);
  });

  it('rejects a secret too short to be one', () => {
    expect(() => loadEnv({ ...complete, JWT_ACCESS_SECRET: 'short' })).toThrow(
      /JWT_ACCESS_SECRET/,
    );
  });

  /**
   * The documented default is the literal `admin`. Requiring an email address
   * here refused the value every setup instruction tells people to use, and the
   * process then would not start at all — which is how the first real boot of
   * this stack failed.
   */
  it('accepts a bare login as the administrator, not only an email', () => {
    expect(loadEnv({ ...complete, ADMIN_EMAIL: 'admin' }).ADMIN_EMAIL).toBe('admin');
    expect(loadEnv({ ...complete, ADMIN_EMAIL: 'owner@example.test' }).ADMIN_EMAIL).toBe(
      'owner@example.test',
    );
  });

  it('still refuses an empty administrator login', () => {
    expect(() => loadEnv({ ...complete, ADMIN_EMAIL: '' })).toThrow(/ADMIN_EMAIL/);
  });

  it('reads CORS origins as a list, tolerating spacing', () => {
    const env = loadEnv({ ...complete, CORS_ORIGINS: 'https://a.test, https://b.test ' });

    expect(corsOrigins(env)).toEqual(['https://a.test', 'https://b.test']);
  });

  it('treats an absent CORS list as no cross-origin callers, not as all of them', () => {
    expect(corsOrigins(loadEnv({ ...complete }))).toEqual([]);
  });
});
