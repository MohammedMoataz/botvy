#!/usr/bin/env tsx
/**
 * Mints a short-lived access token for the seeded administrator.
 *
 * P0 has no sign-in endpoint yet — that arrives with the identity phase — and
 * the spine still has to be exercisable by hand. This is the smallest thing
 * that makes `POST /api/v1/ping` callable from a terminal.
 *
 * It refuses to run in production. A script whose entire purpose is to produce
 * a credential without a password should not be one command away on a machine
 * holding somebody's real data.
 */
import jwt from 'jsonwebtoken';
import { loadEnv } from '../src/shared/config/env.schema.js';

const env = loadEnv();

if (env.NODE_ENV === 'production') {
  console.error(
    'dev:token refuses to run with NODE_ENV=production. It mints a credential with no ' +
      'password behind it, which is a development convenience and nothing else.',
  );
  process.exit(1);
}

const ttlSeconds = 60 * 60;
const token = jwt.sign(
  { sub: process.argv[2] ?? 'dev-admin', role: 'admin', email: env.ADMIN_EMAIL },
  env.JWT_ACCESS_SECRET,
  { expiresIn: ttlSeconds },
);

// Printed alone on stdout so it can be captured directly:
//   TOKEN=$(pnpm --filter @botvy/backend dev:token)
console.log(token);
console.error(`(valid for ${ttlSeconds / 60} minutes, as ${env.ADMIN_EMAIL})`);
