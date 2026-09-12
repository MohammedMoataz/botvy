import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

/**
 * The public pages: reachable, readable, and right to left (P10, T1041, T1042).
 *
 * These need a server but not a working API — that is the point of several of
 * them — so they are separated from `portal.spec.ts`, which needs the whole
 * stack and an administrator.
 */

const BASE = process.env.BOTVY_E2E_URL;

test.skip(!BASE, 'set BOTVY_E2E_URL to run the public suite');

/** Every screen that has to survive a narrow phone (FR-014). */
const SCREENS = ['/', '/login'];

test('carries no third-party request at all (FR-012, SC-005)', async ({ page }) => {
  const foreign: string[] = [];
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (url.origin !== new URL(BASE as string).origin) foreign.push(request.url());
  });

  await page.goto(`${BASE}/`);
  await page.waitForLoadState('networkidle');

  /*
   * Asserted rather than promised. This is a page about software that runs on
   * the reader's own machine, so an analytics beacon or a font from a CDN would
   * contradict its own first sentence — and it is also most of what a
   * performance score measures: nothing render-blocking from somewhere else.
   */
  expect(foreign).toEqual([]);
});

test('passes an accessibility scan (SC-005)', async ({ page }) => {
  await page.goto(`${BASE}/`);

  const scan = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();

  // The whole list, not a count: a failing run should name what to fix rather
  // than say "three problems".
  expect(
    scan.violations.map((violation) => `${violation.id}: ${violation.help}`),
  ).toEqual([]);
});

for (const screen of SCREENS) {
  test(`fits a 360-pixel phone: ${screen} (FR-014)`, async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 780 });
    await page.goto(`${BASE}${screen}`);

    // Sideways scrolling is the failure FR-014 names, and it is the one that
    // does not show up in a screenshot taken on a laptop. One pixel of slack
    // for sub-pixel rounding, which browsers do differently.
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(1);
  });
}

test.describe('in Arabic', () => {
  test.use({ locale: 'ar' });

  test.beforeEach(async ({ context }) => {
    // The locale is a cookie rather than a URL segment, so it is set directly:
    // driving the switcher would be testing the switcher, and what these cases
    // are about is what the pages look like once it has been used.
    await context.addCookies([
      {
        name: 'botvy_locale',
        value: 'ar',
        url: BASE as string,
      },
    ]);
  });

  test('reads right to left, and still fits the phone (FR-013, SC-006)', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 360, height: 780 });
    await page.goto(`${BASE}/`);

    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');

    /*
     * The mechanical half of an RTL review, and the half worth automating: a
     * physical `margin-left` or `padding-right` that was fine in English pushes
     * content off the inline-start edge in Arabic, and the symptom is exactly
     * this — a page wider than its viewport. What no assertion can cover is
     * whether the result reads well, which is why the phase also has a human
     * pass over the screens.
     */
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(1);
  });

  test('translates rather than falling back to English', async ({ page }) => {
    await page.goto(`${BASE}/`);

    // A missing message renders as its key, which looks like English to
    // somebody who does not read the codebase. Asserting Arabic characters are
    // present is the cheap way to catch a half-translated page.
    const heading = await page.getByRole('heading', { level: 1 }).textContent();
    expect(heading ?? '').toMatch(/[؀-ۿ]/);
  });
});
