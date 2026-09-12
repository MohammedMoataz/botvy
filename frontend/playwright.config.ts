import { defineConfig, devices } from '@playwright/test';

/**
 * The portal, in a real browser, against a running stack (P10, T1040).
 *
 * No `webServer` here. The suite needs the whole stack — Caddy, the API, both
 * stores — and standing up the Next.js server alone would give a portal with
 * nothing behind it: every act would fail, and the failures would say nothing
 * about the portal. `BOTVY_E2E_URL` names a stack somebody else started, which
 * is compose locally and the compose job in CI.
 */
export default defineConfig({
  testDir: './e2e',
  // One worker, because the suite signs in as the one administrator and changes
  // settings on the installation. Two of these in parallel would race over the
  // same registry key and the same audit trail.
  workers: 1,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: [['list']],
  use: {
    ...devices['Desktop Chrome'],
    baseURL: process.env.BOTVY_E2E_URL,
    // Kept only for a failure: a trace per run would be most of the run's time
    // and nobody opens the green ones.
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    // A self-signed certificate is the normal case for a stack somebody runs at
    // home, and refusing it here would make the suite untestable exactly where
    // the product is meant to live.
    ignoreHTTPSErrors: true,
  },
});
