import type { BrowserContext, Page } from '@playwright/test';
import { expect, test } from './fixtures';

/**
 * The flows a unit test cannot reach (T960).
 *
 * Everything below needs a **real** extension in a **real** browser: a service
 * worker that the browser evicts, a side panel that is destroyed when it
 * closes, `chrome.storage` that survives a restart, and a context menu. A jsdom
 * side panel is not a side panel, and a mocked `chrome` is a test of the mock.
 *
 * ## What it runs against
 *
 * A **built** extension (`.output/chrome-mv3`) and a **running** Botvy, named by
 * `BOTVY_E2E_URL` with `BOTVY_E2E_EMAIL` and `BOTVY_E2E_PASSWORD`. Without
 * those three the file skips rather than fails: a suite that goes red on a
 * machine with no stack is a suite people learn to ignore, and this one is meant
 * to be run against the member's own installation.
 *
 * Chrome extensions need a persistent context and a headed browser — MV3
 * service workers do not start in headless mode — which is why this is a
 * separate command from `vitest` rather than part of it.
 */

const GATEWAY = process.env.BOTVY_E2E_URL;
const EMAIL = process.env.BOTVY_E2E_EMAIL;
const PASSWORD = process.env.BOTVY_E2E_PASSWORD;

test.skip(
  !GATEWAY || !EMAIL || !PASSWORD,
  'set BOTVY_E2E_URL, BOTVY_E2E_EMAIL and BOTVY_E2E_PASSWORD to run the desk suite',
);

/**
 * The panel's own page, opened by its extension id.
 *
 * As a tab rather than as the side panel itself: Chrome will not let a test
 * drive the real panel chrome, and the page behind it is the same document with
 * the same store and the same Dexie. What that costs is the one property this
 * cannot check — that it is *in* the panel — which is what loading the built
 * extension and reading its manifest covers instead.
 */
async function openPanel(
  context: BrowserContext,
  extensionId: string,
): Promise<Page> {
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/sidepanel.html`);
  return page;
}

async function signIn(
  context: BrowserContext,
  extensionId: string,
): Promise<Page> {
  const page = await openPanel(context, extensionId);

  // The address first: it is a per-browser setting, and on a fresh profile it
  // is whatever the build defaulted to rather than this member's Botvy.
  await page.evaluate(
    async (gateway) => {
      await chrome.storage.local.set({ 'botvy.gateway': gateway });
    },
    GATEWAY as string,
  );
  await page.reload();

  await page.getByLabel(/email/i).fill(EMAIL as string);
  await page.getByLabel(/password/i).fill(PASSWORD as string);

  // Waiting on the **response** rather than on the screen, because the two fail
  // differently and the difference is the whole diagnosis: a screen that never
  // changes with no request behind it is a client that threw before sending,
  // and one with a 401 behind it is a wrong password.
  const [answer] = await Promise.all([
    page.waitForResponse(
      (response) => response.url().includes('/auth/login'),
      { timeout: 20_000 },
    ),
    page.getByRole('button', { name: 'Sign in', exact: true }).click(),
  ]);
  expect(answer.status()).toBe(200);

  await expect(page.getByRole('heading', { name: /today/i })).toBeVisible({
    timeout: 15_000,
  });
  return page;
}

test('signs in, adds a task, and completes it with an undo', async ({
  context,
  extensionId,
}) => {
  const page = await signIn(context, extensionId);

  const title = `e2e ${Date.now()}`;
  await page.getByPlaceholder(/add a task/i).fill(title);
  await page.getByRole('button', { name: /^add$/i }).click();

  // Optimistic: the row is drawn from Dexie before any server has seen it,
  // which is what makes the panel usable on a train.
  await expect(page.getByText(title)).toBeVisible();

  /*
   * And it cannot be completed until the server has it, which is the panel's
   * own rule rather than a limitation of the test: completing calls a route by
   * id, and a row the server has never seen answers 404. The checkbox is
   * disabled until the create is accepted — so the suite syncs and waits for
   * that, which also proves the queue drains.
   */
  const checkbox = page.getByRole('checkbox', { name: new RegExp(title, 'i') });
  await expect(checkbox).toBeDisabled();
  await page.getByRole('button', { name: /sync now/i }).click();
  await expect(checkbox).toBeEnabled({ timeout: 20_000 });

  /*
   * `click`, not `check`.
   *
   * Playwright's `check()` clicks and then asserts the box ended up checked —
   * and this one never does: completing a task takes it out of Today, so the
   * element it would inspect is gone. The checkbox is an action here rather
   * than a state, which the undo strip below is the visible half of.
   */
  await checkbox.click();
  // Completing takes it out of Today, and the undo strip is the only place it
  // still exists — so the strip has to appear in the same tick.
  await expect(page.getByRole('button', { name: /undo/i })).toBeVisible();

  await page.getByRole('button', { name: /undo/i }).click();
  await expect(page.getByText(title)).toBeVisible();
});

test('says it is offline, keeps the work, and sends it when the network returns', async ({
  context,
  extensionId,
}) => {
  const page = await signIn(context, extensionId);

  await context.setOffline(true);

  const title = `offline ${Date.now()}`;
  await page.getByPlaceholder(/add a task/i).fill(title);
  await page.getByRole('button', { name: /^add$/i }).click();

  // Two things at once, and both are FR-007: the row is there, and the panel
  // does not claim to be in step while it holds something unsent.
  await expect(page.getByText(title)).toBeVisible();
  await expect(page.getByText(/unsent/i)).toBeVisible();

  await context.setOffline(false);
  await page.getByRole('button', { name: /sync now/i }).click();

  // Exactly once, which is the whole of SC-002: the id was minted before the
  // first attempt, so a retry is answered as the create that already happened.
  await expect(page.getByText(/unsent/i)).toBeHidden({ timeout: 20_000 });
  await expect(page.getByText(title)).toHaveCount(1);
});

test('clears everything on sign-out', async ({ context, extensionId }) => {
  const page = await signIn(context, extensionId);

  await page.getByText(/settings/i).click();
  await page.getByRole('button', { name: /sign out/i }).click();

  await expect(page.getByRole('button', { name: /sign in/i })).toBeVisible();

  // SC-005, by inspection rather than by trusting the screen: the tokens are
  // gone from `chrome.storage` and the cache is gone from IndexedDB.
  const left = await page.evaluate(async () => {
    const stored = await chrome.storage.local.get(null);
    const rows = await new Promise<number>((resolve) => {
      const open = indexedDB.open('botvy');
      open.addEventListener('success', () => {
        const database = open.result;
        if (!database.objectStoreNames.contains('tasks')) {
          database.close();
          resolve(0);
          return;
        }
        const count = database
          .transaction('tasks', 'readonly')
          .objectStore('tasks')
          .count();
        count.addEventListener('success', () => {
          database.close();
          resolve(count.result);
        });
        count.addEventListener('error', () => {
          database.close();
          resolve(-1);
        });
      });
      open.addEventListener('error', () => resolve(0));
    });

    return {
      // The address is deliberately kept: it is where this browser was told to
      // look, not the member's data, and making them retype their tunnel URL to
      // sign back in would teach them to avoid signing out.
      keys: Object.keys(stored).filter((key) => key !== 'botvy.gateway'),
      rows,
    };
  });

  // SC-005: nothing of the previous member remains — neither the credential nor
  // a single cached row.
  expect(left.keys).toEqual([]);
  expect(left.rows).toBe(0);
});
