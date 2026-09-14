import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { DEFAULT_GATEWAY } from '../lib/session';

/**
 * Can a new member actually get in?
 *
 * Both assertions here are about the same failure, and it is the one kind this
 * surface is worst at catching: the panel worked perfectly for anybody whose
 * Botvy was already at the built-in address, and could not be used at all by
 * anybody else.
 *
 * `Settings` — which holds the address field — renders inside the panel's
 * `store.isAuthenticated` branch. So the address could only be changed by a
 * member who was signed in, and signing in needed the address to already be
 * right. Every install that is not a developer's own laptop hit it, and it
 * shipped through P9, a release build and a green suite.
 *
 * Nothing saw it because nothing renders the signed-out branch: the unit tests
 * bind the store directly, and the Playwright fixture writes the gateway into
 * `chrome.storage` before it opens the panel — testing a path a real member
 * cannot take. That is why this is a source assertion rather than a render
 * test. It is crude, it needs no DOM, and it fails if the field is taken off
 * the sign-in form again, which is the only thing it is for.
 */

function source(file: string): string {
  // Walk up rather than count `..`, for the reason `prompt-files.ts` gives at
  // length: the count is right until somebody moves the file.
  let dir = dirname(fileURLToPath(import.meta.url));
  for (let hop = 0; hop < 8; hop += 1) {
    const candidate = join(dir, file);
    if (existsSync(candidate)) return readFileSync(candidate, 'utf8');
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  throw new Error(`no ${file} above this spec`);
}

describe('a member who has never signed in', () => {
  it('is shown the address field on the sign-in form', () => {
    const app = source(join('entrypoints', 'sidepanel', 'App.tsx'));

    // The signed-out branch is everything after the `: (` of the
    // `store.isAuthenticated ? (…) : (…)` ternary.
    const split = app.indexOf('store.isAuthenticated ?');
    expect(split, 'App.tsx no longer branches on isAuthenticated').toBeGreaterThan(-1);
    const signedOut = app.slice(app.indexOf(') : (', split));

    expect(
      signedOut.includes('<GatewayField'),
      'the sign-in form must render <GatewayField/>: without it a member whose ' +
        'Botvy is not at the default address cannot sign in, and cannot reach ' +
        'Settings to correct it, because Settings is behind the sign-in',
    ).toBe(true);
  });

  it('has a default address that points at the edge, not at the API container', () => {
    /*
     * It was `http://localhost:8080` — the port the backend listens on *inside*
     * the compose network. Nothing publishes it: constitution V allows exactly
     * one public port and it belongs to Caddy. So the built-in default could
     * never have reached a running installation, and the first thing a new
     * member saw was a sign-in that could not succeed.
     */
    expect(DEFAULT_GATEWAY).not.toMatch(/:8080(\/|$)/);
    expect(DEFAULT_GATEWAY).not.toMatch(/:8081(\/|$)/);
  });
});
