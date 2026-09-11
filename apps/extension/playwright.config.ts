import { defineConfig } from '@playwright/test';

/**
 * Playwright against a **built** extension in a real browser.
 *
 * Three things about a Chrome extension make this a separate command rather
 * than another vitest project, and all three are properties of the platform
 * rather than choices:
 *
 * - it must be **loaded from disk**, so `pnpm build` runs first;
 * - it needs a **persistent context**, because that is the only way to load an
 *   unpacked extension;
 * - it cannot run **headless**, because an MV3 service worker does not start
 *   there — and the worker is half of what this suite exists to test.
 */
export default defineConfig({
  testDir: './e2e',
  // One worker: a persistent context is one browser profile, and two suites
  // signing in and out of the same profile would clear each other's tokens.
  workers: 1,
  timeout: 60_000,
  // The browser itself is launched by the `context` fixture in `e2e/fixtures.ts`:
  // an unpacked extension loads only into a persistent context, and Playwright's
  // default one is incognito. Configuring `launchOptions` here would look right
  // and load nothing.
  reporter: [['list']],
});
