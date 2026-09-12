import { chromium, test as base, type BrowserContext } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const built = fileURLToPath(new URL('../.output/chrome-mv3', import.meta.url));

/**
 * A browser with the extension actually loaded.
 *
 * Playwright's default `context` fixture is an *incognito* context, and an
 * unpacked extension is not loaded into one — `context.serviceWorkers()` comes
 * back empty and every test fails reading a worker that was never there, which
 * is precisely how the first run of this suite failed. An extension needs
 * `launchPersistentContext`, so the context fixture is replaced rather than
 * configured.
 *
 * A **fresh profile directory per run**, because the thing under test keeps
 * state on purpose: tokens in `chrome.storage`, rows in IndexedDB. A reused
 * profile would make "signs in" pass because the last run had already signed
 * in, and "clears everything on sign-out" pass against a profile that was
 * already empty.
 */
export const test = base.extend<{
  context: BrowserContext;
  extensionId: string;
}>({
  /*
   * Playwright requires the first argument to be **destructured** — it reads
   * the names to work out what this fixture depends on, and rejects a plain
   * parameter outright ("First argument must use the object destructuring
   * pattern"). An empty `{}` is what that would normally be, which the linter
   * refuses in turn; taking one built-in fixture satisfies both, and the
   * dependency is real enough: this suite is Chromium-only.
   */
  context: async ({ browserName }, use) => {
    if (browserName !== 'chromium') throw new Error('extensions need Chromium');

    const profile = mkdtempSync(join(tmpdir(), 'botvy-e2e-'));
    const context = await chromium.launchPersistentContext(profile, {
      /*
       * Playwright's **bundled Chromium**, not the installed Chrome.
       *
       * Measured here rather than assumed: with `channel: 'chrome'` (152) the
       * extension does not load at all — `serviceWorkers()` stays empty for as
       * long as you wait — because stable Chrome now refuses `--load-extension`
       * from the command line. The bundled build honours it with the override
       * flag below, and it is also the build CI would use.
       */
      headless: false,
      args: [
        // Chrome disabled the switch this suite depends on; this turns the
        // disabling off. Without it the flags below are accepted and ignored,
        // which is the worst shape of failure: everything launches and nothing
        // is loaded.
        '--disable-features=DisableLoadExtensionCommandLineSwitch',
        `--disable-extensions-except=${built}`,
        `--load-extension=${built}`,
      ],
    });
    // The panel's console, on the test's stdout.
    //
    // An extension page has no visible console during a run, and the failures
    // this suite finds are the kind that print one and render nothing — a
    // sign-in that throws before the request leaves the browser being the case
    // that cost this file an afternoon.
    context.on('console', (message) => {
      if (message.type() === 'error') console.log('[panel]', message.text());
    });

    await use(context);
    await context.close();
  },

  /**
   * The id Chrome gave this unpacked build, taken from its service worker.
   *
   * The worker may not have started when the context is ready — the browser
   * spawns it lazily — so this waits for it rather than reading an empty list.
   */
  extensionId: async ({ context }, use) => {
    let [worker] = context.serviceWorkers();
    if (!worker) worker = await context.waitForEvent('serviceworker');
    await use(new URL(worker.url()).host);
  },
});

export const expect = test.expect;
