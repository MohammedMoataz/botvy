import { expect, test } from '@playwright/test';

/**
 * The content security policy (E-025).
 *
 * Two things this has to stop happening. One is the policy quietly
 * disappearing: a middleware that throws, a matcher that stops matching, a
 * Caddy route that bypasses the app. The other is the rollout parking itself in
 * report-only for ever, which is what a report-only rollout does if nobody is
 * measuring whether it could be enforced — so the third case asserts the pages
 * raise **no violations**, which is the whole of what flipping the switch is
 * waiting on.
 */

const BASE = process.env.BOTVY_E2E_URL;

test.skip(!BASE, 'set BOTVY_E2E_URL to run the policy suite');

/**
 * THE SWITCH, mirrored. Flip this to `true` in the same change that sets
 * `CSP_ENFORCE=on` for the installation — one line here, one line in `.env`.
 * Nothing else in this file changes.
 */
const ENFORCED = false;

const SENT = ENFORCED
  ? 'content-security-policy'
  : 'content-security-policy-report-only';
const NOT_SENT = ENFORCED
  ? 'content-security-policy-report-only'
  : 'content-security-policy';

/** The pages a member or an operator lands on without signing in. */
const SCREENS = ['/', '/login'];

declare global {
  interface Window {
    __cspViolations?: string[];
  }
}

test('the web app sends the policy, and still renders (E-025)', async ({ page }) => {
  const response = await page.goto(`${BASE}/`);
  const headers = response?.headers() ?? {};

  expect(headers[SENT], `expected a ${SENT} header`).toBeTruthy();
  expect(headers[NOT_SENT], `did not expect a ${NOT_SENT} header`).toBeUndefined();

  const policy = headers[SENT] ?? '';
  const scriptSrc = /(?:^|;)\s*script-src([^;]*)/.exec(policy)?.[1] ?? '';

  // The nonce is the point. Without it the only way to serve the App Router's
  // inline bootstrap is `'unsafe-inline'`, which is a policy that permits the
  // attack it exists to stop.
  expect(scriptSrc).toMatch(/'nonce-[A-Za-z0-9+/=_-]+'/);
  expect(scriptSrc).not.toContain("'unsafe-inline'");

  // Rendered, not blank. A wrong policy on the App Router does not produce an
  // error page; it produces a document with no JavaScript in it.
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
});

test('the nonce in the header is the one on the scripts (E-025)', async ({ page }) => {
  const response = await page.goto(`${BASE}/`);
  const policy = (response?.headers() ?? {})[SENT] ?? '';
  const nonce = /'nonce-([A-Za-z0-9+/=_-]+)'/.exec(policy)?.[1];

  expect(nonce).toBeTruthy();

  // A nonce nothing carries is a policy that blocks everything the moment it is
  // enforced — and in report-only nothing says so.
  const carried = await page.evaluate(
    (value) => document.querySelectorAll(`script[nonce="${value}"]`).length,
    nonce,
  );
  expect(carried).toBeGreaterThan(0);
});

test('the API is left out of it (E-025)', async ({ request }) => {
  const response = await request.get(`${BASE}/health`);
  const headers = response.headers();

  // Helmet's `contentSecurityPolicy: false` is deliberate: `/api/*`, `/graphql`
  // and `/media` are JSON and images, and a policy there breaks the Swagger UI
  // and the GraphQL playground while covering no page at all.
  expect(headers['content-security-policy']).toBeUndefined();
  expect(headers['content-security-policy-report-only']).toBeUndefined();
});

for (const screen of SCREENS) {
  test(`raises no violation: ${screen} (E-025)`, async ({ page }) => {
    await page.addInitScript(() => {
      window.__cspViolations = [];
      document.addEventListener('securitypolicyviolation', (event) => {
        window.__cspViolations?.push(
          `${event.effectiveDirective} ← ${event.blockedURI || event.sourceFile || 'inline'}`,
        );
      });
    });

    await page.goto(`${BASE}${screen}`);
    await page.waitForLoadState('networkidle');

    // The whole list rather than a count: a failing run should name the
    // directive to widen, not say "two problems".
    expect(await page.evaluate(() => window.__cspViolations ?? [])).toEqual([]);
  });
}
