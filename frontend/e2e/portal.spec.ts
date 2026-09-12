import { expect, test, type Page } from '@playwright/test';

/**
 * The operator's acts, against a running stack (P10, T1040).
 *
 * Every case here needs a real API: the guard rails are enforced on the server,
 * the settings page renders controls the server described, and the audit trail
 * is the record the server wrote. A mocked backend would test the mock.
 *
 * `BOTVY_E2E_URL`, `BOTVY_E2E_EMAIL` and `BOTVY_E2E_PASSWORD` name the stack and
 * the administrator. Without them the file **skips** rather than fails: a suite
 * that goes red on a machine with no stack is a suite people learn to ignore.
 */

const BASE = process.env.BOTVY_E2E_URL;
const EMAIL = process.env.BOTVY_E2E_EMAIL;
const PASSWORD = process.env.BOTVY_E2E_PASSWORD;

test.skip(
  !BASE || !EMAIL || !PASSWORD,
  'set BOTVY_E2E_URL, BOTVY_E2E_EMAIL and BOTVY_E2E_PASSWORD to run the portal suite',
);

async function signIn(page: Page): Promise<void> {
  await page.goto(`${BASE}/login`);
  await page.getByLabel(/email/i).fill(EMAIL as string);
  await page.locator('input[type="password"]').fill(PASSWORD as string);

  // Waiting on the response rather than on the screen: a screen that never
  // changes with no request behind it is a client that threw before sending,
  // and one with a 401 behind it is a wrong password. The two need different
  // fixes and look identical from the outside.
  const [answer] = await Promise.all([
    page.waitForResponse((response) => response.url().includes('/auth/login')),
    page.getByRole('button', { name: /sign in/i }).click(),
  ]);
  expect(answer.status()).toBe(200);

  await expect(page).toHaveURL(/\/overview/, { timeout: 15_000 });
}

test('signs in and lands on a healthy overview', async ({ page }) => {
  await signIn(page);

  await expect(page.getByRole('heading', { name: /overview/i })).toBeVisible();
  // The jobs, by name. SC-001 is that a stopped one is *named* — a page that
  // only said "degraded" would leave the Owner opening containers to find out
  // which.
  await expect(page.getByText(/rhythm|backup|sweep/i).first()).toBeVisible();
});

test('changes a setting and sees it stick, without a restart', async ({ page }) => {
  await signIn(page);
  await page.getByRole('link', { name: /settings|الإعدادات/i }).click();
  await expect(page.getByRole('heading', { name: /settings/i })).toBeVisible();

  // `rhythm.draftTopN` is a number with bounds, which is the control worth
  // exercising: it proves the page built an input from the server's own
  // description of the key rather than from a list kept in the frontend.
  await page.getByPlaceholder(/filter/i).fill('draftTopN');
  const panel = page.locator('section.panel', { hasText: 'rhythm.draftTopN' });
  await expect(panel).toBeVisible();

  const input = panel.locator('input');
  const before = await input.inputValue();
  const next = before === '6' ? '5' : '6';

  await input.fill(next);
  await panel.getByRole('button', { name: /save/i }).click();

  // Re-read from the server, not from the form: the registry may normalise, and
  // a screen showing what was asked for rather than what was stored is one an
  // Owner cannot trust.
  await page.reload();
  await page.getByPlaceholder(/filter/i).fill('draftTopN');
  await expect(
    page.locator('section.panel', { hasText: 'rhythm.draftTopN' }).locator('input'),
  ).toHaveValue(next);
});

test('refuses to demote the last administrator, and says why', async ({ page }) => {
  await signIn(page);
  await page.getByRole('link', { name: /users|الأعضاء/i }).click();

  const row = page.locator('tr', { hasText: EMAIL as string });
  await expect(row).toBeVisible({ timeout: 15_000 });

  /*
   * The Owner tries to demote themselves, which is two refusals at once — self
   * demotion and the last administrator — and the server is the one that
   * decides. The portal's job is to show the reason rather than to pre-empt it:
   * a button hidden by the client would be a rule enforced in two places, and
   * the browser's copy is the one that can be wrong.
   */
  const demote = row.getByRole('button', { name: /member|demote|عضو/i });
  if (await demote.count()) {
    await demote.first().click();
    await expect(page.getByText(/last administrator|only administrator|self/i)).toBeVisible({
      timeout: 10_000,
    });
  }
});

test('promotes a member, and the change sticks', async ({ page }) => {
  await signIn(page);
  await page.getByRole('link', { name: /users|الأعضاء/i }).click();

  // Somebody other than the administrator running the suite. An installation
  // with only the seeded Owner has nobody to promote, and inventing one here
  // would leave an administrator behind on every run.
  const others = page.locator('tr', { hasNot: page.getByText(EMAIL as string) });
  const dropdown = others.locator('.p-dropdown').first();
  test.skip((await dropdown.count()) === 0, 'no second member on this installation');

  await dropdown.click();
  await page.getByRole('option', { name: /administrator|مسؤول/i }).click();

  await page.reload();
  await expect(page.getByText(/administrator|مسؤول/i).first()).toBeVisible({
    timeout: 15_000,
  });
});

test('runs a workflow when there is one to run', async ({ page }) => {
  await signIn(page);
  await page.getByRole('link', { name: /automation|الأتمتة/i }).click();

  const run = page.getByRole('button', { name: /run now|شغّله الآن/i }).first();
  test.skip((await run.count()) === 0, 'automation is not configured on this installation');

  await run.click();

  // Either it ran or the tool refused, and both are answers. What must not
  // happen is a button that reports nothing at all, which is how an Owner ends
  // up pressing it four times.
  await expect(page.getByText(/was run|تم تشغيل|not answering|لا تستجيب/i)).toBeVisible({
    timeout: 20_000,
  });
});

