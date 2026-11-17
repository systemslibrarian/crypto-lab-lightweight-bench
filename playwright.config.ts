import { defineConfig, devices } from '@playwright/test';

/**
 * E2E runs against the production build served by `vite preview`, so what
 * passes here is what ships.
 *
 * Two suites:
 *   a11y.spec.ts   — the axe WCAG 2.1 A/AA gate plus the arithmetic oracles.
 *   claims.spec.ts — whether the page tells the truth, including the negative
 *                    claim of section 4.1d.
 *
 * PORT 4246, and why it is not 4245. `node tools/port-sync.js` in the catalog
 * repo reported 4245 as the next free port, and the registry agrees — but
 * `crypto-lab-pseudorandom-code` already names 4245 in its own committed
 * playwright config and is not yet pinned in the registry, so a run here on
 * 4245 would have reused that lab's preview server and scanned its page. (It
 * was in fact listening on this machine when this config was written.) 4246 is
 * free in the registry AND in every sibling working tree. Never 4173.
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  // The a11y driver walks six panels and runs two exhaustive counts before it
  // scans, and exhibit 5's 2^32-pair run alone takes about eight seconds.
  timeout: 180_000,
  // A generous backstop so a hung run fails rather than sitting until the job
  // limit. The suite measures ~60s locally.
  globalTimeout: 20 * 60_000,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'list' : [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: 'http://localhost:4246/crypto-lab-lightweight-bench/',
  },
  projects: [
    {
      // Dark is the only theme, so the gate scans the only rendering that ships.
      name: 'a11y',
      testMatch: /a11y\.spec\.ts/,
      use: { ...devices['Desktop Chrome'], colorScheme: 'dark' },
    },
    {
      // Claims assert what the page SAYS, which does not vary by engine.
      name: 'claims',
      testMatch: /claims\.spec\.ts/,
      use: { ...devices['Desktop Chrome'], colorScheme: 'dark' },
    },
  ],
  webServer: {
    // Build BEFORE serving. `vite preview` serves whatever is already in dist/,
    // so without the build in front a failing compile leaves the previous good
    // bundle in place and the whole suite passes green against source that no
    // longer compiles — which would silently invalidate every mutation check.
    command: 'npm run build && npm run preview -- --port 4246 --strictPort',
    url: 'http://localhost:4246/crypto-lab-lightweight-bench/',
    // CI never reuses: a reused server can be serving unmutated code, which
    // reads as "the mutation was not caught". scripts/mutations.mjs sets CI=1
    // for exactly this reason.
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
});
