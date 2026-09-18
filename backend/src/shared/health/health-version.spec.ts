import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { BOTVY_VERSION } from './health.controller.js';

/**
 * The one number four artefacts share.
 *
 * FR-011 asks that the images, the app and the extension all name the same
 * release, and `/health` is how anybody asks a running system which one it is.
 * The constant was written by hand and stayed at `2.0.0` through the whole of
 * 2.1.0 — so the soak log and a rollback decision were both reading a version
 * the system was not running. This is the test that fails on the next bump
 * somebody forgets.
 */
describe('the version /health reports', () => {
  it('is the backend package version', () => {
    const packagePath = fileURLToPath(
      new URL('../../../package.json', import.meta.url),
    );
    const { version } = JSON.parse(readFileSync(packagePath, 'utf8')) as {
      version: string;
    };
    expect(BOTVY_VERSION).toBe(version);
  });
});