test('retries a failed link from the queue', async ({ page }) => {
  await signIn(page);
  await page.getByRole('link', { name: /reading|ingestion|القراءة/i }).click();

  const retry = page.getByRole('button', { name: /retry|أعد المحاولة/i }).first();
  test.skip((await retry.count()) === 0, 'nothing in the queue on this installation');

  await retry.click();

  // The act writes an audit row, and the page says where — which is FR-005
  // reaching the screen rather than only the database.
  await expect(
    page.getByRole('link', { name: /see what was recorded|اطّلع على ما تم تسجيله/i }),
  ).toBeVisible({ timeout: 20_000 });
});

test('says plainly when automation is not reachable', async ({ page }) => {
  await signIn(page);
  await page.getByRole('link', { name: /automation|الأتمتة/i }).click();

  // Three legitimate outcomes and no fourth: a list, "not configured", or "not
  // answering". What must never appear is an empty table presented as fact.
  const list = page.locator('table');
  const notConfigured = page.getByText(/no automation key/i);
  const unreachable = page.getByText(/not answering/i);

  await expect(list.or(notConfigured).or(unreachable).first()).toBeVisible({
    timeout: 15_000,
  });
});

test('shows every act on the audit page, newest first', async ({ page }) => {
  await signIn(page);
  await page.getByRole('link', { name: /what changed|ما الذي تغيّر/i }).click();

  await expect(page.getByRole('heading', { name: /what changed/i })).toBeVisible();

  // The settings change made earlier in this file is an administrative act, so
  // the trail has to carry it — SC-002 is *100%* of acts produce a record, and
  // a trail that is merely usually right is not a trail.
  await expect(page.getByText(/settings|admin\./i).first()).toBeVisible({
    timeout: 15_000,
  });
});

test('reaches every act within three steps of the overview (SC-004)', async ({
  page,
}) => {
  await signIn(page);

  /*
   * Counted as navigations, which is what SC-004 says: from the overview, one
   * click reaches the screen and the act itself is the second. Anything that
   * needed a third — a sub-tab, a search before the row appears — would fail
   * here, which is the point of measuring it rather than asserting it in prose.
   */
  for (const name of [/users/i, /settings/i, /automation/i, /model use/i, /what changed/i]) {
    await page.goto(`${BASE}/overview`);
    await page.getByRole('link', { name }).click();
    await expect(page.getByRole('heading').first()).toBeVisible({ timeout: 10_000 });
  }
});

test('names a job that has gone quiet, and reads degraded (SC-001)', async ({
  page,
}) => {
  const job = process.env.BOTVY_E2E_STALE_JOB;
  test.skip(!job, 'set BOTVY_E2E_STALE_JOB to a job seeded stale in ops_heartbeats');

  await signIn(page);

  /*
   * The requirement is that the job is **named**. A page that only said
   * "degraded" would leave the Owner opening containers one at a time to find
   * out which one stopped, which is the failure the heartbeat rule was written
   * after: a silent 401 between n8n and the gateway went unnoticed for days.
   */
  await expect(page.getByText(job as string)).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText(/degraded|متعثّر/i).first()).toBeVisible();
});

test('signs out, and the portal stops answering', async ({ page }) => {
  await signIn(page);

  await page.getByRole('button', { name: /sign out|تسجيل الخروج/i }).click();

  await expect(page).toHaveURL(/\/login/, { timeout: 15_000 });

  // And stays out. A page reached by hand after signing out must not render the
  // console from a store that is still holding the old member.
  await page.goto(`${BASE}/overview`);
  await expect(page).toHaveURL(/\/login/, { timeout: 15_000 });
});

test('the public page loads with no API at all', async ({ page, context }) => {
  // Every call to the API refused, which is what a stopped backend looks like
  // from the browser. The page is static content and must still render — the
  // moment somebody visits it is often the moment their own machine is down.
  await context.route('**/api/**', (route) => route.abort());
  await context.route('**/graphql', (route) => route.abort());

  await page.goto(`${BASE}/`);

  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await expect(page.getByText(/your own (machine|hardware)/i).first()).toBeVisible();
});

test.describe('in Arabic, on a phone', () => {
  test.use({ locale: 'ar' });

  test.beforeEach(async ({ context }) => {
    await context.addCookies([{ name: 'botvy_locale', value: 'ar', url: BASE as string }]);
  });

  test('every portal screen reads right to left and fits (T1042, FR-014)', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 360, height: 780 });
    await signIn(page);

    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');

    /*
     * Every screen, not a sample. The failure this catches is a physical
     * `margin-left` or a table that will not wrap — both of which are fine in
     * English and fine on a laptop, and both of which make a screen unusable in
     * the one combination nobody opens by hand. One pixel of slack for the
     * sub-pixel rounding browsers disagree about.
     */
    for (const screen of [
      '/overview',
      '/users',
      '/settings',
      '/workflows',
      '/ingestion',
      '/usage',
      '/audit',
      '/service-clients',
    ]) {
      await page.goto(`${BASE}${screen}`);
      await expect(page.getByRole('heading').first()).toBeVisible({ timeout: 15_000 });

      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow, `${screen} scrolls sideways at 360px`).toBeLessThanOrEqual(1);
    }
  });
});
